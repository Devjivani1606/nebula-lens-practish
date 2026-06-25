import { CloudNode } from '../../types/cloud';

const SERVICE_CATEGORY_MAP: Record<string, string> = {
  'ec2Node': 'compute',
  'ecsNode': 'compute',
  'eksNode': 'compute',
  
  'lambdaNode': 'serverless',
  'stepFunctionsNode': 'serverless',
  'eventbridgeNode': 'serverless',
  'eventBridgeNode': 'serverless',

  's3Node': 'storage',

  'databaseNode': 'database',
  'rdsNode': 'database',
  'dynamodbNode': 'database',
  'dynamoDbNode': 'database',

  'VPC': 'network',
  'vpcNode': 'network',
  'Subnet': 'network',
  'subnetNode': 'network',
  'IGW': 'network',
  'AvailabilityZone': 'network',
  'eniNode': 'network',
  'albNode': 'network',
  'apiGatewayNode': 'network',
  'cloudfrontNode': 'network',
  'cloudFrontNode': 'network',

  'securityGroupNode': 'security',
  'iamRoleNode': 'security',
  'secretsManagerNode': 'security',

  'sqsNode': 'integration',
  'snsNode': 'integration',
};

// Services that are typically exposed to the internet
const INTERNET_FACING_SERVICES = new Set([
  'albNode',
  'apiGatewayNode',
  'cloudFrontNode',
  'cloudfrontNode',
  'IGW'
]);

/**
 * Enriches a node with standard metadata like `category` and `isInternetFacing`.
 * This ensures the Rule Evaluator can reliably match on `data.category`.
 */
export function enrichNodeWithLayerMetadata(node: CloudNode): CloudNode {
  // If already enriched or data doesn't exist, handle gracefully
  const data = node.data || {};
  const type = node.type || '';

  const category = SERVICE_CATEGORY_MAP[type] || 'unknown';
  const isInternetFacing = INTERNET_FACING_SERVICES.has(type);

  // Return a new object so we don't mutate the store directly
  return {
    ...node,
    data: {
      ...data,
      category,
      isInternetFacing,
    }
  };
}
