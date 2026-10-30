import { describe, expect, it } from 'vitest';
import { createEmptyMap } from '@/domain/map-factory';
import { toCloudLibrary } from '@/features/cloud/library-sync';

describe('toCloudLibrary', () => {
  it('keeps maps and folders and omits device settings', () => {
    const map = createEmptyMap('Saved');
    const payload = toCloudLibrary([map], [{ id: 'f1', name: 'School' }]);
    expect(payload).toEqual({
      version: 1,
      maps: [map],
      folders: [{ id: 'f1', name: 'School' }],
    });
    expect(payload).not.toHaveProperty('settings');
  });
});
