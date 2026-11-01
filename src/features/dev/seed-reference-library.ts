import { migrateLibrary } from '@/domain/library-migration';
import { flushLibraryToDisk } from '@/features/persist/library-autosave';
import { useLibraryStore } from '@/stores/library-store';

/** Dev-only: load gitignored data.json or committed data.json.example for legacy fixture maps. */
export async function seedReferenceLibrary(): Promise<void> {
  let raw: unknown | null = null;
  for (const path of ['../../../data.json', '../../../data.json.example'] as const) {
    const response = await fetch(new URL(path, import.meta.url));
    if (!response.ok) continue;
    raw = await response.json();
    break;
  }
  if (raw === null) {
    console.warn('Reference library seed skipped: no data.json or data.json.example');
    return;
  }
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
