import { useMemo } from 'react';
import { useCanvasStore } from '../store/useCanvasStore';
import { useLayerStore } from '../store/layerStore';
import { selectLayerStack } from '../store/selectors/layerSelectors';
import { computeVisibleNodes, computeVisibleEdges } from '../lib/layers/blendEngine';
import { CloudNode } from '../types/cloud';

export function useLayerEngine() {
  const nodes = useCanvasStore((state) => state.nodes);
  const edges = useCanvasStore((state) => state.edges);

  const layers = useLayerStore((state) => state.layers);
  const layerStates = useLayerStore((state) => state.layerStates);

  const visibleNodes = useMemo(() => {
    const layerStack = selectLayerStack({ layers, layerStates });
    
    // Pass raw nodes directly to our pure blend engine
    const filteredNodes = computeVisibleNodes(nodes, layerStack);
    
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
  }, [nodes, layers, layerStates]); // Only recompute when nodes array OR layer definitions/states change

  const visibleEdges = useMemo(() => {
    return computeVisibleEdges(edges, visibleNodes);
  }, [edges, visibleNodes]); // Only recompute when edges array OR visibleNodes change

  return { visibleNodes, visibleEdges };
}
