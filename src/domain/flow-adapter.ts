import type { Edge, Node } from '@xyflow/react';
import { branchColor } from '@/domain/colors';
import { visibleNodes } from '@/domain/map-edits';
import { fanAlongSide, NODE_H, NODE_W, nodeBounds, separateBoxes } from '@/domain/node-geometry';
import type { MindMapDocument, MindMapNode } from '@/domain/schemas';

export const MIND_MAP_NODE_TYPE = 'mindMapNode' as const;

export type MindMapFlowNodeData = {
  domainNode: MindMapNode;
  isRoot: boolean;
  selected: boolean;
  editing: boolean;
  editText?: string;
  /** Candidate parent while re-parenting; shows the drop affordance. */
  dropTarget?: boolean;
  /** Part of the branch currently being dragged. */
  lifted?: boolean;
};

export const GHOST_NODE_TYPE = 'ghostNode' as const;
export const GHOST_NODE_ID = '__drag-ghost__';
export const REPARENT_PREVIEW_EDGE_ID = '__reparent-preview__';

export function documentToFlowNodes(
  map: MindMapDocument,
  ui?: { selectedId: string | null; editingId: string | null; editText?: string },
): Node<MindMapFlowNodeData>[] {
  return visibleNodes(map).map((node) => {
    const bounds = nodeBounds(
      node,
      ui?.editingId === node.id ? ui.editText : undefined,
    );
    return {
      id: node.id,
      type: MIND_MAP_NODE_TYPE,
      position: { x: node.x, y: node.y },
      data: {
        domainNode: node,
        isRoot: node.id === map.rootId || node.detached === true,
        selected: ui?.selectedId === node.id,
        editing: ui?.editingId === node.id,
        editText: ui?.editingId === node.id ? ui.editText : undefined,
      },
      width: bounds.w,
      height: bounds.h,
      measured: { width: bounds.w, height: bounds.h },
      draggable: node.id !== map.rootId,
    };
  });
}

/** Handle ids: `-out` leaves a node on that side, `-in` enters it. */
export function sideHandles(source: Node | undefined, target: Node | undefined) {
  const sx = source ? source.position.x + Number(source.width ?? NODE_W) / 2 : 0;
  const tx = target ? target.position.x + Number(target.width ?? NODE_W) / 2 : 0;
  return tx >= sx
    ? { sourceHandle: 'right-out', targetHandle: 'left-in' }
    : { sourceHandle: 'left-out', targetHandle: 'right-in' };
}

/**
 * Edges leave each node on the side facing its child, so the layout can wrap
 * both sides of the root. `flowNodes` are the positions actually on screen
 * (including any in-progress drag), so edges re-route as a branch crosses over.
 */
export function documentToFlowEdges(map: MindMapDocument, flowNodes: Node[]): Edge[] {
  const flowById = new Map(flowNodes.map((n) => [n.id, n]));
  const nodeById = new Map(map.nodes.map((n) => [n.id, n]));
  const isVisible = (id: string) => flowById.has(id);

  const parentEdges = map.edges
    .filter((edge) => isVisible(edge.sourceId) && isVisible(edge.targetId))
    .map((edge): Edge => ({
      id: edge.id,
      source: edge.sourceId,
      target: edge.targetId,
      ...sideHandles(flowById.get(edge.sourceId), flowById.get(edge.targetId)),
      type: 'mindMap',
      data: { fan: fanFor(flowNodes, edge.sourceId, edge.targetId, childIds(map, edge.sourceId)) },
      style: {
        stroke: branchColor(nodeById.get(edge.targetId)?.colorIndex ?? 0),
        strokeWidth: 3,
        strokeOpacity: 0.6,
      },
    }));

  const manualEdges = (map.links ?? [])
    .filter((link) => isVisible(link.sourceId) && isVisible(link.targetId))
    .map((link): Edge => ({
      id: `mlink_${link.id}`,
      source: link.sourceId,
      target: link.targetId,
      ...sideHandles(flowById.get(link.sourceId), flowById.get(link.targetId)),
      type: 'mindMap',
      style: {
        stroke: branchColor(nodeById.get(link.targetId)?.colorIndex ?? 0),
        strokeWidth: 3,
        strokeOpacity: 0.6,
        strokeDasharray: '7 5',
      },
      interactionWidth: 16,
    }));

  return [...parentEdges, ...manualEdges];
}

function childIds(map: MindMapDocument, sourceId: string): string[] {
  return map.edges.filter((edge) => edge.sourceId === sourceId).map((edge) => edge.targetId);
}

function fanFor(flowNodes: Node[], sourceId: string, targetId: string, kids: string[]): number {
  const byId = new Map(flowNodes.map((node) => [node.id, node]));
  const source = byId.get(sourceId);
  const target = byId.get(targetId);
  if (!source || !target) return 0;
  const midX = (node: Node) => node.position.x + Number(node.width ?? NODE_W) / 2;
  const toRight = midX(target) >= midX(source);
  const sameSide = kids
    .map((id) => byId.get(id))
    .filter((node): node is Node => node !== undefined)
    .filter((node) => (midX(node) >= midX(source)) === toRight)
    .sort((a, b) => a.position.y - b.position.y);
  return fanAlongSide(
    Number(source.height ?? NODE_H),
    sameSide.length,
    sameSide.findIndex((node) => node.id === targetId),
  );
}

/** Keep a dragged branch off every other node. The pointer delta is the start. */
export function separateBranchDelta(
  nodes: Node[],
  branchIds: ReadonlySet<string>,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  const moving = nodes.filter((node) => branchIds.has(node.id)).map(flowNodeRect);
  const obstacles = nodes.filter((node) => !branchIds.has(node.id)).map(flowNodeRect);
  return separateBoxes(moving, obstacles, dx, dy);
}

export function flowNodePosition(node: Node): { x: number; y: number } {
  return { x: node.position.x, y: node.position.y };
}

export function viewportToFlow(viewport: MindMapDocument['viewport']) {
  return { x: viewport.x, y: viewport.y, zoom: viewport.scale };
}

export function viewportFromFlow(viewport: { x: number; y: number; zoom: number }) {
  return { x: viewport.x, y: viewport.y, scale: viewport.zoom };
}

type FlowRect = { x: number; y: number; w: number; h: number };

function flowNodeRect(node: Node): FlowRect {
  return {
    x: node.position.x,
    y: node.position.y,
    w: Number(node.width ?? NODE_W),
    h: Number(node.height ?? NODE_H),
  };
}

export type DragPreview = {
  draggedId: string;
  /** The dragged node and its descendants. */
  branchIds: ReadonlySet<string>;
  dx: number;
  dy: number;
  targetId: string | null;
  /** True while re-parenting (Alt held or mode on); false for a plain move. */
  reparenting: boolean;
};

/** Shift the dragged branch and mark the re-parent target; everything else is untouched. */
export function applyDragPreview(
  nodes: Node<MindMapFlowNodeData>[],
  preview: DragPreview | null,
): Node<MindMapFlowNodeData>[] {
  if (!preview) return nodes;
  return nodes.map((node) => {
    const lifted = preview.branchIds.has(node.id);
    const dropTarget = node.id === preview.targetId;
    if (!lifted && !dropTarget) return node;
    return {
      ...node,
      position: lifted
        ? { x: node.position.x + preview.dx, y: node.position.y + preview.dy }
        : node.position,
      zIndex: lifted ? 10 : node.zIndex,
      data: { ...node.data, lifted, dropTarget },
    };
  });
}

/**
 * The node under the dragged node's centre that may become its new parent.
 * Requires the centre (not mere overlap) to sit inside the target, so passing
 * near a neighbour never counts.
 */
export function findReparentTarget(
  dragged: Node,
  nodes: Node[],
  blockedIds: ReadonlySet<string>,
  currentParentId: string | null,
): string | null {
  const rect = flowNodeRect(dragged);
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const hit = nodes.find((node) => {
    if (blockedIds.has(node.id) || node.id === currentParentId) return false;
    const r = flowNodeRect(node);
    return cx >= r.x && cx <= r.x + r.w && cy >= r.y && cy <= r.y + r.h;
  });
  return hit?.id ?? null;
}
