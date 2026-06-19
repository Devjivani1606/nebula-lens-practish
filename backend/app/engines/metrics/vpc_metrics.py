"""
VPC Metrics — Mapper + Collector

CloudWatch Namespace : AWS/NATGateway  (VPC itself has NO CW namespace)

COLLECT (per NAT Gateway, then aggregated):
  bytes_out    Sum     → data out through NAT (cost dimension)
  bytes_in     Sum     → data in through NAT
  active_conns Maximum → peak active connections

IGNORE:
  - PacketsDropCount      → network-level detail, not actionable for architecture view
  - BytesInFromDestination / BytesOutToSource → return traffic; not separately billed
  - PacketsInFromSource   → packet-level detail (too granular)
  - PacketsOutToDestination → same
  - ErrorPortAllocation   → NAT exhaustion — show as alert, not regular metric
  - IdleTimeoutCount      → connection management detail

Strategy:
  VPC node shows AGGREGATED NAT Gateway metrics.
  We first enumerate NAT Gateways via EC2 API, then fetch CW per NAT, then aggregate.

MetricsSummary schema:
  {
    "natGateways":       2,
    "dataOutGB":         12.4,
    "dataInGB":          8.2,
    "dataProcessedGB":   20.6,    # → VPCCostCalculator
    "totalNatHours":     48,      # → VPCCostCalculator
  }

CostCalculator inputs: natGateways, totalNatHours, totalDataProcessedGB
IAM: cloudwatch:GetMetricData, ec2:DescribeNatGateways
"""

from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
from app.engines.metrics.cache  import metrics_cache
from datetime import datetime, timedelta, timezone
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# MAPPER
# ─────────────────────────────────────────────────────────────────────────────

class VPCMetricsMapper(BaseMetricsMapper):
    SERVICE      = "vpc"
    CW_NAMESPACE = "AWS/NATGateway"

    METRICS_PLAN = [
        MetricQuery("bytes_out",    "BytesOutToDestination", stat="Sum",     for_telemetry=True,  for_cost=True),
        MetricQuery("bytes_in",     "BytesInFromSource",     stat="Sum",     for_telemetry=True),
        MetricQuery("active_conns", "ActiveConnectionCount", stat="Maximum", for_telemetry=True),
    ]

    IGNORE_METRICS = [
        "PacketsDropCount",            # network-level detail
        "BytesInFromDestination",      # return traffic — not separately billed
        "BytesOutToSource",            # same
        "PacketsInFromSource",         # packet-level, too granular
        "PacketsOutToDestination",     # same
        "ErrorPortAllocation",         # NAT exhaustion event (alarm, not metric)
        "IdleTimeoutCount",            # connection management detail
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        bytes_out_dps  = raw.get("bytes_out",    [])
        bytes_in_dps   = raw.get("bytes_in",     [])
        conn_dps       = raw.get("active_conns", [])

        total_out   = self._sum(bytes_out_dps)
        total_in    = self._sum(bytes_in_dps)
        total_conns = int(self._max(conn_dps))

        nat_count    = getattr(self, "_nat_count", 0)
        nat_hours    = nat_count * period_hours
        data_total_gb = round((total_out + total_in) / 1_073_741_824, 3)

        return {
            "natGateways":        nat_count,
            "dataOutGB":          round(total_out / 1_073_741_824, 3),
            "dataInGB":           round(total_in  / 1_073_741_824, 3),
            "dataProcessedGB":    data_total_gb,
            "activeConnections":  total_conns,
            "totalNatHours":      nat_hours,           # → VPCCostCalculator
            "totalDataProcessedGB": data_total_gb,     # → VPCCostCalculator (alias)
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "bytes_out",    "label": "Data Out",          "unit": "Bytes", "chart": "area"},
            {"key": "bytes_in",     "label": "Data In",           "unit": "Bytes", "chart": "area"},
            {"key": "active_conns", "label": "Active Connections", "unit": "Count", "chart": "line"},
        ]


# ─────────────────────────────────────────────────────────────────────────────
# COLLECTOR — custom collect() because we need EC2 API + CW per NAT
# ─────────────────────────────────────────────────────────────────────────────

class VPCMetricsCollector(BaseMetricsCollector):
    SERVICE = "vpc"

    def __init__(self):
        self.mapper = VPCMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        # Not used — VPC overrides collect() directly
        return []

    def collect(self, node, credentials, region, period_hours=24):
        """
        VPC custom collect:
          1. Get NAT Gateway IDs via EC2 API
          2. Fetch CW metrics per NAT Gateway
          3. Aggregate all NAT results
          4. Run mapper on aggregated data
        """
        import boto3
        from collections import defaultdict

        data = node.get("data", {})
        arn  = data.get("resource_arn") or node.get("id", "")
        vpc_id = arn.split("/")[-1] if "/" in arn else ""

        cached = metrics_cache.get(arn, region, period_hours)
        if cached:
            return cached

        if not vpc_id or not vpc_id.startswith("vpc-"):
            return self._empty_result(f"Invalid VPC ARN: {arn}")

        try:
            ec2 = boto3.client(
                "ec2", region_name=region,
                aws_access_key_id=credentials["AccessKeyId"],
                aws_secret_access_key=credentials["SecretAccessKey"],
                aws_session_token=credentials.get("SessionToken"),
            )
            cw = self._get_cw_client(credentials, region)

            # ── Step 1: Find NAT Gateways ─────────────────────────────────────
            nat_resp = ec2.describe_nat_gateways(
                Filters=[
                    {"Name": "vpc-id",  "Values": [vpc_id]},
                    {"Name": "state",   "Values": ["available"]},
                ]
            )
            nats = nat_resp.get("NatGateways", [])
            self.mapper._nat_count = len(nats)

            if not nats:
                result = {
                    "cloudwatch": {}, "telemetryData": [], "errors": [],
                    "schema":  self.mapper.telemetry_schema(),
                    "summary": self.mapper.map({}, period_hours),
                }
                metrics_cache.set(arn, region, period_hours, result)
                return result

            # ── Step 2: Batch fetch CW for all NAT Gateways ───────────────────
            end_time   = datetime.now(timezone.utc)
            start_time = end_time - timedelta(hours=period_hours)

            # Build queries for ALL NAT gateways in one batch
            # CW GetMetricData: max 500 queries → fine for typical VPC
            queries = []
            for i, nat in enumerate(nats):
                nat_id = nat["NatGatewayId"]
                for mq in self.mapper.METRICS_PLAN:
                    queries.append({
                        "Id": f"{mq.metric_id}_{i}",
                        "MetricStat": {
                            "Metric": {
                                "Namespace":  "AWS/NATGateway",
                                "MetricName": mq.metric_name,
                                "Dimensions": [{"Name": "NatGatewayId", "Value": nat_id}],
                            },
                            "Period": mq.period,
                            "Stat":   mq.stat,
                        },
                        "ReturnData": True,
                    })

            resp = cw.get_metric_data(
                MetricDataQueries=queries,
                StartTime=start_time,
                EndTime=end_time,
            )
            individual = self._parse_results(resp)

            # ── Step 3: Aggregate across all NAT gateways ─────────────────────
            # Merge: bytes_out_0 + bytes_out_1 → bytes_out (sum)
            agg: dict[str, dict] = defaultdict(lambda: defaultdict(float))
            for key, dps in individual.items():
                base_key = "_".join(key.split("_")[:-1])  # strip _0, _1 etc
                for dp in dps:
                    t = dp["timestamp"].strftime("%H:%M")
                    agg[base_key][t] = agg[base_key].get(t, 0) + dp["value"]

            # Convert back to datapoint list format mapper expects
            raw: dict[str, list] = {}
            for base_key, time_vals in agg.items():
                from datetime import datetime as DT
                raw[base_key] = [
                    {"timestamp": DT.strptime(t, "%H:%M").replace(
                        year=end_time.year, month=end_time.month, day=end_time.day,
                        tzinfo=timezone.utc
                    ), "value": v, "unit": ""}
                    for t, v in sorted(time_vals.items())
                ]

            summary   = self.mapper.map(raw, period_hours)
            telemetry = self.mapper._to_telemetry(raw, ["bytes_out", "bytes_in", "active_conns"])

            result = {
                "cloudwatch":    raw,
                "telemetryData": telemetry,
                "summary":       summary,
                "schema":        self.mapper.telemetry_schema(),
                "errors":        [],
            }
            metrics_cache.set(arn, region, period_hours, result)
            return result

        except Exception as e:
            logger.error(f"[VPC] Metrics collection failed: {e}")
            return self._empty_result(str(e))
