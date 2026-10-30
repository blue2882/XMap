import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEmptyMap } from '@/domain/map-factory';
import { renameMap } from '@/domain/map-edits';
import { migrateLibrary, migrateMap, type QuarantinedMap } from '@/domain/library-migration';
import {
  dismissQuarantineAt,
  readQuarantineList,
  writeQuarantineList,
} from '@/domain/quarantine';
import {
  LIBRARY_STORAGE_KEY,
  createDefaultLibraryState,
  type Folder,
  type MindMapDocument,
  type Settings,
  type ThemePreference,
} from '@/domain/schemas';
import { createId } from '@/lib/id';
import { libraryPersistStorage } from '@/lib/library-persist-storage';

type RestoreQuarantineResult = { ok: true } | { ok: false; reason: string };

interface LibraryStore {
  maps: MindMapDocument[];
  folders: Folder[];
  settings: Settings;
  folderFilterId: string | null;
  quarantineRevision: number;
  readQuarantine: () => QuarantinedMap[];
  restoreFromQuarantine: (index: number) => RestoreQuarantineResult;
  dismissFromQuarantine: (index: number) => void;
  setFolderFilter: (id: string | null) => void;
  createMap: (name?: string, folderId?: string | null) => string;
  upsertMap: (map: MindMapDocument) => void;
  deleteMap: (id: string) => void;
  renameMapById: (id: string, name: string) => void;
  moveMapToFolder: (mapId: string, folderId: string | null) => void;
  exportMapJson: (id: string) => string | null;
  importMap: (map: MindMapDocument) => string;
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setTheme: (theme: ThemePreference) => void;
}

function bumpQuarantineRevision(set: (fn: (s: LibraryStore) => Partial<LibraryStore>) => void): void {
  set((s) => ({ quarantineRevision: s.quarantineRevision + 1 }));
}

function saveQuarantine(entries: QuarantinedMap[]): boolean {
  if (entries.length === 0) return false;
  try {
    const existing = readQuarantineList();
    const known = new Set(existing.map((e) => JSON.stringify(e.raw)));
    const fresh = entries.filter((e) => !known.has(JSON.stringify(e.raw)));
    if (fresh.length === 0) return false;
    writeQuarantineList([...existing, ...fresh]);
    return true;
  } catch {
    console.error('Could not preserve unmigratable maps', entries.length);
    return false;
  }
}

function folderRef(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return undefined;
}

export const useLibraryStore = create<LibraryStore>()(
  persist(
    (set, get) => ({
      ...createDefaultLibraryState(),
      folderFilterId: null,
      quarantineRevision: 0,
      readQuarantine: () => readQuarantineList(),
      dismissFromQuarantine: (index) => {
        const next = dismissQuarantineAt(readQuarantineList(), index);
        writeQuarantineList(next);
        bumpQuarantineRevision(set);
      },
      restoreFromQuarantine: (index) => {
        const entries = readQuarantineList();
        const entry = entries[index];
        if (!entry) return { ok: false, reason: 'Not found' };
        const result = migrateMap(entry.raw, (ref, by) => {
          const value = folderRef(ref)?.trim();
          if (!value) return null;
          const { folders, createFolder } = get();
          if (by === 'id') {
            return folders.some((f) => f.id === value) ? value : null;
          }
          const named = folders.find((f) => f.name === value);
          if (named) return named.id;
          return createFolder(value);
        });
        if ('reason' in result) return { ok: false, reason: result.reason };
        get().upsertMap(result.map);
        writeQuarantineList(dismissQuarantineAt(entries, index));
        bumpQuarantineRevision(set);
        return { ok: true };
      },
      setFolderFilter: (id) => set({ folderFilterId: id }),
      createMap: (name = 'Untitled map', folderId = null) => {
        const map = createEmptyMap(name, folderId);
        set((s) => ({ maps: [map, ...s.maps] }));
        return map.id;
      },
      upsertMap: (map) =>
        set((s) => {
          const idx = s.maps.findIndex((m) => m.id === map.id);
          if (idx === -1) {
            return { maps: [map, ...s.maps] };
          }
          const maps = [...s.maps];
          maps[idx] = map;
          return { maps };
        }),
      deleteMap: (id) =>
        set((s) => ({ maps: s.maps.filter((m) => m.id !== id) })),
      renameMapById: (id, name) =>
        set((s) => ({
          maps: s.maps.map((m) => (m.id === id ? renameMap(m, name) : m)),
        })),
      moveMapToFolder: (mapId, folderId) =>
        set((s) => ({
          maps: s.maps.map((m) =>
            m.id === mapId
              ? { ...m, folderId, updatedAt: new Date().toISOString() }
              : m,
          ),
        })),
      exportMapJson: (id) => {
        const map = get().maps.find((m) => m.id === id);
        return map ? JSON.stringify(map, null, 2) : null;
      },
      importMap: (map) => {
        const withId = { ...map, id: map.id || createId('map') };
        set((s) => ({ maps: [withId, ...s.maps.filter((m) => m.id !== withId.id)] }));
        return withId.id;
      },
      createFolder: (name) => {
        const folder = { id: createId('folder'), name: name.trim() || 'Folder' };
        set((s) => ({ folders: [...s.folders, folder] }));
        return folder.id;
      },
      renameFolder: (id, name) =>
        set((s) => ({
          folders: s.folders.map((f) =>
            f.id === id ? { ...f, name: name.trim() || f.name } : f,
          ),
        })),
      deleteFolder: (id) =>
        set((s) => ({
          folders: s.folders.filter((f) => f.id !== id),
          maps: s.maps.map((m) =>
            m.folderId === id ? { ...m, folderId: null } : m,
          ),
          folderFilterId: s.folderFilterId === id ? null : s.folderFilterId,
        })),
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setTheme: (theme) =>
        set((s) => ({ settings: { ...s.settings, theme } })),
    }),
    {
      name: LIBRARY_STORAGE_KEY,
      storage: createJSONStorage(() => libraryPersistStorage),
      partialize: (s) => ({
        maps: s.maps,
        folders: s.folders,
        settings: s.settings,
        version: 1 as const,
      }),
      merge: (persisted, current) => {
        const { library, quarantined } = migrateLibrary(persisted);
        const added = saveQuarantine(quarantined);
        return {
          ...current,
          maps: library.maps,
          folders: library.folders,
          settings: library.settings,
          quarantineRevision: added ? current.quarantineRevision + 1 : current.quarantineRevision,
        };
      },
    },
  ),
);
