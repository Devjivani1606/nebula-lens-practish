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

// Import our mock data
import initialData from '../data/latestdata.json';

// 🚀 FIX: Added 'security' to the allowed lens types
type LensType = 'structural' | 'blast-radius' | 'cost' | 'security';

// Define the TypeScript interface for our store
type CanvasState = {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  isLoading: boolean;

  setSelectedNodeId: (id: string | null) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  fetchInfrastructure: () => Promise<void>;

  // Lens State
  activeLens: LensType;
  setActiveLens: (lens: LensType) => void;
  focusedNodeId: string | null;
  setFocusedNodeId: (id: string | null) => void;
  complianceFramework: 'general' | 'soc2' | 'hipaa';

  setComplianceFramework: (framework: 'general' | 'soc2' | 'hipaa') => void;

  // Live Stream State
  isLiveStreamActive: boolean;
  toggleLiveStream: () => void;
  tickTelemetry: () => void;
};

// Wrap the store creator in `temporal`
export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      nodes: initialData.nodes as Node[],
      edges: initialData.edges as Edge[],
      isLoading: false,

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

      complianceFramework: 'general',
      setComplianceFramework: (framework) => set({ complianceFramework: framework }),

      isLiveStreamActive: false,

      toggleLiveStream: () => set((state) => ({ isLiveStreamActive: !state.isLiveStreamActive })),

      tickTelemetry: () => set((state) => {
        const newNodes = state.nodes.map(node => {
          // Skip nodes that don't have telemetry (like the AZ wrapper)
          if (!node.data?.telemetryData || !Array.isArray(node.data.telemetryData)) return node;

          const currentData = [...node.data.telemetryData];
          const lastPoint = currentData[currentData.length - 1];

          // Generate a live timestamp (HH:MM:SS)
          const now = new Date();
          const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

          const newPoint: any = { time: timeString };

          // Apply random jitter to all numeric metrics to simulate live traffic
          Object.keys(lastPoint).forEach(key => {
            if (key !== 'time') {
              let val = Number(lastPoint[key]);
              let jitter = 0;

              if (val === 0) {
                // THE SMART DEFIBRILLATOR:
                // If a metric naturally hits 0 (like an empty SQS queue), we give it
                // a 30% chance to randomly spawn 1-5 new events to jump-start the math.
                jitter = Math.random() > 0.7 ? Math.floor(Math.random() * 5) + 1 : 0;
              } else {
                // Normal percentage-based chaos
                jitter = val * (Math.random() * 1.6 - 0.8);
              }

              // Apply jitter, ensuring it never goes negative
              newPoint[key] = Math.max(0, Math.floor(val + jitter));
            }
          });

          // Append new data and keep the array constrained to 6 data points to prevent memory leaks
          currentData.push(newPoint);
          if (currentData.length > 6) currentData.shift();

          return {
            ...node,
            data: { ...node.data, telemetryData: currentData }
          };
        });

        return { nodes: newNodes };
      }),

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
          console.error("Hydration Error for rendering topology:", error);
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