import { z } from 'zod';
import type { ThemePreference } from '@/domain/schemas';
import { themeSchema } from '@/domain/schemas';

/** Pre-Vite static app localStorage keys (main branch index.html). */
export const LEGACY_LIBRARY_KEY = 'mindmaps-library-v1';
export const LEGACY_SETTINGS_KEY = 'mindmaps-settings-v1';
export const LEGACY_THEME_KEY = 'mindmaps-theme-v1';

const legacySettingsSchema = z
  .object({
    key: z.string().optional(),
    model: z.string().optional(),
    useAi: z.boolean().optional(),
  })
  .passthrough();

const legacyLibrarySchema = z.object({
  maps: z.array(z.unknown()),
  folders: z.array(z.unknown()).optional(),
});

const parseJson = (raw: string | null): unknown => {
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const themeFromLegacy = (raw: string | null): ThemePreference | undefined => {
  const parsed = themeSchema.safeParse(raw);
  return parsed.success && parsed.data !== 'system' ? parsed.data : undefined;
};

/**
 * One-time import of the monolithic static app's library blob into Zustand persist shape.
 * Map/folder migration runs later via `migrateLibrary` on rehydrate.
 */
export const readLegacyPersistBlob = (): string | null => {
  if (typeof localStorage === 'undefined') return null;

  const libraryRaw = localStorage.getItem(LEGACY_LIBRARY_KEY);
  if (libraryRaw == null) return null;

  const libraryJson: unknown = parseJson(libraryRaw);
  const library = legacyLibrarySchema.safeParse(libraryJson);
  if (!library.success) return null;

  const legacySettingsJson = parseJson(localStorage.getItem(LEGACY_SETTINGS_KEY));
  const legacySettings = legacySettingsSchema.safeParse(legacySettingsJson);
  const legacyTheme = themeFromLegacy(localStorage.getItem(LEGACY_THEME_KEY));

  const settings: Record<string, unknown> = {};
  if (legacySettings.success) {
    if (typeof legacySettings.data.key === 'string') {
      settings.anthropicApiKey = legacySettings.data.key;
    }
  }
  if (legacyTheme) settings.theme = legacyTheme;

  const state: Record<string, unknown> = {
    maps: library.data.maps,
    folders: library.data.folders ?? [],
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
