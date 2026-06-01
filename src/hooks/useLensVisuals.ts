import { useCanvasStore } from '../store/useCanvasStore';

// HELPER: Makes checking container types bulletproof against uppercase/lowercase mismatches
const isContainer = (type?: string) => {
  if (!type) return false;
  const lowerType = type.toLowerCase();
  return lowerType.includes('vpc') || lowerType.includes('subnet');
};

export function useLensVisuals(nodeId: string) {
  const activeLens = useCanvasStore((state) => state.activeLens);
  const selectedNodeId = useCanvasStore((state) => state.selectedNodeId);
  const edges = useCanvasStore((state) => state.edges);
  const nodes = useCanvasStore((state) => state.nodes);

  // Default state (Structural View or nothing selected)
  if (activeLens === 'structural' || !selectedNodeId) {
    return { opacity: 1, isHighlighted: false, isDimmed: false };
  }

  const currentNode = nodes.find((n) => n.id === nodeId);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Blast Radius Logic
  if (activeLens === 'blast-radius') {

    // 1. THE BULLETPROOF GUARD CLAUSE
    if (isContainer(selectedNode?.type)) {
      if (isContainer(currentNode?.type)) {
        return {
          opacity: 0.6,
          isHighlighted: nodeId === selectedNodeId,
          isDimmed: false
        };
      }
      return { opacity: 1, isHighlighted: false, isDimmed: false };
    }

    // 2. Keep containers visible when a service is clicked
    if (isContainer(currentNode?.type)) {
      return { opacity: 0.6, isHighlighted: false, isDimmed: false };
    }

    // 3. Highlight the clicked service node
    if (nodeId === selectedNodeId) {
      return { opacity: 1, isHighlighted: true, isDimmed: false };
    }

    // 4. Calculate direct edge dependencies
    const isConnected = edges.some(
      (edge) =>
        (edge.source === selectedNodeId && edge.target === nodeId) ||
        (edge.target === selectedNodeId && edge.source === nodeId)
    );

    // 5. Apply the standard blast radius fade
    if (isConnected) {
      return { opacity: 1, isHighlighted: false, isDimmed: false };
    } else {
      return { opacity: 0.2, isHighlighted: false, isDimmed: true };
    }
  }

  // Cost Topology Logic
  if (activeLens === 'cost') {
    return { opacity: 1, isHighlighted: false, isDimmed: false };
  }

  return { opacity: 1, isHighlighted: false, isDimmed: false };
}