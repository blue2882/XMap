import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyMap } from '@/domain/map-factory';
import { toCloudLibrary } from '@/features/cloud/library-sync';

describe('toCloudLibrary', () => {
  it('keeps maps and folders and omits device settings', () => {
    const map = createEmptyMap('Saved');
    const payload = toCloudLibrary([map], [{ id: 'f1', name: 'School' }]);
    expect(payload).toEqual({
      version: 1,
      maps: [map],
      folders: [{ id: 'f1', name: 'School' }],
    });
    expect(payload).not.toHaveProperty('settings');
  });
});

const cloudMocks = vi.hoisted(() => {
  const authHandlers: Array<(event: string, session: { user?: { id: string } } | null) => void> = [];
  const removeChannel = vi.fn().mockResolvedValue(undefined);
  const channelSubscribe = vi.fn();
  const maybeSingle = vi.fn();
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const updateSelect = vi.fn().mockResolvedValue({ data: [{ updated_at: '2026-06-01T00:00:00.000Z' }], error: null });
  const getSession = vi.fn();
  return { authHandlers, removeChannel, channelSubscribe, maybeSingle, upsert, updateSelect, getSession };
});

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => cloudMocks.getSession(...args),
      onAuthStateChange: (cb: (event: string, session: { user?: { id: string } } | null) => void) => {
        cloudMocks.authHandlers.push(cb);
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: cloudMocks.maybeSingle,
        }),
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: cloudMocks.updateSelect,
          }),
        }),
      }),
      upsert: cloudMocks.upsert,
    }),
    channel: vi.fn(() => {
      const ch = { on: vi.fn(), subscribe: vi.fn() };
      ch.on.mockReturnValue(ch);
      ch.subscribe.mockImplementation(() => {
        cloudMocks.channelSubscribe();
        return ch;
      });
      return ch;
    }),
    removeChannel: cloudMocks.removeChannel,
  },
}));

vi.mock('@/lib/notify', () => ({
  notify: { error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

describe('startCloudSync auth lifecycle', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal('window', {
      clearTimeout: () => {},
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
    });
    cloudMocks.authHandlers.length = 0;
    cloudMocks.removeChannel.mockClear();
    cloudMocks.channelSubscribe.mockClear();
    cloudMocks.maybeSingle.mockClear();
    cloudMocks.upsert.mockClear();
    cloudMocks.updateSelect.mockClear();
    cloudMocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    cloudMocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    cloudMocks.upsert.mockResolvedValue({ error: null });
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [], folders: [] });
    if (!useLibraryStore.persist.hasHydrated()) {
      await useLibraryStore.persist.rehydrate();
    }
  });

  it('marks auth ready after the initial session read', async () => {
    const { startCloudSync, getAuthSnapshot } = await import('@/features/cloud/library-sync');
    startCloudSync();
    await vi.waitFor(() => expect(getAuthSnapshot().ready).toBe(true));
    expect(getAuthSnapshot().user).toBeNull();
  });

  it('merges on sign-in so newer local maps are not replaced by older cloud copies', async () => {
    const localMap = createEmptyMap('Local only');
    localMap.updatedAt = '2026-03-15T00:00:00.000Z';
    const cloudMap = createEmptyMap('From cloud');
    cloudMap.id = localMap.id;
    cloudMap.updatedAt = '2026-01-01T00:00:00.000Z';
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [localMap], folders: [] });

    cloudMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    cloudMocks.maybeSingle.mockResolvedValue({
      data: {
        data: { version: 1, maps: [cloudMap], folders: [] },
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    const { flushCloudSave, pullCloudLibrary } = await import('@/features/cloud/library-sync');
    await pullCloudLibrary();
    await vi.waitFor(() => expect(useLibraryStore.getState().maps[0]?.name).toBe('Local only'));
    cloudMocks.updateSelect.mockClear();
    await flushCloudSave();
    expect(cloudMocks.updateSelect).toHaveBeenCalled();
  });

  it('uploads the local library when sign-in finds no cloud row', async () => {
    const localMap = createEmptyMap('Needs upload');
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [localMap], folders: [] });

    cloudMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    cloudMocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const { startCloudSync } = await import('@/features/cloud/library-sync');
    startCloudSync();
    await vi.waitFor(() => expect(cloudMocks.upsert).toHaveBeenCalled());
  });

  it('does not tear down realtime on duplicate SIGNED_IN for the same user', async () => {
    cloudMocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    cloudMocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const { startCloudSync } = await import('@/features/cloud/library-sync');
    startCloudSync();
    await vi.waitFor(() => expect(cloudMocks.authHandlers.length).toBeGreaterThan(0));

    const onChange = cloudMocks.authHandlers.at(-1)!;
    cloudMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    onChange('SIGNED_IN', { user: { id: 'user-1' } });
    await vi.waitFor(() => expect(cloudMocks.channelSubscribe).toHaveBeenCalledTimes(1));

    cloudMocks.removeChannel.mockClear();
    onChange('SIGNED_IN', { user: { id: 'user-1' } });
    await vi.waitFor(() => expect(cloudMocks.channelSubscribe).toHaveBeenCalledTimes(1));
    expect(cloudMocks.removeChannel).not.toHaveBeenCalled();
  });

  it('keeps local maps when session ends without a pending clear', async () => {
    const localMap = createEmptyMap('Offline copy');
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [localMap], folders: [] });

    cloudMocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    cloudMocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const { startCloudSync } = await import('@/features/cloud/library-sync');
    startCloudSync();
    await vi.waitFor(() => expect(cloudMocks.authHandlers.length).toBeGreaterThan(0));

    const onChange = cloudMocks.authHandlers.at(-1)!;
    onChange('SIGNED_OUT', null);
    expect(useLibraryStore.getState().maps).toHaveLength(1);
  });

    it('clears the signed-in user and removes realtime on sign-out', async () => {
    const localMap = createEmptyMap('Previous account secret');
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [localMap], folders: [] });

    cloudMocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
    cloudMocks.maybeSingle.mockResolvedValue({ data: null, error: null });

    const { startCloudSync, getAuthSnapshot } = await import('@/features/cloud/library-sync');
    startCloudSync();
    await vi.waitFor(() => expect(cloudMocks.authHandlers.length).toBeGreaterThan(0));

    const onChange = cloudMocks.authHandlers.at(-1)!;
    cloudMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    onChange('SIGNED_IN', { user: { id: 'user-1' } });
    await vi.waitFor(() => expect(cloudMocks.channelSubscribe).toHaveBeenCalled());
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) =>
        key === 'mindmaps.library.signOutClearPending' ? '1' : null,
      setItem: () => {},
      removeItem: () => {},
    });
    onChange('SIGNED_OUT', null);
    expect(cloudMocks.removeChannel).toHaveBeenCalled();
    expect(getAuthSnapshot().user).toBeNull();
    await vi.waitFor(() => expect(useLibraryStore.getState().maps).toHaveLength(0));
  });

  it('does not upload the previous account library after sign-out then sign-in with no cloud row', async () => {
    const previousMap = createEmptyMap('Account A private map');
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [previousMap], folders: [] });

    const { clearLocalLibraryAfterSignOut, pullCloudLibrary } = await import(
      '@/features/cloud/library-sync'
    );
    await clearLocalLibraryAfterSignOut();
    expect(useLibraryStore.getState().maps).toHaveLength(0);

    cloudMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-b' } } },
      error: null,
    });
    cloudMocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    cloudMocks.upsert.mockClear();

    await pullCloudLibrary();

    expect(cloudMocks.upsert).toHaveBeenCalledTimes(1);
    const upsertPayload = cloudMocks.upsert.mock.calls[0]?.[0] as {
      user_id: string;
      data: { maps: { name: string }[] };
    };
    expect(upsertPayload.user_id).toBe('user-b');
    expect(upsertPayload.data.maps).toHaveLength(0);
  });

  it('drops a library left on this device by another account, even after a browser restart', async () => {
    const leftover = createEmptyMap('Account A leftover map');
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [leftover], folders: [] });

    const persisted = new Map([['mindmaps.library.ownerUserId', 'user-a']]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => persisted.get(key) ?? null,
      setItem: (key: string, value: string) => void persisted.set(key, value),
      removeItem: (key: string) => void persisted.delete(key),
    });
    cloudMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-b' } } },
      error: null,
    });
    cloudMocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    cloudMocks.upsert.mockClear();

    const { pullCloudLibrary } = await import('@/features/cloud/library-sync');
    await pullCloudLibrary();

    const upsertPayload = cloudMocks.upsert.mock.calls[0]?.[0] as {
      user_id: string;
      data: { maps: unknown[] };
    };
    expect(upsertPayload.user_id).toBe('user-b');
    expect(upsertPayload.data.maps).toHaveLength(0);
    expect(persisted.get('mindmaps.library.ownerUserId')).toBe('user-b');
  });
});

describe('push conflict handling', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    });
    vi.stubGlobal('window', {
      clearTimeout: () => {},
      setTimeout: (fn: () => void) => {
        fn();
        return 0;
      },
    });
    cloudMocks.authHandlers.length = 0;
    cloudMocks.maybeSingle.mockReset();
    cloudMocks.upsert.mockReset();
    cloudMocks.updateSelect.mockReset();
    cloudMocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    });
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [], folders: [] });
    if (!useLibraryStore.persist.hasHydrated()) {
      await useLibraryStore.persist.rehydrate();
    }
  });

  it('shows a single info toast when cloud is newer on push', async () => {
    const localMap = createEmptyMap('Local');
    localMap.updatedAt = '2026-01-01T00:00:00.000Z';
    const cloudMap = createEmptyMap('Remote wins');
    cloudMap.updatedAt = '2026-06-01T00:00:00.000Z';
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [localMap], folders: [] });

    cloudMocks.maybeSingle.mockResolvedValue({
      data: {
        data: { version: 1, maps: [cloudMap], folders: [] },
        updated_at: '2026-06-01T00:00:00.000Z',
      },
      error: null,
    });

    const { notify } = await import('@/lib/notify');
    const { flushCloudSave } = await import('@/features/cloud/library-sync');
    vi.mocked(notify.error).mockClear();
    vi.mocked(notify.info).mockClear();
    await flushCloudSave();
    await vi.waitFor(() => expect(vi.mocked(notify.info).mock.calls.length).toBeGreaterThan(0));
    expect(vi.mocked(notify.info).mock.calls.some((call) => String(call[0]).includes('elsewhere'))).toBe(
      true,
    );
    expect(vi.mocked(notify.error).mock.calls.some((call) => String(call[1] ?? '').includes('Another device'))).toBe(
      false,
    );
  });

  it('uses conditional update when a cloud row already exists', async () => {
    const localMap = createEmptyMap('Local');
    const { useLibraryStore } = await import('@/stores/library-store');
    useLibraryStore.setState({ maps: [localMap], folders: [] });

    cloudMocks.maybeSingle.mockResolvedValue({
      data: {
        data: { version: 1, maps: [localMap], folders: [] },
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });

    const { flushCloudSave, pullCloudLibrary } = await import('@/features/cloud/library-sync');
    await pullCloudLibrary();
    cloudMocks.upsert.mockClear();
    cloudMocks.updateSelect.mockClear();
    await flushCloudSave();
    expect(cloudMocks.updateSelect).toHaveBeenCalled();
    expect(cloudMocks.upsert).not.toHaveBeenCalled();
  });
});
