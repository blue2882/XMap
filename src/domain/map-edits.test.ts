import { describe, expect, it } from 'vitest';
import {
  addChildNode,
  deleteNode,
  relayoutMap,
  reparentNode,
} from '@/domain/map-edits';
import { createEmptyMap } from '@/domain/map-factory';

describe('map tree edits', () => {
  it('addChildNode increases the number of nodes', () => {
    const map = createEmptyMap('Test');
    const { map: next, newNodeId } = addChildNode(map, map.rootId, 'Child');

    expect(next.nodes.length).toBe(map.nodes.length + 1);
    expect(next.nodes.some((n) => n.id === newNodeId)).toBe(true);
    expect(
      next.edges.some(
        (e) => e.sourceId === map.rootId && e.targetId === newNodeId,
      ),
    ).toBe(true);
  });

  it('deleteNode removes the target and its entire subtree', () => {
    const map = createEmptyMap('Test');
    const { map: withChild, newNodeId: childId } = addChildNode(
      map,
      map.rootId,
    );
    const { map: withGrandchild, newNodeId: grandchildId } = addChildNode(
      withChild,
      childId,
    );

    const after = deleteNode(withGrandchild, childId);

    expect(after.nodes.some((n) => n.id === childId)).toBe(false);
    expect(after.nodes.some((n) => n.id === grandchildId)).toBe(false);
    expect(after.nodes.some((n) => n.id === map.rootId)).toBe(true);
    expect(
      after.edges.some(
        (e) => e.targetId === childId || e.targetId === grandchildId,
      ),
    ).toBe(false);
  });

  it('relayoutMap gives same-side siblings distinct Y coordinates', () => {
    let map = createEmptyMap('Test');
    const ids: string[] = [];
    for (const text of ['A', 'B', 'C', 'D']) {
      const result = addChildNode(map, map.rootId, text);
      map = result.map;
      ids.push(result.newNodeId);
    }

    const laidOut = relayoutMap(map);
    const kids = ids.map((id) => laidOut.nodes.find((n) => n.id === id)!);
    const columns = new Map<number, number[]>();
    for (const kid of kids) {
      columns.set(kid.x, [...(columns.get(kid.x) ?? []), kid.y]);
    }

    expect(columns.size).toBe(2);
    for (const ys of columns.values()) {
      expect(new Set(ys).size).toBe(ys.length);
    }
  });

  it('add, delete, and reparent leave every other node where it is', () => {
    let map = createEmptyMap('Test');
    const first = addChildNode(map, map.rootId, 'A');
    const second = addChildNode(first.map, map.rootId, 'B');
    map = second.map;
    const parked = map.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));

    const added = addChildNode(map, map.rootId, 'C');
    for (const before of parked) {
      const after = added.map.nodes.find((n) => n.id === before.id)!;
      expect([after.x, after.y]).toEqual([before.x, before.y]);
    }

    const removed = deleteNode(added.map, added.newNodeId);
    for (const before of parked) {
      const after = removed.nodes.find((n) => n.id === before.id)!;
      expect([after.x, after.y]).toEqual([before.x, before.y]);
    }

    const moved = reparentNode(map, second.newNodeId, first.newNodeId);
    const stay = moved.nodes.find((n) => n.id === first.newNodeId)!;
    const beforeStay = parked.find((n) => n.id === first.newNodeId)!;
    expect([stay.x, stay.y]).toEqual([beforeStay.x, beforeStay.y]);
    const root = moved.nodes.find((n) => n.id === map.rootId)!;
    const beforeRoot = parked.find((n) => n.id === map.rootId)!;
    expect([root.x, root.y]).toEqual([beforeRoot.x, beforeRoot.y]);
  });
});
