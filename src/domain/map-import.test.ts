import { describe, expect, it } from 'vitest';
import { createEmptyMap } from '@/domain/map-factory';
import { verdictMapImport } from '@/domain/map-import';

describe('verdictMapImport', () => {
  it('allows import when no map with that id exists', () => {
    const incoming = createEmptyMap('Imported');
    expect(verdictMapImport(undefined, incoming)).toEqual({ kind: 'apply' });
  });

  it('rejects when import updatedAt is older than the library copy', () => {
    const existing = createEmptyMap('Current');
    existing.updatedAt = '2026-02-01T12:00:00.000Z';
    const incoming = { ...createEmptyMap('Stale export'), id: existing.id };
    incoming.updatedAt = '2026-01-01T08:00:00.000Z';
    expect(verdictMapImport(existing, incoming)).toEqual({
      kind: 'stale',
      existingUpdatedAt: existing.updatedAt,
      incomingUpdatedAt: incoming.updatedAt,
    });
  });

  it('allows import when incoming is newer or same time', () => {
    const existing = createEmptyMap('Current');
    existing.updatedAt = '2026-01-01T08:00:00.000Z';
    const newer = { ...createEmptyMap('Fresh export'), id: existing.id };
    newer.updatedAt = '2026-02-01T12:00:00.000Z';
    expect(verdictMapImport(existing, newer)).toEqual({ kind: 'apply' });
  });
});
