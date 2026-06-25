"""
CostEngine — pluggable registry-based cost dispatcher.

Routes each node to the correct service-specific CostCalculator.
No if-else chains. Adding a new service = register one class.

Key change from v1:
  - calculate_all() now accepts `credentials` and injects them into each node
    as node["_credentials"] so calculators can call the live Pricing API.
  - PricingService handles the 3-level fallback internally — calculators
    never need to know whether prices came from cache, API, or fallback.

Usage:
    from app.engines.cost_engine import cost_engine
    result = cost_engine.calculate(node, metrics_summary, region, credentials)
"""

import logging
from app.engines.costs.base import BaseCostCalculator

from app.engines.costs.lambda_cost      import LambdaCostCalculator
from app.engines.costs.sqs_cost         import SQSCostCalculator
from app.engines.costs.ec2_cost         import EC2CostCalculator
from app.engines.costs.s3_cost          import S3CostCalculator
from app.engines.costs.vpc_cost         import VPCCostCalculator
from app.engines.costs.apigateway_cost  import APIGatewayCostCalculator
from app.engines.costs.subnet_cost      import SubnetCostAllocator
from app.engines.costs.eventbridge_cost import EventBridgeCostCalculator
from app.engines.costs.rds_cost          import RDSCostCalculator
from app.engines.costs.sns_cost          import SNSCostCalculator
from app.engines.costs.dynamodb_cost     import DynamoDBCostCalculator
from app.engines.costs.cloudfront_cost   import CloudFrontCostCalculator
from app.engines.costs.ecs_cost          import ECSCostCalculator
# from app.engines.costs.eks_cost          import EKSCostCalculator
# from app.engines.costs.secretsmanager_cost import SecretsManagerCostCalculator
# from app.engines.costs.stepfunctions_cost import StepFunctionsCostCalculator

logger = logging.getLogger(__name__)


class CostEngine:
    """
    Central dispatcher for all AWS cost calculation.

    The registry maps service name → calculator instance.
    CostEngine.calculate() routes any node to the right calculator automatically.

    To add a new service (e.g. RDS):
      1. Create app/engines/costs/rds_cost.py  (inherits BaseCostCalculator)
      2. Add fallback prices to pricing_service.py _FALLBACK dict
      3. Call cost_engine.register(RDSCostCalculator())  ← one line
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
            EventBridgeCostCalculator(),
            RDSCostCalculator(),
            SNSCostCalculator(),
            DynamoDBCostCalculator(),
            CloudFrontCostCalculator(),
            ECSCostCalculator(),
            # EKSCostCalculator(),
            # SecretsManagerCostCalculator(),
            # StepFunctionsCostCalculator(),
        ]
        for calc in builtins:
            self.register(calc)

    # ─────────────────────────────────────────────────────────────────────────
    # PUBLIC API
    # ─────────────────────────────────────────────────────────────────────────

    def register(self, calculator: BaseCostCalculator):
        if not calculator.SERVICE:
            raise ValueError(f"Calculator {type(calculator).__name__} must define SERVICE attribute")
        self._registry[calculator.SERVICE] = calculator
        logger.info(f"[CostEngine] Registered calculator for service: {calculator.SERVICE}")

    def calculate(
        self,
        node: dict,
        metrics_summary: dict,
        region: str = "ap-south-1",
        credentials: dict = None,
        **kwargs
    ) -> dict:
        """
        Route a normalized node to its service-specific cost calculator.

        Args:
            node:            Normalized node dict
            metrics_summary: MetricsEngine summary dict for this node
            region:          AWS region
            credentials:     AWS credentials — passed to PricingService for live pricing
            **kwargs:        Extra args for specific calculators (e.g. SubnetCostAllocator)
        """
        service = node.get("data", {}).get("service", "").lower()

        if not service:
            logger.warning(f"[CostEngine] Node has no service field: {node.get('id')}")
            return self._unsupported_result(service)

        calculator = self._registry.get(service)

        if not calculator:
            logger.info(f"[CostEngine] No calculator registered for service '{service}' — skipping")
            return self._unsupported_result(service)

        # Inject credentials into node so calculators can call PricingService
        # We use a temp copy to avoid mutating the original node dict
        node_with_creds = {**node, "_credentials": credentials}

        try:
            return calculator.calculate(node_with_creds, metrics_summary, region, **kwargs)
        except Exception as e:
            logger.error(f"[CostEngine] Calculator for '{service}' raised error: {e}")
            return self._error_result(service, str(e))

    def calculate_all(
        self,
        nodes: list[dict],
        metrics_results: dict[str, dict],
        region: str = "ap-south-1",
        credentials: dict = None,
    ) -> dict[str, dict]:
        """
        Calculate cost for all nodes.

        Args:
            nodes:           List of normalized node dicts
            metrics_results: Dict of { arn → MetricsEngine.collect() result }
            region:          AWS region
            credentials:     AWS credentials for live Pricing API calls

        Returns: Dict of { arn → cost result }
        """
        cost_results: dict[str, dict] = {}
        vpc_costs:    dict[str, float] = {}   # vpc_arn → monthly cost

        # ── Pass 1: All non-subnet nodes ──────────────────────────────────────
        for node in nodes:
            arn     = node.get("id") or node.get("data", {}).get("resource_arn", "")
            service = node.get("data", {}).get("service", "")
            summary = metrics_results.get(arn, {}).get("summary", {})

            if not arn:
                continue

            result = self.calculate(node, summary, region, credentials)
            cost_results[arn] = result

            if service == "vpc":
                vpc_costs[arn] = result.get("monthlyCost", 0.0)

        # ── Pass 2: Subnet proportional allocation ────────────────────────────
        # Map: subnet_arn → vpc_arn
        subnet_to_vpc: dict[str, str] = {}
        for node in nodes:
            if node.get("data", {}).get("service") == "subnet":
                parent_vpc = node.get("parentID") or node.get("parentId")
                arn        = node.get("id", "")
                if parent_vpc:
                    subnet_to_vpc[arn] = parent_vpc

        # Map: subnet_arn → list of compute child arns (ec2, lambda, rds)
        subnet_children: dict[str, list] = {}
        for node in nodes:
            parent_id = node.get("parentID") or node.get("parentId")
            service   = node.get("data", {}).get("service", "")
            arn       = node.get("id", "")
            if parent_id and service in ("ec2", "lambda", "rds"):
                subnet_children.setdefault(parent_id, []).append(arn)

        # Total compute resources per VPC (sum across all its subnets)
        vpc_total_resources: dict[str, int] = {}
        for subnet_arn, vpc_arn in subnet_to_vpc.items():
            count = len(subnet_children.get(subnet_arn, []))
            vpc_total_resources[vpc_arn] = vpc_total_resources.get(vpc_arn, 0) + count

        # Recalculate subnet costs with VPC allocation context
        for node in nodes:
            if node.get("data", {}).get("service") != "subnet":
                continue

            arn        = node.get("id", "")
            summary    = metrics_results.get(arn, {}).get("summary", {})
            parent_vpc = subnet_to_vpc.get(arn, "")
            vpc_cost   = vpc_costs.get(parent_vpc, 0.0)
            total_res  = vpc_total_resources.get(parent_vpc, 0)
            sub_res    = len(subnet_children.get(arn, []))

            cost_results[arn] = self.calculate(
                node, summary, region, credentials,
                vpc_monthly_cost=vpc_cost,
                subnet_resource_count=sub_res,
                total_vpc_resources=total_res,
            )

        total = round(sum(r.get("monthlyCost", 0) for r in cost_results.values()), 2)
        logger.info(
            f"[CostEngine] Calculated costs for {len(cost_results)} nodes. "
            f"Total: ${total}/mo | Region: {region}"
        )
        return cost_results

    def total_cost(self, cost_results: dict[str, dict]) -> float:
        return round(sum(r.get("monthlyCost", 0) for r in cost_results.values()), 2)

    def supported_services(self) -> list[str]:
        return list(self._registry.keys())

    # ─────────────────────────────────────────────────────────────────────────

    def _unsupported_result(self, service: str) -> dict:
        return {
            "service":      service,
            "source":       "pricing-api",
            "confidence":   "estimated",
            "billingModel": "unsupported",
            "dailyCost":    0.0,
            "monthlyCost":  0.0,
            "yearlyCost":   0.0,
            "currency":     "USD",
            "usageMetrics": {},
            "lineItems":    [],
            "notes":        f"No cost calculator registered for service '{service}'"
        }

    def _error_result(self, service: str, error: str) -> dict:
        return {
            "service":      service,
            "source":       "pricing-api",
            "confidence":   "estimated",
            "billingModel": "error",
            "dailyCost":    0.0,
            "monthlyCost":  0.0,
            "yearlyCost":   0.0,
            "currency":     "USD",
            "usageMetrics": {},
            "lineItems":    [],
            "notes":        f"Cost calculation failed: {error}"
        }


# ── Singleton ──────────────────────────────────────────────────────────────────
cost_engine = CostEngine()
