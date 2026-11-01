import type { ThemePreference } from '@/domain/schemas';

/** Pre-Vite static app localStorage keys (main branch index.html). */
export const LEGACY_LIBRARY_KEY = 'mindmaps-library-v1';
export const LEGACY_SETTINGS_KEY = 'mindmaps-settings-v1';
export const LEGACY_THEME_KEY = 'mindmaps-theme-v1';

type LegacySettings = {
  key?: string;
  model?: string;
  useAi?: boolean;
};

const parseJson = (raw: string | null): unknown => {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const themeFromLegacy = (raw: string | null): ThemePreference | undefined => {
  if (raw === 'light' || raw === 'dark') return raw;
  return undefined;
};

/**
 * One-time import of the monolithic static app's library blob into Zustand persist shape.
 * Map/folder migration runs later via `migrateLibrary` on rehydrate.
 */
export const readLegacyPersistBlob = (): string | null => {
  if (typeof localStorage === 'undefined') return null;

  const libraryRaw = localStorage.getItem(LEGACY_LIBRARY_KEY);
  if (libraryRaw == null) return null;

  const library = parseJson(libraryRaw);
  if (typeof library !== 'object' || library === null || !Array.isArray((library as { maps?: unknown }).maps)) {
    return null;
  }

  const legacySettings = parseJson(localStorage.getItem(LEGACY_SETTINGS_KEY)) as LegacySettings | null;
  const legacyTheme = themeFromLegacy(localStorage.getItem(LEGACY_THEME_KEY));

  const settings: Record<string, unknown> = {};
  if (legacySettings && typeof legacySettings === 'object') {
    if (typeof legacySettings.key === 'string') {
      settings.anthropicApiKey = legacySettings.key;
    }
  }
  if (legacyTheme) settings.theme = legacyTheme;

  const libRec = library as Record<string, unknown>;
  const state: Record<string, unknown> = {
    maps: libRec.maps,
    folders: Array.isArray(libRec.folders) ? libRec.folders : [],
    version: 1,
  };
  if (Object.keys(settings).length > 0) state.settings = settings;

  return JSON.stringify({ state, version: 0 });
};

export const clearLegacyBrowserStorage = (): void => {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(LEGACY_LIBRARY_KEY);
  localStorage.removeItem(LEGACY_SETTINGS_KEY);
  localStorage.removeItem(LEGACY_THEME_KEY);
};
