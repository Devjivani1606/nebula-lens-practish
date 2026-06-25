import { create } from 'zustand';
import { LayerDefinition, LayerState, LayerStackItem, SerializedLayerConfig } from '../types/layers';

interface LayerStoreState {
  layers: LayerDefinition[];
  layerStates: Record<string, LayerState>;

  // Actions
  registerLayer: (def: LayerDefinition) => void;
  toggleLayer: (id: string) => void;
  setLayerEnabled: (id: string, enabled: boolean) => void;
  setLayerOpacity: (id: string, opacity: number) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  resetLayers: () => void;
  
  // Serialization
  exportConfig: () => SerializedLayerConfig;
  importConfig: (config: SerializedLayerConfig) => void;
}

export const useLayerStore = create<LayerStoreState>((set, get) => ({
  layers: [],
  layerStates: {},

  registerLayer: (def: LayerDefinition) => set((state) => {
    // If layer already exists, don't overwrite user's state, just update definition
    const exists = state.layers.some(l => l.id === def.id);
    if (exists) {
      return {
        layers: state.layers.map(l => l.id === def.id ? def : l)
      };
    }
    return {
      layers: [...state.layers, def],
      layerStates: {
        ...state.layerStates,
        [def.id]: {
          enabled: def.isEnabled,
          opacity: 100,
          locked: false
        }
      }
    };
  }),

  toggleLayer: (id: string) => set((state) => {
    const currentState = state.layerStates[id];
    if (!currentState) return state;
    return {
      layerStates: {
        ...state.layerStates,
        [id]: { ...currentState, enabled: !currentState.enabled }
      }
    };
  }),

  setLayerEnabled: (id: string, enabled: boolean) => set((state) => {
    const currentState = state.layerStates[id];
    if (!currentState) return state;
    return {
      layerStates: {
        ...state.layerStates,
        [id]: { ...currentState, enabled }
      }
    };
  }),

  setLayerOpacity: (id: string, opacity: number) => set((state) => {
    const currentState = state.layerStates[id];
    if (!currentState) return state;
    return {
      layerStates: {
        ...state.layerStates,
        [id]: { ...currentState, opacity }
      }
    };
  }),

  reorderLayers: (fromIndex: number, toIndex: number) => set((state) => {
    const newLayers = [...state.layers];
    const [movedLayer] = newLayers.splice(fromIndex, 1);
    newLayers.splice(toIndex, 0, movedLayer);
    
    // Update priorities to reflect visual order (index 0 is lowest priority? Or highest?)
    // In our blend engine, we sort by priority descending. So index 0 should have highest priority.
    const reorderedWithPriorities = newLayers.map((layer, index) => ({
      ...layer,
      priority: (newLayers.length - index) * 10
    }));

    return { layers: reorderedWithPriorities };
  }),

  resetLayers: () => set((state) => {
    const resetStates: Record<string, LayerState> = {};
    state.layers.forEach(layer => {
      resetStates[layer.id] = {
        enabled: layer.isEnabled,
        opacity: 100,
        locked: false
      };
    });
    return { layerStates: resetStates };
  }),

  exportConfig: () => {
    const state = get();
    return {
      version: '1.0',
      layers: state.layers.filter(l => !l.isSystem), // Only export custom user layers
      states: state.layerStates
    };
  },

  importConfig: (config: SerializedLayerConfig) => set((state) => {
    if (config.version !== '1.0') return state; // basic validation
    
    // Merge custom layers, ignoring system layers from import if they somehow got in
    const newCustomLayers = config.layers.filter(l => !l.isSystem);
    const systemLayers = state.layers.filter(l => l.isSystem);
    
    return {
      layers: [...systemLayers, ...newCustomLayers],
      layerStates: {
        ...state.layerStates, // keep existing states for safety
        ...config.states      // override with imported states
      }
    };
  })
}));
