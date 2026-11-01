import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LIBRARY_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from '@/domain/schemas';

function stubStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  });
  return data;
}

const legacyState = {
  folders: ['Genetics'],
  maps: [
    { id: 'm1', name: 'Ch 17', folder: 'Genetics', updated: 1793215337319,
      root: { id: 'r', t: 'Root', n: 'note', k: '', c: false, ch: [{ id: 'c', t: 'Child', n: '', k: 'q', c: false, ch: [] }] } },
    { id: 'broken', name: 'Broken', root: 'nonsense' },
  ],
};

describe('library store rehydration', () => {
  beforeEach(() => vi.resetModules());

  it('loads a legacy library, keeps good maps and quarantines broken ones', async () => {
    const storage = stubStorage({ [LIBRARY_STORAGE_KEY]: JSON.stringify({ state: legacyState, version: 0 }) });
    const { useLibraryStore } = await import('@/stores/library-store');
    await useLibraryStore.persist.rehydrate();
    const { maps, folders } = useLibraryStore.getState();
    expect(maps.map((m) => m.id)).toEqual(['m1']);
    expect(maps[0].nodes.map((n) => n.text).sort()).toEqual(['Child', 'Root']);
    expect(folders.map((f) => f.name)).toEqual(['Genetics']);
    expect(JSON.parse(storage.get(QUARANTINE_STORAGE_KEY) ?? '[]')).toHaveLength(1);
  });
});

describe('importMap', () => {
  beforeEach(() => vi.resetModules());

  it('returns stale when an older export shares an id with a newer library map', async () => {
    stubStorage({});
    const { useLibraryStore } = await import('@/stores/library-store');
    const map = useLibraryStore.getState().createMap('Live');
    const live = useLibraryStore.getState().maps.find((m) => m.id === map)!;
    live.updatedAt = '2026-03-01T00:00:00.000Z';
    useLibraryStore.setState({ maps: [live] });
    const stale = { ...live, name: 'Old export', updatedAt: '2026-01-01T00:00:00.000Z' };
    const result = useLibraryStore.getState().importMap(stale);
    expect(result).toEqual({ ok: false, reason: 'stale', existingName: 'Live' });
    expect(useLibraryStore.getState().maps[0].name).toBe('Live');
  });

  it('replaces when force is set after a stale verdict', async () => {
    stubStorage({});
    const { useLibraryStore } = await import('@/stores/library-store');
    const map = useLibraryStore.getState().createMap('Live');
    const live = useLibraryStore.getState().maps.find((m) => m.id === map)!;
    live.updatedAt = '2026-03-01T00:00:00.000Z';
    useLibraryStore.setState({ maps: [live] });
    const stale = { ...live, name: 'Old export', updatedAt: '2026-01-01T00:00:00.000Z' };
    const result = useLibraryStore.getState().importMap(stale, { force: true });
    expect(result).toEqual({ ok: true, id: map });
    expect(useLibraryStore.getState().maps[0].name).toBe('Old export');
  });
});
