import { migrateLibrary } from '@/domain/library-migration';
import { flushLibraryToDisk } from '@/features/persist/library-autosave';
import { useLibraryStore } from '@/stores/library-store';

/** Dev-only: load repo root data.json so reference maps match the legacy fixture. */
export async function seedReferenceLibrary(): Promise<void> {
  const response = await fetch(new URL('../../../data.json', import.meta.url));
  if (!response.ok) {
    console.warn('Reference library seed skipped:', response.status);
    return;
  }
  const raw: unknown = await response.json();
  const { library, quarantined } = migrateLibrary(raw);
  if (quarantined.length > 0) {
    console.warn('Reference seed quarantined maps', quarantined.length);
  }

  useLibraryStore.setState((state) => {
    const mapsById = new Map(state.maps.map((map) => [map.id, map]));
    for (const map of library.maps) {
      mapsById.set(map.id, map);
    }
    const foldersById = new Map(state.folders.map((folder) => [folder.id, folder]));
    for (const folder of library.folders) {
      foldersById.set(folder.id, folder);
    }
    return {
      maps: library.maps.map((map) => mapsById.get(map.id)!),
      folders: [...foldersById.values()],
    };
  });

  await flushLibraryToDisk();
}
