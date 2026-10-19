import { CSSProperties, RefObject, useLayoutEffect, useState } from 'react';

const EDGE = 12;
const GAP = 8;
const MIN_WIDTH = 300;

/**
 * Position for a popout opened from the top bar: below the whole bar, its left edge on the
 * main window's content line (the top bar's left padding), and kept inside the window at any
 * width. Every popout shares that line. Undefined while it is closed. Measured before paint,
 * so the popout never shows at a stale spot.
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
      const row = anchor.closest<HTMLElement>('[data-topbar-row]') ?? anchor;
      const rowRect = row.getBoundingClientRect();
      const top = Math.round(rowRect.bottom + GAP);
      const contentLeft =
        rowRect.left + parseFloat(getComputedStyle(row).paddingLeft || '0');
      // Keep the content line and narrow the popout to fit beside it. Only when that leaves too
      // little room does it fall back to the full window width.
      const spaceOnLine = window.innerWidth - contentLeft - EDGE;
      const onLine = spaceOnLine >= MIN_WIDTH;
      const width = Math.round(
        Math.min(preferredWidth, onLine ? spaceOnLine : window.innerWidth - EDGE * 2)
      );
      const left = Math.round(onLine ? contentLeft : EDGE);
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
    // The bar can change height after the popout opens (it wraps, or settles on load),
    // so follow it as well as the window.
    const bar = anchorRef.current?.closest<HTMLElement>('[data-topbar-row]');
    const observer = bar ? new ResizeObserver(place) : null;
    if (bar) observer?.observe(bar);
    return () => {
      window.removeEventListener('resize', place);
      observer?.disconnect();
    };
  }, [active, anchorRef, preferredWidth]);

  return active ? style : undefined;
}
