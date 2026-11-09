const STORAGE_KEY = 'slimevr-settings-location-v1';
const SETTINGS_PATHS = new Set(
  [
    'trackers',
    'interface',
    'interface/home',
    'special-themes',
    'serial',
    'firmware-tool',
    'advanced',
    'osc/router',
    'osc/vrchat',
    'osc/vmc',
  ].map((path) => `/settings/${path}`)
);

export interface SettingsLocation {
  pathname: string;
  scrollTo?: string;
  top: number;
  sidebarTop: number;
}

export function parseSettingsLocation(raw: string | null): SettingsLocation | null {
  try {
    const value = JSON.parse(raw || 'null');
    if (
      !value ||
      !SETTINGS_PATHS.has(value.pathname) ||
      !Number.isFinite(value.top) ||
      value.top < 0 ||
      !Number.isFinite(value.sidebarTop) ||
      value.sidebarTop < 0 ||
      (value.scrollTo !== undefined && typeof value.scrollTo !== 'string')
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function readSettingsLocation(): SettingsLocation | null {
  try {
    return parseSettingsLocation(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveSettingsLocation(value: SettingsLocation) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Navigation still works when browser storage is unavailable.
  }
}
