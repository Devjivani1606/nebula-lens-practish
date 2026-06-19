"""
EC2 Metrics — Mapper + Collector

CloudWatch Namespace : AWS/EC2

COLLECT:
  cpu_util       Average → instance utilization %
  network_in     Sum     → inbound bytes (convert to MB)
  network_out    Sum     → outbound bytes (for cost: data transfer out)
  status_failed  Maximum → 0 = healthy, >0 = instance check failure

IGNORE:
  - DiskReadBytes      → only for instance-store (not EBS), rarely used
  - DiskWriteBytes     → same as above
  - DiskReadOps        → IOPS detail — use CloudWatch EBS metrics for that
  - DiskWriteOps       → same
  - MetadataNoToken    → IMDSv1 security metric, not dashboard-relevant
  - EBSReadBytes       → EBS-specific, separate namespace
  - EBSWriteBytes      → same
  - EBSReadOps, EBSWriteOps, EBSByteBalance% — storage deep-dive, not architecture view

MetricsSummary schema:
  {
    "avgCpuPercent":    45.2,
    "networkInMB":      1240.0,
    "networkOutMB":     890.0,
    "statusCheckFails": 0,
    "state":            "running",
    "instanceType":     "t3.medium",
    "hoursBilledPeriod": 24,   # → EC2CostCalculator
  }

CostCalculator inputs: instanceType, state, hoursBilledPeriod, networkOutMB
IAM: cloudwatch:GetMetricData
"""

from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# MAPPER
# ─────────────────────────────────────────────────────────────────────────────

class EC2MetricsMapper(BaseMetricsMapper):
    SERVICE      = "ec2"
    CW_NAMESPACE = "AWS/EC2"

    METRICS_PLAN = [
        MetricQuery("cpu_util",      "CPUUtilization",    stat="Average", for_telemetry=True),
        MetricQuery("network_in",    "NetworkIn",         stat="Sum",     for_telemetry=True),
        MetricQuery("network_out",   "NetworkOut",        stat="Sum",     for_telemetry=True,  for_cost=True),
        MetricQuery("status_failed", "StatusCheckFailed", stat="Maximum", for_telemetry=False),
    ]

    IGNORE_METRICS = [
        "DiskReadBytes",   "DiskWriteBytes",           # Instance-store only, not EBS
        "DiskReadOps",     "DiskWriteOps",             # Too granular for architecture view
        "MetadataNoToken",                             # IMDSv1 security — not dashboard metric
        "EBSReadBytes",    "EBSWriteBytes",            # EBS deep-dive — separate namespace
        "EBSReadOps",      "EBSWriteOps",              # Same
        "EBSByteBalance%", "EBSIOBalance%",            # Burst balance — not needed
        "CPUCreditUsage",  "CPUCreditBalance",         # T-type burst — show only if t2/t3
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        cpu_dps    = raw.get("cpu_util",      [])
        net_in_dps = raw.get("network_in",    [])
        net_out_dps= raw.get("network_out",   [])
        status_dps = raw.get("status_failed", [])

        avg_cpu       = self._avg(cpu_dps)
        net_in_bytes  = self._sum(net_in_dps)
        net_out_bytes = self._sum(net_out_dps)
        status_fails  = int(self._max(status_dps))

        # Injected from node during _get_dimensions
        instance_type = getattr(self, "_instance_type", "unknown")
        state         = getattr(self, "_state",         "unknown")
        hours_billed  = period_hours if state == "running" else 0

        return {
            "avgCpuPercent":     round(avg_cpu, 1),
            "networkInMB":       round(net_in_bytes  / 1_048_576, 1),
            "networkOutMB":      round(net_out_bytes / 1_048_576, 1),
            "statusCheckFails":  status_fails,
            "state":             state,
            "instanceType":      instance_type,
            "hoursBilledPeriod": hours_billed,      # → EC2CostCalculator
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "cpu_util",    "label": "CPU %",       "unit": "Percent", "chart": "line"},
            {"key": "network_in",  "label": "Network In",  "unit": "Bytes",   "chart": "area"},
            {"key": "network_out", "label": "Network Out", "unit": "Bytes",   "chart": "area"},
        ]


# ─────────────────────────────────────────────────────────────────────────────
# COLLECTOR
# ─────────────────────────────────────────────────────────────────────────────

class EC2MetricsCollector(BaseMetricsCollector):
    SERVICE = "ec2"

    def __init__(self):
        self.mapper = EC2MetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        arn = node.get("data", {}).get("resource_arn", "")
        instance_id = arn.split("/")[-1] if "/" in arn else ""
        if not instance_id or not instance_id.startswith("i-"):
            raise ValueError(f"Cannot determine EC2 instance ID from ARN: {arn}")

        # Pass instance metadata to mapper
        metrics = node.get("data", {}).get("metrics", {})
        self.mapper._instance_type = metrics.get("instanceType", "unknown")
        self.mapper._state         = metrics.get("state", "unknown")

        return [{"Name": "InstanceId", "Value": instance_id}]
