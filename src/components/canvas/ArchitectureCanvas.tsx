'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { ReactFlow, Background, Controls, Panel, MiniMap} from '@xyflow/react';
import { useStore } from 'zustand';
import { useCanvasStore } from '../../store/useCanvasStore';

import LambdaNode from '../nodes/LambdaNode';
import S3Node from '../nodes/S3Node';
import DatabaseNode from '../nodes/DatabaseNode';
import AnimatedEdge from './AnimatedEdge';
import VpcNode from '../nodes/VpcNode';
import SubnetNode from '../nodes/SubnetNode';
import ApiGatewayNode from '../nodes/ApiGatewayNode';
import SqsNode from '../nodes/SqsNode';
import MetricsSidebar from '../ui/MetricsSidebar';
import LensToolbar from '../ui/LensToolbar';
import TopNav from '../ui/TopNav';
import { Button } from '@/components/ui/button';

const nodeTypes = {
  lambdaNode: LambdaNode,
  s3Node: S3Node,
  databaseNode: DatabaseNode,
  VPC: VpcNode,
  IGW: VpcNode,
  Subnet: SubnetNode,
  apiGatewayNode: ApiGatewayNode,
  sqsNode: SqsNode,
};
const edgeTypes = { animatedEdge: AnimatedEdge };

// Spring-like easing: fast start with a gentle overshoot
function springEase(t: number): number {
  return 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 0.5);
}

const ANIMATION_DURATION = 400; // ms

export default function ArchitectureCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectedNodeId,
    setSelectedNodeId,
    activeLens,
    setActiveLens,
    fetchInfrastructure,
    isLoading
  } = useCanvasStore();



  const { undo, redo, pastStates, futureStates } = useStore(
    useCanvasStore.temporal,
    (state) => state
  );

  const animationRef = useRef<number | null>(null);

  // Animate nodes from old positions to new positions by interpolating
  const animateTransition = useCallback((
    oldPositions: Map<string, { x: number; y: number }>,
    targetNodes: typeof nodes  // The final target state captured BEFORE animation starts
  ) => {
    // Cancel any running animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      // If cancelling a previous animation, resume tracking before starting new one
      useCanvasStore.temporal.getState().resume();
    }

    // Pause temporal tracking so intermediate frames don't pollute undo history
    useCanvasStore.temporal.getState().pause();

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / ANIMATION_DURATION, 1);
      const eased = springEase(progress);

      // Interpolate from old → target using the captured snapshot
      const interpolatedNodes = targetNodes.map((node) => {
        const oldPos = oldPositions.get(node.id);
        if (!oldPos) return node;

        if (
        oldPos.x === node.position.x &&
        oldPos.y === node.position.y
        ) {
        return node;
        }

        const x = oldPos.x + (node.position.x - oldPos.x) * eased;
        const y = oldPos.y + (node.position.y - oldPos.y) * eased;

        return {
          ...node,
          position: { x, y },
        };
      });

      useCanvasStore.setState({ nodes: interpolatedNodes });

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        // Land exactly on target positions
        useCanvasStore.setState({ nodes: targetNodes });
        animationRef.current = null;
        // Resume temporal tracking now that animation is complete
        useCanvasStore.temporal.getState().resume();
      }
    };

    animationRef.current = requestAnimationFrame(tick);
  }, []);

  const executeUndo = useCallback(() => {
    if (pastStates.length > 0) {
      // 1. Capture current node positions BEFORE undo
      const currentNodes = useCanvasStore.getState().nodes;
      const oldPositions = new Map(
        currentNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])
      );

      // 2. Execute undo — nodes jump to previous state instantly
      undo();

      // 3. Capture the target positions AFTER undo (before animation modifies them)
      const targetNodes = [...useCanvasStore.getState().nodes];

      // 4. Animate from old positions to the new (restored) positions
      animateTransition(oldPositions, targetNodes);
    }
  }, [pastStates.length, undo, animateTransition]);

  const executeRedo = useCallback(() => {
    if (futureStates.length > 0) {
      const currentNodes = useCanvasStore.getState().nodes;
      const oldPositions = new Map(
        currentNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])
      );

      redo();

      const targetNodes = [...useCanvasStore.getState().nodes];
      animateTransition(oldPositions, targetNodes);
    }
  }, [futureStates.length, redo, animateTransition]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {

// Ignore shortcuts when user is typing in inputs
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;

      if (modifier && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        executeUndo();
      }

      if (
        (modifier && event.key.toLowerCase() === 'y') ||
        (modifier && event.key.toLowerCase() === 'z' && event.shiftKey)
      ) {
        event.preventDefault();
        executeRedo();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [executeUndo, executeRedo]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);


useEffect(() => {
    fetchInfrastructure();
  }, [fetchInfrastructure]);

  if (isLoading && nodes.length === 0) {
    return (
      <div className="w-full h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
        <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest animate-pulse">
          Parsing AWS Topology...
        </p>
      </div>
    );
  }



  return (
    <div className="flex flex-col w-full h-screen bg-slate-50 overflow-hidden">

      {/* TopNav at the very top */}
    <TopNav />

    {/* 3. Wrap React Flow in a flex-1 container so it fills the remaining height */}
    <div className="flex-1 relative w-full h-full">
      {/* Sidebar here! */}
      <MetricsSidebar />

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        defaultEdgeOptions={{ type: 'animatedEdge' }}
        onNodeClick={(event, node) => setSelectedNodeId(node.id)}
        onPaneClick={() => setSelectedNodeId(null)}
      >
        <Background color="#cbd5e1" gap={20} size={2} />
        {/* <Controls /> */}

        <Panel position="top-left" className="bg-white/80 backdrop-blur-md p-2 rounded-xl shadow-sm border border-slate-200 flex gap-2">
          <Button
            variant="outline"
            onClick={executeUndo}
            disabled={pastStates.length === 0}
            className="font-bold text-slate-700"
          >
            ↩ Undo
          </Button>
          <Button
            variant="outline"
            onClick={executeRedo}
            disabled={futureStates.length === 0}
            className="font-bold text-slate-700"
          >
            Redo ↪
          </Button>

        </Panel>
<LensToolbar />
        {/* FinOps Cost Legend */}
          {activeLens === 'cost' && (
            <div className="absolute bottom-8 left-8 z-40 bg-white/80 backdrop-blur-xl border border-white shadow-xl rounded-2xl p-4 w-64">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-3">
                Monthly Run Rate
              </h3>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]" />
                  <span className="text-xs font-bold text-slate-600">Critical (&gt; $500/mo)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-orange-500/20 border border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]" />
                  <span className="text-xs font-bold text-slate-600">Warning (&gt; $100/mo)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]" />
                  <span className="text-xs font-bold text-slate-600">Optimized</span>
                </div>
              </div>
            </div>
          )}

          {/* 3. The Radar Radar (Bottom Right) */}
          <MiniMap
            zoomable
            pannable
            nodeColor={(node) => {
              const type = node.type?.toLowerCase() || '';

              // 1. Make network containers completely transparent
              if (type.includes('vpc') || type.includes('subnet')) return 'transparent';

              // 2. Color-code the services to match their UI icons
              if (type.includes('api')) return '#a855f7';      // Purple
              if (type.includes('sqs')) return '#d946ef';      // Pink
              if (type.includes('lambda')) return '#f97316';   // Orange
              if (type.includes('database')) return '#3b82f6'; // Blue
              if (type.includes('s3')) return '#22c55e';       // Green

              return '#cbd5e1'; // Default Fallback
            }}
            nodeStrokeColor={(node) => {
              const type = node.type?.toLowerCase() || '';
              // 3. Give the transparent containers a crisp purple outline
              if (type.includes('vpc') || type.includes('subnet')) return '#8b5cf6';
              return 'transparent';
            }}
            nodeStrokeWidth={2}
            maskColor="rgba(248, 250, 252, 0.75)"
            className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden"
          />

      </ReactFlow>
      </div>
    </div>
  );
}
