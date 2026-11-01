import { describe, expect, it } from 'vitest';
import { editorHistoryReducer } from '@/hooks/useEditorMap';
import type { MindMapDocument } from '@/domain/schemas';

function doc(text: string): MindMapDocument {
  return {
    id: 'm1',
    name: 'Test',
    rootId: 'root',
    nodes: [{ id: 'root', text, x: 0, y: 0, colorIndex: 0 }],
    edges: [],
    links: [],
    viewport: { x: 0, y: 0, scale: 1 },
    folderId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('editorHistoryReducer', () => {
  it('undo and redo restore prior document snapshots', () => {
    let state = {
      past: [] as MindMapDocument[],
      present: doc('A'),
      future: [] as MindMapDocument[],
    };

    state = editorHistoryReducer(state, {
      type: 'commit',
      next: (prev) => ({ ...prev, nodes: [{ ...prev.nodes[0], text: 'B' }] }),
    });
    expect(state.present.nodes[0].text).toBe('B');
    expect(state.past).toHaveLength(1);

    state = editorHistoryReducer(state, { type: 'undo' });
    expect(state.present.nodes[0].text).toBe('A');
    expect(state.future).toHaveLength(1);

    state = editorHistoryReducer(state, { type: 'redo' });
    expect(state.present.nodes[0].text).toBe('B');
  });

  it('replace clears undo history', () => {
    let state = {
      past: [doc('A')],
      present: doc('B'),
      future: [] as MindMapDocument[],
    };

    state = editorHistoryReducer(state, { type: 'replace', next: doc('Reloaded') });
    expect(state.present.nodes[0].text).toBe('Reloaded');
    expect(state.past).toHaveLength(0);
    expect(state.future).toHaveLength(0);
  });
});
