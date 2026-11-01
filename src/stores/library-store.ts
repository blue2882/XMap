import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { createEmptyMap } from '@/domain/map-factory';
import { renameMap } from '@/domain/map-edits';
import { migrateLibrary, migrateMap, type QuarantinedMap } from '@/domain/library-migration';
import { verdictMapImport } from '@/domain/map-import';
import {
  appendQuarantine,
  dismissQuarantineAt,
  readQuarantineListResult,
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
import {
  mergeSessionAnthropicApiKey,
  redactPersistedSettings,
  syncAnthropicApiKeySideStorage,
} from '@/lib/anthropic-api-key-storage';
import { createId } from '@/lib/id';
import { libraryPersistStorage } from '@/lib/library-persist-storage';
import {
  emptyCloudTombstones,
  parseCloudTombstones,
  quarantineRawMapId,
  readDismissedUnreadableMapIds,
  type CloudTombstones,
} from '@/features/cloud/merge-cloud-library';

import { notify } from '@/lib/notify';

const isRec = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function persistedMapsField(raw: unknown): unknown[] | 'missing' | 'invalid' {
  if (!isRec(raw) || raw.maps === undefined) return 'missing';
  return Array.isArray(raw.maps) ? raw.maps : 'invalid';
}

function quarantineWriteFailed(message: string, reason: 'quota' | 'storage'): void {
  const title = reason === 'quota' ? 'Storage full' : 'Could not update quarantine';
  notify.error(title, message);
}

type RestoreQuarantineResult = { ok: true } | { ok: false; reason: string };

export type ImportMapResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'stale'; existingName: string };

interface LibraryStore {
  maps: MindMapDocument[];
  folders: Folder[];
  syncTombstones: CloudTombstones;
  settings: Settings;
  folderFilterId: string | null;
  quarantineRevision: number;
  dismissedUnreadableMapIds: string[];
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
  importMap: (map: MindMapDocument, options?: { force?: boolean }) => ImportMapResult;
  createFolder: (name: string) => string;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setTheme: (theme: ThemePreference) => void;
}

function bumpQuarantineRevision(set: (fn: (s: LibraryStore) => Partial<LibraryStore>) => void): void {
  set((s) => ({ quarantineRevision: s.quarantineRevision + 1 }));
}

function persistQuarantine(entries: QuarantinedMap[]): boolean {
  const result = appendQuarantine(entries);
  if (!result.ok) {
    quarantineWriteFailed(result.message, result.reason);
    return false;
  }
  return result.added > 0;
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
      dismissedUnreadableMapIds: [],
      syncTombstones: emptyCloudTombstones(),
      readQuarantine: () => {
        const result = readQuarantineListResult();
        if (!result.ok) {
          notify.error('Quarantine data is damaged', result.message);
          return [];
        }
        return result.entries;
      },
      dismissFromQuarantine: (index) => {
        const existing = readQuarantineListResult();
        if (!existing.ok) {
          quarantineWriteFailed(existing.message, 'storage');
          return;
        }
        const entry = existing.entries[index];
        const dismissedId = entry ? quarantineRawMapId(entry.raw) : null;
        const next = dismissQuarantineAt(existing.entries, index);
        const write = writeQuarantineList(next);
        if (!write.ok) {
          quarantineWriteFailed(write.message, write.reason);
          return;
        }
        if (dismissedId) {
          set((s) => {
            if (s.dismissedUnreadableMapIds.includes(dismissedId)) return s;
            return {
              dismissedUnreadableMapIds: [...s.dismissedUnreadableMapIds, dismissedId],
            };
          });
        }
        bumpQuarantineRevision(set);
      },
      restoreFromQuarantine: (index) => {
        const existing = readQuarantineListResult();
        if (!existing.ok) {
          return { ok: false, reason: existing.message };
        }
        const entries = existing.entries;
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
        const write = writeQuarantineList(dismissQuarantineAt(entries, index));
        if (!write.ok) {
          quarantineWriteFailed(write.message, write.reason);
          return { ok: false, reason: write.message };
        }
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
        set((s) => {
          const deletedAt = new Date().toISOString();
          return {
            maps: s.maps.filter((m) => m.id !== id),
            syncTombstones: {
              ...s.syncTombstones,
              maps: { ...s.syncTombstones.maps, [id]: deletedAt },
            },
          };
        }),
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
      importMap: (map, options) => {
        const withId = { ...map, id: map.id || createId('map') };
        const existing = get().maps.find((m) => m.id === withId.id);
        if (!options?.force) {
          const verdict = verdictMapImport(existing, withId);
          if (verdict.kind === 'stale') {
            return { ok: false, reason: 'stale', existingName: existing!.name };
          }
        }
        set((s) => {
          const mapTombstones = { ...s.syncTombstones.maps };
          delete mapTombstones[withId.id];
          return {
            maps: [withId, ...s.maps.filter((m) => m.id !== withId.id)],
            syncTombstones: { ...s.syncTombstones, maps: mapTombstones },
          };
        });
        return { ok: true, id: withId.id };
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
        set((s) => {
          const deletedAt = new Date().toISOString();
          return {
            folders: s.folders.filter((f) => f.id !== id),
            maps: s.maps.map((m) =>
              m.folderId === id ? { ...m, folderId: null } : m,
            ),
            folderFilterId: s.folderFilterId === id ? null : s.folderFilterId,
            syncTombstones: {
              ...s.syncTombstones,
              folders: { ...s.syncTombstones.folders, [id]: deletedAt },
            },
          };
        }),
      updateSettings: (patch) =>
        set((s) => {
          const next = { ...s.settings, ...patch };
          syncAnthropicApiKeySideStorage(s.settings, next);
          return { settings: next };
        }),
      setTheme: (theme) =>
        set((s) => ({ settings: { ...s.settings, theme } })),
    }),
    {
      name: LIBRARY_STORAGE_KEY,
      storage: createJSONStorage(() => libraryPersistStorage),
      partialize: (s) => ({
        maps: s.maps,
        folders: s.folders,
        syncTombstones: s.syncTombstones,
        dismissedUnreadableMapIds: s.dismissedUnreadableMapIds,
        settings: redactPersistedSettings(s.settings),
        version: 1 as const,
      }),
      merge: (persisted, current) => {
        const mapsField = persistedMapsField(persisted);
        if (mapsField === 'invalid') {
          notify.error(
            'Could not read saved library',
            'Local map data looks damaged. Keeping the in-memory library.',
          );
          return current;
        }
        const { library, quarantined } = migrateLibrary(persisted);
        if (
          mapsField !== 'missing' &&
          mapsField.length > 0 &&
          library.maps.length === 0 &&
          quarantined.length === 0
        ) {
          notify.error(
            'Could not read saved library',
            'No maps could be loaded from disk. Keeping the in-memory library.',
          );
          return current;
        }
        const added = persistQuarantine(quarantined);
        return {
          ...current,
          maps: library.maps,
          folders: library.folders,
          dismissedUnreadableMapIds: readDismissedUnreadableMapIds(persisted),
          syncTombstones: parseCloudTombstones(persisted),
          settings: mergeSessionAnthropicApiKey(library.settings),
          quarantineRevision: added ? current.quarantineRevision + 1 : current.quarantineRevision,
        };
      },
    },
  ),
);
