import { LayerDefinition, LayerState, LayerStackItem } from '../../types/layers';

export const selectActiveLayerCount = (state: { layerStates: Record<string, LayerState> }) => {
  return Object.values(state.layerStates).filter(s => s.enabled).length;
};

export const selectLayerStack = (state: { layers: LayerDefinition[], layerStates: Record<string, LayerState> }): LayerStackItem[] => {
  return state.layers.map(def => ({
    definition: def,
    state: state.layerStates[def.id] || { enabled: def.isEnabled, opacity: 100, locked: false }
  })).sort((a, b) => b.definition.priority - a.definition.priority); // Highest priority first
};

export const selectLayerStackSummary = (state: { layers: LayerDefinition[], layerStates: Record<string, LayerState> }) => {
  const activeLayers = state.layers.filter(l => state.layerStates[l.id]?.enabled);
  return {
    total: state.layers.length,
    active: activeLayers.length,
    activeNames: activeLayers.map(l => l.label).join(', ')
  };
};
