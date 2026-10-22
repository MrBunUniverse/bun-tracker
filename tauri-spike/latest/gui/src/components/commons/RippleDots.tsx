import { RefObject, useEffect, useRef } from 'react';
import { isPawTheme, useConfig } from '@/hooks/config';

// Dot ripples in the Bun theme. Drops spread as rings across the dot grid and fade.
// Brightness is quantised into a few steps, so it keeps the pixel look.
// Grid dots within two cells of a live wave light up faintly, so the grid shows around each ripple as it passes.
// The rings get rougher the further they travel from their drop: each cell gets a random kick that grows with distance.
// By default it sits over the dot grid that body draws (the welcome screen). `dots` draws its own dots, for a panel
// that covers body. `originEl` starts every drop from that element, so the rings boom out of it.
// Runs at 30 fps and stops once the ripples die out. Off when the animations setting is off, and static with reduced motion.
// Nothing is drawn outside Bun.
const CELL = 12; // matches the dot grid on body
const DOT = 2;
const FPS = 30;
const DAMPING = 0.977;
const IDLE = 0.002;
// Turbulence: each cell's wave gets a random kick, zero at a drop and growing to TURB_MAX by TURB_FULL cells out.
const TURB_MAX = 0.15;
const TURB_NEAR = 2;
const TURB_FULL = 30;
// Frames a drop stays in play for turbulence. The waves die out well before this.
const DROP_LIFE = 20 * FPS;
const BASE = 'rgba(239, 230, 214, 0.1)';
// Ripple brightness, low to high. The top step is the Bun coral.
const RIPPLE = [
  'rgba(239, 230, 214, 0.3)',
  'rgba(239, 230, 214, 0.55)',
  'rgb(224, 144, 126)',
];
// Grid dots around a wave: 1 two cells out (faint), 2 next to the wave.
const HALO = ['rgba(239, 230, 214, 0.05)', 'rgba(239, 230, 214, 0.1)'];
// Glyph mode: a cell stays a dot until a wave reaches it, then becomes a character from "slimevr" while the
// wave passes, and goes back to a dot. Wordmark adds the SlimeVR letter shape (5x7 dot font) on top during the pulse.
const GLYPHS = [...'slimevr'];
const GLYPH_FONT = '9px ui-monospace, SFMono-Regular, Menlo, monospace';
const WORD = [
  'rgba(239, 230, 214, 0.5)',
  'rgba(239, 230, 214, 0.62)',
  'rgba(239, 230, 214, 0.8)',
];
// Wave height at which the letters are fully lit.
const WORD_PEAK = 0.3;
const FONT: Record<string, string[]> = {
  S: ['01110', '10001', '10000', '01110', '00001', '10001', '01110'],
  l: ['01100', '00100', '00100', '00100', '00100', '00100', '01110'],
  i: ['00100', '00000', '01100', '00100', '00100', '00100', '01110'],
  m: ['00000', '00000', '11010', '10101', '10101', '10101', '10101'],
  e: ['00000', '00000', '01110', '10001', '11111', '10000', '01110'],
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  c: ['00000', '00000', '01110', '10001', '10000', '10001', '01110'],
  o: ['00000', '00000', '01110', '10001', '10001', '10001', '01110'],
  t: ['01000', '01000', '11100', '01000', '01000', '01001', '00110'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  r: ['00000', '00000', '10110', '11001', '10000', '10000', '10000'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  u: ['00000', '00000', '10001', '10001', '10001', '10011', '01101'],
  n: ['00000', '00000', '10110', '11001', '10001', '10001', '10001'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
};

const ADVANCE = 6; // a 5-wide glyph and a one-cell gap
const LINE_STEP = 9; // 7 rows of glyph and 2 rows between lines

// Width in cells of the widest line at this scale.
function lineWidth(lines: string[], scale: number) {
  return Math.max(...lines.map((line) => (line.length * ADVANCE - 1) * scale));
}

// Cell mask for the wordmark: the first layout that fits the width, each line centred across, in the upper part so
// the welcome card sits below it. Scales up to 2x per font pixel on wide windows. Null when nothing fits.
function buildWord(cols: number, rows: number, layouts: string[][]) {
  const lines = layouts.find((set) => lineWidth(set, 1) + 2 <= cols);
  if (!lines) return null;
  const scale = Math.max(
    1,
    Math.min(2, Math.floor(cols / (lineWidth(lines, 1) + 4)))
  );
  const y0 = Math.round(rows * 0.08);
  const mask = new Uint8Array(cols * rows);
  lines.forEach((line, li) => {
    const left = Math.floor((cols - lineWidth([line], scale)) / 2);
    [...line].forEach((ch, n) => {
      const glyph = FONT[ch];
      if (!glyph) return;
      glyph.forEach((bits, r) => {
        [...bits].forEach((bit, c) => {
          if (bit !== '1') return;
          for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < scale; dx++) {
              const x = left + (n * ADVANCE + c) * scale + dx;
              const y = y0 + (li * LINE_STEP + r) * scale + dy;
              if (x >= 0 && y >= 0 && x < cols && y < rows)
                mask[y * cols + x] = 1;
            }
          }
        });
      });
    });
  });
  return mask;
}

// Glyph tone: 0 (dot) to GLYPH_STEPS (fully up). Eased with smoothstep, so the fade has no steps you can see.
const GLYPH_STEPS = 16;
const GLYPH_PALETTE = Array.from({ length: GLYPH_STEPS + 1 }, (_, k) => {
  const t = k / GLYPH_STEPS;
  // Cream towards the Bun coral as the wave peaks, and more opaque with it.
  const c = t * t;
  const r = Math.round(239 + (224 - 239) * c);
  const g = Math.round(230 + (144 - 230) * c);
  const b = Math.round(214 + (126 - 214) * c);
  return `rgba(${r}, ${g}, ${b}, ${(0.15 + 0.75 * t).toFixed(3)})`;
});

function glyphTone(height: number) {
  const u = Math.min(1, Math.max(0, (Math.abs(height) - 0.02) / 0.28));
  return Math.round(u * u * (3 - 2 * u) * GLYPH_STEPS);
}

function rippleLevel(height: number) {
  const a = Math.abs(height);
  if (a < 0.04) return 0;
  if (a < 0.12) return 1;
  if (a < 0.25) return 2;
  return 3;
}

export function RippleDots({
  dots = false,
  solid = false,
  glyphs = false,
  wordmark,
  originEl,
  gapMin = 1500,
  gapMax = 4000,
  className = 'absolute inset-0 -z-10 w-full h-full pointer-events-none',
}: {
  dots?: boolean;
  // Paints the grid over a page-coloured backdrop, so ripple dots replace body's dots instead of stacking on them.
  solid?: boolean;
  // Each cell is a dot at rest and a character from "slimevr" where a wave passes.
  glyphs?: boolean;
  // Title layouts for the dot font above the grid (the welcome title), widest first. The first one that fits the window is
  // drawn. Only characters in FONT can be used.
  wordmark?: string[][];
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
    // Wordmark cells (null when the grid is drawn instead).
    let word: Uint8Array | null = null;
    // Drops still in play, with their age in frames. Turbulence grows with the distance to the nearest one.
    let drops: { x: number; y: number; age: number }[] = [];
    // The page colour behind the canvas, read from body; empty when body is see-through.
    let backdrop = '';
    // The backdrop and resting grid, painted once per size and copied in each frame.
    const base = document.createElement('canvas');
    let halo = new Uint8Array(0);
    let raf = 0;
    let last = 0;
    let running = false;
    let timer = 0;

    // Sizes the canvas and buffers. Ripples reset on resize, which is fine for a background.
    const size = () => {
      dpr = window.devicePixelRatio || 1;
      const bg = getComputedStyle(document.body).backgroundColor;
      backdrop =
        !solid || /rgba?\(.*,\s*0\)$/.test(bg) || bg === 'transparent'
          ? ''
          : bg;
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
      word = wordmark ? buildWord(cols, rows, wordmark) : null;
      drops = [];
      halo = new Uint8Array(cols * rows);
      paintBase();
    };

    // One wave step. Interior cells only, so the edges stay flat.
    const step = () => {
      for (const d of drops) d.age++;
      drops = drops.filter((d) => d.age <= DROP_LIFE);
      for (let y = 1; y < rows - 1; y++) {
        for (let x = 1; x < cols - 1; x++) {
          const i = y * cols + x;
          const avg =
            (cur[i - 1] + cur[i + 1] + cur[i - cols] + cur[i + cols]) / 2;
          // Farther from the nearest drop, the wider the random kick: the rings break up as they travel.
          // The kick scales with |cur[i]|, so flat cells skip the distance search.
          let t = 0;
          if (drops.length && Math.abs(cur[i]) > 1e-4) {
            let d2 = Infinity;
            for (const d of drops) {
              d2 = Math.min(d2, (x - d.x) ** 2 + (y - d.y) ** 2);
            }
            const span = TURB_FULL - TURB_NEAR;
            t = Math.min(1, Math.max(0, (Math.sqrt(d2) - TURB_NEAR) / span));
          }
          prev[i] =
            (avg - prev[i]) * DAMPING +
            TURB_MAX * t * (Math.random() * 2 - 1) * Math.abs(cur[i]);
        }
      }
      [cur, prev] = [prev, cur];
    };

    // One grid cell: a dot, or with `glyph` a character from "slimevr" (glyph mode only). Centred on the grid point.
    const paint = (x: number, y: number, glyph = false) => {
      if (glyphs && glyph) {
        ctx.fillText(
          GLYPHS[(x + 3 * y) % GLYPHS.length],
          offX + x * CELL,
          offY + y * CELL
        );
        return;
      }
      ctx.fillRect(
        offX + x * CELL - DOT / 2,
        offY + y * CELL - DOT / 2,
        DOT,
        DOT
      );
    };

    // The canvas paints the whole grid over a backdrop in the page colour, hiding body's own dots here.
    // Ripple dots then replace grid dots instead of stacking on them (which showed as doubled dots whenever the two grids were a pixel off).
    const paintBase = () => {
      base.width = canvas.width;
      base.height = canvas.height;
      const baseCtx = base.getContext('2d');
      if (!baseCtx) return;
      baseCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (backdrop) {
        baseCtx.fillStyle = backdrop;
        baseCtx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      }
      if (dots || solid) {
        baseCtx.fillStyle = BASE;
        for (let y = 0; y < rows; y++) {
          for (let x = 0; x < cols; x++) {
            baseCtx.fillRect(
              offX + x * CELL - DOT / 2,
              offY + y * CELL - DOT / 2,
              DOT,
              DOT
            );
          }
        }
      }
    };

    // Copies in the grid and paints the ripples over it. Returns the biggest height, to tell when the surface is still.
    const draw = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (glyphs) {
        ctx.font = GLYPH_FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
      }
      if (base.width > 0 && base.height > 0) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(base, 0, 0);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      // Halo: 2 for cells next to a wave, 1 for cells two out.
      halo.fill(0);
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
              halo[j] = Math.max(
                halo[j],
                Math.max(Math.abs(dx), Math.abs(dy)) <= 1 ? 2 : 1
              );
            }
          }
        }
      }
      // Wordmark: the title's cells stay visible at rest. A wave brightens them, and while one passes they become characters.
      if (word) {
        const pulse = moving
          ? Math.min(1, Math.max(0, (peak - IDLE) / WORD_PEAK))
          : 1;
        ctx.fillStyle =
          WORD[Math.min(WORD.length - 1, Math.floor(pulse * WORD.length))];
        for (let i = 0; i < word.length; i++) {
          if (!word[i]) continue;
          paint(i % cols, Math.floor(i / cols), pulse > 0);
        }
      }
      let lastLevel = -1;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x;
          if (glyphs) {
            // Glyph cells fade with the wave height, so a character eases in and out instead of popping.
            const tone = glyphTone(cur[i]);
            if (tone === 0 && halo[i] === 0) continue;
            ctx.fillStyle = tone > 0 ? GLYPH_PALETTE[tone] : HALO[halo[i] - 1];
            paint(x, y, true);
            continue;
          }
          const level = rippleLevel(cur[i]);
          if (level === 0) {
            if (halo[i] === 0) continue;
            ctx.fillStyle = HALO[halo[i] - 1];
            lastLevel = -1;
            paint(x, y, true);
            continue;
          }
          if (level !== lastLevel) {
            ctx.fillStyle = RIPPLE[level - 1];
            lastLevel = level;
          }
          paint(x, y, true);
        }
      }
      return peak;
    };

    const frame = (time: number) => {
      raf = 0;
      // Glyphs included, everything is drawn once per wave step, at FPS.
      if (time - last >= 1000 / FPS) {
        last = time;
        step();
        if (draw() < IDLE) {
          running = false;
          drops = [];
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
      drops.push({ x, y, age: 0 });
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
  }, [shown, animate, dots, solid, glyphs, wordmark, originEl, gapMin, gapMax]);

  if (!shown) return null;

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
