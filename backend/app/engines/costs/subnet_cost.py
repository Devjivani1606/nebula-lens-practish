"""
SubnetCostAllocator

Subnets have NO direct AWS billing.

Strategy: Proportionally allocate parent VPC NAT Gateway cost across subnets
based on how many compute resources (EC2/Lambda/RDS) are inside each subnet.

This gives a cost-attribution view even though AWS doesn't bill subnets directly.

Example:
  VPC NAT cost: $100/month
  subnet-A: 3 resources → 60% → $60
  subnet-B: 2 resources → 40% → $40
"""

from app.engines.costs.base import BaseCostCalculator


class SubnetCostAllocator(BaseCostCalculator):

    SERVICE = "subnet"

    def calculate(
        self,
        node: dict,
        metrics_summary: dict,
        region: str = "ap-south-1",
        vpc_monthly_cost: float = 0.0,
        subnet_resource_count: int = 0,
        total_vpc_resources: int = 0
    ) -> dict:
        """
        Args:
            node:                  Normalized subnet node
            metrics_summary:       Subnet metrics summary (static metadata)
            vpc_monthly_cost:      Total VPC (NAT) cost for the parent VPC
            subnet_resource_count: Number of compute nodes inside this subnet
            total_vpc_resources:   Total compute nodes across all subnets in VPC
        """
        if total_vpc_resources == 0 or vpc_monthly_cost == 0:
            return self._zero_result(
                "Subnets have no direct billing. "
                "VPC cost allocation requires at least one compute resource in the VPC."
            )

        # Proportional allocation
        allocation_pct = subnet_resource_count / total_vpc_resources
        allocated_cost = round(vpc_monthly_cost * allocation_pct, 4)

        line_items = [
            self._line(
                f"VPC NAT Cost Allocation ({subnet_resource_count}/{total_vpc_resources} resources = {round(allocation_pct*100,1)}%)",
                1,
                "allocation",
                allocated_cost
            )
        ]

        return self._build_result(
            billing_model="vpc-cost-allocation",
            dimensions={
                "vpcMonthlyCost":     vpc_monthly_cost,
                "subnetResources":    subnet_resource_count,
                "totalVpcResources":  total_vpc_resources,
                "allocationPct":      round(allocation_pct * 100, 2),
            },
            line_items=line_items,
            region=region,
            notes=(
                f"Allocated {round(allocation_pct*100,1)}% of parent VPC cost (${vpc_monthly_cost}/mo) "
                f"based on {subnet_resource_count} resources in this subnet."
            )
        )
