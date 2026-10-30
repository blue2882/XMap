import { describe, expect, it } from 'vitest';
import { layoutMindMap } from '@/domain/mindmap-layout';
import { addChildNode, moveSubtree } from '@/domain/map-edits';
import { createEmptyMap } from '@/domain/map-factory';
import { nodeBounds } from '@/domain/node-geometry';
import type { MindMapDocument } from '@/domain/schemas';

function build(childCount: number): { map: MindMapDocument; ids: string[] } {
  let map = createEmptyMap('Root');
  const ids: string[] = [];
  for (let i = 0; i < childCount; i += 1) {
    const result = addChildNode(map, map.rootId, `Child ${i}`);
    map = result.map;
    ids.push(result.newNodeId);
  }
  return { map, ids };
}

const centerX = (map: MindMapDocument, id: string): number => {
  const node = map.nodes.find((n) => n.id === id)!;
  return node.x + nodeBounds(node).w / 2;
};

describe('layoutMindMap', () => {
  it('puts the first child on the left and the next on the right', () => {
    const { map, ids } = build(3);
    const laid = layoutMindMap(map);
    const doc = { ...map, nodes: laid };
    const rootX = centerX(doc, map.rootId);
    const root = laid.find((n) => n.id === map.rootId)!;
    const rootMidY = root.y + nodeBounds(root).h / 2;
    const midY = (id: string) => {
      const node = laid.find((n) => n.id === id)!;
      return node.y + nodeBounds(node).h / 2;
    };
    expect(centerX(doc, ids[0])).toBeLessThan(rootX);
    expect(centerX(doc, ids[1])).toBeGreaterThan(rootX);
    expect(centerX(doc, ids[2])).toBeLessThan(rootX);
    expect(midY(ids[0])).toBeLessThan(rootMidY);
    expect(midY(ids[2])).toBeGreaterThan(rootMidY);
  });

  it('splits root children across both sides', () => {
    const { map, ids } = build(4);
    const laid = layoutMindMap(map);
    const rootX = centerX({ ...map, nodes: laid }, map.rootId);
    const sides = ids.map((id) => Math.sign(centerX({ ...map, nodes: laid }, id) - rootX));
    expect(sides.filter((s) => s > 0)).toHaveLength(2);
    expect(sides.filter((s) => s < 0)).toHaveLength(2);
  });

  it('keeps the root where it was', () => {
    const { map } = build(3);
    const before = map.nodes.find((n) => n.id === map.rootId)!;
    const after = layoutMindMap(map).find((n) => n.id === map.rootId)!;
    expect([after.x, after.y]).toEqual([before.x, before.y]);
  });

  it('grows grandchildren away from the root on the same side', () => {
    const { map, ids } = build(2);
    const { map: deep, newNodeId } = addChildNode(map, ids[0], 'Grand');
    const doc = { ...deep, nodes: layoutMindMap(deep) };
    const rootX = centerX(doc, doc.rootId);
    const childDir = Math.sign(centerX(doc, ids[0]) - rootX);
    const grandDir = Math.sign(centerX(doc, newNodeId) - centerX(doc, ids[0]));
    expect(grandDir).toBe(childDir);
  });

  it('never overlaps siblings within a column', () => {
    const { map, ids } = build(7);
    const laid = layoutMindMap(map);
    const boxes = ids.map((id) => {
      const n = laid.find((x) => x.id === id)!;
      return { x: n.x, y: n.y, h: nodeBounds(n).h };
    });
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b || a.x !== b.x) continue;
        expect(a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
      }
    }
  });

  it('leaves nodes unreachable from the root untouched', () => {
    const { map } = build(1);
    const stray = { id: 'stray', text: 'Stray', x: 999, y: 777, colorIndex: 0, detached: true };
    const laid = layoutMindMap({ ...map, nodes: [...map.nodes, stray] });
    expect(laid.find((n) => n.id === 'stray')).toMatchObject({ x: 999, y: 777 });
  });

  it('survives a cyclic edge list', () => {
    const { map, ids } = build(1);
    const cyclic = {
      ...map,
      edges: [...map.edges, { id: 'loop', sourceId: ids[0], targetId: map.rootId }],
    };
    expect(() => layoutMindMap(cyclic)).not.toThrow();
  });
});

describe('moveSubtree', () => {
  it('moves the node and its descendants by the same delta and nothing else', () => {
    const { map, ids } = build(2);
    const { map: deep, newNodeId } = addChildNode(map, ids[0], 'Grand');
    const moved = moveSubtree(deep, ids[0], 40, -25);
    const pos = (m: MindMapDocument, id: string) => {
      const n = m.nodes.find((x) => x.id === id)!;
      return [n.x, n.y];
    };
    for (const id of [ids[0], newNodeId]) {
      const [bx, by] = pos(deep, id);
      expect(pos(moved, id)).toEqual([bx + 40, by - 25]);
    }
    expect(pos(moved, ids[1])).toEqual(pos(deep, ids[1]));
    expect(pos(moved, deep.rootId)).toEqual(pos(deep, deep.rootId));
  });

  it('returns the same document for a zero delta', () => {
    const { map, ids } = build(1);
    expect(moveSubtree(map, ids[0], 0, 0)).toBe(map);
  });
});
