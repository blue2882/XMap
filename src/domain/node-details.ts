import { collectDescendants, relayoutMap } from '@/domain/map-edits';
import type { MindMapDocument, MindMapNode } from '@/domain/schemas';

export const MAX_NODE_IMAGE_BYTES = 1_800_000;

function touch(map: MindMapDocument): MindMapDocument {
  return { ...map, updatedAt: new Date().toISOString() };
}

function patchNode(
  map: MindMapDocument,
  nodeId: string,
  patch: (node: MindMapNode) => MindMapNode,
): MindMapDocument {
  if (!map.nodes.some((n) => n.id === nodeId)) return map;
  return touch({ ...map, nodes: map.nodes.map((n) => (n.id === nodeId ? patch(n) : n)) });
}

/** Set an optional field, or drop the key entirely when cleared. */
function withOptional(
  node: MindMapNode,
  key: 'color' | 'image',
  value: string | undefined,
): MindMapNode {
  const next = { ...node };
  if (value) next[key] = value;
  else delete next[key];
  return next;
}

export function parentIdOf(map: MindMapDocument, nodeId: string): string | null {
  return map.edges.find((e) => e.targetId === nodeId)?.sourceId ?? null;
}

/** The depth-1 ancestor (or the node itself) that owns this node's branch colour. */
export function mainBranchId(map: MindMapDocument, nodeId: string): string | null {
  let current: string | null = nodeId;
  while (current) {
    const parent = parentIdOf(map, current);
    if (parent === map.rootId) return current;
    current = parent;
  }
  return null;
}

export function setNodeKind(
  map: MindMapDocument,
  nodeId: string,
  kind: MindMapNode['kind'],
): MindMapDocument {
  if (nodeId === map.rootId) return map;
  return patchNode(map, nodeId, (n) => (n.kind === kind ? n : { ...n, kind }));
}

/** Recolour a whole main branch. Nodes with their own custom colour keep it. */
export function setBranchColor(
  map: MindMapDocument,
  nodeId: string,
  colorIndex: number,
): MindMapDocument {
  const branchId = mainBranchId(map, nodeId);
  if (!branchId) return map;
  const ids = collectDescendants(map, branchId);
  return touch({
    ...map,
    nodes: map.nodes.map((n) => (ids.has(n.id) ? { ...n, colorIndex } : n)),
  });
}

export function setNodeColor(
  map: MindMapDocument,
  nodeId: string,
  color: string | undefined,
): MindMapDocument {
  return patchNode(map, nodeId, (node) => withOptional(node, 'color', color));
}

export function setNodeImage(
  map: MindMapDocument,
  nodeId: string,
  image: string | undefined,
): MindMapDocument {
  return patchNode(map, nodeId, (node) => withOptional(node, 'image', image));
}

/** Swap a node with its previous (-1) or next (+1) sibling, then re-tidy the layout. */
export function moveSibling(
  map: MindMapDocument,
  nodeId: string,
  direction: -1 | 1,
): MindMapDocument {
  const parentId = parentIdOf(map, nodeId);
  if (!parentId) return map;
  const siblingEdges = map.edges.filter((e) => e.sourceId === parentId);
  const from = siblingEdges.findIndex((e) => e.targetId === nodeId);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= siblingEdges.length) return map;

  const reordered = [...siblingEdges];
  [reordered[from], reordered[to]] = [reordered[to], reordered[from]];
  let cursor = 0;
  const edges = map.edges.map((e) => (e.sourceId === parentId ? reordered[cursor++] : e));
  return relayoutMap({ ...map, edges });
}

export function canMoveSibling(map: MindMapDocument, nodeId: string, direction: -1 | 1): boolean {
  const parentId = parentIdOf(map, nodeId);
  if (!parentId) return false;
  const siblings = map.edges.filter((e) => e.sourceId === parentId);
  const index = siblings.findIndex((e) => e.targetId === nodeId);
  const target = index + direction;
  return index >= 0 && target >= 0 && target < siblings.length;
}
