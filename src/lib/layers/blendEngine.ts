import { CloudNode, CloudEdge } from '../../types/cloud';
import { LayerStackItem } from '../../types/layers';
import { evaluateNode } from './ruleEvaluator';
import { enrichNodeWithLayerMetadata } from './nodeEnricher';

/**
 * Computes the final set of visible nodes based on active layers and their blend modes.
 * Resolves priority and correctly applies additive, subtractive, exclusive, and override logic.
 *
 * @param allNodes Original complete list of nodes from store.
 * @param layerStack Array of all layers, ideally sorted by priority or handled herein.
 * @returns Array of nodes that should be visible.
 */
export function computeVisibleNodes(
  allNodes: CloudNode[],
  layerStack: LayerStackItem[]
): CloudNode[] {
  // Only process enabled layers
  const activeLayers = layerStack
    .filter(layer => layer.state.enabled)
    .sort((a, b) => a.definition.priority - b.definition.priority); // Lowest priority first, so highest is applied last

  // If no layers are active, fallback behavior: show all nodes (backward compatible)
  if (activeLayers.length === 0) {
    return allNodes;
  }

  const visibleNodes = new Set<string>();
  const overrideNodes = new Set<string>();

  // Flag to know if we hit an exclusive layer
  let hasExclusive = false;

  // Enrich nodes once before evaluation
  const enrichedNodes = allNodes.map(node => enrichNodeWithLayerMetadata(node));

  // If there's an exclusive layer, we only process exclusive and override layers.
  // Additive layers are ignored. Subtractive layers are applied against the exclusive set.
  const exclusiveLayers = activeLayers.filter(l => l.definition.blendMode === 'exclusive');
  if (exclusiveLayers.length > 0) {
    hasExclusive = true;
  }

  for (const layer of activeLayers) {
    const { blendMode, rules } = layer.definition;

    for (const node of enrichedNodes) {
      // Evaluate if the node matches this layer's rules
      const matches = evaluateNode(node, rules);

      if (matches) {
        if (blendMode === 'override') {
          overrideNodes.add(node.id);
        } else if (blendMode === 'exclusive') {
          visibleNodes.add(node.id);
        } else if (blendMode === 'subtractive') {
          visibleNodes.delete(node.id);
        } else if (blendMode === 'additive') {
          if (!hasExclusive) {
            visibleNodes.add(node.id);
          }
        }
      }
    }
  }

  // Combine sets
  const finalVisibleIds = new Set([...visibleNodes, ...overrideNodes]);

  // Return original node references to preserve any React flow state / memoization stability
  return allNodes.filter(node => finalVisibleIds.has(node.id));
}

/**
 * Cleans up dangling edges where either the source or target node is hidden.
 *
 * @param allEdges Original complete list of edges.
 * @param visibleNodes Array of currently visible nodes.
 * @returns Filtered array of edges.
 */
export function computeVisibleEdges(
  allEdges: CloudEdge[],
  visibleNodes: CloudNode[]
): CloudEdge[] {
  const visibleNodeIds = new Set(visibleNodes.map(n => n.id));

  return allEdges.filter(
    edge => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)
  );
}
