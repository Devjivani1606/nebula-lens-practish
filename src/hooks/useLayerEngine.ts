import { useMemo } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import { useLayerStore } from '../store/layerStore';
import { CloudNode, CloudEdge } from '../types/cloud';

export function useLayerEngine() {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);

  const activeLayers = useLayerStore((state) => state.activeLayers);
  const getVisibleNodes = useLayerStore((state) => state.getVisibleNodes);
  const getVisibleEdges = useLayerStore((state) => state.getVisibleEdges);

  const visibleNodes = useMemo(() => {
    const filteredNodes = getVisibleNodes(nodes);
    const visibleIds = new Set(filteredNodes.map(n => n.id));

    // React Flow throws an error if a node has a parentId that doesn't exist in the nodes array.
    // If a parent is filtered out by a layer, we must detach the child so it can still render independently.
    return filteredNodes.map(node => {
      if (node.parentId && !visibleIds.has(node.parentId)) {
        const { parentId, extent, ...rest } = node;
        return rest as CloudNode;
      }
      return node;
    });
  }, [nodes, activeLayers, getVisibleNodes]);

  const visibleEdges = useMemo(() => {
    return getVisibleEdges(nodes, edges);
  }, [nodes, edges, activeLayers, getVisibleEdges]);

  return { visibleNodes, visibleEdges };
}


