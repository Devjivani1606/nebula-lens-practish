import { useState, useEffect } from 'react';

export type FontScale = 'compact' | 'small' | 'medium' | 'large' | 'larger';

const SCALE_VALUES: Record<FontScale, number> = {
  compact: 0.75,
  small: 0.8125,
  medium: 0.875,
  large: 1,
  larger: 1.125
};

const SCALE_ORDER: FontScale[] = ['compact', 'small', 'medium', 'large', 'larger'];

export function useFontScale() {
  const [scale, setScaleState] = useState<FontScale>('small');
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
      const inspectorScaleIndex = Math.max(0, SCALE_ORDER.indexOf(s) - 1);
      const inspectorScale = SCALE_ORDER[inspectorScaleIndex];
      const inspector = document.getElementById('gl-inspector');
      if (inspector) inspector.dataset.fontScale = inspectorScale;

      try {
        localStorage.setItem('gl-font-scale', s);
      } catch (e) {
        console.error('Failed to set localStorage', e);
      }
    };
    
    applyScale(scale);
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
