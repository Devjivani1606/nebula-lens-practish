import { Layer, CloudNode, CloudEdge } from '../types/cloud';

const NETWORK_NODE_TYPES = [
  "vpc", "subnet", "ec2", "rds", "lambda", "igw", 
  "nat-gateway", "route-table", "security-group", 
  "load-balancer", "elasticache"
];

const NETWORK_EDGE_TYPES = [
  "network-traffic", "routes-to", "sg-rule"
];

export const NetworkLayer: Layer = {
  id: 'network-layer',
  name: 'Network',
  icon: 'network',
  active: true,
  priority: 10,
  filter: (node: CloudNode) => {
    return node.type ? NETWORK_NODE_TYPES.includes(node.type) : false;
  },
  edgeFilter: (edge: CloudEdge) => {
    // Assuming relationshipType might be on the edge itself or in its data payload
    const relType = (edge as any).relationshipType || edge.data?.relationshipType;
    return NETWORK_EDGE_TYPES.includes(relType);
  },
  renderOverride: {
    tint: "#3B82F6",
    groupBy: "vpcId",
    showBadge: "cidr",
    edgeStyle: "animated-flow"
  } as any
};

export const SecurityLayer: Layer = {
  id: 'security-layer',
  name: 'Security',
  icon: 'shield',
  active: false,
  priority: 20,
  filter: (node: CloudNode) => true,
  edgeFilter: (edge: CloudEdge) => true,
};

export const CostLayer: Layer = {
  id: 'cost-layer',
  name: 'Cost',
  icon: 'dollar-sign',
  active: false,
  priority: 30,
  filter: (node: CloudNode) => true,
  edgeFilter: (edge: CloudEdge) => true,
};
