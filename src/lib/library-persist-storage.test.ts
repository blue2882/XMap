import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIBRARY_STORAGE_KEY } from '@/domain/schemas';
import {
  LEGACY_LIBRARY_KEY,
  LEGACY_SETTINGS_KEY,
  LEGACY_THEME_KEY,
} from '@/lib/legacy-browser-storage';

const idb = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
}));

vi.mock('idb-keyval', () => idb);

const notifyMocks = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  warning: vi.fn(),
  success: vi.fn(),
}));

vi.mock('@/lib/notify', () => ({ notify: notifyMocks }));

const lsData = vi.hoisted(() => new Map<string, string>());

describe('commitLibraryBlobMigration', () => {
  beforeEach(() => {
    vi.resetModules();
    idb.get.mockReset();
    idb.set.mockReset();
    idb.del.mockReset();
    lsData.clear();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => lsData.get(k) ?? null,
      setItem: (k: string, v: string) => {
        lsData.set(k, v);
      },
      removeItem: (k: string) => {
        lsData.delete(k);
      },
    });
    localStorage.setItem(LEGACY_LIBRARY_KEY, JSON.stringify({ maps: [], folders: [] }));
    localStorage.setItem(LEGACY_SETTINGS_KEY, '{}');
    localStorage.setItem(LEGACY_THEME_KEY, 'dark');
    localStorage.setItem(LIBRARY_STORAGE_KEY, 'draft');
  });

  it('does not clear legacy keys when IndexedDB write fails', async () => {
    idb.set.mockRejectedValueOnce(new Error('quota'));
    const { commitLibraryBlobMigration } = await import('@/lib/library-persist-storage');
    await expect(
      commitLibraryBlobMigration(LIBRARY_STORAGE_KEY, '{"state":{}}', true),
    ).rejects.toThrow('quota');
    expect(localStorage.getItem(LEGACY_LIBRARY_KEY)).not.toBeNull();
    expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBe('draft');
  });

  it('clears legacy keys only after a successful IndexedDB write', async () => {
    idb.set.mockResolvedValueOnce(undefined);
    const { commitLibraryBlobMigration } = await import('@/lib/library-persist-storage');
    await commitLibraryBlobMigration(LIBRARY_STORAGE_KEY, '{"state":{}}', true);
    expect(localStorage.getItem(LEGACY_LIBRARY_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_SETTINGS_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_THEME_KEY)).toBeNull();
    expect(localStorage.getItem(LIBRARY_STORAGE_KEY)).toBeNull();
    expect(idb.set).toHaveBeenCalledWith(LIBRARY_STORAGE_KEY, '{"state":{}}');
  });
});

describe('corrupt persist blob handling', () => {
  beforeEach(() => {
    vi.resetModules();
    idb.get.mockReset();
    idb.del.mockReset();
    lsData.clear();
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => lsData.get(k) ?? null,
      setItem: (k: string, v: string) => {
        lsData.set(k, v);
      },
      removeItem: (k: string) => {
        lsData.delete(k);
      },
    });
  });

  it('backs up invalid localStorage blobs in test mode', async () => {
    notifyMocks.error.mockClear();
    const corrupt = '{not-json';
    lsData.set(LIBRARY_STORAGE_KEY, corrupt);
    const {
      corruptPersistBackupKey,
      libraryPersistStorage,
      readCorruptPersistBackup,
    } = await import('@/lib/library-persist-storage');
    const result = await libraryPersistStorage.getItem(LIBRARY_STORAGE_KEY);
    expect(result).toBeNull();
    expect(readCorruptPersistBackup(LIBRARY_STORAGE_KEY)).toBe(corrupt);
    expect(lsData.get(corruptPersistBackupKey(LIBRARY_STORAGE_KEY))).toBe(corrupt);
    expect(lsData.has(LIBRARY_STORAGE_KEY)).toBe(false);
    expect(notifyMocks.error).toHaveBeenCalled();
  });

  it('backs up invalid IndexedDB blobs when not in test storage mode', async () => {
    vi.stubEnv('MODE', 'development');
    notifyMocks.error.mockClear();
    const corrupt = '{not-json';
    idb.get.mockResolvedValueOnce(corrupt);
    const {
      corruptPersistBackupKey,
      libraryPersistStorage,
      readCorruptPersistBackup,
    } = await import('@/lib/library-persist-storage');
    const result = await libraryPersistStorage.getItem(LIBRARY_STORAGE_KEY);
    expect(result).toBeNull();
    expect(readCorruptPersistBackup(LIBRARY_STORAGE_KEY)).toBe(corrupt);
    expect(lsData.get(corruptPersistBackupKey(LIBRARY_STORAGE_KEY))).toBe(corrupt);
    expect(idb.del).toHaveBeenCalledWith(LIBRARY_STORAGE_KEY);
    expect(notifyMocks.error).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
