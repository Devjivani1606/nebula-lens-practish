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
    return getVisibleNodes(nodes);
  }, [nodes, activeLayers, getVisibleNodes]);

  const visibleEdges = useMemo(() => {
    return getVisibleEdges(edges);
  }, [edges, activeLayers, getVisibleEdges]);

  return { visibleNodes, visibleEdges };
}
