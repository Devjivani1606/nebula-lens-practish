'use client';

import React, { useEffect, useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ReactFlow, Background, Controls, Panel, MiniMap, useReactFlow } from '@xyflow/react';
import { useStore } from 'zustand';
import { useCanvasStore } from '../../store/useCanvasStore';
import { useAutoLayout } from '../../lib/layout/useAutoLayout';
import { useLayerEngine } from '../../hooks/useLayerEngine';
import LayerPanel from '../layers/LayerPanel';
import { useLayerStore } from '../../store/layerStore';
import { systemLayers } from '../../lib/layers/systemLayers';

import LambdaNode from '../nodes/LambdaNode';
import S3Node from '../nodes/S3Node';
import DatabaseNode from '../nodes/DatabaseNode';
import AnimatedEdge from './AnimatedEdge';
import VpcNode from '../nodes/VpcNode';
import SubnetNode from '../nodes/SubnetNode';
import ApiGatewayNode from '../nodes/ApiGatewayNode';
import SqsNode from '../nodes/SqsNode';
import LensToolbar from '../ui/LensToolbar';
import { Button } from '@/components/ui/button';
import ContextualInspector from '../ui/ContextualInspector';
import { useTheme } from 'next-themes';
import AvailabilityZoneNode from '../nodes/AvailabilityZoneNode';
import Ec2Node from '../nodes/Ec2Node';
import CanvasSkeleton from '../ui/CanvasSkeleton';
import CommandPalette from '../ui/CommandPalette';
import SecurityGroupNode from '../nodes/SecurityGroupNode';
import EniNode from '../nodes/EniNode';
import IamRoleNode from '../nodes/IamRoleNode';
import AlbNode from '../nodes/AlbNode';
import SnsNode from '../nodes/SnsNode';
import EventBridgeNode from '../nodes/EventBridgeNode';
import DynamoDbNode from '../nodes/DynamoDbNode';
import RdsNode from '../nodes/RdsNode';
import EcsNode from '../nodes/EcsNode';
import EksNode from '../nodes/EksNode';
import CloudFrontNode from '../nodes/CloudFrontNode';
import StepFunctionsNode from '../nodes/StepFunctionsNode';
import SecretsManagerNode from '../nodes/SecretsManagerNode';

const nodeTypes = {
  lambdaNode: LambdaNode,
  s3Node: S3Node,
  databaseNode: DatabaseNode,
  VPC: VpcNode,
  vpcNode: VpcNode,
  IGW: VpcNode,
  Subnet: SubnetNode,
  subnetNode: SubnetNode,
  apiGatewayNode: ApiGatewayNode,
  sqsNode: SqsNode,
  ec2Node: Ec2Node,
  AvailabilityZone: AvailabilityZoneNode,
  securityGroupNode: SecurityGroupNode,
  eniNode: EniNode,
  iamRoleNode: IamRoleNode,
  albNode: AlbNode,
  snsNode: SnsNode,
  eventbridgeNode: EventBridgeNode,
  eventBridgeNode: EventBridgeNode,
  dynamodbNode: DynamoDbNode,
  dynamoDbNode: DynamoDbNode,
  rdsNode: RdsNode,
  ecsNode: EcsNode,
  eksNode: EksNode,
  cloudfrontNode: CloudFrontNode,
  cloudFrontNode: CloudFrontNode,
  stepFunctionsNode: StepFunctionsNode,
  secretsManagerNode: SecretsManagerNode,
};
const edgeTypes = { animatedEdge: AnimatedEdge };

// Spring-like easing: fast start with a gentle overshoot
function springEase(t: number): number {
  return 1 - Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 0.5);
}

const ANIMATION_DURATION = 400; // ms

export default function ArchitectureCanvas() {
  const { resolvedTheme } = useTheme();

  const [mounted, setMounted] = useState(false);
  const [lensFlash, setLensFlash] = useState(false);
  
  useEffect(() => {
    setMounted(true);
    // Initialize system layers on boot
    const registerLayer = useLayerStore.getState().registerLayer;
    systemLayers.forEach(layer => registerLayer(layer));
  }, []);

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
    isLoading,
    isInspectorPinned,
    isTourActive,
    activeSnapshotId,
    setActiveSnapshotId
  } = useCanvasStore();

  const { fitView, setCenter, getNode } = useReactFlow();

  const { visibleNodes, visibleEdges } = useLayerEngine();

  // Smoothly re-center canvas when the inspector panel resizes
  useEffect(() => {
    // Wait for the DOM transition (280ms) to finish so React Flow calculates the center based on the final width constraints
    const timer = setTimeout(() => {
      if (nodes.length > 0) {
        // When the layout changes (e.g., inspector pinned), fit the whole graph
        fitView({ padding: 0.2, duration: 600 });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [isInspectorPinned, isTourActive, fitView, nodes.length]);



  const { undo, redo, pastStates, futureStates } = useStore(
    useCanvasStore.temporal,
    (state) => state
  );

  const animationRef = useRef<number | null>(null);

  /**
   * animateTransition
   * ─────────────────
   * Interpolates nodes from oldPositions → targetNodes using springEase.
   *
   * @param delayMap  Optional per-node start delay in ms, keyed by node id.
   *                  Used for depth-staggered auto-layout animation:
   *                  containers (depth 0-2) animate before resources (depth 3).
   *                  When omitted, all nodes animate simultaneously (undo/redo).
   * @param duration  Animation duration in ms (default ANIMATION_DURATION).
   * @param onComplete  Called once the animation finishes (used for fitView).
   */
  const animateTransition = useCallback((
    oldPositions: Map<string, { x: number; y: number }>,
    targetNodes: typeof nodes,
    delayMap?: Map<string, number>,
    duration: number = ANIMATION_DURATION,
    onComplete?: () => void,
  ) => {
    // Cancel any running animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      useCanvasStore.temporal.getState().resume();
    }

    // Pause temporal tracking so intermediate frames don't pollute undo history
    useCanvasStore.temporal.getState().pause();

    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      // Overall animation is done when the longest-delayed node finishes.
      // Max delay comes from the deepest depth level.
      const maxDelay = delayMap ? Math.max(0, ...delayMap.values()) : 0;
      const totalDuration = duration + maxDelay;
      const overallProgress = Math.min(elapsed / totalDuration, 1);

      const interpolatedNodes = targetNodes.map((node) => {
        const oldPos = oldPositions.get(node.id);
        if (!oldPos) return node;
        if (oldPos.x === node.position.x && oldPos.y === node.position.y) return node;

        // Per-node progress: gate animation start by this node's delay
        const nodeDelay = delayMap?.get(node.id) ?? 0;
        const nodeElapsed = Math.max(0, elapsed - nodeDelay);
        const nodeProgress = Math.min(nodeElapsed / duration, 1);
        const eased = springEase(nodeProgress);

        return {
          ...node,
          position: {
            x: oldPos.x + (node.position.x - oldPos.x) * eased,
            y: oldPos.y + (node.position.y - oldPos.y) * eased,
          },
        };
      });

      useCanvasStore.setState({ nodes: interpolatedNodes });

      if (overallProgress < 1) {
        animationRef.current = requestAnimationFrame(tick);
      } else {
        // Land exactly on target positions
        useCanvasStore.setState({ nodes: targetNodes });
        animationRef.current = null;
        useCanvasStore.temporal.getState().resume();
        onComplete?.();
      }
    };

    animationRef.current = requestAnimationFrame(tick);
  }, []);

  const executeUndo = useCallback(() => {
    if (pastStates.length > 0) {
      const currentNodes = useCanvasStore.getState().nodes;
      const oldPositions = new Map(
        currentNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])
      );
      undo();
      const targetNodes = [...useCanvasStore.getState().nodes];
      // No delayMap for undo — all nodes animate simultaneously
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

  // ── Auto Layout ───────────────────────────────────────────────────────────
  const { isLayouting, triggerLayout } = useAutoLayout();

  const executeAutoLayout = useCallback(async (opts?: { force?: boolean }) => {
    const currentNodes = useCanvasStore.getState().nodes;
    const currentEdges = useCanvasStore.getState().edges;

    // Capture old positions BEFORE running ELK (async — store may not change)
    const oldPositions = new Map(
      currentNodes.map((n) => [n.id, { x: n.position.x, y: n.position.y }])
    );

    const result = await triggerLayout(currentNodes, currentEdges, opts);
    if (!result) return; // skipped (no change) or failed

    const { nodes: layoutedNodes, depthMap } = result;

    // Build depth-stagger delay map: 30ms per depth level
    // depth 0 (VPC)            → 0ms delay
    // depth 1 (AZ)             → 30ms delay
    // depth 2 (Subnet)         → 60ms delay
    // depth 3 (resources)      → 90ms delay
    const DEPTH_STAGGER_MS = 30;
    const delayMap = new Map<string, number>(
      layoutedNodes.map((n) => [
        n.id,
        (depthMap.get(n.id) ?? 0) * DEPTH_STAGGER_MS,
      ])
    );

    // Apply layouted nodes as the target state in the store
    useCanvasStore.setState({ nodes: layoutedNodes });

    // Animate from old positions → ELK positions with depth stagger
    // Duration 500ms + easeInOut (springEase approximates cubic-bezier(0.4,0,0.2,1))
    const ELK_ANIMATION_DURATION = 500;
    animateTransition(
      oldPositions,
      layoutedNodes,
      delayMap,
      ELK_ANIMATION_DURATION,
      // onComplete: sequence fitView to avoid conflict with inspector CSS transition
      () => setTimeout(() => fitView({ duration: 500, padding: 0.15 }), 300)
    );
  }, [triggerLayout, animateTransition, fitView]);

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

      if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        if (event.shiftKey) {
          executeRedo();
        } else {
          executeUndo();
        }
      }

      // Ctrl+Shift+L / Cmd+Shift+L → Auto Layout
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key === 'l') {
        event.preventDefault();
        executeAutoLayout({ force: true });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [executeUndo, executeRedo, executeAutoLayout]);

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

  // Lens transition pulse
  const prevLensRef = useRef(activeLens);
  useEffect(() => {
    if (prevLensRef.current !== activeLens) {
      prevLensRef.current = activeLens;
      setLensFlash(true);
      const t = setTimeout(() => setLensFlash(false), 350);
      return () => clearTimeout(t);
    }
  }, [activeLens]);

  if (isLoading && nodes.length === 0) {
    return <CanvasSkeleton />;
  }



  return (
    <div className="flex flex-col w-full h-full bg-[var(--gl-bg-base)] transition-colors duration-300 overflow-hidden">

      {/* 3. Wrap React Flow in a flex-1 container so it fills the remaining height */}
      <div className="flex-1 flex flex-row w-full h-full relative overflow-hidden">


        <motion.div
          variants={{
            initial: { opacity: 0 },
            animate: { opacity: 1, transition: { duration: 0.4, staggerChildren: 0.04 } }
          }}
          initial="initial"
          animate="animate"
          data-tour-id="canvas-viewport"
          className="relative flex-1 h-full transition-all duration-[280ms] ease-in-out"
        >
          <ReactFlow
            nodes={visibleNodes}
            edges={visibleEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            fitView
            minZoom={0.3}
            maxZoom={2.0}
            defaultEdgeOptions={{ type: 'animatedEdge' }}
            onNodeClick={(event, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
          >

            {/* Dynamic dot colors based on the theme! */}
            <Background
              color={mounted && resolvedTheme === 'dark' ? '#334155' : '#cbd5e1'}
              gap={20}
              size={2}
            />

            {/* <Controls /> */}

            <Panel position="top-left" data-tour-id="undo-redo-panel" className="bg-white/80 dark:bg-[#111111] backdrop-blur-md p-2 rounded-xl shadow-sm border border-slate-200 dark:border-[#222222] flex gap-2">
              <Button
                variant="outline"
                onClick={executeUndo}
                disabled={pastStates.length === 0}
                className="font-medium text-slate-700 dark:text-slate-300 dark:border-[#333333] dark:hover:bg-[#222222] dark:bg-transparent"
              >
                ↩ Undo
              </Button>
              <Button
                variant="outline"
                onClick={executeRedo}
                disabled={futureStates.length === 0}
                className="font-medium text-slate-700 dark:text-slate-300 dark:border-[#333333] dark:hover:bg-[#222222] dark:bg-transparent"
              >
                Redo ↪
              </Button>
            </Panel>
            
            {activeSnapshotId && (
              <Panel position="top-center" className="bg-amber-500/10 dark:bg-amber-500/20 border border-amber-500/30 dark:border-amber-500/50 text-amber-600 dark:text-amber-400 font-medium px-4 py-2 rounded-xl backdrop-blur-md flex items-center gap-3 shadow-lg z-[100] text-xs">
                <span>Viewing Historical Version ({nodes.length} resources)</span>
                <Button
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-7 px-3 text-[10px]"
                  onClick={() => {
                    setActiveSnapshotId(null);
                    fetchInfrastructure(null);
                  }}
                >
                  Reset to Live
                </Button>
              </Panel>
            )}

            <Panel position="top-left" className="mt-16 z-50">
              <LayerPanel />
            </Panel>

            <LensToolbar
              isLayouting={isLayouting}
              onAutoLayout={() => executeAutoLayout({ force: true })}
            />
            <CommandPalette />
            {/* FinOps Cost Legend — Animated */}
            <AnimatePresence>
              {activeLens === 'cost' && (
                <motion.div
                  key="cost-legend"
                  initial={{ opacity: 0, y: 30, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="absolute bottom-8 left-8 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-white dark:border-slate-700 shadow-lg rounded-2xl p-4 w-64"
                >
                  <h3 className="text-xs font-medium text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-3">
                    Monthly Run Rate
                  </h3>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Critical (&gt; $500/mo)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-orange-500/20 border border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.4)]" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Warning (&gt; $100/mo)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]" />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Optimized</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Lens Transition Pulse Overlay */}
            <AnimatePresence>
              {lensFlash && (
                <motion.div
                  key="lens-pulse"
                  initial={{ opacity: 0.15 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: 'easeOut' }}
                  className={`absolute inset-0 z-30 pointer-events-none rounded-none ${activeLens === 'blast-radius' ? 'bg-orange-500' :
                      activeLens === 'cost' ? 'bg-emerald-500' :
                        activeLens === 'security' ? 'bg-amber-500' :
                          'bg-indigo-500'
                    }`}
                />
              )}
            </AnimatePresence>

            {/* MiniMap Radar */}
            <MiniMap
              zoomable
              pannable
              nodeColor={(node) => {
                const type = node.type?.toLowerCase() || '';
                if (type.includes('vpc') || type.includes('subnet') || type.includes('availabilityzone')) return 'transparent';
                if (type.includes('api') || type.includes('cloudfront')) return '#a855f7';
                if (type.includes('sqs') || type.includes('sns') || type.includes('eventbridge')) return '#d946ef';
                if (type.includes('lambda') || type.includes('stepfunctions') || type.includes('ecs') || type.includes('eks')) return '#f97316';
                if (type.includes('database') || type.includes('dynamodb') || type.includes('rds')) return '#3b82f6';
                if (type.includes('s3') || type.includes('secretsmanager')) return '#22c55e';
                if (type.includes('ec2') || type.includes('alb') || type.includes('iam') || type.includes('eni') || type.includes('securitygroup')) return '#06b6d4';
                return '#cbd5e1';
              }}
              nodeStrokeColor={(node) => {
                const type = node.type?.toLowerCase() || '';
                if (type.includes('vpc') || type.includes('subnet')) return '#8b5cf6';
                return 'transparent';
              }}
              nodeStrokeWidth={2}
              maskColor={mounted && resolvedTheme === 'dark' ? 'rgba(2, 6, 23, 0.75)' : 'rgba(248, 250, 252, 0.75)'}
              className="!bg-white dark:!bg-slate-900 !border !border-slate-200 dark:!border-slate-800 !shadow-sm !rounded-xl overflow-hidden"
            />

          </ReactFlow>
        </motion.div>
        <ContextualInspector />
      </div>
    </div>
  );
}
