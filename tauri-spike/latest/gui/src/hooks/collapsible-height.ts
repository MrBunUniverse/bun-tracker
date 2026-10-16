import { CSSProperties, RefObject, useRef } from 'react';

export function useCollapsibleHeight(_expanded: boolean) {
  const ref = useRef<HTMLDivElement>(null);

  return {
    ref: ref as RefObject<HTMLDivElement>,
    style: undefined as CSSProperties | undefined,
    onTransitionEnd: undefined,
  };
}
