import type { QuarantinedMap } from '@/domain/library-migration';
import { QUARANTINE_STORAGE_KEY, quarantineListSchema } from '@/domain/schemas';

export type QuarantineWriteResult =
  | { ok: true }
  | { ok: false; reason: 'quota' | 'storage'; message: string };

export type QuarantineReadResult =
  | { ok: true; entries: QuarantinedMap[] }
  | { ok: false; reason: 'corrupt'; message: string };

const isQuotaError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'QuotaExceededError';

export function readQuarantineList(storage: Pick<Storage, 'getItem'> = localStorage): QuarantinedMap[] {
  const result = readQuarantineListResult(storage);
  return result.ok ? result.entries : [];
}

export function readQuarantineListResult(
  storage: Pick<Storage, 'getItem'> = localStorage,
): QuarantineReadResult {
  try {
    const raw = storage.getItem(QUARANTINE_STORAGE_KEY);
    if (!raw) return { ok: true, entries: [] };
    const parsed: unknown = JSON.parse(raw);
    const validated = quarantineListSchema.safeParse(parsed);
    if (!validated.success) {
      return { ok: false, reason: 'corrupt', message: 'Quarantine data was not a list.' };
    }
    return { ok: true, entries: validated.data };
  } catch {
    return { ok: false, reason: 'corrupt', message: 'Quarantine data could not be parsed.' };
  }
}

export function writeQuarantineList(
  entries: QuarantinedMap[],
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage,
): QuarantineWriteResult {
  try {
    if (entries.length === 0) {
      storage.removeItem(QUARANTINE_STORAGE_KEY);
      return { ok: true };
    }
    storage.setItem(QUARANTINE_STORAGE_KEY, JSON.stringify(entries));
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: isQuotaError(error) ? 'quota' : 'storage',
      message: isQuotaError(error)
        ? 'Browser storage is full.'
        : error instanceof Error
          ? error.message
          : 'Could not save quarantine.',
    };
  }
}

export function appendQuarantine(
  entries: QuarantinedMap[],
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage,
): { added: number } & QuarantineWriteResult {
  if (entries.length === 0) return { added: 0, ok: true };
  const existingResult = readQuarantineListResult(storage);
  if (!existingResult.ok) {
    return { added: 0, ok: false, reason: 'storage', message: existingResult.message };
  }
  const known = new Set(existingResult.entries.map((e) => JSON.stringify(e.raw)));
  const fresh = entries.filter((e) => !known.has(JSON.stringify(e.raw)));
  if (fresh.length === 0) return { added: 0, ok: true };
  const write = writeQuarantineList([...existingResult.entries, ...fresh], storage);
  if (!write.ok) return { added: 0, ...write };
  return { added: fresh.length, ok: true };
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
