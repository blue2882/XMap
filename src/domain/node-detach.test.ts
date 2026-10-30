import { describe, expect, it } from 'vitest';
import { addChildNode } from '@/domain/map-edits';
import { createEmptyMap } from '@/domain/map-factory';
import { setNodeDetached } from '@/domain/node-detach';

describe('setNodeDetached', () => {
  it('detach removes the parent edge only', () => {
    const map = createEmptyMap('Test');
    const { map: withChild, newNodeId: childId } = addChildNode(map, map.rootId, 'Child');
    const { map: withGrandchild, newNodeId: grandchildId } = addChildNode(
      withChild,
      childId,
    );

    const detached = setNodeDetached(withGrandchild, childId, true);

    expect(detached.nodes.find((n) => n.id === childId)?.detached).toBe(true);
    expect(detached.edges.some((e) => e.targetId === childId)).toBe(false);
    expect(
      detached.edges.some(
        (e) => e.sourceId === childId && e.targetId === grandchildId,
      ),
    ).toBe(true);
  });

  it('reattach adds an edge from the root', () => {
    const map = createEmptyMap('Test');
    const { map: withChild, newNodeId: childId } = addChildNode(map, map.rootId, 'Child');
    const detached = setNodeDetached(withChild, childId, true);

    const attached = setNodeDetached(detached, childId, false);

    expect(attached.nodes.find((n) => n.id === childId)?.detached).toBe(false);
    expect(
      attached.edges.some(
        (e) =>
          e.sourceId === map.rootId &&
          e.targetId === childId &&
          e.id === `edge_${map.rootId}_${childId}`,
      ),
    ).toBe(true);
  });

  it('root is unchanged', () => {
    const map = createEmptyMap('Test');
    const next = setNodeDetached(map, map.rootId, true);

    expect(next).toBe(map);
  });
});
