import { describe, expect, it } from 'vitest';
import { addChildNode } from '@/domain/map-edits';
import { createEmptyMap } from '@/domain/map-factory';
import {
  canMoveSibling,
  mainBranchId,
  moveSibling,
  setBranchColor,
  setNodeColor,
  setNodeImage,
  setNodeKind,
} from '@/domain/node-details';

function fixture() {
  const base = createEmptyMap('Root');
  const a = addChildNode(base, base.rootId, 'A');
  const b = addChildNode(a.map, base.rootId, 'B');
  const a1 = addChildNode(b.map, a.newNodeId, 'A1');
  return { map: a1.map, rootId: base.rootId, a: a.newNodeId, b: b.newNodeId, a1: a1.newNodeId };
}

describe('node details edits', () => {
  it('finds the main branch of a deep node', () => {
    const { map, a, a1 } = fixture();
    expect(mainBranchId(map, a1)).toBe(a);
  });

  it('recolours the whole main branch but not other branches', () => {
    const { map, a, a1, b } = fixture();
    const next = setBranchColor(map, a1, 3);
    const color = (id: string) => next.nodes.find((n) => n.id === id)!.colorIndex;
    expect(color(a)).toBe(3);
    expect(color(a1)).toBe(3);
    expect(color(b)).toBe(map.nodes.find((n) => n.id === b)!.colorIndex);
  });

  it('sets and clears a custom colour and image', () => {
    const { map, a } = fixture();
    const coloured = setNodeColor(map, a, '#7c8da6');
    expect(coloured.nodes.find((n) => n.id === a)!.color).toBe('#7c8da6');
    expect(setNodeColor(coloured, a, undefined).nodes.find((n) => n.id === a)!.color).toBeUndefined();
    const pictured = setNodeImage(map, a, 'data:image/png;base64,AAAA');
    expect(pictured.nodes.find((n) => n.id === a)!.image).toBeDefined();
    expect(setNodeImage(pictured, a, undefined).nodes.find((n) => n.id === a)!.image).toBeUndefined();
  });

  it('toggles the self-check kind but never on the root', () => {
    const { map, a, rootId } = fixture();
    expect(setNodeKind(map, a, 'question').nodes.find((n) => n.id === a)!.kind).toBe('question');
    expect(setNodeKind(map, rootId, 'question')).toBe(map);
  });

  it('moves a node among its siblings and reports the limits', () => {
    const { map, a, b } = fixture();
    expect(canMoveSibling(map, a, -1)).toBe(false);
    expect(canMoveSibling(map, a, 1)).toBe(true);
    const next = moveSibling(map, a, 1);
    const order = next.edges.filter((e) => e.sourceId === map.rootId).map((e) => e.targetId);
    expect(order).toEqual([b, a]);
    expect(moveSibling(map, a, -1)).toBe(map);
  });
});
