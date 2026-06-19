"""
CostEngine — pluggable registry-based cost dispatcher.

Routes each node to the correct service-specific CostCalculator.
No if-else chains. Adding a new service = register one class.

Usage:
    from app.engines.cost_engine import cost_engine
    result = cost_engine.calculate(node, metrics_summary, region)
"""

import logging
from app.engines.costs.base import BaseCostCalculator

# ── Import all built-in calculators ──────────────────────────────────────────
from app.engines.costs.lambda_cost      import LambdaCostCalculator
from app.engines.costs.sqs_cost         import SQSCostCalculator
from app.engines.costs.ec2_cost         import EC2CostCalculator
from app.engines.costs.s3_cost          import S3CostCalculator
from app.engines.costs.vpc_cost         import VPCCostCalculator
from app.engines.costs.apigateway_cost  import APIGatewayCostCalculator
from app.engines.costs.subnet_cost      import SubnetCostAllocator

logger = logging.getLogger(__name__)


class CostEngine:
    """
    Central dispatcher for all AWS cost calculation.

    The registry maps service name → calculator instance.
    CostEngine.calculate() routes any node to the right calculator automatically.

    To add a new service (e.g. RDS):
      1. Create app/engines/costs/rds_cost.py  (inherits BaseCostCalculator)
      2. Call cost_engine.register(RDSCostCalculator())   ← one line
      Done. No other code changes needed.
    """

    def __init__(self):
        self._registry: dict[str, BaseCostCalculator] = {}
        self._register_builtins()

    def _register_builtins(self):
        builtins = [
            LambdaCostCalculator(),
            SQSCostCalculator(),
            EC2CostCalculator(),
            S3CostCalculator(),
            VPCCostCalculator(),
            APIGatewayCostCalculator(),
            SubnetCostAllocator(),
        ]
        for calc in builtins:
            self.register(calc)

    # ─────────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ─────────────────────────────────────────────────────────────────────────

    def register(self, calculator: BaseCostCalculator):
        """Register a new cost calculator. Must have SERVICE class attribute."""
        if not calculator.SERVICE:
            raise ValueError(f"Calculator {type(calculator).__name__} must define SERVICE attribute")
        self._registry[calculator.SERVICE] = calculator
        logger.info(f"[CostEngine] Registered calculator for service: {calculator.SERVICE}")

    def calculate(
        self,
        node: dict,
        metrics_summary: dict,
        region: str = "ap-south-1",
        **kwargs  # Extra args passed to service-specific calculators (e.g. SubnetCostAllocator)
    ) -> dict:
        """
        Route a normalized node to its service-specific cost calculator.

        Args:
            node:            Normalized node dict
            metrics_summary: MetricsEngine summary dict for this node
            region:          AWS region
            **kwargs:        Extra args (e.g. vpc_monthly_cost for subnet allocation)

        Returns:
            {
                "service":          "lambda",
                "currency":         "USD",
                "billingModel":     "pay-per-use",
                "dimensions":       {...},
                "lineItems":        [...],
                "totalMonthlyCost": 2.45,
                "notes":            "..."
            }
        """
        service = node.get("data", {}).get("service", "").lower()

        if not service:
            logger.warning(f"[CostEngine] Node has no service field: {node.get('id')}")
            return self._unsupported_result(service)

        calculator = self._registry.get(service)

        if not calculator:
            logger.info(f"[CostEngine] No calculator registered for service '{service}' — skipping")
            return self._unsupported_result(service)

        try:
            return calculator.calculate(node, metrics_summary, region, **kwargs)
        except Exception as e:
            logger.error(f"[CostEngine] Calculator for '{service}' raised error: {e}")
            return {
                "service":          service,
                "source":           "pricing-api",
                "confidence":       "estimated",
                "billingModel":     "error",
                "dailyCost":        0.0,
                "monthlyCost":      0.0,
                "yearlyCost":       0.0,
                "currency":         "USD",
                "usageMetrics":     {},
                "lineItems":        [],
                "notes":            f"Cost calculation failed: {str(e)}"
            }

    def calculate_all(
        self,
        nodes: list[dict],
        metrics_results: dict[str, dict],
        region: str = "ap-south-1"
    ) -> dict[str, dict]:
        """
        Calculate cost for all nodes.

        Args:
            nodes:           List of normalized node dicts
            metrics_results: Dict of { arn → MetricsEngine.collect() result }
            region:          AWS region

        Returns:
            Dict of { arn → cost result }

        Also handles:
          - VPC cost computation first (needed for subnet allocation)
          - Subnet proportional allocation based on VPC cost
        """
        cost_results: dict[str, dict] = {}

        # ── Pass 1: Calculate all non-subnet, non-vpc nodes ───────────────────
        vpc_costs: dict[str, float] = {}   # vpc_arn → monthly cost
        vpc_resources: dict[str, list] = {}  # vpc_arn → list of child resource arns

        for node in nodes:
            arn     = node.get("id") or node.get("data", {}).get("resource_arn", "")
            service = node.get("data", {}).get("service", "")
            summary = metrics_results.get(arn, {}).get("summary", {})

            if not arn:
                continue

            result = self.calculate(node, summary, region)
            cost_results[arn] = result

            # Track VPC costs for subnet allocation
            if service == "vpc":
                vpc_costs[arn] = result.get("monthlyCost", 0.0)

        # ── Pass 2: Subnet proportional allocation ────────────────────────────
        # Build: parent_node_id → list of child arns (compute resources in subnets)
        subnet_children: dict[str, list] = {}
        for node in nodes:
            parent_id = node.get("parentID") or node.get("parentId")
            service   = node.get("data", {}).get("service", "")
            arn       = node.get("id", "")
            if parent_id and service in ("ec2", "lambda", "rds"):
                subnet_children.setdefault(parent_id, []).append(arn)

        # For each subnet, find its parent VPC cost
        # Build subnet → vpc mapping (subnet parentID is vpc ARN)
        subnet_to_vpc: dict[str, str] = {}
        for node in nodes:
            if node.get("data", {}).get("service") == "subnet":
                parent_vpc = node.get("parentID") or node.get("parentId")
                arn        = node.get("id", "")
                if parent_vpc:
                    subnet_to_vpc[arn] = parent_vpc

        # Count total resources per VPC (across all its subnets)
        vpc_total_resources: dict[str, int] = {}
        for subnet_arn, vpc_arn in subnet_to_vpc.items():
            count = len(subnet_children.get(subnet_arn, []))
            vpc_total_resources[vpc_arn] = vpc_total_resources.get(vpc_arn, 0) + count

        # Recalculate subnet costs with VPC allocation context
        for node in nodes:
            service = node.get("data", {}).get("service", "")
            if service != "subnet":
                continue

            arn        = node.get("id", "")
            summary    = metrics_results.get(arn, {}).get("summary", {})
            parent_vpc = subnet_to_vpc.get(arn, "")
            vpc_cost   = vpc_costs.get(parent_vpc, 0.0)
            total_res  = vpc_total_resources.get(parent_vpc, 0)
            sub_res    = len(subnet_children.get(arn, []))

            cost_results[arn] = self.calculate(
                node, summary, region,
                vpc_monthly_cost=vpc_cost,
                subnet_resource_count=sub_res,
                total_vpc_resources=total_res,
            )

        logger.info(
            f"[CostEngine] Calculated costs for {len(cost_results)} nodes. "
            f"Total: ${round(sum(r.get('monthlyCost',0) for r in cost_results.values()),2)}/mo"
        )
        return cost_results

    def total_cost(self, cost_results: dict[str, dict]) -> float:
        """Sum all node costs. Returns monthly USD total."""
        return round(sum(r.get("monthlyCost", 0) for r in cost_results.values()), 2)

    def supported_services(self) -> list[str]:
        return list(self._registry.keys())

    # ─────────────────────────────────────────────────────────────────────────

    def _unsupported_result(self, service: str) -> dict:
        return {
            "service":          service,
            "source":           "pricing-api",
            "confidence":       "estimated",
            "billingModel":     "unsupported",
            "dailyCost":        0.0,
            "monthlyCost":      0.0,
            "yearlyCost":       0.0,
            "currency":         "USD",
            "usageMetrics":     {},
            "lineItems":        [],
            "notes":            f"No cost calculator registered for service '{service}'"
        }


# ── Singleton ─────────────────────────────────────────────────────────────────
cost_engine = CostEngine()
