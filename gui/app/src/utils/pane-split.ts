// Sizing rules for the stacked live-preview / controls split on the manual proportions page. Pure so the bounds,
// keyboard mapping and stored-value parsing can be tested without a DOM.

export const PREVIEW_MIN = 160; // 10rem
export const CONTROLS_MIN = 144;
export const HANDLE_SIZE = 12;
export const DEFAULT_PREVIEW_RATIO = 0.35;
export const DEFAULT_PREVIEW_MAX = 384; // 24rem
export const KEY_STEP = 16;
export const KEY_STEP_LARGE = 64;

export interface SplitBounds {
  min: number;
  max: number;
}

// `container` is the stack's content height. When it is too short to give both panes their minimum, each minimum
// shrinks to at most 40% of what is left so both panes stay usable and min never exceeds max.
export function splitBounds(container: number): SplitBounds {
  const avail = Math.max(0, container - HANDLE_SIZE);
  const min = Math.floor(Math.min(PREVIEW_MIN, avail * 0.4));
  const controls = Math.floor(Math.min(CONTROLS_MIN, avail * 0.4));
  return { min, max: Math.max(min, avail - controls) };
}

export function clampPreview(height: number, container: number): number {
  const { min, max } = splitBounds(container);
  return Math.round(Math.min(max, Math.max(min, height)));
}

export function defaultPreview(container: number): number {
  return clampPreview(
    Math.min(DEFAULT_PREVIEW_MAX, container * DEFAULT_PREVIEW_RATIO),
    container
  );
}

// Stored preference: a finite positive pixel height, anything else (missing, NaN, negative, junk) is ignored.
export function parseStoredPreview(raw: string | null): number | null {
  if (raw === null || !/^\d+(\.\d+)?$/.test(raw.trim())) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 && value <= 10000 ? value : null;
}

// ArrowUp moves the divider up (smaller preview), ArrowDown down. Home/End jump to the smallest/largest preview.
// Returns null for keys the separator does not handle.
export function keyboardPreview(
  key: string,
  shift: boolean,
  current: number,
  container: number
): number | null {
  const step = shift ? KEY_STEP_LARGE : KEY_STEP;
  const { min, max } = splitBounds(container);
  switch (key) {
    case 'ArrowUp':
      return clampPreview(current - step, container);
    case 'ArrowDown':
      return clampPreview(current + step, container);
    case 'Home':
      return min;
    case 'End':
      return max;
    default:
      return null;
  }
}
