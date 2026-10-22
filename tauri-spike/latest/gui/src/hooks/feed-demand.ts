import { PrimitiveAtom, useSetAtom } from 'jotai';
import { useEffect } from 'react';

// Counts this component as needing a data feed (see bonesFeedCountAtom, trackerDetailCountAtom)
// while it is mounted and `active`.
export function useFeedDemand(countAtom: PrimitiveAtom<number>, active = true) {
  const setCount = useSetAtom(countAtom);
  useEffect(() => {
    if (!active) return;
    setCount((count) => count + 1);
    return () => setCount((count) => Math.max(0, count - 1));
  }, [active, setCount]);
}
