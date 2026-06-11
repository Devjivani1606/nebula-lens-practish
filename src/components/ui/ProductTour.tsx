'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence, Variants, Transition } from 'framer-motion';
import { useCanvasStore } from '../../store/useCanvasStore';
import { springSmooth, springSnappy, scaleIn } from '../../lib/motion';
import { GraphIcon, PlanetIcon, CurrencyDollarIcon, ShieldCheckIcon, ArrowRightIcon, ArrowLeftIcon, XIcon, PlayIcon, SparkleIcon, CursorClickIcon, PulseIcon, DownloadSimpleIcon, ArrowUUpLeftIcon, EyeIcon, ShieldIcon } from '@phosphor-icons/react';

// ────────────────────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────────────────────
type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  targetId: string | null;
  placement: TooltipPlacement;
  spotlightPadding?: number;
  spotlightRadius?: number;
  disableDimming?: boolean;
  action: (store: StoreActions) => void;
  delay?: number;
}

interface StoreActions {
  setActiveLens: (lens: any) => void;
  setSelectedNodeId: (id: string | null) => void;
  setComplianceFramework: (fw: any) => void;
  toggleLiveStream: () => void;
  setTourActive: (active: boolean) => void;
}

interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ────────────────────────────────────────────────────────────────────────────
// TOUR STEPS
//   1. Canvas → 2. Live Telemetry → 3. Lens Toolbar → 4. Blast Radius
//   → 5. Blast Inspector → 6. Cost → 7. Cost Inspector → 8. Security
//   → 9. Compliance → 10. Undo/Redo → 11. Export → 12. Complete
// ────────────────────────────────────────────────────────────────────────────
const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Gravity Lens',
    description: 'This is your live cloud architecture canvas. Pan, zoom, and drag any node to rearrange your infrastructure topology. Let\'s walk through every powerful feature.',
    icon: SparkleIcon,
    targetId: null,
    placement: 'center',
    action: (store) => {
      store.setActiveLens('structural');
      store.setSelectedNodeId(null);
    }
  },
  {
    id: 'structural-mode',
    title: 'Structural Mode',
    description: 'The Lens Toolbar lets you switch perspectives. Right now, we are in the Structural Mode, which shows how your resources are connected.',
    icon: GraphIcon,
    targetId: 'lens-toolbar',
    placement: 'bottom',
    spotlightPadding: 8,
    spotlightRadius: 16,
    delay: 300,
    action: (store) => {
      store.setActiveLens('structural');
      store.setSelectedNodeId(null);
    }
  },
  {
    id: 'mongo-node-highlight',
    title: 'Node Deep Dive',
    description: 'We just clicked the MongoDB Atlas database node. Notice how it is selected on the canvas.',
    icon: CursorClickIcon,
    targetId: 'db-mongo-cluster',
    placement: 'top',
    spotlightPadding: 8,
    spotlightRadius: 12,
    delay: 400,
    action: (store) => {
      store.setActiveLens('structural');
      store.setSelectedNodeId('db-mongo-cluster');
    }
  },
  {
    id: 'mongo-sidebar-highlight',
    title: 'Resource Inspector',
    description: 'Selecting a node opens the Resource Inspector sidebar, revealing its specific properties, metadata, and static metrics.',
    icon: PulseIcon,
    targetId: 'inspector-panel',
    placement: 'left',
    spotlightPadding: 4,
    spotlightRadius: 16,
    delay: 300,
    action: (store) => {
      store.setActiveLens('structural');
      store.setSelectedNodeId('db-mongo-cluster');
    }
  },
  {
    id: 'blast-radius-lens',
    title: 'SRE: Blast Radius',
    description: 'Switch to the Blast Radius lens to simulate outages. The entire canvas transforms to support SRE workflows.',
    icon: EyeIcon,
    targetId: 'canvas-viewport',
    placement: 'right',
    spotlightPadding: 0,
    action: (store) => {
      store.setActiveLens('blast-radius');
      store.setSelectedNodeId(null);
      const state = useCanvasStore.getState();
      if (state.isLiveStreamActive) store.toggleLiveStream();
    }
  },
  {
    id: 'api-gateway-clicked',
    title: 'Simulate Failure',
    description: 'We just selected the API Gateway as a failure point. The custom BFS algorithm instantly highlights every downstream service that would cascade into failure.',
    icon: PlanetIcon,
    targetId: 'canvas-viewport',
    placement: 'right',
    spotlightPadding: 0,
    delay: 400,
    action: (store) => {
      store.setActiveLens('blast-radius');
      store.setSelectedNodeId('api-gateway-ingress');
    }
  },
  {
    id: 'blast-inspector',
    title: 'Impact Analysis Report',
    description: 'The inspector panel shows every affected downstream node, the total count of cascading failures, and the full impact chain. This is your SRE war-room view for outage simulation.',
    icon: PulseIcon,
    targetId: 'inspector-panel',
    placement: 'left',
    spotlightPadding: 4,
    spotlightRadius: 16,
    delay: 300,
    action: (store) => {
      store.setActiveLens('blast-radius');
      store.setSelectedNodeId('api-gateway-ingress');
    }
  },
  {
    id: 'cost-lens',
    title: 'FinOps: Cost Topology',
    description: 'Every node now reveals its estimated monthly cost. Red glowing borders = critical spend (>$500/mo), orange = warning, green = optimized. The legend in the bottom-left explains it all.',
    icon: CurrencyDollarIcon,
    targetId: 'canvas-viewport',
    placement: 'right',
    spotlightPadding: 0,
    delay: 400,
    action: (store) => {
      store.setActiveLens('cost');
      store.setSelectedNodeId(null);
    }
  },
  {
    id: 'cost-node-interaction',
    title: 'Cost Inspector: Node Deep Dive',
    description: 'We just selected the Lambda Processor. The inspector shows its financial breakdown — compute, storage, and network costs as a stacked bar chart, plus AI-powered rightsizing recommendations.',
    icon: CursorClickIcon,
    targetId: 'inspector-panel',
    placement: 'left',
    spotlightPadding: 4,
    spotlightRadius: 16,
    delay: 500,
    action: (store) => {
      store.setActiveLens('cost');
      store.setSelectedNodeId('lambda-processor');
    }
  },
  {
    id: 'security-lens',
    title: 'SecOps: Security Posture',
    description: 'The security lens audits your infrastructure for misconfigurations. Amber borders flag compliance violations, and red dashed lines trace lateral breach paths an attacker could exploit.',
    icon: ShieldCheckIcon,
    targetId: 'canvas-viewport',
    placement: 'right',
    spotlightPadding: 0,
    delay: 400,
    action: (store) => {
      store.setActiveLens('security');
      store.setSelectedNodeId(null);
      store.setComplianceFramework('general');
    }
  },
  {
    id: 'frameworks-intro',
    title: 'Regulatory Frameworks',
    description: 'Notice these tabs in the Global Overview? They let you switch between different compliance standards. Let\'s highlight them so you know exactly where to look.',
    icon: ShieldIcon,
    targetId: 'compliance-tabs',
    placement: 'left',
    spotlightPadding: 4,
    delay: 400,
    action: (store) => {
      store.setActiveLens('security');
      store.setSelectedNodeId(null);
      store.setComplianceFramework('general');
    }
  },
  {
    id: 'compliance-frameworks',
    title: 'Compliance Framework Switching',
    description: 'Watch the tabs cycle through General → SOC2 → HIPAA. Each framework audits against different regulatory standards, revealing unique violations and remediation steps.',
    icon: ShieldIcon,
    targetId: 'compliance-tabs',
    placement: 'left',
    disableDimming: true,
    spotlightPadding: 4,
    delay: 600,
    action: () => {
      // Action handled by dedicated compliance cycling effect
    }
  },
  {
    id: 'undo-redo',
    title: 'Undo / Redo with Animation',
    description: 'Dragged a node by accident? Use these buttons or keyboard shortcuts (Ctrl+Z / Ctrl+Y). Every layout change is tracked with smooth spring-animated transitions.',
    icon: ArrowUUpLeftIcon,
    targetId: 'undo-redo-panel',
    placement: 'bottom',
    spotlightPadding: 10,
    spotlightRadius: 14,
    action: (store) => {
      store.setActiveLens('structural');
      store.setSelectedNodeId(null);
    }
  },
  {
    id: 'export',
    title: 'Export High-Res Snapshot',
    description: 'Download a production-quality PNG snapshot of any lens view at 2× Retina resolution. Perfect for architecture reviews, documentation, and presentations.',
    icon: DownloadSimpleIcon,
    targetId: 'export-button',
    placement: 'bottom',
    spotlightPadding: 12,
    spotlightRadius: 24,
    action: (store) => {
      store.setActiveLens('structural');
      store.setSelectedNodeId(null);
    }
  },
  {
    id: 'complete',
    title: 'You\'re All Set!!!',
    description: 'You now know every feature of Gravity Lens. Start exploring your architecture — and click the replay button (↺) in the top nav anytime to revisit this tour.',
    icon: PlayIcon,
    targetId: null,
    placement: 'center',
    action: (store) => {
      store.setActiveLens('structural');
      store.setSelectedNodeId(null);
      const state = useCanvasStore.getState();
      if (state.isLiveStreamActive) store.toggleLiveStream();
    }
  },
];

// ────────────────────────────────────────────────────────────────────────────
// SPOTLIGHT OVERLAY — Fixed alignment: single div for pulse, no double coords
// ────────────────────────────────────────────────────────────────────────────
function SpotlightOverlay({
  rect,
  prevRect,
  isFullscreen,
  disableDimming,
  borderRadius = 16,
}: {
  rect: SpotlightRect | null;
  prevRect: SpotlightRect | null;
  isFullscreen: boolean;
  disableDimming?: boolean;
  borderRadius?: number;
}) {
  if (disableDimming) return null;

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

  const targetRect = isFullscreen || !rect ? { x: vw / 2, y: vh / 2, width: 0, height: 0 } : rect;
  const initial = prevRect || targetRect;

  return (
    <motion.div
      key="spotlight-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[200] pointer-events-none"
    >
      <svg width="100%" height="100%" className="absolute inset-0" style={{ pointerEvents: 'auto' }}>
        <defs>
          <mask id="tour-spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            <motion.rect
              initial={{ x: initial.x, y: initial.y, width: initial.width, height: initial.height }}
              animate={{ x: targetRect.x, y: targetRect.y, width: targetRect.width, height: targetRect.height }}
              transition={springSmooth as Transition}
              rx={borderRadius}
              ry={borderRadius}
              fill="black"
            />
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(2, 6, 23, 0.65)" mask="url(#tour-spotlight-mask)" />
      </svg>
      {(!isFullscreen && rect) && (
        <motion.div
          initial={{ left: initial.x - 5, top: initial.y - 5, width: initial.width + 10, height: initial.height + 10 }}
          animate={{ left: targetRect.x - 5, top: targetRect.y - 5, width: targetRect.width + 10, height: targetRect.height + 10 }}
          transition={springSmooth as Transition}
          className="absolute pointer-events-none"
          style={{ borderRadius: borderRadius + 4 }}
        >
          <motion.div
            className="absolute inset-0 border-2 border-[var(--gl-brand-accent,#7C6FF7)]"
            style={{ borderRadius: borderRadius + 4 }}
            animate={{ boxShadow: ['0 0 0 0px rgba(124, 111, 247, 0.2)', '0 0 0 12px rgba(124, 111, 247, 0)'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
          />
        </motion.div>
      )}
    </motion.div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// TOOLTIP POSITION CALCULATOR
// ────────────────────────────────────────────────────────────────────────────
function getTooltipPosition(
  rect: SpotlightRect | null,
  placement: TooltipPlacement,
  tooltipW: number,
  tooltipH: number
): { top: number; left: number; origin: string } | null {
  if (!rect || placement === 'center') return null; // use CSS centering

  const gap = 20;
  let top = 0;
  let left = 0;
  let origin = 'center center';

  switch (placement) {
    case 'bottom':
      top = rect.y + rect.height + gap;
      left = rect.x + rect.width / 2 - tooltipW / 2;
      origin = 'top center';
      break;
    case 'top':
      top = rect.y - tooltipH - gap;
      left = rect.x + rect.width / 2 - tooltipW / 2;
      origin = 'bottom center';
      break;
    case 'left':
      top = rect.y + rect.height / 2 - tooltipH / 2;
      left = rect.x - tooltipW - gap;
      origin = 'center right';
      break;
    case 'right':
      top = rect.y + rect.height / 2 - tooltipH / 2;
      left = rect.x + rect.width + gap;
      origin = 'center left';
      break;
  }

  // Clamp to viewport with padding
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
  top = Math.max(12, Math.min(top, vh - tooltipH - 12));
  left = Math.max(12, Math.min(left, vw - tooltipW - 12));

  return { top, left, origin };
}

// ────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ────────────────────────────────────────────────────────────────────────────
export default function ProductTour() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [prevSpotlightRect, setPrevSpotlightRect] = useState<SpotlightRect | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const complianceTimersRef = useRef<NodeJS.Timeout[]>([]);
  const stepTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Store selectors
  const setActiveLens = useCanvasStore(state => state.setActiveLens);
  const setSelectedNodeId = useCanvasStore(state => state.setSelectedNodeId);
  const setComplianceFramework = useCanvasStore(state => state.setComplianceFramework);
  const toggleLiveStream = useCanvasStore(state => state.toggleLiveStream);
  const setTourActive = useCanvasStore(state => state.setTourActive);

  const storeActions: StoreActions = {
    setActiveLens,
    setSelectedNodeId,
    setComplianceFramework,
    toggleLiveStream,
    setTourActive,
  };

  // ──── Measure target element ────
  const measureTarget = useCallback((targetId: string | null, padding: number = 0): SpotlightRect | null => {
    if (!targetId) return null;
    const el = document.querySelector(`[data-tour-id="${targetId}"], [data-id="${targetId}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: r.left - padding,
      y: r.top - padding,
      width: r.width + padding * 2,
      height: r.height + padding * 2,
    };
  }, []);

  // ──── Clear all compliance cycling timers ────
  const clearComplianceTimers = useCallback(() => {
    complianceTimersRef.current.forEach(t => clearTimeout(t));
    complianceTimersRef.current = [];
  }, []);

  // ──── Update spotlight rect ────
  const updateSpotlight = useCallback(() => {
    const step = TOUR_STEPS[currentStep];
    if (!step) return;
    const rect = measureTarget(step.targetId, step.spotlightPadding ?? 8);
    setSpotlightRect(rect);
  }, [currentStep, measureTarget]);

  // ──── Auto-start on first visit ────
  useEffect(() => {
    const hasSeenTour = localStorage.getItem('gravity-lens-tour-complete');
    if (!hasSeenTour) {
      const t = setTimeout(() => {
        setIsOpen(true);
        setTourActive(true);
      }, 2000);
      return () => clearTimeout(t);
    }
  }, [setTourActive]);

  // ──── Listen for replay event ────
  useEffect(() => {
    const handleReplay = () => {
      clearComplianceTimers();
      setCurrentStep(0);
      setIsOpen(true);
      setTourActive(true);
    };
    window.addEventListener('replay-tour', handleReplay);
    return () => window.removeEventListener('replay-tour', handleReplay);
  }, [setTourActive, clearComplianceTimers]);

  // ──── Step transition choreography ────
  useEffect(() => {
    if (!isOpen) return;
    const step = TOUR_STEPS[currentStep];
    if (!step) return;

    // Phase 1: Hide tooltip, clear old timers
    queueMicrotask(() => setShowTooltip(false));
    clearComplianceTimers();
    if (stepTimerRef.current) clearTimeout(stepTimerRef.current);

    // Phase 2: Execute the state action (lens switch, node select, etc.)
    step.action(storeActions);

    // Phase 3: Wait for DOM to settle, then measure + show
    const settleDelay = step.delay ?? 250;
    stepTimerRef.current = setTimeout(() => {
      // Save current rect as "previous" for spring animation
      setPrevSpotlightRect(spotlightRect);

      // Measure the new target
      const newRect = measureTarget(step.targetId, step.spotlightPadding ?? 8);
      setSpotlightRect(newRect);

      // Phase 4: Stagger the tooltip reveal slightly after spotlight moves
      setTimeout(() => setShowTooltip(true), 120);
    }, settleDelay);

    // Phase 5: If compliance step, start cycling after tooltip appears
    if (step.id === 'compliance-frameworks') {
      const base = settleDelay + 400;
      const t1 = setTimeout(() => {
        setActiveLens('security');
        setSelectedNodeId(null);
        setComplianceFramework('general');
      }, base);
      const t2 = setTimeout(() => setComplianceFramework('soc2'), base + 1200);
      const t3 = setTimeout(() => setComplianceFramework('hipaa'), base + 2800);
      const t4 = setTimeout(() => setComplianceFramework('general'), base + 4400);
      complianceTimersRef.current = [t1, t2, t3, t4];
    }

    return () => {
      if (stepTimerRef.current) clearTimeout(stepTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, isOpen]);

  // ──── Reposition on resize ────
  useEffect(() => {
    if (!isOpen) return;
    const handleResize = () => updateSpotlight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isOpen, updateSpotlight]);

  const endTour = useCallback(() => {
    clearComplianceTimers();
    setIsOpen(false);
    setShowTooltip(false);
    setTourActive(false);
    localStorage.setItem('gravity-lens-tour-complete', 'true');
    setActiveLens('structural');
    setSelectedNodeId(null);
    setComplianceFramework('general');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearComplianceTimers, setTourActive, setActiveLens, setSelectedNodeId, setComplianceFramework]);

  // ──── Navigation ────
  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      endTour();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, endTour]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  // ──── Keyboard navigation ────
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); handleNext(); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(); }
      if (e.key === 'Escape') endTour();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, handleNext, handlePrev, endTour]);

  // ──── Derived values ────
  const step = TOUR_STEPS[currentStep];
  if (!step) return null;

  const StepIcon = step.icon;
  const isFullscreen = step.targetId === null;
  const tooltipW = 400;
  const tooltipH = 260;
  const position = getTooltipPosition(spotlightRect, step.placement, tooltipW, tooltipH);
  const isCentered = !position;
  const borderRadius = step.spotlightRadius ?? 16;

  // Step-specific accent
  const getAccent = () => {
    switch (step.id) {
      case 'blast-radius':
      case 'blast-inspector':
        return { text: 'text-orange-500', iconBg: 'bg-orange-50 dark:bg-orange-500/10', iconBorder: 'border-orange-200 dark:border-orange-500/20' };
      case 'cost-lens':
      case 'cost-node-interaction':
        return { text: 'text-emerald-500', iconBg: 'bg-emerald-50 dark:bg-emerald-500/10', iconBorder: 'border-emerald-200 dark:border-emerald-500/20' };
      case 'security-lens':
      case 'compliance-frameworks':
        return { text: 'text-amber-500', iconBg: 'bg-amber-50 dark:bg-amber-500/10', iconBorder: 'border-amber-200 dark:border-amber-500/20' };
      case 'live-stream':
        return { text: 'text-red-500', iconBg: 'bg-red-50 dark:bg-red-500/10', iconBorder: 'border-red-200 dark:border-red-500/20' };
      case 'complete':
        return { text: 'text-violet-500', iconBg: 'bg-violet-50 dark:bg-violet-500/10', iconBorder: 'border-violet-200 dark:border-violet-500/20' };
      default:
        return { text: 'text-indigo-500', iconBg: 'bg-indigo-50 dark:bg-indigo-500/10', iconBorder: 'border-indigo-200 dark:border-indigo-500/20' };
    }
  };
  const accent = getAccent();

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            onClick={endTour}
            className="fixed top-6 right-8 z-[305] text-[12px] font-medium text-slate-400 hover:text-slate-200 transition-colors pointer-events-auto"
          >
            Skip tour
          </motion.button>

          {/* ── Spotlight Overlay ── */}
          <SpotlightOverlay
            rect={spotlightRect}
            prevRect={prevSpotlightRect}
            isFullscreen={isFullscreen}
            disableDimming={step.disableDimming}
            borderRadius={borderRadius}
          />

          {/* ── Tooltip Card ── */}
          <AnimatePresence mode="wait">
            {showTooltip && (
              <motion.div
                key={`tooltip-${step.id}`}
                variants={scaleIn as Variants}
                initial="initial"
                animate="animate"
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                style={{
                  position: 'fixed',
                  width: tooltipW,
                  zIndex: 301,
                  transformOrigin: isCentered ? 'center center' : position!.origin,
                  ...(isCentered
                    ? { top: '50%', left: '50%', x: '-50%', y: '-50%' }
                    : { top: position!.top, left: position!.left }
                  ),
                }}
                className="pointer-events-auto"
              >
                <div className="bg-white/[0.97] dark:bg-slate-950/[0.97] backdrop-blur-2xl border border-slate-200/80 dark:border-slate-700/60 rounded-2xl shadow-[0_20px_60px_-12px_rgba(0,0,0,0.25)] overflow-hidden">
                  <div className="p-5">
                    {/* Header row */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl border ${accent.iconBg} ${accent.iconBorder} shrink-0`}>
                          <StepIcon weight="duotone" className={`w-5 h-5 ${accent.text}`} />
                        </div>
                        <h3 className="text-[15px] font-medium text-slate-900 dark:text-white leading-snug">
                          {step.title}
                        </h3>
                      </div>
                      <p className="text-[12px] font-medium text-slate-400 dark:text-slate-500 mt-1">
                        {currentStep + 1} of {TOUR_STEPS.length}
                      </p>
                    </div>

                    {/* Description */}
                    <p className="text-[13px] text-slate-600 dark:text-slate-400 leading-[1.6] mb-5">
                      {step.description}
                    </p>

                    {/* Navigation */}
                    <div className="flex items-center justify-between mt-2">
                      {/* Step dots */}
                      <div className="flex items-center gap-2">
                        {TOUR_STEPS.map((_, i) => (
                          <motion.div
                            key={i}
                            className={`rounded-full ${i === currentStep
                                ? 'bg-[var(--gl-brand-accent,#7C6FF7)]'
                                : i < currentStep
                                  ? 'bg-[var(--gl-brand-accent,#7C6FF7)] opacity-50'
                                  : 'bg-slate-200 dark:bg-slate-700'
                              }`}
                            initial={false}
                            animate={{
                              scale: i === currentStep ? 1.4 : 1,
                              width: 6,
                              height: 6
                            }}
                            transition={springSnappy as Transition}
                          />
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <motion.button
                          whileHover={currentStep !== 0 ? { scale: 1.05 } : {}}
                          whileTap={currentStep !== 0 ? { scale: 0.95 } : {}}
                          onClick={handlePrev}
                          disabled={currentStep === 0}
                          className="flex items-center justify-center h-[32px] px-4 rounded-[6px] text-[13px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                        >
                          Previous
                        </motion.button>
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={handleNext}
                          className="flex items-center justify-center gap-2 h-[32px] px-4 bg-[var(--gl-brand-accent,#7C6FF7)] hover:opacity-90 text-white text-[13px] font-medium rounded-[6px] shadow-[0_4px_12px_rgba(124,111,247,0.3)] transition-all"
                        >
                          {currentStep === TOUR_STEPS.length - 1 ? 'Finish' : 'Next'}
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );
}