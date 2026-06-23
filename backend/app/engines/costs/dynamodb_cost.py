from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service

FREE_TIER_STORAGE_GB = 25.0


class DynamoDBCostCalculator(BaseCostCalculator):

    SERVICE = "dynamodb"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")

        metrics = node.get("data", {}).get("metrics", {})
        billing_mode = metrics.get("billingMode", "PROVISIONED").upper()

        # Get storage size
        size_bytes = metrics.get("sizeBytes", 0)
        storage_gb = size_bytes / (1024 ** 3)
        billable_storage = max(0.0, storage_gb - FREE_TIER_STORAGE_GB)

        # Fetch pricing for storage
        price_per_gb = pricing_service.get("dynamodb", region, "storage", credentials) or 0.25

        line_items = []
        dimensions = {
            "billingMode": billing_mode,
            "storageGB": round(storage_gb, 4),
            "billableStorageGB": round(billable_storage, 4)
        }

        # Storage line item
        line_items.append(
            self._line(
                "DynamoDB Indexed Storage",
                billable_storage,
                "GB-month",
                price_per_gb
            )
        )

        if billing_mode == "PAY_PER_REQUEST":
            # On-Demand: billable reads and writes
            consumed_reads = metrics_summary.get("consumedReadUnits", 0) or metrics_summary.get("consumedReadCapacityUnits", 0) or 0
            consumed_writes = metrics_summary.get("consumedWriteUnits", 0) or metrics_summary.get("consumedWriteCapacityUnits", 0) or 0

            monthly_reads = consumed_reads * 30
            monthly_writes = consumed_writes * 30

            price_per_1m_rru = pricing_service.get("dynamodb", region, "rru", credentials) or 0.25
            price_per_1m_wru = pricing_service.get("dynamodb", region, "wru", credentials) or 1.25

            line_items.append(
                self._line(
                    "DynamoDB Read Request Units (RRU)",
                    monthly_reads / 1_000_000,
                    "per 1M RRUs",
                    price_per_1m_rru
                )
            )
            line_items.append(
                self._line(
                    "DynamoDB Write Request Units (WRU)",
                    monthly_writes / 1_000_000,
                    "per 1M WRUs",
                    price_per_1m_wru
                )
            )
            dimensions["monthlyReads"] = monthly_reads
            dimensions["monthlyWrites"] = monthly_writes

        else:
            # Provisioned: standard hourly RCU and WCU billing
            rcu = metrics.get("provisionedRCU", 5)
            wcu = metrics.get("provisionedWCU", 5)

            price_per_rcu_hour = pricing_service.get("dynamodb", region, "rcu_hourly", credentials) or 0.00013
            price_per_wcu_hour = pricing_service.get("dynamodb", region, "wcu_hourly", credentials) or 0.00065

            line_items.append(
                self._line(
                    "DynamoDB Provisioned Read Capacity Units (RCU)",
                    rcu * 730,
                    "unit-hours",
                    price_per_rcu_hour
                )
            )
            line_items.append(
                self._line(
                    "DynamoDB Provisioned Write Capacity Units (WCU)",
                    wcu * 730,
                    "unit-hours",
                    price_per_wcu_hour
                )
            )
            dimensions["provisionedRCU"] = rcu
            dimensions["provisionedWCU"] = wcu

        return self._build_result(
            billing_model="on-demand" if billing_mode == "PAY_PER_REQUEST" else "provisioned",
            dimensions=dimensions,
            line_items=line_items,
            region=region,
            notes=f"Estimated monthly cost for DynamoDB table {node.get('data', {}).get('name', 'Table')} in {region}"
        )
