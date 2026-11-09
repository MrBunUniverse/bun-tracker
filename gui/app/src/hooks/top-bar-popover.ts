import { CSSProperties, RefObject, useLayoutEffect, useState } from 'react';

const EDGE = 12;
const GAP = 8;
const MIN_WIDTH = 300;
const PENDING: CSSProperties = { position: 'fixed', visibility: 'hidden' };

/**
 * Position for a popout opened from the top bar: below the whole bar (above it when the bar
 * carries data-topbar-row="up", like the bottom status bar, aligned to its trigger), its left edge on the
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
      const up = row.dataset.topbarRow === 'up';
      const contentLeft = up
        ? anchor.getBoundingClientRect().left
        : rowRect.left + parseFloat(getComputedStyle(row).paddingLeft || '0');
      // Keep the content line and narrow the popout to fit beside it. Only when that leaves too
      // little room does it fall back to the full window width.
      const spaceOnLine = up
        ? window.innerWidth - EDGE * 2
        : window.innerWidth - contentLeft - EDGE;
      const onLine = spaceOnLine >= MIN_WIDTH;
      const width = Math.round(
        Math.min(preferredWidth, onLine ? spaceOnLine : window.innerWidth - EDGE * 2)
      );
      // From a bottom bar, slide left so the popout still fits beside its trigger.
      const left = Math.round(
        up
          ? Math.max(EDGE, Math.min(contentLeft, window.innerWidth - width - EDGE))
          : onLine
            ? contentLeft
            : EDGE
      );
      if (up) {
        const bottom = Math.round(window.innerHeight - rowRect.top + GAP);
        setStyle({
          position: 'fixed',
          top: 'auto',
          bottom,
          left,
          right: 'auto',
          width,
          maxHeight: `calc(100dvh - ${bottom + EDGE}px)`,
        });
        return;
      }
      const top = Math.round(rowRect.bottom + GAP);
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

  // Fixed and invisible until measured, so a panel never paints in flow or at a stale spot.
  return active ? (style ?? PENDING) : undefined;
}
