import { useState, useEffect } from 'react';

export type FontScale = 'small' | 'medium' | 'large';

const SCALE_VALUES: Record<FontScale, number> = {
  small: 0.875,
  medium: 1,
  large: 1.125
};

const SCALE_ORDER: FontScale[] = ['small', 'medium', 'large'];

export function useFontScale() {
  const [scale, setScaleState] = useState<FontScale>('medium');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem('gl-font-scale') as FontScale;
      if (saved && SCALE_VALUES[saved]) {
        setScaleState(saved);
      }
    } catch (e) {
      console.error('Failed to access localStorage', e);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const applyScale = (s: FontScale) => {
      // Dashboard wrapper (existing)
      const dashboard = document.getElementById('gl-dashboard');
      if (dashboard) dashboard.dataset.fontScale = s;

      // Inspector panel (new)
      const inspector = document.getElementById('gl-inspector');
      if (inspector) inspector.dataset.fontScale = s;
    };
    
    applyScale(scale);
    
    try {
      localStorage.setItem('gl-font-scale', scale);
    } catch (e) {
      console.error('Failed to set localStorage', e);
    }
  }, [scale, mounted]);

  const setScale = (newScale: FontScale) => {
    setScaleState(newScale);
  };

  const increase = () => {
    const idx = SCALE_ORDER.indexOf(scale);
    if (idx < SCALE_ORDER.length - 1) {
      setScaleState(SCALE_ORDER[idx + 1]);
    }
  };

  const decrease = () => {
    const idx = SCALE_ORDER.indexOf(scale);
    if (idx > 0) {
      setScaleState(SCALE_ORDER[idx - 1]);
    }
  };

  return { scale, setScale, increase, decrease, scaleValue: mounted ? SCALE_VALUES[scale] : 1 };
}
