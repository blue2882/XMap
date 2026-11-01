import { describe, expect, it } from 'vitest';
import type { QuarantinedMap } from '@/domain/library-migration';
import { QUARANTINE_STORAGE_KEY } from '@/domain/schemas';
import {
  appendQuarantine,
  dismissQuarantineAt,
  quarantineEntryName,
  readQuarantineList,
  readQuarantineListResult,
  writeQuarantineList,
} from '@/domain/quarantine';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
}

describe('quarantine helpers', () => {
  it('reads and writes the quarantine list', () => {
    const storage = memoryStorage();
    expect(readQuarantineList(storage)).toEqual([]);

    const entries: QuarantinedMap[] = [{ raw: { id: 'a', name: 'Alpha' }, reason: 'bad nodes' }];
    expect(writeQuarantineList(entries, storage).ok).toBe(true);
    expect(storage.data.get(QUARANTINE_STORAGE_KEY)).toBe(JSON.stringify(entries));
    expect(readQuarantineList(storage)).toEqual(entries);
  });

  it('ignores corrupt quarantine entries missing reason', () => {
    const storage = memoryStorage({
      [QUARANTINE_STORAGE_KEY]: JSON.stringify([{ raw: { id: 'x' } }]),
    });
    expect(readQuarantineList(storage)).toEqual([]);
  });

  it('clears storage when the list is empty', () => {
    const storage = memoryStorage({ [QUARANTINE_STORAGE_KEY]: '[]' });
    writeQuarantineList([], storage);
    expect(storage.data.has(QUARANTINE_STORAGE_KEY)).toBe(false);
  });

  it('dismisses one entry by index', () => {
    const entries: QuarantinedMap[] = [
      { raw: 1, reason: 'one' },
      { raw: 2, reason: 'two' },
    ];
    expect(dismissQuarantineAt(entries, 0)).toEqual([{ raw: 2, reason: 'two' }]);
    expect(dismissQuarantineAt(entries, 5)).toEqual(entries);
  });

  it('derives a display name from raw objects', () => {
    expect(quarantineEntryName({ name: '  My map  ' })).toBe('My map');
    expect(quarantineEntryName({ name: '' })).toBe('Untitled map');
    expect(quarantineEntryName(null)).toBe('Untitled map');
  });

  it('reports corrupt quarantine JSON instead of treating it as empty', () => {
    const storage = memoryStorage({ [QUARANTINE_STORAGE_KEY]: '{not json' });
    expect(readQuarantineListResult(storage).ok).toBe(false);
    expect(readQuarantineList(storage)).toEqual([]);
  });

  it('surfaces quota failures on append without dropping existing entries', () => {
    const storage = memoryStorage({
      [QUARANTINE_STORAGE_KEY]: JSON.stringify([{ raw: { id: 'a' }, reason: 'one' }]),
    });
    storage.setItem = () => {
      throw new DOMException('quota', 'QuotaExceededError');
    };
    const result = appendQuarantine([{ raw: { id: 'b' }, reason: 'two' }], storage);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('quota');
    expect(readQuarantineList(storage)).toHaveLength(1);
  });
});
