import { describe, expect, it } from 'vitest';
import { createEmptyMap } from '@/domain/map-factory';
import type { CloudLibrary } from '@/features/cloud/merge-cloud-library';
import {
  CLOUD_LIBRARY_MAX_PAYLOAD_BYTES,
  cloudLibrariesEqual,
  formatByteCount,
  isServerStampNewer,
  measureCloudLibraryBytes,
  mergeCloudLibrary,
  maxMapUpdatedAtMs,
  preserveQuarantinedCloudMapsOnPush,
} from '@/features/cloud/merge-cloud-library';

const withUpdatedAt = (name: string, updatedAt: string) => {
  const map = createEmptyMap(name);
  map.updatedAt = updatedAt;
  return map;
};

describe('mergeCloudLibrary', () => {
  it('keeps the local map when its updatedAt is newer than cloud', () => {
    const id = 'map-1';
    const localMap = withUpdatedAt('Local title', '2026-03-01T00:00:00.000Z');
    localMap.id = id;
    const cloudMap = withUpdatedAt('Cloud title', '2026-02-01T00:00:00.000Z');
    cloudMap.id = id;
    const local: CloudLibrary = { version: 1, maps: [localMap], folders: [] };
    const cloud: CloudLibrary = { version: 1, maps: [cloudMap], folders: [] };

    const merged = mergeCloudLibrary(local, cloud);

    expect(merged.maps).toHaveLength(1);
    expect(merged.maps[0]?.name).toBe('Local title');
    expect(cloudLibrariesEqual(merged, cloud)).toBe(false);
  });

  it('takes the cloud map when cloud updatedAt is newer', () => {
    const id = 'map-1';
    const localMap = withUpdatedAt('Local title', '2026-01-01T00:00:00.000Z');
    localMap.id = id;
    const cloudMap = withUpdatedAt('Cloud title', '2026-03-01T00:00:00.000Z');
    cloudMap.id = id;
    const merged = mergeCloudLibrary(
      { version: 1, maps: [localMap], folders: [] },
      { version: 1, maps: [cloudMap], folders: [] },
    );

    expect(merged.maps[0]?.name).toBe('Cloud title');
  });

  it('unions maps that exist on only one side', () => {
    const localOnly = withUpdatedAt('Only local', '2026-01-01T00:00:00.000Z');
    const cloudOnly = withUpdatedAt('Only cloud', '2026-01-02T00:00:00.000Z');
    const merged = mergeCloudLibrary(
      { version: 1, maps: [localOnly], folders: [] },
      { version: 1, maps: [cloudOnly], folders: [] },
    );

    expect(merged.maps.map((m) => m.name).sort()).toEqual(['Only cloud', 'Only local']);
  });

  it('drops a stale local copy when cloud tombstone deleted it elsewhere', () => {
    const id = 'deleted-map';
    const staleLocal = withUpdatedAt('Ghost', '2026-01-01T00:00:00.000Z');
    staleLocal.id = id;
    const cloudCopy = withUpdatedAt('Ghost', '2026-01-01T00:00:00.000Z');
    cloudCopy.id = id;
    const merged = mergeCloudLibrary(
      { version: 1, maps: [staleLocal], folders: [] },
      {
        version: 1,
        maps: [cloudCopy],
        folders: [],
        tombstones: { maps: { [id]: '2026-03-01T00:00:00.000Z' }, folders: {} },
      },
    );

    expect(merged.maps).toHaveLength(0);
    expect(merged.tombstones?.maps[id]).toBe('2026-03-01T00:00:00.000Z');
  });

  it('reports max map updatedAt in milliseconds', () => {
    const older = withUpdatedAt('A', '2026-01-01T00:00:00.000Z');
    const newer = withUpdatedAt('B', '2026-06-01T12:00:00.000Z');
    expect(maxMapUpdatedAtMs({ version: 1, maps: [older, newer], folders: [] })).toBe(
      Date.parse('2026-06-01T12:00:00.000Z'),
    );
  });
});

describe('preserveQuarantinedCloudMapsOnPush', () => {
  it('re-includes unmigratable cloud map blobs on push', () => {
    const localMap = createEmptyMap('Good');
    const local: CloudLibrary = { version: 1, maps: [localMap], folders: [] };
    const cloudRaw = {
      version: 1,
      maps: [localMap, { id: 'broken', name: 'Broken', root: 'nonsense' }],
      folders: [],
    };
    const payload = preserveQuarantinedCloudMapsOnPush(local, cloudRaw);
    expect(payload.maps).toHaveLength(2);
    expect(payload.maps.some((m) => m.id === 'broken')).toBe(true);
  });

  it('does not re-include dismissed unreadable map ids', () => {
    const localMap = createEmptyMap('Good');
    const local: CloudLibrary = {
      version: 1,
      maps: [localMap],
      folders: [],
      dismissedUnreadableMapIds: ['broken'],
    };
    const cloudRaw = {
      version: 1,
      maps: [localMap, { id: 'broken', name: 'Broken', root: 'nonsense' }],
      folders: [],
    };
    const payload = preserveQuarantinedCloudMapsOnPush(local, cloudRaw);
    expect(payload.maps).toHaveLength(1);
    expect(payload.dismissedUnreadableMapIds).toEqual(['broken']);
  });
});

describe('cloud payload limits', () => {
  it('measures encoded JSON size', () => {
    const lib: CloudLibrary = { version: 1, maps: [createEmptyMap('x')], folders: [] };
    expect(measureCloudLibraryBytes(lib)).toBeGreaterThan(0);
  });

  it('detects when server stamp is newer', () => {
    expect(isServerStampNewer(100, 99)).toBe(true);
    expect(isServerStampNewer(99, 100)).toBe(false);
  });

  it('formats byte counts for error messages', () => {
    expect(formatByteCount(512)).toBe('512 B');
    expect(formatByteCount(CLOUD_LIBRARY_MAX_PAYLOAD_BYTES)).toContain('MB');
  });
});
