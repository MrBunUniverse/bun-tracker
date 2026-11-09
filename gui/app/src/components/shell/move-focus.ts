import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

/** Moves focus along a list of items, wrapping at the ends. */
export function moveFocus(
  event: ReactKeyboardEvent,
  items: HTMLElement[],
  backKey: string,
  forwardKey: string
) {
  if (![backKey, forwardKey, 'Home', 'End'].includes(event.key)) return;
  const index = items.indexOf(document.activeElement as HTMLElement);
  if (index === -1) return;
  event.preventDefault();
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (index + (event.key === forwardKey ? 1 : -1) + items.length) % items.length;
  items[next]?.focus();
}
