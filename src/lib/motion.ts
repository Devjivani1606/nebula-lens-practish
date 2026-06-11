import { Variants, Transition } from "framer-motion";

// -----------------------------------------------------------------------------
// TRANSITION CONFIGS
// Rules: All durations under 300ms, no linear easings.
// -----------------------------------------------------------------------------

export const springSnappy: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 25,
};

export const springSmooth: Transition = {
  type: "spring",
  stiffness: 250,
  damping: 28,
};

export const easeOut: Transition = {
  type: "tween",
  ease: [0.25, 0.46, 0.45, 0.94],
  duration: 0.2, // 200ms
};

export const easeInOut: Transition = {
  type: "tween",
  ease: [0.4, 0, 0.2, 1],
  duration: 0.25, // 250ms
};

// -----------------------------------------------------------------------------
// REUSABLE VARIANTS
// -----------------------------------------------------------------------------

export type MotionVariant = Variants;

export const fadeIn: MotionVariant = {
  initial: { opacity: 0, y: 8 },
  animate: { 
    opacity: 1, 
    y: 0, 
    transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] } 
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }
  }
};

export const fadeOut: MotionVariant = {
  initial: { opacity: 1, y: 0 },
  animate: { 
    opacity: 0, 
    y: -4, 
    transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] } 
  },
  exit: { 
    opacity: 0, 
    y: -4, 
    transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] } 
  },
};

export const slideInRight: MotionVariant = {
  initial: { x: "100%" },
  animate: { x: 0, transition: springSmooth },
  exit: { x: "100%", transition: springSmooth },
};

export const slideOutRight: MotionVariant = {
  initial: { x: 0 },
  animate: { x: "100%", transition: springSmooth },
  exit: { x: "100%", transition: springSmooth },
};

export const scaleIn: MotionVariant = {
  initial: { scale: 0.95, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: easeOut },
  exit: { scale: 0.95, opacity: 0, transition: { duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] } },
};

export const staggerContainer: MotionVariant = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

// Matches fadeIn but defined separately for semantic clarity in staggered lists
export const staggerItem: MotionVariant = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: easeOut },
};
