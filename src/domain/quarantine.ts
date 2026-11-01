import type { QuarantinedMap } from '@/domain/library-migration';
import { QUARANTINE_STORAGE_KEY } from '@/domain/schemas';

export function readQuarantineList(storage: Pick<Storage, 'getItem'> = localStorage): QuarantinedMap[] {
  try {
    const raw = storage.getItem(QUARANTINE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QuarantinedMap[]) : [];
  } catch {
    return [];
  }
}

export function writeQuarantineList(
  entries: QuarantinedMap[],
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): void {
  if (entries.length === 0) {
    storage.removeItem(QUARANTINE_STORAGE_KEY);
    return;
  }
  storage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(entries));
}

export function dismissQuarantineAt(entries: QuarantinedMap[], index: number): QuarantinedMap[] {
  if (index < 0 || index >= entries.length) return entries;
  return entries.filter((_, i) => i !== index);
}

export function quarantineEntryName(raw: unknown): string {
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const name = (raw as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return 'Untitled map';
}
