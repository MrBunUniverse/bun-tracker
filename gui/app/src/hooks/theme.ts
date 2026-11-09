// PawPad special themes. They share Bun's layout and pixel look; each has its own palette in index.scss.
export const PAW_THEMES = ['bun', 'fox', 'dog'];
export const DEFAULT_THEME = 'bun';

export const isPawTheme = (theme?: string) =>
  theme !== undefined && PAW_THEMES.includes(theme);

// Older configs can hold retired palettes (claude, macos, slime-*, dark, trans, ...)
// or no theme at all. Anything that is not a current theme becomes Bun.
export const normalizeTheme = (theme: unknown): string =>
  typeof theme === 'string' && isPawTheme(theme) ? theme : DEFAULT_THEME;

// Returns a copy of a loaded config with only `theme` normalized.
export const withNormalizedTheme = <T extends { theme?: unknown }>(
  config: T
): T & { theme: string } => ({ ...config, theme: normalizeTheme(config.theme) });
