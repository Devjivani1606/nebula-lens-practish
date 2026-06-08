import { useMemo } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';

export function useSecurityAudit() {
  const nodes = useCanvasStore(state => state.nodes);
  const edges = useCanvasStore(state => state.edges);
  const complianceFramework = useCanvasStore(state => state.complianceFramework); // 🚀 NEW

  return useMemo(() => {
    const vulnerabilities: any[] = [];
    let score = 100;

    nodes.forEach(node => {
      // 🛡️ GENERAL RULES (Applies to all)
      if (node.type === 'apiGatewayNode') {
        vulnerabilities.push({ nodeId: node.id, name: node.data?.name || 'API Gateway', issue: 'Missing WAF', severity: 'high', remediation: 'Attach AWS WAF.', deduction: 15 });
        score -= 15;
      }

      // 📜 SOC 2 RULES (Data Privacy & Auditing)
      if (complianceFramework === 'soc2' || complianceFramework === 'hipaa') {
        if (node.type === 'databaseNode') {
          vulnerabilities.push({ nodeId: node.id, name: node.data?.name || 'Database', issue: 'Audit Logging Disabled', severity: 'high', remediation: 'SOC 2 requires comprehensive access logging on all data stores.', deduction: 20 });
          score -= 20;
        }
        if (node.type === 's3Node') {
          vulnerabilities.push({ nodeId: node.id, name: node.data?.name || 'S3 Bucket', issue: 'Object Lock Disabled', severity: 'medium', remediation: 'Enable WORM (Write Once Read Many) storage for compliance.', deduction: 10 });
          score -= 10;
        }
      }

      // 🏥 HIPAA RULES (Strict Healthcare Data Security)
      if (complianceFramework === 'hipaa') {
        if (node.type === 'lambdaNode') {
          vulnerabilities.push({ nodeId: node.id, name: node.data?.name || 'Compute', issue: 'Shared Tenancy Compute', severity: 'critical', remediation: 'HIPAA requires dedicated compute instances (ePHI isolation).', deduction: 30 });
          score -= 30;
        }
        if (node.type === 'subnet-private' || node.type === 'Subnet') {
           vulnerabilities.push({ nodeId: node.id, name: node.data?.name || 'Network', issue: 'Unencrypted Intra-Subnet Traffic', severity: 'critical', remediation: 'Enforce strict mTLS mesh for all internal microservices.', deduction: 25 });
           score -= 25;
        }
      }
    });

    return {
      vulnerabilities,
      score: Math.max(0, score),
      vulnerableNodeIds: new Set(vulnerabilities.map(v => v.nodeId))
    };
  }, [nodes, edges, complianceFramework]); // Add dependency
}