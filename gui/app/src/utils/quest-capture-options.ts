// Pure Quest capture option and crop helpers. They were in the retired Electron main process
// (electron/main/quest-capture.ts) and have no Node or native dependencies, so they stay in the
// frontend where they are tested (tests/quest-capture.test.ts).
import type {
  QuestCaptureAspect,
  QuestCaptureEye,
  QuestCropRect,
  QuestVideoStartOptions,
} from '@shared/electron-api';

export const QUEST_MIRROR_WINDOW_TITLE = 'SlimeVR Quest Mirror';
const CROP_ALIGNMENT = 8;

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function alignDown(value: number, alignment = CROP_ALIGNMENT): number {
  return Math.max(alignment, Math.floor(value / alignment) * alignment);
}

export function normalizeVideoOptions(
  input: QuestVideoStartOptions
): QuestVideoStartOptions {
  const allowedProfiles = ['low-latency', 'balanced', 'quality', 'custom'];
  const allowedEyes = ['left', 'right', 'both', 'manual'];
  const allowedAspects = ['source', '16:9', '16:10', '4:3', '1:1'];
  const allowedCodecs = ['h264', 'h265'];
  const allowedRenderers = ['auto', 'metal', 'opengl', 'software'];
  const allowedRotations = [0, 90, 180, 270];

  if (!input || typeof input !== 'object') {
    throw new Error('Capture settings are missing.');
  }

  const profile = allowedProfiles.includes(input.profile)
    ? input.profile
    : 'low-latency';
  const eye = allowedEyes.includes(input.eye) ? input.eye : 'left';
  const aspect = allowedAspects.includes(input.aspect) ? input.aspect : '16:9';
  const codec = allowedCodecs.includes(input.codec) ? input.codec : 'h264';
  const renderer = allowedRenderers.includes(input.renderer) ? input.renderer : 'auto';
  const rotation = allowedRotations.includes(input.rotation) ? input.rotation : 0;

  if (eye === 'manual' && !input.manualCrop) {
    throw new Error('Manual eye mode requires a crop rectangle.');
  }

  let manualCrop: QuestCropRect | undefined;
  if (input.manualCrop) {
    const { x, y, width, height } = input.manualCrop;
    if (![x, y, width, height].every(Number.isFinite)) {
      throw new Error('Manual crop values must be numbers.');
    }
    if (
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > 100 ||
      y + height > 100
    ) {
      throw new Error('Manual crop must stay within the source frame.');
    }
    manualCrop = { x, y, width, height };
  }

  return {
    serial:
      typeof input.serial === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(input.serial)
        ? input.serial
        : undefined,
    profile,
    eye,
    aspect,
    manualCrop,
    codec,
    bitrateMbps: clampInteger(input.bitrateMbps, 2, 30),
    maxSize: clampInteger(input.maxSize, 720, 4096),
    maxFps: clampInteger(input.maxFps, 24, 120),
    bufferMs: clampInteger(input.bufferMs, 0, 250),
    rotation: rotation as 0 | 90 | 180 | 270,
    flipHorizontal: Boolean(input.flipHorizontal),
    alwaysOnTop: Boolean(input.alwaysOnTop),
    borderless: input.borderless !== false,
    windowWidth: clampInteger(input.windowWidth, 480, 3840),
    windowHeight: clampInteger(input.windowHeight, 270, 2160),
    renderer: renderer as QuestVideoStartOptions['renderer'],
    adaptiveQuality: input.adaptiveQuality !== false,
    autoReconnect: input.autoReconnect !== false,
    maxReconnectAttempts: clampInteger(input.maxReconnectAttempts, 1, 5),
  };
}

function aspectRatio(aspect: QuestCaptureAspect): number | undefined {
  switch (aspect) {
    case '16:9':
      return 16 / 9;
    case '16:10':
      return 16 / 10;
    case '4:3':
      return 4 / 3;
    case '1:1':
      return 1;
    default:
      return undefined;
  }
}

export function calculateVideoCrop(
  sourceWidth: number,
  sourceHeight: number,
  eye: QuestCaptureEye,
  aspect: QuestCaptureAspect,
  manualCrop?: QuestCropRect
): { width: number; height: number; x: number; y: number } | undefined {
  const width = alignDown(sourceWidth);
  const height = alignDown(sourceHeight);
  if (width <= 0 || height <= 0) return undefined;

  let crop = { width, height, x: 0, y: 0 };

  if (eye === 'left' || eye === 'right') {
    crop.width = alignDown(width / 2);
    crop.x = eye === 'right' ? alignDown(width - crop.width) : 0;
  } else if (eye === 'manual' && manualCrop) {
    crop = {
      width: alignDown((width * manualCrop.width) / 100),
      height: alignDown((height * manualCrop.height) / 100),
      x: alignDown((width * manualCrop.x) / 100),
      y: alignDown((height * manualCrop.y) / 100),
    };
  }

  const targetRatio = aspectRatio(aspect);
  if (targetRatio) {
    const currentRatio = crop.width / crop.height;
    if (currentRatio > targetRatio) {
      const nextWidth = alignDown(crop.height * targetRatio);
      crop.x += alignDown((crop.width - nextWidth) / 2);
      crop.width = nextWidth;
    } else if (currentRatio < targetRatio) {
      const nextHeight = alignDown(crop.width / targetRatio);
      crop.y += alignDown((crop.height - nextHeight) / 2);
      crop.height = nextHeight;
    }
  }

  if (
    crop.x < 0 ||
    crop.y < 0 ||
    crop.x + crop.width > width ||
    crop.y + crop.height > height
  ) {
    throw new Error('The selected crop falls outside the Quest display.');
  }

  return crop.width === width && crop.height === height && crop.x === 0 && crop.y === 0
    ? undefined
    : crop;
}

export function downshiftVideoOptions(
  options: QuestVideoStartOptions
): QuestVideoStartOptions | undefined {
  if (options.bitrateMbps > 4) {
    return {
      ...options,
      profile: 'custom',
      bitrateMbps: Math.max(4, options.bitrateMbps - 2),
    };
  }

  const sizes = [720, 1080, 1440, 1920, 2560, 4096];
  const currentSizeIndex = sizes.findLastIndex((size) => size < options.maxSize);
  if (currentSizeIndex >= 0) {
    return { ...options, profile: 'custom', maxSize: sizes[currentSizeIndex] };
  }

  const frameRates = [30, 45, 60, 72, 90];
  const currentFpsIndex = frameRates.findLastIndex((fps) => fps < options.maxFps);
  if (currentFpsIndex >= 0) {
    return { ...options, profile: 'custom', maxFps: frameRates[currentFpsIndex] };
  }
  return undefined;
}

export function buildVideoArgs(
  options: QuestVideoStartOptions,
  crop?: { width: number; height: number; x: number; y: number }
): string[] {
  const orientation = `${options.flipHorizontal ? 'flip' : ''}${options.rotation}`;
  const args = [
    '--no-audio',
    '--no-control',
    '--no-clipboard-autosync',
    '--video-source=display',
    `--video-codec=${options.codec}`,
    `--video-bit-rate=${options.bitrateMbps}M`,
    `--max-size=${options.maxSize}`,
    `--max-fps=${options.maxFps}`,
    `--video-buffer=${options.bufferMs}`,
    `--capture-orientation=@${orientation}`,
    '--render-fit=letterbox',
    '--print-fps',
    '--stay-awake',
    `--window-title=${QUEST_MIRROR_WINDOW_TITLE}`,
    `--window-width=${options.windowWidth}`,
    `--window-height=${options.windowHeight}`,
  ];

  if (options.borderless) args.push('--window-borderless');
  if (options.alwaysOnTop) args.push('--always-on-top');
  if (options.renderer !== 'auto') args.push(`--render-driver=${options.renderer}`);
  if (crop) args.push(`--crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`);
  if (options.serial) args.push('-s', options.serial);
  return args;
}
