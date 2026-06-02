// src/store/useCanvasStore.ts
import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';

// Import our Boto3 mock data
// import initialData from '../data/architecture.json';
import initialData from '../data/latestdata.json'
// import initialData from '../data/transformed_architecture.json';
type LensType = 'structural' | 'blast-radius' | 'cost';
// 1. Define the TypeScript interface for our store
type CanvasState = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  isLoading: boolean; // Track data retrieval states

  setSelectedNodeId: (id: string | null) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  fetchInfrastructure: () => Promise<void>;
  // NEW: Lens State
  activeLens: LensType;
  setActiveLens: (lens: LensType) => void;
  focusedNodeId: string | null;
  setFocusedNodeId: (id: string | null) => void;
};

// 1. Wrap the store creator in `temporal`
export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      nodes: initialData.nodes as Node[],
      edges: initialData.edges as Edge[],
      isLoading: false,
      // New Selection State
      selectedNodeId: null,
      setSelectedNodeId: (id) => set({ selectedNodeId: id }),

      onNodesChange: (changes: NodeChange[]) => {
        set({ nodes: applyNodeChanges(changes, get().nodes) });
      },
      onEdgesChange: (changes: EdgeChange[]) => {
        set({ edges: applyEdgeChanges(changes, get().edges) });
      },
      onConnect: (connection: Connection) => {
        set({ edges: addEdge(connection, get().edges) });
      },
      activeLens: 'structural',
      setActiveLens: (lens) => set({ activeLens: lens }),

      focusedNodeId: null,
      setFocusedNodeId: (id) => set({ focusedNodeId: id }),

      fetchInfrastructure: async () => {
    set({ isLoading: true });
    try {
      const response = await fetch('/api/infrastructure');
      if (!response.ok) throw new Error('Failed to capture cloud layout topology');
      const data = await response.json();

      set({
        nodes: data.nodes,
        edges: data.edges,
        isLoading: false
      });
    } catch (error) {
      console.error("Hydration Error:", error);
      set({ isLoading: false });
    }
  }

    }),


    {
      // Partialize: Tell Zundo exactly what to track for undo/redo
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
      }),
      // Debounce the history snapshots
      handleSet: (originalHandleSet) => {
        let timeout: ReturnType<typeof setTimeout>;
        return (pastState, replace) => {
          clearTimeout(timeout);
          // Wait 250ms after the last change before saving to history
          timeout = setTimeout(() => {
            originalHandleSet(pastState, replace);
          }, 250);
        };
      },
    }
  )
);