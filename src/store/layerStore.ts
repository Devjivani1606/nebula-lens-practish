import { create } from 'zustand';
import { NetworkLayer, SecurityLayer, CostLayer } from '../layers/NetworkLayer';
import { Layer, CloudNode, CloudEdge } from '../types/cloud';

interface LayerStore {
  layers: Layer[];
  activeLayers: string[];
  toggleLayer: (id: string) => void;
  getVisibleNodes: (allNodes: CloudNode[]) => CloudNode[];
  getVisibleEdges: (allNodes: CloudNode[], allEdges: CloudEdge[]) => CloudEdge[];
}

export const useLayerStore = create<LayerStore>((set, get) => ({
  layers: [NetworkLayer, SecurityLayer, CostLayer],
  activeLayers: [],

  toggleLayer: (id: string) => {
    set((state) => {
      const isActive = state.activeLayers.includes(id);
      return {
        activeLayers: isActive
          ? state.activeLayers.filter((layerId) => layerId !== id)
          : [...state.activeLayers, id],
      };
    });
  },

  getVisibleNodes: (allNodes: CloudNode[]) => {
    const { activeLayers, layers } = get();

    if (activeLayers.length === 0) {
      return allNodes;
    }

    const activeLayerObjects = layers.filter(l => activeLayers.includes(l.id));

    return allNodes.filter(node =>
      activeLayerObjects.some(layer => layer.filter(node))
    );
  },

  getVisibleEdges: (allNodes: CloudNode[], allEdges: CloudEdge[]) => {
    const { activeLayers, layers } = get();

    if (activeLayers.length === 0) {
      return allEdges;
    }

    const activeLayerObjects = layers.filter(l => activeLayers.includes(l.id));

    return allEdges.filter(edge =>
      activeLayerObjects.some(layer => layer.edgeFilter(edge, allNodes))
    );
  }
}));
