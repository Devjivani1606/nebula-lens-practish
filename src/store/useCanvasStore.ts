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

// 1. Define the TypeScript interface for our store
type CanvasState = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  setSelectedNodeId: (id: string | null) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
};

// 1. Wrap the store creator in `temporal`
export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      nodes: initialData.nodes as Node[],
      edges: initialData.edges as Edge[],

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