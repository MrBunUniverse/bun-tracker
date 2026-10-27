import { useEffect, useRef } from 'react';
import { isPawTheme, useConfig } from '@/hooks/config';

// Welcome background in Bun: faint topographic contour lines drawn on the dot grid, drifting very slowly.
// The height field is three crossed sine waves, so it never repeats visibly and costs a few sines per cell.
// Paints over a backdrop in the page colour, so it replaces body's dots. Runs at 15 fps (the drift is slow enough),
// and draws one still frame when the animations setting is off or with reduced motion. Nothing is drawn outside Bun.
const CELL = 12; // matches the dot grid on body
const DOT = 3;
const FPS = 15;
// Contour lines per unit of height. Higher packs the lines closer together.
const DENSITY = 1.1;
// How much of each band, around the contour, lights up (0..1).
const LINE_WIDTH = 0.22;
// Dot brightness: QUIET at rest, up to QUIET + LINE on a contour line.
const QUIET = 0.06;
const LINE = 0.28;
const STEPS = 16;
const PALETTE = Array.from(
  { length: STEPS + 1 },
  (_, k) => `rgba(239, 230, 214, ${(QUIET + (LINE * k) / STEPS).toFixed(3)})`
);

function smooth(u: number) {
  return u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u);
}

// Brightness step for a cell at grid position (x, y), time t in seconds.
function level(x: number, y: number, t: number) {
  const h =
    Math.sin(x * 0.007 + t * 0.05) +
    Math.sin(y * 0.009 - t * 0.04) +
    Math.sin((x + y) * 0.005 + t * 0.03);
  const f = (((h * DENSITY) % 1) + 1) % 1;
  const k = smooth((1 - Math.abs(f - 0.5) * 2 - (1 - LINE_WIDTH)) / LINE_WIDTH);
  return Math.round(k * STEPS);
}

export function ContourDots({
  className = 'absolute inset-0 -z-10 w-full h-full pointer-events-none',
}: {
  className?: string;
}) {
  const { config } = useConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animate = config?.animations !== false;
  const shown = isPawTheme(config?.theme);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!shown || !canvas || !ctx) return;
    const moving =
      animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let backdrop = '';
    let raf = 0;
    let last = 0;

    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(canvas.clientWidth * dpr);
      canvas.height = Math.round(canvas.clientHeight * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = getComputedStyle(document.body).backgroundColor;
      backdrop = /rgba?\(.*,\s*0\)$/.test(bg) || bg === 'transparent' ? '' : bg;
    };

    const draw = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      if (backdrop) {
        ctx.fillStyle = backdrop;
        ctx.fillRect(0, 0, w, h);
      }
      for (let y = CELL / 2; y < h; y += CELL) {
        for (let x = CELL / 2; x < w; x += CELL) {
          ctx.fillStyle = PALETTE[level(x, y, t)];
          ctx.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT);
        }
      }
    };

    const frame = (time: number) => {
      raf = requestAnimationFrame(frame);
      if (time - last < 1000 / FPS) return;
      last = time;
      draw(time / 1000);
    };

    size();
    draw(0);
    const ro = new ResizeObserver(() => {
      size();
      draw(last / 1000);
    });
    ro.observe(canvas);
    if (moving) raf = requestAnimationFrame(frame);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [shown, animate]);

  if (!shown) return null;

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
