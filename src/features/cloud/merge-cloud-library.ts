import { migrateLibrary } from '@/domain/library-migration';
import type { Folder, MindMapDocument } from '@/domain/schemas';

export type CloudTombstones = {
  maps: Record<string, string>;
  folders: Record<string, string>;
};

export type CloudLibrary = {
  version: 1;
  maps: MindMapDocument[];
  folders: Folder[];
  /** ISO timestamps for deleted entity ids; propagated in the jsonb row. */
  tombstones?: CloudTombstones;
  /** Unreadable cloud map ids the user dismissed; stripped from sync on push. */
  dismissedUnreadableMapIds?: string[];
};

export const emptyCloudTombstones = (): CloudTombstones => ({ maps: {}, folders: {} });

const isRec = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseUpdatedAt = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
};

export const parseCloudTombstones = (raw: unknown): CloudTombstones => {
  if (!isRec(raw)) return emptyCloudTombstones();
  const tombstones = raw.tombstones;
  if (!isRec(tombstones)) return emptyCloudTombstones();
  const parseRecord = (value: unknown): Record<string, string> => {
    if (!isRec(value)) return {};
    const out: Record<string, string> = {};
    for (const [id, deletedAt] of Object.entries(value)) {
      if (typeof deletedAt === 'string') out[id] = deletedAt;
    }
    return out;
  };
  return { maps: parseRecord(tombstones.maps), folders: parseRecord(tombstones.folders) };
};

const mergeTombstoneRecords = (
  local: Record<string, string>,
  cloud: Record<string, string>,
): Record<string, string> => {
  const merged: Record<string, string> = { ...cloud };
  for (const [id, deletedAt] of Object.entries(local)) {
    const remote = merged[id];
    if (!remote || parseUpdatedAt(deletedAt) >= parseUpdatedAt(remote)) {
      merged[id] = deletedAt;
    }
  }
  return merged;
};

export const mergeCloudTombstones = (local: CloudTombstones, cloud: CloudTombstones): CloudTombstones => ({
  maps: mergeTombstoneRecords(local.maps, cloud.maps),
  folders: mergeTombstoneRecords(local.folders, cloud.folders),
});

const mapDeletedByTombstone = (map: MindMapDocument, tombstones: CloudTombstones): boolean => {
  const deletedAt = tombstones.maps[map.id];
  if (!deletedAt) return false;
  return parseUpdatedAt(deletedAt) >= parseUpdatedAt(map.updatedAt);
};

const folderDeletedByTombstone = (folder: Folder, tombstones: CloudTombstones): boolean =>
  folder.id in tombstones.folders;

export const applyCloudTombstones = (library: CloudLibrary): CloudLibrary => {
  const tombstones = library.tombstones ?? emptyCloudTombstones();
  return {
    ...library,
    maps: library.maps.filter((map) => !mapDeletedByTombstone(map, tombstones)),
    folders: library.folders.filter((folder) => !folderDeletedByTombstone(folder, tombstones)),
    tombstones,
  };
};

export const quarantineRawMapId = (raw: unknown): string | null => {
  if (!isRec(raw)) return null;
  const id = raw.id;
  return typeof id === 'string' ? id : typeof id === 'number' ? String(id) : null;
};

export const readDismissedUnreadableMapIds = (raw: unknown): string[] => {
  if (!isRec(raw)) return [];
  const value = raw.dismissedUnreadableMapIds;
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
};

export const unionDismissedUnreadableMapIds = (
  ...lists: (readonly string[] | undefined)[]
): string[] => {
  const ids = new Set<string>();
  for (const list of lists) {
    for (const id of list ?? []) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
};

const withDismissedField = (lib: CloudLibrary, dismissed: string[]): CloudLibrary => {
  if (dismissed.length === 0) {
    const rest: CloudLibrary = { ...lib };
    delete rest.dismissedUnreadableMapIds;
    return rest;
  }
  return { ...lib, dismissedUnreadableMapIds: dismissed };
};

export const dismissedUnreadableMapIdSet = (lib: CloudLibrary | unknown): ReadonlySet<string> =>
  new Set(readDismissedUnreadableMapIds(lib));

/** Re-include unmigratable map blobs from cloud so a local push does not delete them. */
export const preserveQuarantinedCloudMapsOnPush = (
  local: CloudLibrary,
  cloudRaw: unknown,
  dismissedUnreadableMapIds: ReadonlySet<string> = dismissedUnreadableMapIdSet(local),
): CloudLibrary => {
  const mergedDismissed = unionDismissedUnreadableMapIds(
    [...dismissedUnreadableMapIds],
    readDismissedUnreadableMapIds(cloudRaw),
  );
  const dismissed = new Set(mergedDismissed);
  const { quarantined } = migrateLibrary(cloudRaw);
  if (quarantined.length === 0) {
    return withDismissedField(local, mergedDismissed);
  }
  const localIds = new Set(local.maps.map((map) => map.id));
  const preserved: MindMapDocument[] = [];
  for (const entry of quarantined) {
    const id = quarantineRawMapId(entry.raw);
    if (id && dismissed.has(id)) continue;
    if (id && localIds.has(id)) continue;
    preserved.push(entry.raw as MindMapDocument);
  }
  const next: CloudLibrary = {
    ...local,
    maps: preserved.length === 0 ? local.maps : [...local.maps, ...preserved],
  };
  return withDismissedField(next, mergedDismissed);
};

const stableCloudJson = (lib: CloudLibrary): string => {
  const maps = [...lib.maps].sort((a, b) => a.id.localeCompare(b.id));
  const folders = [...lib.folders].sort((a, b) => a.id.localeCompare(b.id));
  const dismissed = [...(lib.dismissedUnreadableMapIds ?? [])].sort();
  const tombstones = lib.tombstones ?? emptyCloudTombstones();
  const sortRecord = (rec: Record<string, string>) =>
    Object.fromEntries(Object.entries(rec).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({
    maps,
    folders,
    dismissedUnreadableMapIds: dismissed,
    tombstones: { maps: sortRecord(tombstones.maps), folders: sortRecord(tombstones.folders) },
  });
};

export const cloudLibrariesEqual = (a: CloudLibrary, b: CloudLibrary): boolean =>
  stableCloudJson(a) === stableCloudJson(b);

/** Per-map `updatedAt` wins; folders union with local name preferred on id clash. Tombstones drop stale copies. */
export const mergeCloudLibrary = (local: CloudLibrary, cloud: CloudLibrary): CloudLibrary => {
  const dismissed = unionDismissedUnreadableMapIds(
    local.dismissedUnreadableMapIds,
    cloud.dismissedUnreadableMapIds,
  );
  const dismissedIds = new Set(dismissed);
  const tombstones = mergeCloudTombstones(
    local.tombstones ?? emptyCloudTombstones(),
    cloud.tombstones ?? emptyCloudTombstones(),
  );

  const mapById = new Map<string, MindMapDocument>();
  for (const map of cloud.maps) {
    if (!dismissedIds.has(map.id)) mapById.set(map.id, map);
  }
  for (const map of local.maps) {
    if (dismissedIds.has(map.id)) continue;
    const remote = mapById.get(map.id);
    if (!remote || parseUpdatedAt(map.updatedAt) >= parseUpdatedAt(remote.updatedAt)) {
      mapById.set(map.id, map);
    }
  }

  const folderById = new Map<string, Folder>();
  for (const folder of cloud.folders) {
    folderById.set(folder.id, folder);
  }
  for (const folder of local.folders) {
    folderById.set(folder.id, folder);
  }

  return applyCloudTombstones(
    withDismissedField(
      {
        version: 1,
        maps: [...mapById.values()],
        folders: [...folderById.values()],
        tombstones,
      },
      dismissed,
    ),
  );
};

export const maxMapUpdatedAtMs = (lib: CloudLibrary): number =>
  lib.maps.reduce((max, map) => Math.max(max, parseUpdatedAt(map.updatedAt)), 0);

/** Guard before whole-row upsert; large embedded images can exceed practical limits. */
export const CLOUD_LIBRARY_MAX_PAYLOAD_BYTES = 5 * 1024 * 1024;

export const measureCloudLibraryBytes = (snapshot: CloudLibrary): number =>
  new TextEncoder().encode(JSON.stringify(snapshot)).length;

export const formatByteCount = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const isServerStampNewer = (
  serverStampMs: number,
  lastKnownServerStampMs: number,
): boolean => serverStampMs > lastKnownServerStampMs;
