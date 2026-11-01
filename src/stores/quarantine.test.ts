import { describe, expect, it } from 'vitest';
import type { QuarantinedMap } from '@/domain/library-migration';
import { QUARANTINE_STORAGE_KEY } from '@/domain/schemas';
import {
  dismissQuarantineAt,
  quarantineEntryName,
  readQuarantineList,
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
    writeQuarantineList(entries, storage);
    expect(storage.data.get(QUARANTINE_STORAGE_KEY)).toBe(JSON.stringify(entries));
    expect(readQuarantineList(storage)).toEqual(entries);
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
});
