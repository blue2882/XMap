import { describe, expect, it } from 'vitest';
import { MAX_JSON_IMPORT_CHARS, parseJsonImport } from '@/features/import/json-import';

describe('parseJsonImport', () => {
  it('rejects oversized JSON before parse', () => {
    const huge = '{' + ' '.repeat(MAX_JSON_IMPORT_CHARS) + '}';
    expect(() => parseJsonImport(huge)).toThrow(/exceeds/);
  });

  it('rejects invalid JSON', () => {
    expect(() => parseJsonImport('{not json')).toThrow(/Invalid JSON/);
  });
});
