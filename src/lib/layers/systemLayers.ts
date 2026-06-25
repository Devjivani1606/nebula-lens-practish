import { LayerDefinition } from '../../types/layers';

export const systemLayers: LayerDefinition[] = [
  {
    id: 'layer-network',
    label: 'Network Layer',
    description: 'VPCs, Subnets, Gateways, and ALBs',
    icon: 'network',
    color: '#8b5cf6',
    isSystem: true,
    isEnabled: false,
    blendMode: 'additive',
    priority: 100,
    tags: ['infrastructure', 'core'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'data.category', operator: 'eq', value: 'network' }
      ]
    }
  },
  {
    id: 'layer-compute',
    label: 'Compute Layer',
    description: 'EC2, ECS, and EKS',
    icon: 'server',
    color: '#06b6d4',
    isSystem: true,
    isEnabled: false,
    blendMode: 'additive',
    priority: 90,
    tags: ['infrastructure', 'core'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'data.category', operator: 'eq', value: 'compute' }
      ]
    }
  },
  {
    id: 'layer-storage',
    label: 'Storage Layer',
    description: 'S3 Buckets and Volumes',
    icon: 'database',
    color: '#22c55e',
    isSystem: true,
    isEnabled: false,
    blendMode: 'additive',
    priority: 80,
    tags: ['data', 'core'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'data.category', operator: 'eq', value: 'storage' }
      ]
    }
  },
  {
    id: 'layer-database',
    label: 'Database Layer',
    description: 'RDS, DynamoDB, MongoDB',
    icon: 'database-zap',
    color: '#3b82f6',
    isSystem: true,
    isEnabled: false,
    blendMode: 'additive',
    priority: 70,
    tags: ['data', 'core'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'data.category', operator: 'eq', value: 'database' }
      ]
    }
  },
  {
    id: 'layer-serverless',
    label: 'Serverless',
    description: 'Lambda, Step Functions, EventBridge',
    icon: 'zap',
    color: '#f97316',
    isSystem: true,
    isEnabled: false,
    blendMode: 'additive',
    priority: 60,
    tags: ['compute', 'modern'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'data.category', operator: 'eq', value: 'serverless' }
      ]
    }
  },
  {
    id: 'layer-security',
    label: 'Security & IAM',
    description: 'IAM Roles, Security Groups, Secrets',
    icon: 'shield',
    color: '#eab308',
    isSystem: true,
    isEnabled: false,
    blendMode: 'additive',
    priority: 50,
    tags: ['security', 'compliance'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'data.category', operator: 'eq', value: 'security' }
      ]
    }
  },
  {
    id: 'layer-integration',
    label: 'Integration & Messaging',
    description: 'SQS, SNS queues and topics',
    icon: 'mail',
    color: '#d946ef',
    isSystem: true,
    isEnabled: false, // Defaulting to true as it connects compute often
    blendMode: 'additive',
    priority: 40,
    tags: ['messaging'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'data.category', operator: 'eq', value: 'integration' }
      ]
    }
  },
  {
    id: 'layer-internet-facing',
    label: 'Internet Facing',
    description: 'Resources exposed to the public internet',
    icon: 'globe',
    color: '#ef4444',
    isSystem: true,
    isEnabled: false,
    blendMode: 'additive',
    priority: 30,
    tags: ['security', 'network'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'data.isInternetFacing', operator: 'eq', value: true }
      ]
    }
  },
  {
    id: 'layer-data-flow',
    label: 'Data Flow Only',
    description: 'Hides all network structures (VPC/Subnets) to show only logical data flow',
    icon: 'git-merge',
    color: '#ec4899',
    isSystem: true,
    isEnabled: false,
    blendMode: 'subtractive',
    priority: 150, // High priority to subtract before others
    tags: ['view'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'type', operator: 'in', value: ['VPC', 'vpcNode', 'Subnet', 'subnetNode', 'AvailabilityZone'] }
      ]
    }
  },
  {
    id: 'layer-critical-path',
    label: 'Critical Path',
    description: 'Always show resources tagged as Production/Critical',
    icon: 'alert-triangle',
    color: '#ef4444',
    isSystem: true,
    isEnabled: false,
    blendMode: 'override',
    priority: 999, // Highest priority to always override
    tags: ['business'],
    rules: {
      operator: 'OR',
      rules: [
        { field: 'data.cost.monthlyCost', operator: 'regex', value: '.*' }, // Fallback rule for testing
        // You can add more rules based on actual tags in data
      ]
    }
  }
];
