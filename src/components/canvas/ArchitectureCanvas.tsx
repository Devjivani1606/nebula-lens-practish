'use client';
import React from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import { useCanvasStore } from '../../store/useCanvasStore';

import LambdaNode from '../nodes/LambdaNode';
import S3Node from '../nodes/S3Node';
import DatabaseNode from '../nodes/DatabaseNode';

import AnimatedEdge from './AnimatedEdge';

const nodeTypes = {
  lambdaNode: LambdaNode,
  s3Node: S3Node,
  databaseNode: DatabaseNode,
};

const edgeTypes = {
  animatedEdge: AnimatedEdge,
};

export default function ArchitectureCanvas() {
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect } = useCanvasStore();

  return (
    // A subtle dotted background helps the glassmorphism pop
    <div className="w-full h-screen bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes} // Register it here!
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        defaultEdgeOptions={{ type: 'animatedEdge' }}
      >
        <Background color="#cbd5e1" gap={20} size={2} />
        <Controls />
      </ReactFlow>
    </div>
  );
}