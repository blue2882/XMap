import type { Node } from '@xyflow/react';
import { describe, expect, it } from 'vitest';
import { applyDragPreview, findReparentTarget, separateBranchDelta } from '@/domain/flow-adapter';

const box = (id: string, x: number, y: number): Node => ({
  id,
  position: { x, y },
  data: {},
  width: 100,
  height: 40,
});

describe('findReparentTarget', () => {
  const nodes = [box('a', 0, 0), box('b', 300, 0), box('c', 0, 200)];

  it('ignores a node that only overlaps another at the edge', () => {
    const dragged = box('d', 80, 10);
    expect(findReparentTarget(dragged, nodes, new Set(['d']), null)).toBeNull();
  });

  it('returns the node containing the dragged centre', () => {
    const dragged = box('d', 270, 0);
    expect(findReparentTarget(dragged, nodes, new Set(['d']), null)).toBe('b');
  });

  it('skips blocked nodes and the current parent', () => {
    const dragged = box('d', 0, 0);
    expect(findReparentTarget(dragged, nodes, new Set(['a']), null)).toBeNull();
    expect(findReparentTarget(dragged, nodes, new Set(), 'a')).toBeNull();
  });
});

describe('separateBranchDelta', () => {
  it('pushes a dragged node off a node it would cover', () => {
    const nodes = [box('a', 0, 0), box('b', 300, 0)];
    const separated = separateBranchDelta(nodes, new Set(['a']), 300, 0);
    const moved = { x: 0 + separated.dx, y: 0 + separated.dy, w: 100, h: 40 };
    const other = { x: 300, y: 0, w: 100, h: 40 };
    const overlapX = Math.min(moved.x + moved.w, other.x + other.w) - Math.max(moved.x, other.x);
    const overlapY = Math.min(moved.y + moved.h, other.y + other.h) - Math.max(moved.y, other.y);
    expect(overlapX > 0 && overlapY > 0).toBe(false);
  });
});

describe('applyDragPreview', () => {
  it('moves only the dragged branch', () => {
    const nodes = [box('a', 0, 0), box('b', 300, 0)] as never;
    const out = applyDragPreview(nodes, {
      draggedId: 'a',
      branchIds: new Set(['a']),
      dx: 10,
      dy: 5,
      targetId: null,
      reparenting: false,
    });
    expect(out[0].position).toEqual({ x: 10, y: 5 });
    expect(out[1].position).toEqual({ x: 300, y: 0 });
  });
});
