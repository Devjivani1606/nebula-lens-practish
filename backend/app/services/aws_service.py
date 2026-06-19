import boto3
from botocore.exceptions import ClientError, NoCredentialsError
from typing import Optional
import logging

logger = logging.getLogger(__name__)

class AWSService:

    def verify_role_arn(self, role_arn: str) -> dict:
        """
        Verify that the IAM Role ARN is valid and accessible.
        Uses STS to assume the role and get caller identity.
        
        Returns dict with success status and account details.
        """
        
        try:
            # Step 1: Create STS client
            sts_client = boto3.client('sts')  # Security Token Service

            # Step 2: Assume the role the user provided
            assume_args = {
                "RoleArn": role_arn,
                "RoleSessionName": "GravityLensVerification"
            }

            assumed_role = sts_client.assume_role(**assume_args)

            # Step 3: Use temporary credentials to verify identity
            credentials = assumed_role['Credentials']

            temp_sts = boto3.client(
                'sts',
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            # Step 4: Get account details
            identity = temp_sts.get_caller_identity()

            return {
                "success": True,
                "account_id": identity['Account'],
                "arn": identity['Arn'],
                "user_id": identity['UserId']
            }

        except ClientError as e:
            error_code = e.response['Error']['Code']
            
            if error_code == 'AccessDenied':
                return {
                    "success": False,
                    "error": "Access denied. Check your IAM Role permissions."
                }
            elif error_code == 'InvalidClientTokenId':
                return {
                    "success": False,
                    "error": "Invalid credentials. Check your Role ARN."
                }
            else:
                return {
                    "success": False,
                    "error": f"AWS Error: {str(e)}"
                }

        except Exception as e:
            logger.error(f"Error verifying role ARN: {str(e)}")
            return {
                "success": False,
                "error": f"Verification failed: {str(e)}"
            }

    def get_active_regions(self, role_arn: str) -> list:
        """
        Get all active AWS regions for this account.
        Used by Region Manager during scanning.
        """
        try:
            credentials = self._get_temp_credentials(role_arn)
            if not credentials:
                return []

            ec2_client = boto3.client(
                'ec2',
                region_name='us-east-1',
                aws_access_key_id=credentials['AccessKeyId'],
                aws_secret_access_key=credentials['SecretAccessKey'],
                aws_session_token=credentials['SessionToken']
            )

            response = ec2_client.describe_regions(
                Filters=[{'Name': 'opt-in-status', 'Values': ['opt-in-not-required', 'opted-in']}]
            )

            regions = [r['RegionName'] for r in response['Regions']]
            logger.info(f"Found {len(regions)} active regions")
            return regions

        except Exception as e:
            logger.error(f"Error fetching regions: {str(e)}")
            return ['ap-south-1', 'us-east-1']  # fallback regions

    def _get_temp_credentials(self, role_arn: str) -> Optional[dict]:
        """
        Internal helper — assumes role and returns temporary credentials.
        Used by all scanners.
        """
        try:
            sts_client = boto3.client('sts')
            assume_args = {
                "RoleArn": role_arn,
                "RoleSessionName": "GravityLensScan"
            }

            assumed_role = sts_client.assume_role(**assume_args)
            return assumed_role['Credentials']
        except Exception as e:
            logger.error(f"Failed to get credentials: {str(e)}")
            return None


# Single instance used across the app
aws_service = AWSService()