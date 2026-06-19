import { Layer, CloudNode, CloudEdge } from '../types/cloud';

export const NetworkLayer: Layer = {
  id: 'network-layer',
  name: 'Network',
  icon: 'network',
  active: true,
  priority: 10,
  filter: (node: CloudNode) => {
    return ["VPC", "AvailabilityZone", "Subnet", "lambdaNode"].includes(node.type || "");
  },
  edgeFilter: (edge: CloudEdge, nodes: CloudNode[]) => {
    const networkTypes = ["VPC", "AvailabilityZone", "Subnet", "lambdaNode"];
    const sourceIsNetwork = nodes.find(n => n.id === edge.source && networkTypes.includes(n.type || ""));
    const targetIsNetwork = nodes.find(n => n.id === edge.target && networkTypes.includes(n.type || ""));
    return !!(sourceIsNetwork && targetIsNetwork);
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
  filter: (node: CloudNode) => {
    return ["apiGatewayNode", "databaseNode", "s3Node", "sqsNode"].includes(node.type || "");
  },
  edgeFilter: (edge: CloudEdge, nodes: CloudNode[]) => {
    const securityTypes = ["apiGatewayNode", "databaseNode", "s3Node", "sqsNode"];
    const sourceIs = nodes.find(n => n.id === edge.source && securityTypes.includes(n.type || ""));
    const targetIs = nodes.find(n => n.id === edge.target && securityTypes.includes(n.type || ""));
    return !!(sourceIs || targetIs); // show edge if either end is a security node
  },
};

export const CostLayer: Layer = {
  id: 'cost-layer',
  name: 'Cost',
  icon: 'dollar-sign',
  active: false,
  priority: 30,
  filter: (node: CloudNode) => true,
  edgeFilter: (edge: CloudEdge, nodes: CloudNode[]) => true,
};
