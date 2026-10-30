import { migrateMap } from '@/domain/library-migration';
import { relayoutMap } from '@/domain/map-edits';
import type { MindMapDocument } from '@/domain/schemas';

export function parseJsonImport(text: string): MindMapDocument {
  const result = migrateMap(JSON.parse(text) as unknown);
  if ('reason' in result) {
    throw new Error(`Not a valid mind map: ${result.reason}`);
  }
  return relayoutMap(result.map);
}
