import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { migrateLibrary } from '@/domain/library-migration';
import { appendQuarantine, writeQuarantineList } from '@/domain/quarantine';
import { createDefaultLibraryState, type Folder, type MindMapDocument } from '@/domain/schemas';
import {
  cloudLibrariesEqual,
  CLOUD_LIBRARY_MAX_PAYLOAD_BYTES,
  formatByteCount,
  isServerStampNewer,
  emptyCloudTombstones,
  measureCloudLibraryBytes,
  mergeCloudLibrary,
  parseCloudTombstones,
  preserveQuarantinedCloudMapsOnPush,
  readDismissedUnreadableMapIds,
  type CloudLibrary,
  type CloudTombstones,
} from '@/features/cloud/merge-cloud-library';
import { LIBRARY_STORAGE_KEY, libraryPersistStorage } from '@/lib/library-persist-storage';
import { notify } from '@/lib/notify';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useLibraryStore } from '@/stores/library-store';

const CLOUD_PUSH_DELAY_MS = 400;
const LIBRARY_OWNER_SESSION_KEY = 'mindmaps.library.ownerUserId';
const SIGN_OUT_CLEAR_PENDING_KEY = 'mindmaps.library.signOutClearPending';
let localLibraryClearPromise: Promise<void> = Promise.resolve();

export type { CloudLibrary } from '@/features/cloud/merge-cloud-library';

type AuthSnapshot = { ready: boolean; user: User | null };

const authListeners = new Set<() => void>();
let authSnapshot: AuthSnapshot = { ready: false, user: null };
let channel: RealtimeChannel | null = null;
let remoteSubscribeUserId: string | null = null;
let applyingCloud = false;
let lastCloudStamp = 0;
let pushTimer: number | undefined;
let pushChain: Promise<string | null> = Promise.resolve(null);
let started = false;
let cloudApplyGeneration = 0;
const cloudApplyListeners = new Set<() => void>();

export function getCloudApplyGeneration(): number {
  return cloudApplyGeneration;
}

export function subscribeCloudApply(listener: () => void): () => void {
  cloudApplyListeners.add(listener);
  return () => cloudApplyListeners.delete(listener);
}

function bumpCloudApplyGeneration() {
  cloudApplyGeneration += 1;
  cloudApplyListeners.forEach((listener) => listener());
}


export function toCloudLibrary(
  maps: MindMapDocument[],
  folders: Folder[],
  options: {
    dismissedUnreadableMapIds?: string[];
    tombstones?: CloudTombstones;
  } = {},
): CloudLibrary {
  const { dismissedUnreadableMapIds = [], tombstones = emptyCloudTombstones() } = options;
  const hasTombstones =
    Object.keys(tombstones.maps).length > 0 || Object.keys(tombstones.folders).length > 0;
  let lib: CloudLibrary = { version: 1, maps, folders };
  if (hasTombstones) lib = { ...lib, tombstones };
  if (dismissedUnreadableMapIds.length === 0) return lib;
  return { ...lib, dismissedUnreadableMapIds };
}

export function getAuthSnapshot(): AuthSnapshot {
  return authSnapshot;
}

export function subscribeAuth(listener: () => void): () => void {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

function setAuth(next: AuthSnapshot) {
  authSnapshot = next;
  authListeners.forEach((listener) => listener());
}

function currentCloudLibrary(): CloudLibrary {
  const { maps, folders, dismissedUnreadableMapIds, syncTombstones } = useLibraryStore.getState();
  return toCloudLibrary(maps, folders, { dismissedUnreadableMapIds, tombstones: syncTombstones });
}

function libraryFromCloud(raw: unknown): CloudLibrary | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { library, quarantined } = migrateLibrary(raw);
  if (quarantined.length > 0) {
    const saved = appendQuarantine(quarantined);
    if (!saved.ok) {
      notify.error(
        saved.reason === 'quota' ? 'Storage full' : 'Could not save unreadable maps',
        saved.message,
      );
    } else if (saved.added > 0) {
      useLibraryStore.setState((state) => ({ quarantineRevision: state.quarantineRevision + 1 }));
      notify.error(
        'Some maps could not be read',
        `${saved.added} saved to Quarantine on this device. Dismiss them to stop syncing from cloud.`,
      );
    }
  }
  const dismissed = readDismissedUnreadableMapIds(raw);
  const tombstones = parseCloudTombstones(raw);
  const withCloudFields = (lib: CloudLibrary): CloudLibrary => ({
    ...lib,
    tombstones,
    ...(dismissed.length > 0 ? { dismissedUnreadableMapIds: dismissed } : {}),
  });
  if (library.maps.length === 0 && quarantined.length > 0) {
    return withCloudFields({ version: 1, maps: [], folders: library.folders });
  }
  return withCloudFields({ version: 1, maps: library.maps, folders: library.folders });
}

function shouldApplyCloudLibrary(raw: unknown, library: CloudLibrary): boolean {
  if (library.maps.length > 0) return true;
  const { quarantined } = migrateLibrary(raw);
  return quarantined.length === 0;
}

const waitForLibraryHydrated = (): Promise<void> => {
  if (useLibraryStore.persist.hasHydrated()) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = useLibraryStore.persist.onFinishHydration(() => {
      finish();
      resolve();
    });
  });
};

function applyCloudLibrary(data: CloudLibrary, stamp: number) {
  applyingCloud = true;
  try {
    const local = currentCloudLibrary();
    const merged = mergeCloudLibrary(local, data);
    useLibraryStore.setState({
      maps: merged.maps,
      folders: merged.folders,
      syncTombstones: merged.tombstones ?? emptyCloudTombstones(),
      dismissedUnreadableMapIds: merged.dismissedUnreadableMapIds ?? [],
    });
    lastCloudStamp = Math.max(lastCloudStamp, stamp);
    if (!cloudLibrariesEqual(merged, data)) {
      scheduleCloudSave();
    }
  } finally {
    applyingCloud = false;
    bumpCloudApplyGeneration();
  }
}

function resetCloudSyncSessionState() {
  if (pushTimer !== undefined) clearTimeout(pushTimer);
  pushTimer = undefined;
  lastCloudStamp = 0;
  applyingCloud = false;
  pushChain = Promise.resolve(null);
}

/** Drops persisted library data so the next signed-in account cannot push the previous user's maps. */
export async function clearLocalLibraryAfterSignOut(): Promise<void> {
  resetCloudSyncSessionState();
  applyingCloud = true;
  const defaults = createDefaultLibraryState();
  useLibraryStore.setState({
    ...defaults,
    syncTombstones: emptyCloudTombstones(),
    dismissedUnreadableMapIds: [],
    folderFilterId: null,
    quarantineRevision: 0,
  });
  applyingCloud = false;
  writeQuarantineList([]);
  try {
    sessionStorage.removeItem(LIBRARY_OWNER_SESSION_KEY);
  } catch {
    /* sessionStorage unavailable */
  }
  await libraryPersistStorage.removeItem(LIBRARY_STORAGE_KEY);
}

const markSignOutClearPending = (): void => {
  try {
    sessionStorage.setItem(SIGN_OUT_CLEAR_PENDING_KEY, '1');
  } catch {
    /* sessionStorage unavailable */
  }
};

const consumeSignOutClearPending = (): boolean => {
  try {
    const pending = sessionStorage.getItem(SIGN_OUT_CLEAR_PENDING_KEY) === '1';
    sessionStorage.removeItem(SIGN_OUT_CLEAR_PENDING_KEY);
    return pending;
  } catch {
    return false;
  }
};

/** Flush cloud when possible, then sign out. Local library is wiped only after a successful upload. */
export async function signOutSafely(): Promise<void> {
  const { maps } = useLibraryStore.getState();
  if (maps.length === 0) {
    markSignOutClearPending();
  } else {
    const result = await flushCloudSave();
    if (result.saved) {
      markSignOutClearPending();
    } else {
      notify.warning(
        'Cloud save did not complete',
        result.error ??
          'Your maps remain on this device. Sign in again to sync or export a JSON backup from Settings.',
      );
    }
  }
  const { error } = await supabase.auth.signOut();
  if (error) notify.error('Sign-out failed', error.message);
}

const handleSignedOut = (): void => {
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  remoteSubscribeUserId = null;
  const shouldClear = consumeSignOutClearPending() || useLibraryStore.getState().maps.length === 0;
  if (shouldClear) {
    localLibraryClearPromise = clearLocalLibraryAfterSignOut();
    return;
  }
  resetCloudSyncSessionState();
  notify.warning(
    'Session ended',
    'Your library was not uploaded before sign-out. Maps on this device are unchanged.',
  );
};

const readBoundLibraryUserId = (): string | null => {
  try {
    return sessionStorage.getItem(LIBRARY_OWNER_SESSION_KEY);
  } catch {
    return null;
  }
};

const markLibraryBoundToUser = (userId: string): void => {
  try {
    sessionStorage.setItem(LIBRARY_OWNER_SESSION_KEY, userId);
  } catch {
    /* sessionStorage unavailable */
  }
};

const ensureLocalLibraryOwnedByUser = async (userId: string): Promise<void> => {
  await localLibraryClearPromise;
  const owner = readBoundLibraryUserId();
  if (owner && owner !== userId) {
    await clearLocalLibraryAfterSignOut();
  }
};

async function reloadBecauseCloudIsNewer(): Promise<null> {
  await pullCloudLibrary();
  notify.info(
    'Cloud library was updated elsewhere',
    'This device did not overwrite the newer cloud copy. The latest library from your account is loaded.',
  );
  return null;
}

function pushNow(): Promise<string | null> {
  const write = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const snapshot = currentCloudLibrary();
    const { data: existingRow, error: fetchError } = await supabase
      .from('mindmap_libraries')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (fetchError) return fetchError.message;
    let payload = snapshot;
    if (existingRow?.data) {
      payload = preserveQuarantinedCloudMapsOnPush(snapshot, existingRow.data);
    }
    const payloadBytes = measureCloudLibraryBytes(payload);
    if (payloadBytes > CLOUD_LIBRARY_MAX_PAYLOAD_BYTES) {
      return `Library is too large to sync (${formatByteCount(payloadBytes)}; limit ${formatByteCount(CLOUD_LIBRARY_MAX_PAYLOAD_BYTES)}). Shrink embedded images or keep backups as JSON exports. Smaller per-map cloud rows need a database migration.`;
    }

    const serverUpdatedAtIso = existingRow?.updated_at ?? null;
    const serverStampMs =
      serverUpdatedAtIso != null ? Date.parse(serverUpdatedAtIso) || 0 : null;
    if (serverStampMs !== null && isServerStampNewer(serverStampMs, lastCloudStamp)) {
      return reloadBecauseCloudIsNewer();
    }

    const updatedAt = new Date().toISOString();
    try {
      if (serverUpdatedAtIso != null) {
        const { data: updatedRows, error } = await supabase
          .from('mindmap_libraries')
          .update({ data: payload, updated_at: updatedAt })
          .eq('user_id', user.id)
          .eq('updated_at', serverUpdatedAtIso)
          .select('updated_at');
        if (error) return error.message;
        if (!updatedRows || updatedRows.length === 0) {
          return reloadBecauseCloudIsNewer();
        }
        const pushStamp = Date.parse(updatedAt) || Date.now();
        lastCloudStamp = Math.max(lastCloudStamp, pushStamp);
        return null;
      }

      const { error } = await supabase.from('mindmap_libraries').upsert(
        { user_id: user.id, data: payload, updated_at: updatedAt },
        { onConflict: 'user_id' },
      );
      if (error) return error.message;
      const pushStamp = Date.parse(updatedAt) || Date.now();
      lastCloudStamp = Math.max(lastCloudStamp, pushStamp);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : 'Cloud save failed';
    }
  };
  pushChain = pushChain.then(write, write);
  return pushChain;
}

export function scheduleCloudSave() {
  if (!authSnapshot.user) return;
  if (pushTimer !== undefined) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    void pushNow().then((message) => {
      if (message) notify.error('Cloud save failed', message);
    });
  }, CLOUD_PUSH_DELAY_MS) as unknown as number;
}

/** Writes the current library to Supabase before the caller treats the save as done. */
export async function flushCloudSave(): Promise<{ saved: boolean; error?: string }> {
  window.clearTimeout(pushTimer);
  pushTimer = undefined;
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) return { saved: false };
  const error = await pushNow();
  if (error) return { saved: false, error };
  return { saved: true };
}

export async function pullCloudLibrary() {
  await waitForLibraryHydrated();
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return;
  await ensureLocalLibraryOwnedByUser(user.id);
  const { data, error } = await supabase
    .from('mindmap_libraries')
    .select('data, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    notify.error('Could not load your library', error.message);
    return;
  }
  if (!data) {
    const uploadError = await pushNow();
    if (uploadError) notify.error('Could not upload this library', uploadError);
    else markLibraryBoundToUser(user.id);
    return;
  }
  const library = libraryFromCloud(data.data);
  if (!library) {
    notify.error('Could not read your cloud library', 'The row is still in Supabase.');
    return;
  }
  if (!shouldApplyCloudLibrary(data.data, library)) {
    lastCloudStamp = Math.max(lastCloudStamp, Date.parse(data.updated_at) || Date.now());
    return;
  }
  applyCloudLibrary(library, Date.parse(data.updated_at) || Date.now());
  markLibraryBoundToUser(user.id);
}

function handleRemoteLibraryRow(row: { data?: unknown; updated_at?: string }) {
  const stamp = Date.parse(row.updated_at ?? '') || Date.now();
  if (stamp <= lastCloudStamp) return;
  const library = libraryFromCloud(row.data);
  if (!library) return;
  if (!shouldApplyCloudLibrary(row.data, library)) {
    lastCloudStamp = Math.max(lastCloudStamp, stamp);
    return;
  }
  applyCloudLibrary(library, stamp);
  notify.info('Updated from another device');
}

function subscribeRemote(userId: string) {
  if (remoteSubscribeUserId === userId && channel) {
    return;
  }
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  remoteSubscribeUserId = userId;
  const changeFilter = {
    schema: 'public' as const,
    table: 'mindmap_libraries',
    filter: `user_id=eq.${userId}`,
  };
  channel = supabase
    .channel(`mindmap-library-${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', ...changeFilter },
      (payload) => {
        handleRemoteLibraryRow(payload.new as { data?: unknown; updated_at?: string });
      },
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', ...changeFilter },
      (payload) => {
        handleRemoteLibraryRow(payload.new as { data?: unknown; updated_at?: string });
      },
    )
    .subscribe();
}

export function startCloudSync() {
  if (started) return;
  started = true;

  if (!isSupabaseConfigured) {
    setAuth({ ready: true, user: null });
    return;
  }

  useLibraryStore.subscribe((state, previous) => {
    if (applyingCloud) return;
    if (
      state.maps === previous.maps &&
      state.folders === previous.folders &&
      state.syncTombstones === previous.syncTombstones &&
      state.dismissedUnreadableMapIds === previous.dismissedUnreadableMapIds
    ) {
      return;
    }
    scheduleCloudSave();
  });

  void supabase.auth.getSession().then(({ data, error }) => {
    if (error) notify.error('Could not restore sign-in', error.message);
    const user = data.session?.user ?? null;
    setAuth({ ready: true, user });
    if (user) {
      void pullCloudLibrary();
      subscribeRemote(user.id);
    }
  });

  supabase.auth.onAuthStateChange((event, session) => {
    const user = session?.user ?? null;
    setAuth({ ready: true, user });
    if (event === 'SIGNED_IN' && user) {
      void pullCloudLibrary();
      subscribeRemote(user.id);
    }
    if (event === 'SIGNED_OUT') {
      handleSignedOut();
    }
  });
}
