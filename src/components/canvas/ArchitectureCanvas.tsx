'use client';

import React, { useEffect, useCallback, useRef } from 'react';
import { ReactFlow, Background, Controls, Panel } from '@xyflow/react';
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
    setActiveLens
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

  return (
    <div className="w-full h-screen bg-slate-50 transition-colors duration-200">
      {/* Drop the Sidebar here! */}
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
        <Controls />

        <Panel position="top-left" className="bg-white/80 backdrop-blur-md p-2 rounded-xl shadow-sm border border-slate-200 flex gap-2">
          <button
            onClick={executeUndo}
            disabled={pastStates.length === 0}
            className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            ↩ Undo
          </button>
          <button
            onClick={executeRedo}
            disabled={futureStates.length === 0}
            className="px-4 py-2 text-sm font-bold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Redo ↪
          </button>

        </Panel>
<LensToolbar />
      </ReactFlow>
    </div>
  );
}
