import { migrateMap } from '@/domain/library-migration';
import { relayoutMap } from '@/domain/map-edits';
import type { MindMapDocument } from '@/domain/schemas';

/** Rough cap aligned with localStorage / import UX; rejects oversized paste or file text. */
export const MAX_JSON_IMPORT_CHARS = 5_000_000;

export function parseJsonImport(text: string): MindMapDocument {
  if (text.length > MAX_JSON_IMPORT_CHARS) {
    throw new Error(`JSON import exceeds ${MAX_JSON_IMPORT_CHARS} characters`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Invalid JSON');
  }
  const result = migrateMap(parsed);
  if ('reason' in result) {
    throw new Error(`Not a valid mind map: ${result.reason}`);
  }
  return relayoutMap(result.map);
}
