'use client';

import React, { useEffect, useState } from 'react';
import { ReactFlow, Background, Controls, Panel } from '@xyflow/react';
import { useStore } from 'zustand';
import { useCanvasStore } from '../../store/useCanvasStore';

import LambdaNode from '../nodes/LambdaNode';
import S3Node from '../nodes/S3Node';
import DatabaseNode from '../nodes/DatabaseNode';
import AnimatedEdge from './AnimatedEdge';

const nodeTypes = { lambdaNode: LambdaNode, s3Node: S3Node, databaseNode: DatabaseNode };
const edgeTypes = { animatedEdge: AnimatedEdge };

export default function ArchitectureCanvas() {
  const { nodes,
          edges,
          onNodesChange,
          onEdgesChange,
          onConnect,
          selectedNodeId,
          setSelectedNodeId,
        } = useCanvasStore();

  const { undo, redo, pastStates, futureStates } = useStore(
    useCanvasStore.temporal,
    (state) => state
  );

  // 1. Track if an undo/redo action is actively animating
  const [isHistoryAnimating, setIsHistoryAnimating] = useState(false);

  // 2. Intercept Undo calls to safely flag the animation window
  const executeUndo = () => {
    if (pastStates.length > 0) {
      setIsHistoryAnimating(true);
      undo();
      // Remove the transition properties right as the animation finishes (300ms)
      setTimeout(() => setIsHistoryAnimating(false), 300);
    }
  };

  // 3. Intercept Redo calls
  const executeRedo = () => {
    if (futureStates.length > 0) {
      setIsHistoryAnimating(true);
      redo();
      setTimeout(() => setIsHistoryAnimating(false), 300);
    }
  };

  // Update keyboard shortcuts to use our custom transition executors
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
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
  }, [undo, redo, pastStates.length, futureStates.length]);

  return (
    /* 4. THE POLISH LAYER:
         When isHistoryAnimating is true, we inject a highly responsive, custom
         spring easing function (cubic-bezier) directly into the internal classes of
         both React Flow nodes and edge SVG paths.
    */
    <div className={`w-full h-screen bg-slate-50 transition-colors duration-200 ${
      isHistoryAnimating
        ? '[&_.react-flow__node]:transition-transform [&_.react-flow__node]:duration-400 [&_.react-flow__node]:ease-[cubic-bezier(0.34, 1.56, 0.64,1)] [&_.react-flow__edge-path]:transition-all [&_.react-flow__edge-path]:duration-400 [&_.react-flow__edge-path]:ease-[cubic-bezier(0.34, 1.56, 0.64, 1)]'
        : ''
    }`}>
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

        {/* Update panel click handlers to use the animated execution wrappers */}
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

      </ReactFlow>
    </div>
  );
}