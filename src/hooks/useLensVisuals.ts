import { useCanvasStore } from '../store/useCanvasStore';
// 🚀 NEW: Import the Security Engine
import { useSecurityAudit } from './useSecurityAudit';

// HELPER: Makes checking container types bulletproof against uppercase/lowercase mismatches
const isContainer = (type?: string) => {
  if (!type) return false;
  const lowerType = type.toLowerCase();
  return lowerType.includes('vpc') || lowerType.includes('subnet') || lowerType.includes('availabilityzone'); // Added AZ support just in case!
};

export function useLensVisuals(nodeId: string) {
  const activeLens = useCanvasStore((state) => state.activeLens);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);

  // 🚀 NEW: Pull the vulnerability map from the engine
  const { vulnerableNodeIds } = useSecurityAudit();

  const currentNode = nodes.find((n) => n.id === nodeId);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Default state (Structural View or nothing selected)
  if (activeLens === 'structural') {
    return { opacity: 1, isHighlighted: false, isDimmed: false };
  }

  // ==========================================
  // LENS 1: BLAST RADIUS LOGIC
  // ==========================================
  if (activeLens === 'blast-radius' && selectedNodeId) {
    if (isContainer(selectedNode?.type)) {
      if (isContainer(currentNode?.type)) {
        return { opacity: 0.6, isHighlighted: nodeId === selectedNodeId, isDimmed: false };
      }
      return { opacity: 1, isHighlighted: false, isDimmed: false };
    }

    if (isContainer(currentNode?.type)) {
      return { opacity: 0.6, isHighlighted: false, isDimmed: false };
    }

    if (nodeId === selectedNodeId) {
      return { opacity: 1, isHighlighted: true, isDimmed: false };
    }

    const isConnected = edges.some(
      (edge) =>
        (edge.source === selectedNodeId && edge.target === nodeId) ||
        (edge.target === selectedNodeId && edge.source === nodeId)
    );

    if (isConnected) {
      return { opacity: 1, isHighlighted: false, isDimmed: false };
    } else {
      return { opacity: 0.2, isHighlighted: false, isDimmed: true };
    }
  }

  // ==========================================
  // LENS 2: COST TOPOLOGY LOGIC
  // ==========================================
  if (activeLens === 'cost') {
    if (isContainer(currentNode?.type)) {
      return { opacity: 0.3, isHighlighted: false, isDimmed: true, heatmapColor: undefined };
    }

    const rawCost = (currentNode?.data as any)?.cost?.monthlyCost;
    const cost = rawCost !== undefined ? Number(rawCost) : undefined;

    if (cost === undefined || isNaN(cost)) {
      //FALLBACK: If cost is missing, don't dim the node out so it remains fully visible.
      return { opacity: 1, isHighlighted: false, isDimmed: false, heatmapColor: undefined };
    }

    let heatmapColor = "rgba(34, 197, 94, 0.04)";
    let borderColor = "rgba(34, 197, 94, 0.4)";
    let shadowColor = "rgba(34, 197, 94, 0.15)";

    if (cost > 500) {
      heatmapColor = "rgba(239, 68, 68, 0.03)";
      borderColor = "rgba(239, 68, 68, 0.5)";
      shadowColor = "rgba(239, 68, 68, 0.20)";
    } else if (cost > 100) {
      heatmapColor = "rgba(249, 115, 22, 0.04)";
      borderColor = "rgba(249, 115, 22, 0.5)";
      shadowColor = "rgba(249, 115, 22, 0.15)";
    }
    return { opacity: 1, isHighlighted: false, isDimmed: false, heatmapColor, borderColor, shadowColor };
  }

  // ==========================================
  // LENS 3: SEC-OPS LOGIC (NEW)
  // ==========================================
  if (activeLens === 'security') {
    // Fade out structural containers so vulnerabilities pop
    if (isContainer(currentNode?.type)) {
      return { opacity: 0.15, isHighlighted: false, isDimmed: true };
    }

    // Check if the current node is flagged by our security engine
    const isVulnerable = vulnerableNodeIds.has(nodeId);

    if (isVulnerable) {
      // 🚨 Threat Detected! Highlight with Amber/Orange glow
      return {
        opacity: 1,
        isHighlighted: true,
        isDimmed: false,
        heatmapColor: "rgba(245, 158, 11, 0.05)", // Amber tint
        borderColor: "rgba(245, 158, 11, 0.6)",   // Crisp Amber border
        shadowColor: "rgba(245, 158, 11, 0.3)"    // Deep Amber glow
      };
    } else {
      // 🛡️ Safe Node. Dim it out slightly with a secure green border.
      return {
        opacity: 0.4,
        isHighlighted: false,
        isDimmed: true,
        heatmapColor: "rgba(34, 197, 94, 0.02)",
        borderColor: "rgba(34, 197, 94, 0.2)",
        shadowColor: "transparent"
      };
    }
  }

  // Default return for Structural View
  return { opacity: 1, isHighlighted: false, isDimmed: false, heatmapColor: undefined, borderColor: undefined };
}