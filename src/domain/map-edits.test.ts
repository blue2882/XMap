import { describe, expect, it } from 'vitest';
import {
  addChildNode,
  addSiblingNode,
  deleteNode,
  relayoutMap,
  reparentNode,
} from '@/domain/map-edits';
import { createEmptyMap } from '@/domain/map-factory';
import { setNodeDetached } from '@/domain/node-detach';

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

  it('new ideas inherit their branch colour', () => {
    const map = createEmptyMap('Test');
    const { map: m1, newNodeId: branch } = addChildNode(map, map.rootId, 'Branch');
    const { map: m2, newNodeId: child } = addChildNode(m1, branch, 'Child');
    const { map: m3, newNodeId: grandchild } = addChildNode(m2, child, 'Grandchild');
    const { map: m4, newNodeId: sibling } = addSiblingNode(m3, grandchild);
    const color = (id: string) => m4.nodes.find((n) => n.id === id)!.colorIndex;
    expect(color(child)).toBe(color(branch));
    expect(color(grandchild)).toBe(color(branch));
    expect(color(sibling)).toBe(color(branch));
  });

  it('new main branches pick distinct colours', () => {
    let map = createEmptyMap('Test');
    const colors: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const result = addChildNode(map, map.rootId, `B${i}`);
      map = result.map;
      colors.push(map.nodes.find((n) => n.id === result.newNodeId)!.colorIndex);
    }
    expect(new Set(colors).size).toBe(6);
  });

  it('reparentNode reattaches a detached node under the chosen parent', () => {
    const map = createEmptyMap('Test');
    const { map: m1, newNodeId: a } = addChildNode(map, map.rootId, 'A');
    const { map: m2, newNodeId: b } = addChildNode(m1, map.rootId, 'B');
    const detached = setNodeDetached(m2, b, true);
    expect(detached.edges.some((e) => e.targetId === b)).toBe(false);

    const next = reparentNode(detached, b, a);
    expect(next.edges.filter((e) => e.targetId === b)).toEqual([
      expect.objectContaining({ sourceId: a, targetId: b }),
    ]);
    expect(next.nodes.find((n) => n.id === b)!.detached).toBe(false);
  });

  it('reparentNode still refuses to drop a detached node into its own branch', () => {
    const map = createEmptyMap('Test');
    const { map: m1, newNodeId: a } = addChildNode(map, map.rootId, 'A');
    const { map: m2, newNodeId: a1 } = addChildNode(m1, a, 'A1');
    const detached = setNodeDetached(m2, a, true);
    expect(reparentNode(detached, a, a1)).toBe(detached);
  });
});
