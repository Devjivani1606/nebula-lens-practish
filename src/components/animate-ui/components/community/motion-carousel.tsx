'use client';

import * as React from 'react';
import { motion, type Transition } from 'framer-motion';
import { EmblaOptionsType, EmblaCarouselType } from 'embla-carousel';
import useEmblaCarousel from 'embla-carousel-react';
import { Button } from '@/components/ui/button';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { TrendUp } from '@phosphor-icons/react';

interface SnapshotVersion {
  version_id: string;
  version_number: number;
  label: string;
  is_latest: boolean;
  created_at: string;
  summary: {
    total_resources: number;
  };
  costs: {
    total_monthly: number;
    by_service: Record<string, number>;
  };
  changes: {
    added: number;
    removed: number;
    modified: number;
  };
}

type PropType = {
  versions: SnapshotVersion[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  options?: EmblaOptionsType;
};

type EmblaControls = {
  prevDisabled: boolean;
  nextDisabled: boolean;
  onDotClick: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  scrollSnaps: number[];
};

const transition: Transition = {
  type: 'spring',
  stiffness: 240,
  damping: 24,
  mass: 1,
};

const useEmblaControls = (
  emblaApi: EmblaCarouselType | undefined,
  selectedIndex: number,
  onSelect: (index: number) => void,
): EmblaControls => {
  const [scrollSnaps, setScrollSnaps] = React.useState<number[]>([]);
  const [prevDisabled, setPrevDisabled] = React.useState(true);
  const [nextDisabled, setNextDisabled] = React.useState(true);

  const selectedIndexRef = React.useRef(selectedIndex);
  const onSelectRef = React.useRef(onSelect);

  React.useEffect(() => {
    selectedIndexRef.current = selectedIndex;
  }, [selectedIndex]);

  React.useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const onDotClick = React.useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  const onPrev = React.useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const onNext = React.useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  const updateSelectionState = React.useCallback((api: EmblaCarouselType) => {
    const apiIndex = api.selectedScrollSnap();
    if (apiIndex !== selectedIndexRef.current) {
      onSelectRef.current(apiIndex);
    }
    setPrevDisabled(!api.canScrollPrev());
    setNextDisabled(!api.canScrollNext());
  }, []);

  const onInit = React.useCallback((api: EmblaCarouselType) => {
    setScrollSnaps(api.scrollSnapList());
    updateSelectionState(api);
  }, [updateSelectionState]);

  const onSelectCallback = React.useCallback((api: EmblaCarouselType) => {
    updateSelectionState(api);
  }, [updateSelectionState]);

  React.useEffect(() => {
    if (!emblaApi) return;

    onInit(emblaApi);
    emblaApi.on('reInit', onInit).on('select', onSelectCallback);

    return () => {
      emblaApi.off('reInit', onInit).off('select', onSelectCallback);
    };
  }, [emblaApi, onInit, onSelectCallback]);

  // Handle external selection changes (e.g. from Management Bar)
  React.useEffect(() => {
    if (emblaApi && emblaApi.selectedScrollSnap() !== selectedIndex) {
      emblaApi.scrollTo(selectedIndex);
    }
  }, [emblaApi, selectedIndex]);

  return {
    scrollSnaps,
    prevDisabled,
    nextDisabled,
    onDotClick,
    onPrev,
    onNext,
  };
};

function MotionCarousel({ versions, selectedIndex, onSelect, options }: PropType) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: 'center',
    containScroll: false,
    ...options
  });

  const {
    scrollSnaps,
    prevDisabled,
    nextDisabled,
    onDotClick,
    onPrev,
    onNext,
  } = useEmblaControls(emblaApi, selectedIndex, onSelect);

  return (
    <div className="w-full space-y-6">
      <div className="overflow-hidden py-2 px-1" ref={emblaRef}>
        <div className="flex touch-pan-y touch-pinch-zoom">
          {versions.map((v, index) => {
            const isActive = index === selectedIndex;
            const totalChanges = (v.changes?.added || 0) + (v.changes?.removed || 0) + (v.changes?.modified || 0);

            return (
              <motion.div
                key={v.version_id}
                onClick={() => onSelect(index)}
                className="w-[320px] sm:w-[380px] mr-6 shrink-0 flex-none cursor-pointer"
                style={{ originX: 0.5, originY: 0.5 }}
              >
                <motion.div
                  className={`h-48 border rounded-2xl p-5 shadow-md flex flex-col justify-between transition-colors select-none ${
                    isActive
                      ? 'bg-[var(--gl-bg-panel)] border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'bg-[var(--gl-bg-panel)]/60 border-[var(--gl-border)] hover:border-indigo-400/50 hover:bg-[var(--gl-bg-panel)]'
                  }`}
                  initial={false}
                  animate={{
                    scale: isActive ? 1 : 0.9,
                    opacity: isActive ? 1 : 0.6,
                  }}
                  transition={transition}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-extrabold text-[var(--gl-text-primary)]">
                            {v.label}
                          </span>
                          {v.is_latest && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-blue-500/10 text-blue-400 border border-blue-500/20 uppercase tracking-wide">
                              Current
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-[var(--gl-text-muted)] font-medium">
                          {new Date(v.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-lg font-black text-[var(--gl-text-primary)] leading-none">
                          ${(v.costs?.total_monthly || 0).toFixed(2)}
                        </span>
                        <span className="text-[8px] uppercase tracking-widest font-bold text-[var(--gl-text-muted)] mt-1">
                          / month
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats Row */}
                  <div className="grid grid-cols-3 gap-2 bg-[var(--gl-bg-muted)]/50 border border-[var(--gl-border)]/50 p-3 rounded-xl text-center text-xs">
                    <div className="flex flex-col">
                      <span className="text-[8px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Resources</span>
                      <span className="font-extrabold text-[var(--gl-text-primary)] mt-0.5">
                        {v.summary?.total_resources || 0}
                      </span>
                    </div>
                    <div className="flex flex-col border-x border-[var(--gl-border)]/60">
                      <span className="text-[8px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Changes</span>
                      <span className={`font-extrabold mt-0.5 ${totalChanges > 0 ? "text-indigo-400" : "text-[var(--gl-text-muted)]"}`}>
                        {totalChanges > 0 ? `+${totalChanges}` : "0"}
                      </span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] uppercase font-bold tracking-wider text-[var(--gl-text-muted)]">Compare</span>
                      <div className="flex justify-center items-center gap-1 mt-0.5 font-bold">
                        {(v.changes?.added || 0) > 0 && <span className="text-emerald-400" title="Added">+{v.changes?.added}</span>}
                        {(v.changes?.removed || 0) > 0 && <span className="text-red-400" title="Removed">-{v.changes?.removed}</span>}
                        {(v.changes?.modified || 0) > 0 && <span className="text-amber-400" title="Modified">~{v.changes?.modified}</span>}
                        {totalChanges === 0 && <span className="text-[var(--gl-text-muted)] font-normal italic">-</span>}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Control Buttons & Dot Pill Pagination */}
      <div className="flex justify-between items-center px-4 max-w-4xl mx-auto">
        <Button
          variant="outline"
          size="icon"
          onClick={onPrev}
          disabled={prevDisabled}
          className="border-[var(--gl-border)] hover:bg-[var(--gl-bg-muted)] text-[var(--gl-text-secondary)] h-9 w-9 rounded-xl"
        >
          <ChevronLeft className="size-5" />
        </Button>

        <div className="flex flex-wrap justify-center items-center gap-2 max-w-lg overflow-hidden py-1">
          {scrollSnaps.map((_, index) => (
            <DotButton
              key={index}
              label={`Snapshot ${index + 1}`}
              selected={index === selectedIndex}
              onClick={() => onDotClick(index)}
            />
          ))}
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={onNext}
          disabled={nextDisabled}
          className="border-[var(--gl-border)] hover:bg-[var(--gl-bg-muted)] text-[var(--gl-text-secondary)] h-9 w-9 rounded-xl"
        >
          <ChevronRight className="size-5" />
        </Button>
      </div>
    </div>
  );
}

function DotButton({ selected = false, label, onClick }: { selected?: boolean; label: string; onClick: () => void }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      layout
      initial={false}
      className="flex cursor-pointer select-none items-center justify-center rounded-full border-none bg-indigo-600 text-white text-xs"
      animate={{
        width: selected ? 88 : 10,
        height: selected ? 24 : 10,
      }}
      transition={transition}
    >
      <motion.span
        layout
        initial={false}
        className="block whitespace-nowrap px-2.5 py-0.5 font-bold"
        animate={{
          opacity: selected ? 1 : 0,
          scale: selected ? 1 : 0,
        }}
        transition={transition}
      >
        {label}
      </motion.span>
    </motion.button>
  );
}

export { MotionCarousel };
