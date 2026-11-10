// Which optional tracker-table columns fit in `width` CSS px. 0 (not measured yet, or "more info" scrolling) shows
// every column that has data. Name, battery and ping always show; the rest drop out in reverse of this order.
const REM = 16;
const BASE = (15 + 7.5 + 6.5 + 1) * REM; // name at its comfortable width, battery, ping, list padding

export function fitColumns(
  width: number,
  has: { type: boolean; temp: boolean; preciseRotation: boolean }
) {
  const fit = { type: has.type, tps: true, temp: has.temp, rot: true };
  if (width <= 0) return fit;
  let left = width - BASE;
  const take = (want: boolean, rem: number) => {
    if (!want || left < rem * REM) return false;
    left -= rem * REM;
    return true;
  };
  fit.type = take(has.type, 6);
  fit.tps = take(true, 3.5);
  fit.temp = take(has.temp, 4.5);
  fit.rot = take(true, has.preciseRotation ? 9 : 7);
  return fit;
}
