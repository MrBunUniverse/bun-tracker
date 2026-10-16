import { RefObject, useEffect, useRef } from 'react';
import { isPawTheme, useConfig } from '@/hooks/config';

// Dot ripples in the Bun theme. Drops spread as rings across the dot grid and fade.
// Brightness is quantised into a few steps, so it keeps the pixel look.
// Grid dots within two cells of a live wave light up faintly, so the grid shows around each ripple as it passes.
// By default it sits over the dot grid that body draws (the welcome screen). `dots` draws its own dots, for a panel
// that covers body. `originEl` starts every drop from that element, so the rings boom out of it.
// Runs at 30 fps and stops once the ripples die out. Off when the animations setting is off, and static with reduced motion.
// Nothing is drawn outside Bun.
const CELL = 12; // matches the dot grid on body
const DOT = 2;
const FPS = 30;
const DAMPING = 0.975;
const IDLE = 0.002;
const BASE = 'rgba(239, 230, 214, 0.1)';
// Ripple brightness, low to high. The top step is the Bun coral.
const RIPPLE = [
  'rgba(239, 230, 214, 0.3)',
  'rgba(239, 230, 214, 0.55)',
  'rgb(224, 144, 126)',
];
// Grid dots around a wave: 1 two cells out (faint), 2 next to the wave.
const HALO = ['rgba(239, 230, 214, 0.05)', 'rgba(239, 230, 214, 0.1)'];

function rippleLevel(height: number) {
  const a = Math.abs(height);
  if (a < 0.04) return 0;
  if (a < 0.12) return 1;
  if (a < 0.25) return 2;
  return 3;
}

export function RippleDots({
  dots = false,
  originEl,
  gapMin = 1500,
  gapMax = 4000,
  className = 'absolute inset-0 -z-10 w-full h-full pointer-events-none',
}: {
  dots?: boolean;
  originEl?: RefObject<HTMLElement | null>;
  // How long between drops, in ms: a random time in this range.
  gapMin?: number;
  gapMax?: number;
  className?: string;
}) {
  const { config } = useConfig();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animate = config?.animations !== false;
  const shown = isPawTheme(config?.theme) && (dots || animate);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!shown || !canvas || !ctx) return;
    const reduceMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;
    const moving = animate && !reduceMotion;

    let cols = 0;
    let rows = 0;
    let dpr = 1;
    // Where the first cell's centre sits inside the canvas, so the grid lines up with body's dots.
    let offX = 0;
    let offY = 0;
    // Two height buffers: the current frame and the one before it.
    let cur = new Float32Array(0);
    let prev = new Float32Array(0);
    let raf = 0;
    let last = 0;
    let running = false;
    let timer = 0;

    // Sizes the canvas and buffers. Ripples reset on resize, which is fine for a background.
    const size = () => {
      dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      // body's dots sit at the centre of each 12px tile, counted from the viewport's top-left. Line this grid up with them.
      const r = canvas.getBoundingClientRect();
      const firstCol = Math.ceil((r.left - CELL / 2) / CELL);
      const firstRow = Math.ceil((r.top - CELL / 2) / CELL);
      offX = firstCol * CELL + CELL / 2 - r.left;
      offY = firstRow * CELL + CELL / 2 - r.top;
      cols = Math.floor((w - offX) / CELL) + 1;
      rows = Math.floor((h - offY) / CELL) + 1;
      cur = new Float32Array(cols * rows);
      prev = new Float32Array(cols * rows);
    };

    // One wave step. Interior cells only, so the edges stay flat.
    const step = () => {
      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
          const i = y * cols + x;
          prev[i] =
            ((cur[i - 1] + cur[i + 1] + cur[i - cols] + cur[i + cols]) / 2 -
              prev[i]) *
            DAMPING;
        }
      }
      [cur, prev] = [prev, cur];
    };

    // Paints the dots (when asked) and the ripples over them. Returns the biggest height, to tell when the surface is still.
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (dots) {
        ctx.fillStyle = BASE;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            ctx.fillRect(
              offX + x * CELL - DOT / 2,
              offY + y * CELL - DOT / 2,
              DOT,
              DOT
            );
          }
        }
      }
      // Halo: 2 for cells next to a wave, 1 for cells two out.
      const halo = new Uint8Array(cols * rows);
      let peak = 0;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const h = cur[y * cols + x];
          peak = Math.max(peak, Math.abs(h));
          if (rippleLevel(h) === 0) continue;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
              const j = ny * cols + nx;
              halo[j] = Math.max(halo[j], Math.max(Math.abs(dx), Math.abs(dy)) <= 1 ? 2 : 1);
            }
          }
        }
      }
      let lastLevel = -1;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          const level = rippleLevel(cur[i]);
          if (level === 0) {
            if (halo[i] === 0) continue;
            ctx.fillStyle = HALO[halo[i] - 1];
            lastLevel = -1;
            ctx.fillRect(
              offX + x * CELL - DOT / 2,
              offY + y * CELL - DOT / 2,
              DOT,
              DOT
            );
            continue;
          }
          if (level !== lastLevel) {
            ctx.fillStyle = RIPPLE[level - 1];
            lastLevel = level;
          }
          ctx.fillRect(
            offX + x * CELL - DOT / 2,
            offY + y * CELL - DOT / 2,
            DOT,
            DOT
          );
        }
      }
      return peak;
    };

    const frame = (time: number) => {
      raf = 0;
      if (time - last >= 1000 / FPS) {
        last = time;
        step();
        if (draw() < IDLE) {
          running = false;
          return;
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(frame);
    };

    // The cell a drop lands on: the centre of `originEl` when it's given, otherwise a random spot away from the edges.
    const dropCell = (): [number, number] => {
      const el = originEl?.current;
      if (el) {
        const c = canvas.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        const x = Math.round((r.left + r.width / 2 - c.left - offX) / CELL);
        const y = Math.round((r.top + r.height / 2 - c.top - offY) / CELL);
        if (x >= 0 && x < cols && y >= 0 && y < rows) return [x, y];
      }
      return [
        2 + Math.floor(Math.random() * (cols - 4)),
        2 + Math.floor(Math.random() * (rows - 4)),
      ];
    };

    const drop = () => {
      if (document.visibilityState !== 'visible' || cols < 5 || rows < 5) {
        return;
      }
      const [x, y] = dropCell();
      cur[y * cols + x] -= 0.6 + Math.random() * 0.4;
      wake();
    };

    const schedule = (delay: number) => {
      timer = window.setTimeout(() => {
        drop();
        schedule(gapMin + Math.random() * (gapMax - gapMin));
      }, delay);
    };

    size();
    draw();
    const ro = new ResizeObserver(() => {
      size();
      draw();
    });
    ro.observe(canvas);
    if (moving) schedule(600);

    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [shown, animate, dots, originEl, gapMin, gapMax]);

  if (!shown) return null;

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
