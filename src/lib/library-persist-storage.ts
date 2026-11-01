import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';
import { LIBRARY_STORAGE_KEY } from '@/domain/schemas';
import {
  clearLegacyBrowserStorage,
  readLegacyPersistBlob,
} from '@/lib/legacy-browser-storage';
import { notify } from '@/lib/notify';

export const corruptPersistBackupKey = (storageKey: string): string =>
  `${storageKey}.corrupt-backup`;

const corruptBackupNotified = new Set<string>();

export const readCorruptPersistBackup = (storageKey: string): string | null => {
  try {
    return localStorage.getItem(corruptPersistBackupKey(storageKey));
  } catch {
    return null;
  }
};

const quarantineCorruptPersistBlob = (name: string, raw: string): boolean => {
  const backupKey = corruptPersistBackupKey(name);
  try {
    localStorage.setItem(backupKey, raw);
  } catch (error) {
    const quota = error instanceof DOMException && error.name === 'QuotaExceededError';
    notify.error(
      quota ? 'Storage full' : 'Could not back up unreadable library data',
      quota
        ? 'Your library could not be parsed and the backup did not fit. Export any other backups you have.'
        : 'The unreadable copy is still in browser storage under its original key.',
    );
    return false;
  }
  if (!corruptBackupNotified.has(name)) {
    corruptBackupNotified.add(name);
    notify.error(
      'Local library data could not be read',
      `A raw backup was saved under "${backupKey}". You can try to repair it or import from another export.`,
    );
  }
  return true;
};

function parsePersistBlob(blob: string): string | null {
  try {
    JSON.parse(blob);
    return blob;
  } catch {
    return null;
  }
}

const handleCorruptPersistBlob = async (
  name: string,
  raw: string,
  removePrimary: () => void | Promise<void>,
): Promise<null> => {
  quarantineCorruptPersistBlob(name, raw);
  await removePrimary();
  return null;
};

function localStorageAdapter(): StateStorage {
  return {
    getItem: (name) => {
      const value = localStorage.getItem(name);
      if (value == null) return null;
      const parsed = parsePersistBlob(value);
      if (parsed != null) return parsed;
      void handleCorruptPersistBlob(name, value, () => {
        localStorage.removeItem(name);
      });
      return null;
    },
    setItem: (name, value) => {
      localStorage.setItem(name, value);
    },
    removeItem: (name) => {
      localStorage.removeItem(name);
    },
  };
}

export async function commitLibraryBlobMigration(
  name: string,
  blob: string,
  legacyImported: boolean,
): Promise<void> {
  await set(name, blob);
  localStorage.removeItem(name);
  if (legacyImported) clearLegacyBrowserStorage();
}

function indexedDbAdapter(): StateStorage {
  return {
    getItem: async (name) => {
      const fromIdb = await get<string>(name);
      if (fromIdb != null) {
        const parsed = parsePersistBlob(fromIdb);
        if (parsed != null) return parsed;
        return handleCorruptPersistBlob(name, fromIdb, () => del(name));
      }

      let blob = localStorage.getItem(name);
      let legacyImported = false;
      if (blob == null && name === LIBRARY_STORAGE_KEY) {
        blob = readLegacyPersistBlob();
        legacyImported = blob != null;
      }
      if (blob != null) {
        const parsed = parsePersistBlob(blob);
        if (parsed == null) {
          return handleCorruptPersistBlob(name, blob, () => {
            localStorage.removeItem(name);
          });
        }
        await commitLibraryBlobMigration(name, parsed, legacyImported);
        return parsed;
      }
      return blob;
    },
    setItem: async (name, value) => {
      try {
        await set(name, value);
      } catch (error) {
        const quota =
          error instanceof DOMException && error.name === 'QuotaExceededError';
        if (quota) {
          throw new Error('Browser storage is full. Free space or export maps as JSON.');
        }
        throw error;
      }
    },
    removeItem: async (name) => {
      await del(name);
      localStorage.removeItem(name);
    },
  };
}

/** Vitest uses sync localStorage; the app uses IndexedDB with a one-time localStorage migration. */
export const libraryPersistStorage: StateStorage =
  import.meta.env.MODE === 'test' ? localStorageAdapter() : indexedDbAdapter();

export async function writeLibraryPersistBlob(name: string, value: string): Promise<void> {
  await libraryPersistStorage.setItem(name, value);
}

export { LIBRARY_STORAGE_KEY };
