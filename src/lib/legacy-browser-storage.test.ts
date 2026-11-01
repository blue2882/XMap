import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LEGACY_LIBRARY_KEY,
  LEGACY_SETTINGS_KEY,
  LEGACY_THEME_KEY,
  readLegacyPersistBlob,
} from '@/lib/legacy-browser-storage';

function installLocalStorage() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    clear: () => void data.clear(),
  };
  vi.stubGlobal('localStorage', storage);
  return storage;
}

describe('readLegacyPersistBlob', () => {
  beforeEach(() => {
    installLocalStorage().clear();
  });

  it('migrates validated legacy library and settings', () => {
    localStorage.setItem(
      LEGACY_LIBRARY_KEY,
      JSON.stringify({ maps: [{ id: 'm1' }], folders: [{ id: 'f1' }] }),
    );
    localStorage.setItem(LEGACY_SETTINGS_KEY, JSON.stringify({ key: 'sk-test', useAi: true }));
    localStorage.setItem(LEGACY_THEME_KEY, 'dark');

    const blob = readLegacyPersistBlob();
    expect(blob).not.toBeNull();
    const parsed = JSON.parse(blob!) as {
      state: { maps: unknown[]; settings: { anthropicApiKey: string; theme: string } };
    };
    expect(parsed.state.maps).toHaveLength(1);
    expect(parsed.state.settings.anthropicApiKey).toBe('sk-test');
    expect(parsed.state.settings.theme).toBe('dark');
  });

  it('returns null when legacy library shape is invalid', () => {
    localStorage.setItem(LEGACY_LIBRARY_KEY, JSON.stringify({ notMaps: [] }));
    expect(readLegacyPersistBlob()).toBeNull();
  });
});
