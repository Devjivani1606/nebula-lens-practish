from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


class RDSMetricsMapper(BaseMetricsMapper):
    SERVICE       = "rds"
    CW_NAMESPACE  = "AWS/RDS"

    METRICS_PLAN = [
        MetricQuery("cpu_utilization",      "CPUUtilization",        stat="Average", for_telemetry=True),
        MetricQuery("read_iops",            "ReadIOPS",              stat="Average", for_telemetry=True),
        MetricQuery("write_iops",           "WriteIOPS",             stat="Average", for_telemetry=True),
        MetricQuery("free_storage_space",   "FreeStorageSpace",      stat="Average", for_telemetry=True),
        MetricQuery("database_connections", "DatabaseConnections",   stat="Average", for_telemetry=True),
    ]

    IGNORE_METRICS = [
        "BinLogDiskUsage",
        "ReplicaLag",
        "TransactionLogsDiskUsage",
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        cpu_dps  = raw.get("cpu_utilization", [])
        read_dps = raw.get("read_iops", [])
        write_dps = raw.get("write_iops", [])
        storage_dps = raw.get("free_storage_space", [])
        conn_dps = raw.get("database_connections", [])

        return {
            "cpuUtilization":      round(self._avg(cpu_dps), 2),
            "readIOPS":            round(self._avg(read_dps), 2),
            "writeIOPS":           round(self._avg(write_dps), 2),
            "freeStorageSpaceGB":  round(self._avg(storage_dps) / (1024 ** 3), 2),
            "databaseConnections": int(self._max(conn_dps)),
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "cpu_utilization",      "label": "CPU Utilization",      "unit": "Percent",     "chart": "line"},
            {"key": "database_connections", "label": "Database Connections", "unit": "Count",       "chart": "line"},
            {"key": "free_storage_space",   "label": "Free Storage Space",   "unit": "Bytes",       "chart": "line"},
        ]


class RDSMetricsCollector(BaseMetricsCollector):
    SERVICE = "rds"

    def __init__(self):
        self.mapper = RDSMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        arn  = node.get("data", {}).get("resource_arn", "")
        db_id = name or arn.split(":")[-1]
        if not db_id:
            raise ValueError("Cannot determine RDS database identifier")
        return [{"Name": "DBInstanceIdentifier", "Value": db_id}]
