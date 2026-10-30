import { nodeBounds } from '@/domain/node-geometry';
import type { MindMapDocument, MindMapNode } from '@/domain/schemas';

export const ROOT_GAP = 96;
export const COLUMN_GAP = 64;
export const SIBLING_GAP = 14;

type Side = 1 | -1;
type Anchor = { x: number; w: number };

/**
 * Bilateral mind-map layout. Root children alternate left, right, left, right.
 * A side with two or more branches stacks them around the parent, one above
 * and one below, and deeper nodes grow outward in that same vertical rhythm.
 * Nodes unreachable from the root keep their positions.
 */
export function layoutMindMap(map: MindMapDocument): MindMapNode[] {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const root = byId.get(map.rootId);
  if (!root) return map.nodes;

  const outgoing = new Map<string, string[]>();
  for (const edge of map.edges) {
    if (!byId.has(edge.sourceId) || !byId.has(edge.targetId)) continue;
    const list = outgoing.get(edge.sourceId) ?? [];
    list.push(edge.targetId);
    outgoing.set(edge.sourceId, list);
  }

  const tree = new Map<string, string[]>();
  const visited = new Set<string>([root.id]);
  const queue = [root.id];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const kids = (outgoing.get(id) ?? []).filter((c) => !visited.has(c));
    kids.forEach((c) => visited.add(c));
    tree.set(id, kids);
    queue.push(...kids);
  }

  const size = (id: string) => nodeBounds(byId.get(id)!);
  const blockHeights = new Map<string, number>();
  const stack = (ids: string[]): number =>
    ids.reduce((sum, id, i) => sum + blockHeights.get(id)! + (i > 0 ? SIBLING_GAP : 0), 0);
  const measure = (id: string): number => {
    const kids = tree.get(id) ?? [];
    kids.forEach(measure);
    const height = Math.max(size(id).h, stack(kids));
    blockHeights.set(id, height);
    return height;
  };
  measure(root.id);

  const positions = new Map<string, { x: number; y: number }>();

  const placeChildren = (ids: string[], parent: Anchor, top: number, side: Side, gap: number) => {
    let cursor = top;
    for (const id of ids) {
      const b = size(id);
      const x = side > 0 ? parent.x + parent.w + gap : parent.x - gap - b.w;
      place(id, x, cursor, side);
      cursor += blockHeights.get(id)! + SIBLING_GAP;
    }
  };

  const place = (id: string, x: number, top: number, side: Side) => {
    const b = size(id);
    const block = blockHeights.get(id)!;
    const kids = tree.get(id) ?? [];
    positions.set(id, { x, y: top + (block - b.h) / 2 });
    placeChildren(kids, { x, w: b.w }, top + (block - stack(kids)) / 2, side, COLUMN_GAP);
  };

  const rootBounds = size(root.id);
  const rootCenterY = root.y + rootBounds.h / 2;
  const rootAnchor = { x: root.x, w: rootBounds.w };
  const [rightIds, leftIds] = splitAlternate(tree.get(root.id) ?? []);

  placeChildren(rightIds, rootAnchor, rootCenterY - stack(rightIds) / 2, 1, ROOT_GAP);
  placeChildren(leftIds, rootAnchor, rootCenterY - stack(leftIds) / 2, -1, ROOT_GAP);

  return map.nodes.map((node) => {
    const point = positions.get(node.id);
    return point ? { ...node, x: point.x, y: point.y } : node;
  });
}

/** Even indexes go left, odd indexes go right. Returns [right, left]. */
function splitAlternate(ids: string[]): [string[], string[]] {
  const right: string[] = [];
  const left: string[] = [];
  ids.forEach((id, index) => {
    if (index % 2 === 0) left.push(id);
    else right.push(id);
  });
  return [right, left];
}
