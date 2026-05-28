// src/store/useCanvasStore.ts
import { create } from 'zustand';
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
import initialData from '../data/architecture.json';

// 1. Define the TypeScript interface for our store
type CanvasState = {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
};

// 2. Create the actual Zustand hook
export const useCanvasStore = create<CanvasState>((set, get) => ({
  // Set the initial data from the JSON file
  nodes: initialData.nodes,
  edges: initialData.edges,

  // React Flow requires these three functions to handle dragging and connecting
  onNodesChange: (changes: NodeChange[]) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes: EdgeChange[]) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection: Connection) => {
    set({
      edges: addEdge(connection, get().edges),
    });
  },
}));