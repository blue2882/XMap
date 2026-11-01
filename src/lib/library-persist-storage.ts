import { del, get, set } from 'idb-keyval';
import type { StateStorage } from 'zustand/middleware';
import { LIBRARY_STORAGE_KEY } from '@/domain/schemas';
import {
  clearLegacyBrowserStorage,
  readLegacyPersistBlob,
} from '@/lib/legacy-browser-storage';

function localStorageAdapter(): StateStorage {
  return {
    getItem: (name) => {
      const value = localStorage.getItem(name);
      return value ?? null;
    },
    setItem: (name, value) => {
      localStorage.setItem(name, value);
    },
    removeItem: (name) => {
      localStorage.removeItem(name);
    },
  };
}

function indexedDbAdapter(): StateStorage {
  return {
    getItem: async (name) => {
      const fromIdb = await get<string>(name);
      if (fromIdb != null) return fromIdb;

      let blob = localStorage.getItem(name);
      if (blob == null && name === LIBRARY_STORAGE_KEY) {
        blob = readLegacyPersistBlob();
        if (blob != null) clearLegacyBrowserStorage();
      }
      if (blob != null) {
        await set(name, blob);
        localStorage.removeItem(name);
      }
      return blob;
    },
    setItem: async (name, value) => {
      await set(name, value);
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
