import { COLUMN_GAP, layoutMindMap, ROOT_GAP, SIBLING_GAP } from '@/domain/mindmap-layout';
import { NODE_W, nodeBounds, separateBoxes, type Box } from '@/domain/node-geometry';
import { createId } from '@/lib/id';
import type { MindMapDocument, MindMapEdge, MindMapNode } from '@/domain/schemas';

const COLOR_COUNT = 6;

function touch(map: MindMapDocument): MindMapDocument {
  return { ...map, updatedAt: new Date().toISOString() };
}

function childrenOf(map: MindMapDocument, nodeId: string): string[] {
  return map.edges.filter((e) => e.sourceId === nodeId).map((e) => e.targetId);
}

function parentOf(map: MindMapDocument, nodeId: string): string | null {
  const edge = map.edges.find((e) => e.targetId === nodeId);
  return edge?.sourceId ?? null;
}

function nodeById(map: MindMapDocument, id: string): MindMapNode | undefined {
  return map.nodes.find((n) => n.id === id);
}

function isCollapsed(node: MindMapNode): boolean {
  return node.collapsed ?? false;
}

/** Drop the new or moved node beside its parent. Everyone else stays put. */
function slotBesideParent(
  map: MindMapDocument,
  parentId: string,
  text: string,
  ignore: Set<string> = new Set(),
): { x: number; y: number } {
  const parent = nodeById(map, parentId)!;
  const parentBox = nodeBounds(parent);
  const childH = nodeBounds({ ...parent, text }).h;
  const parentMidX = parent.x + parentBox.w / 2;
  const parentMidY = parent.y + parentBox.h / 2;
  const siblings = childrenOf(map, parentId).filter((id) => !ignore.has(id));
  const side = parentId === map.rootId ? (siblings.length % 2 === 0 ? -1 : 1) : outwardSide(map, parent);
  const gap = parentId === map.rootId ? ROOT_GAP : COLUMN_GAP;
  const x = side > 0 ? parent.x + parentBox.w + gap : parent.x - gap - NODE_W;
  const onSide = siblings
    .map((id) => nodeById(map, id)!)
    .filter((node) => {
      const midX = node.x + nodeBounds(node).w / 2;
      return side > 0 ? midX >= parentMidX : midX < parentMidX;
    });
  return { x, y: stackedY(onSide, parentMidY, childH) };
}

function stackedY(onSide: MindMapNode[], parentMidY: number, childH: number): number {
  if (onSide.length === 0) return parentMidY - childH / 2;
  const center = (node: MindMapNode) => node.y + nodeBounds(node).h / 2;
  const above = onSide.filter((node) => center(node) < parentMidY - 1).length;
  const below = onSide.filter((node) => center(node) > parentMidY + 1).length;
  if (above <= below) {
    const top = Math.min(...onSide.map((node) => node.y));
    return top - SIBLING_GAP - childH;
  }
  const bottom = Math.max(...onSide.map((node) => node.y + nodeBounds(node).h));
  return bottom + SIBLING_GAP;
}

function clearOf(
  map: MindMapDocument,
  ignore: Set<string>,
  slot: Box,
): { x: number; y: number } {
  const obstacles = map.nodes.filter((node) => !ignore.has(node.id)).map((node) => nodeBounds(node));
  const shift = separateBoxes([slot], obstacles, 0, 0);
  return { x: slot.x + shift.dx, y: slot.y + shift.dy };
}

function outwardSide(map: MindMapDocument, parent: MindMapNode): 1 | -1 {
  const root = nodeById(map, map.rootId);
  if (!root) return 1;
  const rootMidX = root.x + nodeBounds(root).w / 2;
  const parentMidX = parent.x + nodeBounds(parent).w / 2;
  return parentMidX >= rootMidX ? 1 : -1;
}

export function relayoutMap(map: MindMapDocument): MindMapDocument {
  return touch({ ...map, nodes: layoutMindMap(map) });
}

function hiddenByCollapsedAncestor(map: MindMapDocument, nodeId: string): boolean {
  let current = parentOf(map, nodeId);
  while (current) {
    const parent = nodeById(map, current);
    if (parent && isCollapsed(parent)) {
      return true;
    }
    current = parentOf(map, current);
  }
  return false;
}

export function visibleNodes(map: MindMapDocument): MindMapNode[] {
  return map.nodes.filter((n) => !hiddenByCollapsedAncestor(map, n.id));
}

export function toggleNodeCollapsed(
  map: MindMapDocument,
  nodeId: string,
): MindMapDocument {
  return touch({
    ...map,
    nodes: map.nodes.map((n) =>
      n.id === nodeId ? { ...n, collapsed: !isCollapsed(n) } : n,
    ),
  });
}

export function cycleNodeColor(map: MindMapDocument, nodeId: string): MindMapDocument {
  return touch({
    ...map,
    nodes: map.nodes.map((n) =>
      n.id === nodeId
        ? { ...n, colorIndex: (n.colorIndex + 1) % COLOR_COUNT }
        : n,
    ),
  });
}

export function reparentNode(
  map: MindMapDocument,
  nodeId: string,
  newParentId: string,
): MindMapDocument {
  if (nodeId === map.rootId || nodeId === newParentId) {
    return map;
  }
  if (!nodeById(map, nodeId) || !nodeById(map, newParentId)) {
    return map;
  }
  if (collectDescendants(map, nodeId).has(newParentId)) {
    return map;
  }
  // A detached node has no parent edge; attaching it creates one and clears the flag.
  const hasIncoming = map.edges.some((e) => e.targetId === nodeId);
  const edges: MindMapEdge[] = hasIncoming
    ? map.edges.map((e) => (e.targetId === nodeId ? { ...e, sourceId: newParentId } : e))
    : [...map.edges, { id: createId('edge'), sourceId: newParentId, targetId: nodeId }];
  const next = touch({
    ...map,
    edges,
    nodes: hasIncoming
      ? map.nodes
      : map.nodes.map((n) => (n.id === nodeId ? { ...n, detached: false } : n)),
  });
  const node = nodeById(map, nodeId)!;
  const movingIds = collectDescendants(map, nodeId);
  const slot = slotBesideParent(next, newParentId, node.text, movingIds);
  const moving = next.nodes.filter((n) => movingIds.has(n.id)).map((n) => nodeBounds(n));
  const obstacles = next.nodes.filter((n) => !movingIds.has(n.id)).map((n) => nodeBounds(n));
  const shift = separateBoxes(moving, obstacles, slot.x - node.x, slot.y - node.y);
  return moveSubtree(next, nodeId, shift.dx, shift.dy);
}

export function updateNodeText(
  map: MindMapDocument,
  nodeId: string,
  text: string,
): MindMapDocument {
  return touch({
    ...map,
    nodes: map.nodes.map((n) => (n.id === nodeId ? { ...n, text } : n)),
  });
}

export function updateNodePosition(
  map: MindMapDocument,
  nodeId: string,
  x: number,
  y: number,
): MindMapDocument {
  return touch({
    ...map,
    nodes: map.nodes.map((n) => (n.id === nodeId ? { ...n, x, y } : n)),
  });
}

/** Shift a node and its whole branch by a delta, leaving every other node where it is. */
export function moveSubtree(
  map: MindMapDocument,
  nodeId: string,
  dx: number,
  dy: number,
): MindMapDocument {
  if (dx === 0 && dy === 0) {
    return map;
  }
  const ids = collectDescendants(map, nodeId);
  return touch({
    ...map,
    nodes: map.nodes.map((n) => (ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
  });
}

export function updateViewport(
  map: MindMapDocument,
  viewport: MindMapDocument['viewport'],
): MindMapDocument {
  return { ...map, viewport };
}

/**
 * Children inherit their branch colour. A new main branch (child of the root or
 * a detached node) takes the least-used colour among its siblings instead, so
 * neighbouring branches stay distinct.
 */
function colorIndexForChild(map: MindMapDocument, parent: MindMapNode): number {
  const startsBranch = parent.id === map.rootId || parent.detached === true;
  if (!startsBranch) return parent.colorIndex;
  const used = childrenOf(map, parent.id).map((id) => nodeById(map, id)?.colorIndex);
  const counts = Array.from({ length: COLOR_COUNT }, (_, i) => used.filter((c) => c === i).length);
  const least = Math.min(...counts);
  for (let step = 1; step <= COLOR_COUNT; step += 1) {
    const index = (parent.colorIndex + step) % COLOR_COUNT;
    if (counts[index] === least) return index;
  }
  return (parent.colorIndex + 1) % COLOR_COUNT;
}

export function addChildNode(
  map: MindMapDocument,
  parentId: string,
  text = 'New idea',
): { map: MindMapDocument; newNodeId: string } {
  const parent = nodeById(map, parentId);
  if (!parent) {
    return { map, newNodeId: '' };
  }
  const newNodeId = createId('node');
  const edge: MindMapEdge = {
    id: createId('edge'),
    sourceId: parentId,
    targetId: newNodeId,
  };
  const open = slotBesideParent(map, parentId, text);
  const childH = nodeBounds({ ...parent, text }).h;
  const slot = clearOf(map, new Set(), { x: open.x, y: open.y, w: NODE_W, h: childH });
  const node: MindMapNode = {
    id: newNodeId,
    text,
    x: slot.x,
    y: slot.y,
    colorIndex: colorIndexForChild(map, parent),
    collapsed: false,
  };
  const next = touch({
    ...map,
    nodes: [...map.nodes, node],
    edges: [...map.edges, edge],
  });
  return { map: next, newNodeId };
}

export function addSiblingNode(
  map: MindMapDocument,
  nodeId: string,
  text = 'New idea',
): { map: MindMapDocument; newNodeId: string } {
  const parentId = parentOf(map, nodeId);
  if (!parentId) {
    return addChildNode(map, map.rootId, text);
  }
  return addChildNode(map, parentId, text);
}

/** The node plus every node below it (including collapsed ones). */
export function collectDescendants(map: MindMapDocument, nodeId: string): Set<string> {
  const ids = new Set<string>([nodeId]);
  for (const cid of childrenOf(map, nodeId)) {
    for (const d of collectDescendants(map, cid)) {
      ids.add(d);
    }
  }
  return ids;
}

export function deleteNode(map: MindMapDocument, nodeId: string): MindMapDocument {
  if (nodeId === map.rootId) {
    return map;
  }
  const remove = collectDescendants(map, nodeId);
  return touch({
    ...map,
    nodes: map.nodes.filter((n) => !remove.has(n.id)),
    edges: map.edges.filter(
      (e) => !remove.has(e.sourceId) && !remove.has(e.targetId),
    ),
  });
}

export function renameMap(map: MindMapDocument, name: string): MindMapDocument {
  return touch({ ...map, name: name.trim() || map.name });
}

export function neighborNodeId(
  map: MindMapDocument,
  nodeId: string,
  direction: 'up' | 'down' | 'left' | 'right',
): string | null {
  const current = nodeById(map, nodeId);
  if (!current) {
    return null;
  }
  const parentId = parentOf(map, nodeId);
  if (direction === 'left' && parentId) {
    return parentId;
  }
  if (direction === 'right') {
    const kids = childrenOf(map, nodeId);
    return kids[0] ?? null;
  }
  const siblings = parentId ? childrenOf(map, parentId) : [map.rootId];
  const index = siblings.indexOf(nodeId);
  if (direction === 'up' && index > 0) {
    return siblings[index - 1];
  }
  if (direction === 'down' && index >= 0 && index < siblings.length - 1) {
    return siblings[index + 1];
  }
  return null;
}
