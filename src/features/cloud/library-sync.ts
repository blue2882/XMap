import type { RealtimeChannel, User } from '@supabase/supabase-js';
import { migrateLibrary } from '@/domain/library-migration';
import type { Folder, MindMapDocument } from '@/domain/schemas';
import { notify } from '@/lib/notify';
import { supabase } from '@/lib/supabase';
import { useLibraryStore } from '@/stores/library-store';

const CLOUD_PUSH_DELAY_MS = 400;

export type CloudLibrary = {
  version: 1;
  maps: MindMapDocument[];
  folders: Folder[];
};

type AuthSnapshot = { ready: boolean; user: User | null };

const authListeners = new Set<() => void>();
let authSnapshot: AuthSnapshot = { ready: false, user: null };
let channel: RealtimeChannel | null = null;
let applyingCloud = false;
let lastCloudStamp = 0;
let pushTimer = 0;
let pushChain: Promise<string | null> = Promise.resolve(null);
let started = false;

export function toCloudLibrary(maps: MindMapDocument[], folders: Folder[]): CloudLibrary {
  return { version: 1, maps, folders };
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
  const { maps, folders } = useLibraryStore.getState();
  return toCloudLibrary(maps, folders);
}

function libraryFromCloud(raw: unknown): CloudLibrary | null {
  const { library, quarantined } = migrateLibrary(raw);
  if (library.maps.length === 0 && quarantined.length > 0) return null;
  if (quarantined.length > 0) {
    notify.error('Some maps could not be read', `${quarantined.length} left out of this library.`);
  }
  return { version: 1, maps: library.maps, folders: library.folders };
}

function applyCloudLibrary(data: CloudLibrary, stamp: number) {
  applyingCloud = true;
  lastCloudStamp = stamp;
  useLibraryStore.setState({ maps: data.maps, folders: data.folders });
  applyingCloud = false;
}

function pushNow(): Promise<string | null> {
  const write = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) return null;
    const snapshot = currentCloudLibrary();
    const updatedAt = new Date().toISOString();
    try {
      const { error } = await supabase.from('mindmap_libraries').upsert(
        { user_id: user.id, data: snapshot, updated_at: updatedAt },
        { onConflict: 'user_id' },
      );
      if (error) return error.message;
      lastCloudStamp = Date.parse(updatedAt) || Date.now();
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
  window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    void pushNow().then((message) => {
      if (message) notify.error('Cloud save failed', message);
    });
  }, CLOUD_PUSH_DELAY_MS);
}

/** Writes the current library to Supabase before the caller treats the save as done. */
export async function flushCloudSave(): Promise<{ saved: boolean; error?: string }> {
  window.clearTimeout(pushTimer);
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user) return { saved: false };
  const error = await pushNow();
  if (error) return { saved: false, error };
  return { saved: true };
}

async function pullCloudLibrary() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData.session?.user;
  if (!user) return;
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
    return;
  }
  const library = libraryFromCloud(data.data);
  if (!library) {
    notify.error('Could not read your cloud library', 'The row is still in Supabase.');
    return;
  }
  applyCloudLibrary(library, Date.parse(data.updated_at) || Date.now());
}

function subscribeRemote(userId: string) {
  if (channel) {
    void supabase.removeChannel(channel);
    channel = null;
  }
  channel = supabase
    .channel(`mindmap-library-${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'mindmap_libraries',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        const row = payload.new as { data?: unknown; updated_at?: string };
        const stamp = Date.parse(row.updated_at ?? '') || Date.now();
        if (stamp <= lastCloudStamp) return;
        const library = libraryFromCloud(row.data);
        if (!library) return;
        applyCloudLibrary(library, stamp);
        notify.info('Updated from another device');
      },
    )
    .subscribe();
}

export function startCloudSync() {
  if (started) return;
  started = true;

  useLibraryStore.subscribe((state, previous) => {
    if (applyingCloud) return;
    if (state.maps === previous.maps && state.folders === previous.folders) return;
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
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    }
  });
}
