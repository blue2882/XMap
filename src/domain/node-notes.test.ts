import { describe, expect, it } from 'vitest';
import { updateNodeNotes } from '@/domain/node-notes';
import { createEmptyMap } from '@/domain/map-factory';

describe('updateNodeNotes', () => {
  it('updates notes without changing text, kind, or detached', () => {
    const map = createEmptyMap('Test');
    const nodeId = map.rootId;
    const seeded = {
      ...map,
      nodes: map.nodes.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              text: 'Keep this label',
              notes: 'Old note',
              kind: 'question' as const,
              detached: true,
            }
          : n,
      ),
    };

    const next = updateNodeNotes(seeded, nodeId, 'New note body');

    const node = next.nodes.find((n) => n.id === nodeId);
    expect(node).toBeDefined();
    expect(node!.notes).toBe('New note body');
    expect(node!.text).toBe('Keep this label');
    expect(node!.kind).toBe('question');
    expect(node!.detached).toBe(true);
  });

  it('returns the same map when nodeId is missing', () => {
    const map = createEmptyMap('Test');
    const next = updateNodeNotes(map, 'missing-id', 'Notes');
    expect(next).toBe(map);
  });
});
