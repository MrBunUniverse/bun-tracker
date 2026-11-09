import { createContext, useContext, useEffect, useState } from 'react';

export type StatusBarMode = 'desk' | 'vr';

/** Set by the bottom StatusBar; null when a status component is used elsewhere. */
export const StatusBarModeContext = createContext<StatusBarMode | null>(null);
export const useStatusBarMode = () => useContext(StatusBarModeContext);

/** VR items share the bar's width equally. */
export const barRoot = (mode: StatusBarMode | null) =>
  mode === 'vr' ? 'flex-1 min-w-0' : '';

/**
 * Size, shape and (VR only) colours of a bar trigger; null leaves the component's own look.
 * Desk triggers clip their own text, never an ancestor: a popover is a fixed-position
 * descendant of the item wrapper, and WebKit drops those under an overflow-hidden ancestor.
 */
export const barTrigger = (mode: StatusBarMode | null, open = false) =>
  mode === 'vr'
    ? `h-[60px] w-full min-w-0 flex-col justify-center gap-1 overflow-hidden rounded-[16px] border px-1 text-[12px] font-medium leading-none ${
        open
          ? 'border-accent-background-20/40 bg-accent-background-20/[0.12] text-accent-background-10'
          : 'border-[var(--material-border-subtle)] bg-background-70 text-background-10 hover:bg-background-60'
      }`
    : mode === 'desk'
      ? 'h-6 min-w-0 max-w-full gap-1.5 overflow-hidden rounded-md border border-transparent px-2 text-[12px] font-medium'
      : '';

/** Enlarges the hit targets inside a popover opened from the VR bar (see StatusBar.scss). */
export const barPopover = (mode: StatusBarMode | null) =>
  mode === 'vr' ? 'statusbar-vr' : '';

const KEY = 'slimevr-statusbar-mode';

/** The bar size, kept in localStorage like the other GUI-only preferences. */
export function useStatusBarModeSetting() {
  const [mode, setMode] = useState<StatusBarMode>(() => {
    try {
      return localStorage.getItem(KEY) === 'vr' ? 'vr' : 'desk';
    } catch {
      return 'desk';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // storage unavailable; the choice lasts until restart
    }
  }, [mode]);
  return [mode, setMode] as const;
}
