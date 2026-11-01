import { describe, expect, it } from 'vitest';
import {
  firstImportFileFromDataTransfer,
  isImportFileName,
} from '@/lib/dropped-import-file';

describe('dropped import file boundary', () => {
  it('accepts json and pptx names', () => {
    expect(isImportFileName('map.JSON')).toBe(true);
    expect(isImportFileName('deck.pptx')).toBe(true);
    expect(isImportFileName('notes.txt')).toBe(false);
  });

  it('returns null when dataTransfer has no files', () => {
    expect(firstImportFileFromDataTransfer(null)).toBeNull();
    expect(firstImportFileFromDataTransfer({ files: [] } as unknown as DataTransfer)).toBeNull();
  });

  it('returns the first importable file', () => {
    const file = new File(['{}'], 'a.json', { type: 'application/json' });
    const dt = { files: [file] } as unknown as DataTransfer;
    expect(firstImportFileFromDataTransfer(dt)).toBe(file);
  });
});
