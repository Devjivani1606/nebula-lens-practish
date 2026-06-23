from app.engines.metrics.mapper import BaseMetricsMapper, MetricQuery
from app.engines.metrics.base   import BaseMetricsCollector
import logging

logger = logging.getLogger(__name__)


class DynamoDBMetricsMapper(BaseMetricsMapper):
    SERVICE       = "dynamodb"
    CW_NAMESPACE  = "AWS/DynamoDB"

    METRICS_PLAN = [
        MetricQuery("consumed_read_capacity_units",  "ConsumedReadCapacityUnits",  stat="Sum", for_telemetry=True, for_cost=True),
        MetricQuery("consumed_write_capacity_units", "ConsumedWriteCapacityUnits", stat="Sum", for_telemetry=True, for_cost=True),
        MetricQuery("system_errors",                 "SystemErrors",                 stat="Sum", for_telemetry=True),
        MetricQuery("user_errors",                   "UserErrors",                   stat="Sum", for_telemetry=True),
    ]

    IGNORE_METRICS = [
        "OnlineIndexPercentageProgress",
        "ProvisionedReadCapacityUnits",
        "ProvisionedWriteCapacityUnits",
    ]

    def map(self, raw: dict, period_hours: int) -> dict:
        read_dps = raw.get("consumed_read_capacity_units", [])
        write_dps = raw.get("consumed_write_capacity_units", [])
        sys_err_dps = raw.get("system_errors", [])
        user_err_dps = raw.get("user_errors", [])

        reads = self._sum(read_dps)
        writes = self._sum(write_dps)
        sys_err = self._sum(sys_err_dps)
        user_err = self._sum(user_err_dps)

        return {
            "consumedReadUnits":   int(reads),
            "consumedWriteUnits":  int(writes),
            "systemErrors":        int(sys_err),
            "userErrors":          int(user_err),
        }

    def telemetry_schema(self) -> list[dict]:
        return [
            {"key": "consumed_read_capacity_units",  "label": "Consumed RCU",       "unit": "Count", "chart": "line"},
            {"key": "consumed_write_capacity_units", "label": "Consumed WCU",       "unit": "Count", "chart": "line"},
            {"key": "system_errors",                 "label": "System Errors",      "unit": "Count", "chart": "bar"},
        ]


class DynamoDBMetricsCollector(BaseMetricsCollector):
    SERVICE = "dynamodb"

    def __init__(self):
        self.mapper = DynamoDBMetricsMapper()

    def _get_dimensions(self, node: dict) -> list[dict]:
        name = node.get("data", {}).get("name", "")
        arn  = node.get("data", {}).get("resource_arn", "")
        table_name = name or arn.split("/")[-1]
        if not table_name:
            raise ValueError("Cannot determine DynamoDB table name")
        return [{"Name": "TableName", "Value": table_name}]
