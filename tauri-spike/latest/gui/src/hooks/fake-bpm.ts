import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAdaptiveBpm } from './adaptive-bpm';

export type BpmPresetId =
  | 'sleeping'
  | 'resting'
  | 'sitting'
  | 'standing'
  | 'dancing'
  | 'dynamic'
  | 'adaptive';

export interface BpmPreset {
  id: BpmPresetId;
  label: string;
  icon: string;
  min: number;
  max: number;
  base: number;
  variance: number;
  description: string;
  zone: 'resting' | 'normal' | 'elevated' | 'cardio';
}

export const BPM_PRESETS: Record<BpmPresetId, BpmPreset> = {
  adaptive: {
    id: 'adaptive',
    label: 'Adaptive',
    icon: '',
    min: 60,
    max: 160,
    base: 74,
    variance: 0,
    description: 'Simulated BPM from live tracker activity with gradual recovery',
    zone: 'normal',
  },
  sleeping: {
    id: 'sleeping',
    label: 'Sleeping',
    icon: '🌙',
    min: 48,
    max: 60,
    base: 52,
    variance: 1.5,
    description: 'Deep sleep & minimal metabolic rate',
    zone: 'resting',
  },
  resting: {
    id: 'resting',
    label: 'Resting',
    icon: '🛋️',
    min: 58,
    max: 70,
    base: 64,
    variance: 2.0,
    description: 'Relaxed calm posture & quiet breathing',
    zone: 'resting',
  },
  sitting: {
    id: 'sitting',
    label: 'Sitting',
    icon: '🪑',
    min: 68,
    max: 82,
    base: 74,
    variance: 2.5,
    description: 'Normal idle desk or couch posture',
    zone: 'normal',
  },
  standing: {
    id: 'standing',
    label: 'Standing',
    icon: '🧍',
    min: 84,
    max: 104,
    base: 92,
    variance: 3.5,
    description: 'Upright posture & light ambient motion',
    zone: 'elevated',
  },
  dancing: {
    id: 'dancing',
    label: 'Dancing',
    icon: '💃',
    min: 125,
    max: 160,
    base: 140,
    variance: 6.0,
    description: 'High energy rhythm, workout & clubbing',
    zone: 'cardio',
  },
  dynamic: {
    id: 'dynamic',
    label: 'Dynamic',
    icon: '⚡',
    min: 65,
    max: 145,
    base: 95,
    variance: 14.0,
    description: 'Frequent jumps, excitement swings & surges',
    zone: 'cardio',
  },
};

const STORAGE_KEY_ENABLED = 'slimevr-fake-bpm-enabled';
const STORAGE_KEY_PRESET = 'slimevr-fake-bpm-preset';
const STORAGE_KEY_SHOW_SITUATION = 'slimevr-fake-bpm-show-situation';

function computeNextBpm(current: number, preset: BpmPreset): number {
  if (preset.id === 'dynamic') {
    const spike = Math.random() < 0.28;
    const direction = Math.random() > 0.46 ? 1 : -1;
    const magnitude = spike
      ? Math.floor(Math.random() * 16) + 7
      : Math.floor(Math.random() * 7) + 2;
    let next = current + direction * magnitude;
    if (next < preset.min) next = preset.min + Math.floor(Math.random() * 6);
    if (next > preset.max) next = preset.max - Math.floor(Math.random() * 6);
    return Math.round(next);
  }

  // Organic random walk with gentle mean-reversion towards base
  const meanReversion = (preset.base - current) * 0.14;
  const jitter = (Math.random() * 2 - 1) * preset.variance;
  let next = Math.round(current + meanReversion + jitter);
  if (next < preset.min) next = preset.min;
  if (next > preset.max) next = preset.max;
  return next;
}

export function useFakeBpm() {
  const [enabled, setEnabledState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true';
  });

  const [presetId, setPresetIdState] = useState<BpmPresetId>(() => {
    if (typeof window === 'undefined') return 'sitting';
    const saved = localStorage.getItem(STORAGE_KEY_PRESET) as BpmPresetId;
    return BPM_PRESETS[saved] ? saved : 'sitting';
  });

  const [showSituation, setShowSituationState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const saved = localStorage.getItem(STORAGE_KEY_SHOW_SITUATION);
    return saved !== null ? saved === 'true' : true;
  });

  const adaptive = useAdaptiveBpm(enabled && presetId === 'adaptive');
  const preset = BPM_PRESETS[presetId] || BPM_PRESETS.sitting;
  const [currentBpm, setCurrentBpm] = useState<number>(preset.base);
  const [delta, setDelta] = useState<number>(0);

  const presetRef = useRef(preset);
  presetRef.current = preset;

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_ENABLED, String(next));
    }
  }, []);

  const setPresetId = useCallback((id: BpmPresetId) => {
    if (!BPM_PRESETS[id]) return;
    setPresetIdState(id);
    const targetPreset = BPM_PRESETS[id];
    setCurrentBpm(targetPreset.base);
    setDelta(0);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_PRESET, id);
    }
  }, []);

  const setShowSituation = useCallback((next: boolean) => {
    setShowSituationState(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_SHOW_SITUATION, String(next));
    }
  }, []);

  // Update loop: updates every 2 to 3 seconds with randomized interval
  useEffect(() => {
    if (!enabled || presetId === 'adaptive') return;

    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;

    const tick = () => {
      if (!isMounted) return;
      setCurrentBpm((prev) => {
        const next = computeNextBpm(prev, presetRef.current);
        setDelta(next - prev);
        return next;
      });

      // Randomize interval between 2000ms and 3000ms (2-3 seconds)
      const nextDelay = 2000 + Math.floor(Math.random() * 1000);
      timeoutId = setTimeout(tick, nextDelay);
    };

    // First scheduled tick
    const initialDelay = 2000 + Math.floor(Math.random() * 800);
    timeoutId = setTimeout(tick, initialDelay);

    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [enabled, presetId]);

  const displayedBpm = presetId === 'adaptive' ? adaptive.bpm : currentBpm;
  const available = presetId !== 'adaptive' || adaptive.available;
  const zone =
    presetId === 'adaptive'
      ? displayedBpm < 68
        ? 'resting'
        : displayedBpm < 85
          ? 'normal'
          : displayedBpm < 120
            ? 'elevated'
            : 'cardio'
      : preset.zone;
  const formattedBpmText = useMemo(() => {
    if (!enabled || !available) return '';
    return `❤️ ${displayedBpm} BPM`;
  }, [enabled, available, displayedBpm]);

  return {
    enabled,
    setEnabled,
    presetId,
    setPresetId,
    preset,
    showSituation,
    setShowSituation,
    currentBpm: displayedBpm,
    delta: presetId === 'adaptive' ? 0 : delta,
    available,
    adaptive,
    zone,
    activityLabel: presetId === 'adaptive' ? adaptive.activity : preset.label,
    formattedBpmText,
    allPresets: Object.values(BPM_PRESETS),
  };
}
