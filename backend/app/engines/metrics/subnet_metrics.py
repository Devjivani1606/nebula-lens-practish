"""
Subnet Metrics — Mapper + Collector

CloudWatch Namespace : NONE  (AWS does not emit CW metrics for Subnets)

Strategy:
  Subnet is a network boundary, not a billable AWS resource.
  We extract useful metadata from the normalized node instead of CloudWatch.

MetricsSummary schema:
  {
    "subnetType":    "Private",    # Public | Private
    "cidrBlock":     "10.0.1.0/24",
    "availableIPs":  245,
    "az":            "ap-south-1a",
    "securityScan":  "Pass",
  }

Cost strategy:
  SubnetCostAllocator proportionally distributes parent VPC NAT cost
  based on how many compute resources (EC2/Lambda/RDS) are inside this subnet.

IAM: None required (no CW calls)
"""

from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# MAPPER — maps node metadata (no raw CW data)
# ─────────────────────────────────────────────────────────────────────────────

class SubnetMetricsMapper(BaseMetricsMapper):
    SERVICE      = "subnet"
    CW_NAMESPACE = ""    # No CW namespace for subnets

    METRICS_PLAN   = []  # No CloudWatch metrics to collect
    IGNORE_METRICS = []  # Nothing to ignore — nothing exists

    def map(self, raw: dict, period_hours: int) -> dict:
        # raw is always {} for subnet — we use node metadata injected via _node_data
        meta = getattr(self, "_node_data", {})
        m    = meta.get("metrics", {})

        subnet_type = m.get("type", "Unknown")
        return {
            "subnetType":   subnet_type,
            "cidrBlock":    m.get("cidrBlock",         "N/A"),
            "availableIPs": m.get("availableIPs",      0),
            "az":           m.get("availabilityZone",  "N/A"),
            "securityScan": m.get("securityScan",      "N/A"),
        }

    def telemetry_schema(self) -> list[dict]:
        return []   # No time-series charts for subnets


# ─────────────────────────────────────────────────────────────────────────────
# COLLECTOR
# ─────────────────────────────────────────────────────────────────────────────

class SubnetMetricsCollector(BaseMetricsCollector):
    SERVICE = "subnet"

    def __init__(self):
        self.mapper = SubnetMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        return []  # No CW dimensions — not used

    def collect(self, node, credentials, region, period_hours=24):
        """Subnet has no CW — return static metadata from node."""
        self.mapper._node_data = node.get("data", {})
        return self._static_result(node)
