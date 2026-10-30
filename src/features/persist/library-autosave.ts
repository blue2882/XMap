import { flushCloudSave } from '@/features/cloud/library-sync';
import {
  LIBRARY_STORAGE_KEY,
  writeLibraryPersistBlob,
} from '@/lib/library-persist-storage';
import { useLibraryStore } from '@/stores/library-store';

let started = false;
let visibilityHandler: (() => void) | null = null;

export function buildPersistedLibraryJson(): string {
  const { maps, folders, settings } = useLibraryStore.getState();
  return JSON.stringify({
    state: {
      maps,
      folders,
      settings,
      version: 1 as const,
    },
    version: 0,
  });
}

/** Ensures the latest library snapshot is on disk (IndexedDB in the app). */
export async function flushLibraryToDisk(): Promise<void> {
  await writeLibraryPersistBlob(LIBRARY_STORAGE_KEY, buildPersistedLibraryJson());
}

function flushOnBackground(): void {
  void flushLibraryToDisk();
  void flushCloudSave();
}

export function startLibraryAutosave(): void {
  if (started) return;
  started = true;

  window.addEventListener('pagehide', flushOnBackground);
  visibilityHandler = () => {
    if (document.visibilityState === 'hidden') flushOnBackground();
  };
  document.addEventListener('visibilitychange', visibilityHandler);
}

export function stopLibraryAutosave(): void {
  if (!started) return;
  started = false;
  window.removeEventListener('pagehide', flushOnBackground);
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}
