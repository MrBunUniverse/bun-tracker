import { useEffect, useRef } from 'react';
import { useConfig } from '@/hooks/config';
import { isPawTheme } from '@/hooks/theme';

import {
  CALM_CLOUDS,
  WELCOME_CLOUDS,
  cloudField,
  createStir,
  relaxStir,
  stir,
  warpField,
  weatherFields,
} from './cloud-field';

// Welcome background in Bun: pixel clouds drifting left to right across the dot grid. The clouds are
// bitmaps lit onto the existing dots (see cloud-field.ts), so the grid itself never moves.
// The plain dots are drawn once per resize into a cached layer; each frame copies that layer and draws
// only the cloud dots on top. Paints over a backdrop in the page colour, so it replaces body's dots.
// Now and then a dark rain cloud drifts in and drops sparse rain, and a thin gust sweeps across
// (weatherFields). Dragging with the mouse stirs the clouds, which drift back into shape over a few
// seconds (stir in cloud-field.ts). The rain cloud is slate-tinted with larger dots so it reads against the dark page.
// Runs at 12 fps (1.2 fps at a tenth of the speed while the window is unfocused), and draws one still
// frame (no rain, no gust) when the animations setting is off or
// with reduced motion. The scene clock stops while the page is hidden, so it resumes where it left off.
// Nothing is drawn outside Bun.
// `quiet` is the dashboard variant: half the lanes at 60% speed, dimmer clouds, and no rain, gusts or
// stirring. `stirrable={false}` keeps the welcome look but ignores the mouse (the Home empty state).
const CELL = 8; // denser than the 12 px grid on body, so cloud silhouettes get finer (see cloud-field.ts)
const DOT = 3;
// 12 fps on purpose: a choppy, retro pixel-art step. The drift speed is time-based, so it does not change.
const FPS = 12;
// Plain dot brightness, and how much a cloud adds at its brightest.
const QUIET = 0.06;
const CLOUD = 0.2;
const CALM_CLOUD = 0.12;
const STEPS = 16;
const DOT_COLOR = `rgba(239, 230, 214, ${QUIET})`;
const cloudPalette = (peak: number) =>
  Array.from(
    { length: STEPS + 1 },
    (_, k) => `rgba(239, 230, 214, ${((peak * k) / STEPS).toFixed(3)})`
  );
const PALETTE = cloudPalette(CLOUD);
const CALM_PALETTE = cloudPalette(CALM_CLOUD);
const STORM = 0.3;
const STORM_DOT = 4;
const STORM_PALETTE = Array.from(
  { length: STEPS + 1 },
  (_, k) => `rgba(138, 156, 182, ${((STORM * k) / STEPS).toFixed(3)})`
);
// The longest step of the scene clock, so a stalled frame never makes the scene jump.
const MAX_DT = 0.25;
// Unfocused (a game in front): a tenth of the frame rate and a tenth of the speed, so the clouds nearly stop and
// cost almost nothing. A timer paces it instead of rAF, so the display rate no longer wakes the loop.
const IDLE_SCALE = 0.1;
// Time for the still frame. Any time shows clouds; this one spreads them evenly over the welcome card.
const STILL_TIME = 30;

export function ContourDots({
  className = 'absolute inset-0 -z-10 w-full h-full pointer-events-none',
  quiet = false,
  stirrable = true,
}: {
  className?: string;
  quiet?: boolean;
  stirrable?: boolean;
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
    const palette = quiet ? CALM_PALETTE : PALETTE;
    const profile = quiet ? CALM_CLOUDS : WELCOME_CLOUDS;
    const base = document.createElement('canvas');
    const baseCtx = base.getContext('2d');
    if (!baseCtx) return;
    const buckets: number[][] = PALETTE.map(() => []);
    const stormBuckets: number[][] = STORM_PALETTE.map(() => []);
    // One seed per mount picks this session's weather; the weather itself is a function of time.
    const seed = Math.floor(Math.random() * 2 ** 32);
    let field = new Float32Array(0);
    let storm = new Float32Array(0);
    let stirState = createStir(0);
    let stirred = false;
    let scene = STILL_TIME;
    let cols = 0;
    let rows = 0;
    let raf = 0;
    let timer = 0;
    let last = 0;

    const size = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = base.width = Math.round(w * dpr);
      canvas.height = base.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);
      field = new Float32Array(cols * rows);
      storm = new Float32Array(cols * rows);
      stirState = createStir(cols * rows);
      stirred = false;
      const bg = getComputedStyle(document.body).backgroundColor;
      if (!/rgba?\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') {
        baseCtx.fillStyle = bg;
        baseCtx.fillRect(0, 0, w, h);
      }
      baseCtx.fillStyle = DOT_COLOR;
      for (let y = CELL / 2; y < h; y += CELL) {
        for (let x = CELL / 2; x < w; x += CELL) {
          baseCtx.fillRect(x - DOT / 2, y - DOT / 2, DOT, DOT);
        }
      }
    };

    // Lights the cells of f on top of the dots, in the given palette and dot size.
    const paint = (
      f: Float32Array,
      palette: string[],
      b: number[][],
      dot: number
    ) => {
      for (const list of b) list.length = 0;
      for (let i = 0; i < f.length; i++) {
        const k = Math.round(f[i] * STEPS);
        if (k > 0) b[k].push(i);
      }
      for (let k = 1; k <= STEPS; k++) {
        if (!b[k].length) continue;
        ctx.fillStyle = palette[k];
        for (const i of b[k]) {
          const x = (i % cols) * CELL + CELL / 2;
          const y = Math.floor(i / cols) * CELL + CELL / 2;
          ctx.fillRect(x - dot / 2, y - dot / 2, dot, dot);
        }
      }
    };

    const draw = (t: number) => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(base, 0, 0, w, h);
      cloudField(cols, rows, t, field, profile);
      const stormy =
        moving && !quiet && weatherFields(cols, rows, t, seed, field, storm);
      if (stirred) {
        warpField(field, stirState, cols, rows);
        if (stormy) warpField(storm, stirState, cols, rows);
      }
      paint(field, palette, buckets, DOT);
      if (stormy) paint(storm, STORM_PALETTE, stormBuckets, STORM_DOT);
    };

    // The scene clock starts at the still frame, so motion picks up from the same scene, and only
    // advances by frames actually drawn.
    const schedule = () => {
      if (document.hidden) return;
      if (document.hasFocus()) raf = requestAnimationFrame(frame);
      else
        timer = window.setTimeout(
          () => frame(performance.now()),
          1000 / (FPS * IDLE_SCALE)
        );
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    };
    const frame = (time: number) => {
      schedule();
      const idle = !document.hasFocus();
      if (!idle && last && time - last < 1000 / FPS) return;
      if (last) {
        const dt = Math.min(
          ((time - last) / 1000) * (idle ? IDLE_SCALE : 1),
          MAX_DT
        );
        scene += dt;
        if (stirred) stirred = relaxStir(stirState, dt);
      }
      last = time;
      draw(scene);
    };

    // Also on focus changes, so the loop switches between rAF and the slow timer straight away.
    const onVisibility = () => {
      stop();
      last = 0;
      schedule();
    };

    // Last pointer position in cells while the primary button is held, NaN otherwise.
    let px = NaN;
    let py = NaN;
    const onPointer = (e: PointerEvent) => {
      if (!(e.buttons & 1) || e.type === 'pointerdown') {
        px = py = NaN;
        if (e.type !== 'pointerdown') return;
      }
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / CELL - 0.5;
      const y = (e.clientY - r.top) / CELL - 0.5;
      if (!Number.isNaN(px)) {
        stir(stirState, cols, rows, x, y, x - px, y - py);
        stirred = true;
      }
      px = x;
      py = y;
    };

    size();
    draw(scene);
    const ro = new ResizeObserver(() => {
      size();
      draw(scene);
    });
    ro.observe(canvas);
    if (moving) {
      schedule();
      document.addEventListener('visibilitychange', onVisibility);
      window.addEventListener('focus', onVisibility);
      window.addEventListener('blur', onVisibility);
    }
    if (moving && !quiet && stirrable) {
      window.addEventListener('pointerdown', onPointer);
      window.addEventListener('pointermove', onPointer);
    }

    return () => {
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
      window.removeEventListener('blur', onVisibility);
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('pointermove', onPointer);
      stop();
    };
  }, [shown, animate, quiet, stirrable]);

  if (!shown) return null;

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
