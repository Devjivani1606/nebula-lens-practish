import { useMemo } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';

export function useBlastRadius(startNodeId: string | null) {
  const edges = useCanvasStore(state => state.edges);
  const nodes = useCanvasStore(state => state.nodes);

  return useMemo(() => {
    if (!startNodeId) return { affectedNodeIds: new Set<string>(), affectedNodes: [], affectedEdgesMap: new Map<string, number>() };

    const affected = new Set<string>();
    const affectedEdgesMap = new Map<string, number>();
    const queue = [{ id: startNodeId, depth: 0 }];

    // The node that fails is the center of the blast radius
    affected.add(startNodeId);

    // Breadth-First Search (BFS) to find all downstream cascading failures
    while (queue.length > 0) {
      const { id: currentId, depth } = queue.shift()!;

      // 1. NETWORK FAILURE: Find anything connected downstream via traffic edges
      edges.forEach(edge => {
        if (edge.source === currentId) {
          if (!affectedEdgesMap.has(edge.id)) {
            affectedEdgesMap.set(edge.id, depth);
          }
          if (!affected.has(edge.target)) {
            affected.add(edge.target);
            queue.push({ id: edge.target, depth: depth + 1 });
          }
        }
      });


      // 2. INFRASTRUCTURE FAILURE: Find anything structurally trapped inside this container
      nodes.forEach(node => {
        if (node.parentId === currentId && !affected.has(node.id)) {
          affected.add(node.id);
          // By pushing the child to the queue, the algorithm will now also find
          // everything connected to the child!
          queue.push({ id: node.id, depth: depth + 1 });
        }
      });
    }

    // Map the IDs back to the actual node data objects for the UI
    const affectedNodes = nodes.filter(n => affected.has(n.id) && n.id !== startNodeId);

    return { affectedNodeIds: affected, affectedNodes, affectedEdgesMap };
  }, [startNodeId, edges, nodes]);
}