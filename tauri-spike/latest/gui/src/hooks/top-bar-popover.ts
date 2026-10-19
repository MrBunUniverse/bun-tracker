import { CSSProperties, RefObject, useLayoutEffect, useState } from 'react';

const EDGE = 12;
const GAP = 8;

/**
 * Position for a popout opened from the top bar: below the whole bar, its left edge on the
 * button, and kept inside the window at any width. Undefined while it is closed. Measured
 * before paint, so the popout never shows at a stale spot.
 */
export function useTopBarPopover(
  anchorRef: RefObject<HTMLElement | null>,
  active: boolean,
  preferredWidth: number
): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties>();

  useLayoutEffect(() => {
    if (!active) return;
    const place = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const bar = anchor.closest('[data-topbar-row]') ?? anchor;
      const top = Math.round(bar.getBoundingClientRect().bottom + GAP);
      const width = Math.min(preferredWidth, window.innerWidth - EDGE * 2);
      const maxLeft = window.innerWidth - width - EDGE;
      const left = Math.round(
        Math.max(EDGE, Math.min(anchor.getBoundingClientRect().left, maxLeft))
      );
      setStyle({
        position: 'fixed',
        top,
        left,
        right: 'auto',
        width,
        maxHeight: `calc(100dvh - ${top + EDGE}px)`,
      });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [active, anchorRef, preferredWidth]);

  return active ? style : undefined;
}
