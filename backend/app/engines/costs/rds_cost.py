from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service


class RDSCostCalculator(BaseCostCalculator):

    SERVICE = "rds"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")

        # Get metadata from node
        metrics = node.get("data", {}).get("metrics", {})
        instance_class = metrics.get("instanceClass", "db.t4g.micro")

        # storage can be "20 GB" or 20 or similar, parse it
        storage_str = str(metrics.get("storage", "20 GB"))
        try:
            storage_gb = int(storage_str.split()[0])
        except Exception:
            storage_gb = 20

        multi_az = metrics.get("multiAZ", False)

        # Determine engine
        engine_str = metrics.get("engine", "postgres").lower()
        if "postgres" in engine_str:
            db_engine = "PostgreSQL"
        elif "mysql" in engine_str:
            db_engine = "MySQL"
        elif "mariadb" in engine_str:
            db_engine = "MariaDB"
        elif "oracle" in engine_str:
            db_engine = "Oracle"
        elif "sqlserver" in engine_str:
            db_engine = "SQL Server"
        elif "aurora-postgresql" in engine_str or "aurora-pg" in engine_str:
            db_engine = "Aurora PostgreSQL"
        elif "aurora-mysql" in engine_str:
            db_engine = "Aurora MySQL"
        else:
            db_engine = "PostgreSQL"

        deployment = "Multi-AZ" if multi_az else "Single-AZ"

        # Fetch pricing dynamically
        # Default instance hourly fallbacks
        fallback_hourly = 0.016 if "micro" in instance_class else 0.035
        if multi_az:
            fallback_hourly *= 2

        instance_type_param = f"instance:{instance_class}:{db_engine}:{deployment}"
        price_per_hour = pricing_service.get("rds", region, instance_type_param, credentials)
        if price_per_hour is None:
            price_per_hour = fallback_hourly

        # Default fallback for storage: $0.115 per GB-month (gp2)
        storage_volume_param = "storage:gp2"
        price_per_gb_month = pricing_service.get("rds", region, storage_volume_param, credentials) or 0.115

        line_items = [
            self._line(
                f"RDS Instance ({instance_class}, {db_engine}, {deployment})",
                730,
                "hours",
                price_per_hour
            ),
            self._line(
                f"RDS Storage ({storage_gb} GB, gp2)",
                storage_gb,
                "GB-month",
                price_per_gb_month
            )
        ]

        return self._build_result(
            billing_model="on-demand",
            dimensions={
                "instanceClass": instance_class,
                "storageGB": storage_gb,
                "multiAZ": multi_az,
                "engine": db_engine,
            },
            line_items=line_items,
            region=region,
            notes=f"Estimated monthly cost for RDS {node.get('data', {}).get('name', 'DB')} in {region}"
        )
