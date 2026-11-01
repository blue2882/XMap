import { describe, expect, it } from 'vitest';
import { addManualLink, removeManualLink } from '@/domain/manual-links';
import { addChildNode } from '@/domain/map-edits';
import { createEmptyMap } from '@/domain/map-factory';

describe('manual links', () => {
  it('adds a link between two nodes that are not parent and child', () => {
    const map = createEmptyMap('Test');
    const { map: withA, newNodeId: a } = addChildNode(map, map.rootId, 'A');
    const { map: withB, newNodeId: b } = addChildNode(withA, withA.rootId, 'B');
    const next = addManualLink(withB, a, b);

    expect(next.links).toEqual([{ id: `link_${a}_${b}`, sourceId: a, targetId: b }]);
  });

  it('rejects self links and duplicate parent edges', () => {
    const map = createEmptyMap('Test');
    const { map: withChild, newNodeId } = addChildNode(map, map.rootId, 'Child');

    expect(addManualLink(withChild, newNodeId, newNodeId)).toBe(withChild);
    expect(addManualLink(withChild, map.rootId, newNodeId)).toBe(withChild);
  });

  it('rejects duplicate manual links in either direction', () => {
    const map = createEmptyMap('Test');
    const { map: withA, newNodeId: a } = addChildNode(map, map.rootId, 'A');
    const { map: withB, newNodeId: b } = addChildNode(withA, withA.rootId, 'B');
    const first = addManualLink(withB, a, b);

    expect(addManualLink(first, b, a)).toBe(first);
    expect(addManualLink(first, a, b)).toBe(first);
  });

  it('removeManualLink drops one link by id', () => {
    const map = createEmptyMap('Test');
    const { map: withA, newNodeId: a } = addChildNode(map, map.rootId, 'A');
    const { map: withB, newNodeId: b } = addChildNode(withA, withA.rootId, 'B');
    const linked = addManualLink(withB, a, b);
    const linkId = linked.links![0].id;
    const cleared = removeManualLink(linked, linkId);

    expect(cleared.links).toEqual([]);
    expect(removeManualLink(cleared, linkId)).toBe(cleared);
  });
});
