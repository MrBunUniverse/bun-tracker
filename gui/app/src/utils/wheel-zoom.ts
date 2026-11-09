const LINE_PX = 16;
const PAGE_PX = 400;
const NOTCH_STEP = 0.12; // zoom per mouse-wheel notch
const PIXEL_GAIN = 0.005; // trackpad zoom per px
const PINCH_GAIN = 0.01; // trackpad pinch (ctrlKey) zoom per px
const MAX_DELTA_PX = 60; // per event, so a fast flick cannot jump

// Multiplier for one wheel event: > 1 zooms in (deltaY < 0), < 1 zooms out.
// ponytail: a notch is a legacy wheelDeltaY that is a nonzero multiple of 120 (WebKit/Chromium mouse wheels);
// a device that reports such values for smooth scrolling would be treated as notches. Upgrade by
// also requiring deltaMode/size heuristics if one shows up.
export function wheelZoomFactor(
  deltaY: number,
  deltaMode = 0,
  wheelDeltaY?: number,
  ctrlKey = false
): number {
  if (
    !ctrlKey &&
    wheelDeltaY !== undefined &&
    wheelDeltaY !== 0 &&
    wheelDeltaY % 120 === 0
  ) {
    const notches = Math.abs(wheelDeltaY) / 120;
    return (1 + NOTCH_STEP) ** (-Math.sign(deltaY || -wheelDeltaY) * notches);
  }
  const px = deltaY * (deltaMode === 1 ? LINE_PX : deltaMode === 2 ? PAGE_PX : 1);
  const clamped = Math.max(-MAX_DELTA_PX, Math.min(MAX_DELTA_PX, px));
  return Math.exp(-clamped * (ctrlKey ? PINCH_GAIN : PIXEL_GAIN));
}
