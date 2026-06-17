import { Node, Edge } from '@xyflow/react';
import { CSSProperties } from 'react';

export interface CloudNode extends Node {
  networkMeta?: {
    vpcId: string;
    subnetId?: string;
    cidr?: string;
    az?: string;
    isPublic?: boolean;
    securityGroups?: string[];
    routeTable?: string;
  };
}

export interface CloudEdge extends Edge {
  networkMeta?: {
    protocol?: "TCP" | "UDP" | "ICMP";
    port?: number | string;
    direction: "inbound" | "outbound" | "bidirectional";
    isEncrypted?: boolean;
    throughput?: number;
  };
}

export type Layer = {
  id: string;
  name: string;
  icon: string;
  active: boolean;
  filter: (node: CloudNode) => boolean;
  edgeFilter: (edge: CloudEdge) => boolean;
  renderOverride?: Partial<CSSProperties>;
  priority: number;
};
