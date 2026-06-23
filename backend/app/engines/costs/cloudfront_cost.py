from app.engines.costs.base import BaseCostCalculator
from app.engines.pricing import pricing_service


class CloudFrontCostCalculator(BaseCostCalculator):

    SERVICE = "cloudfront"

    def calculate(self, node: dict, metrics_summary: dict, region: str = "ap-south-1") -> dict:
        credentials = node.get("_credentials")

        total_requests = metrics_summary.get("requests", 0) or metrics_summary.get("totalRequests", 0) or 0
        monthly_requests = total_requests * 30

        bytes_downloaded = metrics_summary.get("bytesDownloaded", 0) or metrics_summary.get("dataTransferOut", 0) or 0
        monthly_gb = (bytes_downloaded / (1024 ** 3)) * 30

        # Dynamic pricing
        price_per_10k_req = pricing_service.get("cloudfront", region, "requests", credentials) or 0.0075
        price_per_gb_out = pricing_service.get("cloudfront", region, "transfer", credentials) or 0.085

        line_items = [
            self._line(
                "CloudFront HTTP/HTTPS Requests",
                monthly_requests / 10_000,
                "per 10K requests",
                price_per_10k_req
            ),
            self._line(
                "CloudFront Outbound Data Transfer",
                monthly_gb,
                "GB",
                price_per_gb_out
            )
        ]

        return self._build_result(
            billing_model="pay-per-use",
            dimensions={
                "monthlyRequests": monthly_requests,
                "monthlyDataTransferGB": round(monthly_gb, 4)
            },
            line_items=line_items,
            region=region,
            notes=f"Estimated monthly cost for CloudFront Distribution {node.get('data', {}).get('name', 'CDN')} in {region}"
        )
