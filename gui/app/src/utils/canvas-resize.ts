// Resizing a WebGL canvas clears its drawing buffer, so the new size has to be drawn in the same task (a
// ResizeObserver callback runs before paint). Waiting for the next throttled animation frame composites a blank
// canvas, which reads as flashing while a pane is dragged. Unchanged or empty sizes are ignored.
export function createCanvasResizer(
  setSize: (width: number, height: number) => void,
  draw: () => void,
  initial: { width: number; height: number } = { width: 0, height: 0 }
) {
  let width = initial.width;
  let height = initial.height;
  return (nextWidth: number, nextHeight: number): boolean => {
    if (nextWidth <= 0 || nextHeight <= 0) return false;
    if (nextWidth === width && nextHeight === height) return false;
    width = nextWidth;
    height = nextHeight;
    setSize(width, height);
    draw();
    return true;
  };
}
