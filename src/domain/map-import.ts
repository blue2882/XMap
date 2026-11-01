import type { MindMapDocument } from '@/domain/schemas';

const parseUpdatedAt = (iso: string): number | null => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

export type MapImportVerdict =
  | { kind: 'apply' }
  | { kind: 'stale'; existingUpdatedAt: string; incomingUpdatedAt: string };

/** Blocks replacing a library map when the import is strictly older than what is already stored. */
export const verdictMapImport = (
  existing: MindMapDocument | undefined,
  incoming: MindMapDocument,
): MapImportVerdict => {
  if (existing == null) return { kind: 'apply' };
  const existingMs = parseUpdatedAt(existing.updatedAt);
  const incomingMs = parseUpdatedAt(incoming.updatedAt);
  if (existingMs != null && incomingMs != null && incomingMs < existingMs) {
    return {
      kind: 'stale',
      existingUpdatedAt: existing.updatedAt,
      incomingUpdatedAt: incoming.updatedAt,
    };
  }
  return { kind: 'apply' };
};
