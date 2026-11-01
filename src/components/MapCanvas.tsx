import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { GitFork } from 'lucide-react';
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  getBezierPath,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type OnMoveEnd,
  type OnNodeDrag,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { DragGhostNode } from '@/components/DragGhostNode';
import { MindMapFlowNode } from '@/components/MindMapFlowNode';
import { setMindMapNodeEditorHandlers } from '@/components/mind-map-node-editor-handlers';
import {
  GHOST_NODE_ID,
  GHOST_NODE_TYPE,
  MIND_MAP_NODE_TYPE,
  REPARENT_PREVIEW_EDGE_ID,
  applyDragPreview,
  documentToFlowEdges,
  documentToFlowNodes,
  findReparentTarget,
  separateBranchDelta,
  sideHandles,
  viewportFromFlow,
  viewportToFlow,
  type DragPreview,
} from '@/domain/flow-adapter';
import { collectDescendants } from '@/domain/map-edits';
import type { MindMapDocument } from '@/domain/schemas';
import { cn, isCoarsePointer } from '@/lib/utils';

const nodeTypes = { [MIND_MAP_NODE_TYPE]: MindMapFlowNode, [GHOST_NODE_TYPE]: DragGhostNode };

function MindMapEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data,
}: EdgeProps) {
  const fan = Number((data as { fan?: number } | undefined)?.fan ?? 0);
  const [path] = getBezierPath({
    sourceX,
    sourceY: sourceY + fan,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return <BaseEdge path={path} style={style} />;
}

const edgeTypes = { mindMap: MindMapEdge };
const DRAG_THRESHOLD_PX = 4;
const DRAG_THRESHOLD_TOUCH_PX = 12;

export type MapCanvasHandle = {
  fitView: (duration?: number) => void;
};

type Props = {
  map: MindMapDocument;
  selectedId: string | null;
  editingId: string | null;
  onSelect: (id: string | null) => void;
  onEditStart: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onEditEnd: (id: string, text: string) => void;
  /** Move a node and its branch by a delta; nothing else changes. */
  onCommitMove: (id: string, dx: number, dy: number) => void;
  onReparent: (nodeId: string, newParentId: string) => void;
  onViewportChange: (viewport: MindMapDocument['viewport']) => void;
  onRemoveLink: (linkId: string) => void;
  reparentMode: boolean;
  onReparentModeChange: (on: boolean) => void;
};

function buildEdges(map: MindMapDocument, flowNodes: Node[], drag: DragPreview | null): Edge[] {
  const edges = documentToFlowEdges(map, flowNodes);
  if (!drag?.targetId) return edges;

  const flowById = new Map(flowNodes.map((n) => [n.id, n]));
  const preview: Edge = {
    id: REPARENT_PREVIEW_EDGE_ID,
    source: drag.targetId,
    target: drag.draggedId,
    ...sideHandles(flowById.get(drag.targetId), flowById.get(drag.draggedId)),
      type: 'mindMap',
    animated: true,
    selectable: false,
    style: { stroke: 'var(--color-accent)', strokeWidth: 3, strokeDasharray: '7 5' },
  };
  // Fade the connection that will be replaced so the swap reads as a preview.
  const faded = edges.map((edge) =>
    edge.target === drag.draggedId
      ? { ...edge, style: { ...edge.style, strokeOpacity: 0.15 } }
      : edge,
  );
  return [...faded, preview];
}

function MapFlowInner(
  {
    map,
    selectedId,
    editingId,
    onSelect,
    onEditStart,
    onToggleCollapse,
    onEditEnd,
    onCommitMove,
    onReparent,
    onViewportChange,
    onRemoveLink,
    reparentMode,
    onReparentModeChange,
  }: Props,
  ref: React.ForwardedRef<MapCanvasHandle>,
) {
  const { fitView, setViewport } = useReactFlow();
  const [editText, setEditText] = useState('');
  const [editBoxHeight, setEditBoxHeightState] = useState<number | undefined>(undefined);
  const framedMapIdRef = useRef<string | null>(null);

  const setEditBoxHeight = useCallback((height: number) => {
    setEditBoxHeightState((prev) => (prev === height ? prev : height));
  }, []);

  const [drag, setDrag] = useState<DragPreview | null>(null);
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const dragCancelledRef = useRef(false);

  const baseNodes = documentToFlowNodes(map, {
    selectedId,
    editingId,
    editText,
    editBoxHeight,
  });
  const shiftedNodes = applyDragPreview(baseNodes, drag);
  const draggedBase = drag ? baseNodes.find((n) => n.id === drag.draggedId) : undefined;
  const flowNodes: Node[] =
    drag && draggedBase && (drag.dx !== 0 || drag.dy !== 0)
      ? [
          {
            id: GHOST_NODE_ID,
            type: GHOST_NODE_TYPE,
            position: draggedBase.position,
            width: draggedBase.width,
            height: draggedBase.height,
            measured: draggedBase.measured,
            data: {},
            zIndex: -1,
            draggable: false,
            selectable: false,
            focusable: false,
            style: { pointerEvents: 'none' },
          },
          ...shiftedNodes,
        ]
      : shiftedNodes;
  const flowEdges = buildEdges(map, flowNodes, drag);
  const dragTargetText = drag?.targetId
    ? map.nodes.find((n) => n.id === drag.targetId)?.text
    : undefined;

  useEffect(() => {
    if (editingId) {
      const node = map.nodes.find((n) => n.id === editingId);
      setEditText(node?.text ?? '');
      setEditBoxHeightState(undefined);
    } else {
      setEditBoxHeightState(undefined);
    }
  }, [editingId, map.nodes]);

  useEffect(() => {
    setMindMapNodeEditorHandlers({
      editingId,
      editText,
      setEditText,
      setEditBoxHeight,
      onEditStart,
      onToggleCollapse,
      onEditEnd,
      selectedId,
      onSelect: (id) => onSelect(id),
    });
    return () => setMindMapNodeEditorHandlers(null);
  }, [editText, editingId, onEditEnd, onEditStart, onToggleCollapse, onSelect, selectedId, setEditBoxHeight]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      fitView({ padding: 0.12, duration: 0 });
      framedMapIdRef.current = map.id;
    });
    return () => cancelAnimationFrame(frame);
  }, [map.id, fitView]);

  useEffect(() => {
    if (framedMapIdRef.current !== map.id) return;
    setViewport(viewportToFlow(map.viewport), { duration: 0 });
  }, [map.id, map.viewport, setViewport]);

  useImperativeHandle(ref, () => ({
    fitView: (duration = 200) => {
      fitView({ padding: 0.12, duration });
    },
  }));

  const onMoveEnd: OnMoveEnd = (_event, viewport) => {
    onViewportChange(viewportFromFlow(viewport));
  };

  useEffect(() => {
    if (!drag) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      dragCancelledRef.current = true;
      setDrag(null);
    };
    window.addEventListener('keydown', cancelOnEscape);
    return () => window.removeEventListener('keydown', cancelOnEscape);
  }, [drag]);

  const resolveDrag = (event: MouseEvent | TouchEvent, node: Node) => {
    const origin = dragOriginRef.current;
    if (!origin) return null;
    const draggedId = node.id;
    const branchIds = collectDescendants(map, draggedId);
    const isDetached = map.nodes.find((n) => n.id === draggedId)?.detached === true;
    // A detached node drops onto a tree like normal; no modifier or mode needed.
    const wantsReparent = reparentMode || isDetached || ('altKey' in event && event.altKey);
    const parentEdge = map.edges.find((e) => e.targetId === draggedId);
    const targetId = wantsReparent
      ? findReparentTarget(
          node,
          baseNodes.filter((n) => !branchIds.has(n.id)),
          branchIds,
          parentEdge?.sourceId ?? null,
        )
      : null;
    const rawDx = node.position.x - origin.x;
    const rawDy = node.position.y - origin.y;
    const separated = separateBranchDelta(baseNodes, branchIds, rawDx, rawDy);
    return {
      draggedId,
      branchIds,
      dx: separated.dx,
      dy: separated.dy,
      targetId,
      reparenting: wantsReparent,
    } satisfies DragPreview;
  };

  const onNodeDragStart: OnNodeDrag = (_event, node) => {
    if (editingId) return;
    const domainNode = map.nodes.find((n) => n.id === node.id);
    if (!domainNode) return;
    dragCancelledRef.current = false;
    dragOriginRef.current = { x: domainNode.x, y: domainNode.y };
  };

  const onNodeDrag: OnNodeDrag = (event, node) => {
    if (dragCancelledRef.current) return;
    const next = resolveDrag(event, node);
    if (next) setDrag(next);
  };

  const onNodeDragStop: OnNodeDrag = (event, node) => {
    const cancelled = dragCancelledRef.current;
    const result = cancelled ? null : resolveDrag(event, node);
    dragOriginRef.current = null;
    dragCancelledRef.current = false;
    setDrag(null);
    if (!result) return;
    if (result.targetId) {
      onReparent(result.draggedId, result.targetId);
      return;
    }
    onCommitMove(result.draggedId, result.dx, result.dy);
  };

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onPaneClick={() => onSelect(null)}
      onEdgeClick={(_event, edge) => {
        if (edge.id.startsWith('mlink_')) onRemoveLink(edge.id.slice('mlink_'.length));
      }}
      onMoveEnd={onMoveEnd}
      onNodeDragStart={onNodeDragStart}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      nodeDragThreshold={isCoarsePointer() ? DRAG_THRESHOLD_TOUCH_PX : DRAG_THRESHOLD_PX}
      minZoom={0.35}
      maxZoom={1.8}
      panOnDrag
      panOnScroll
      zoomOnScroll
      zoomOnPinch
      selectionOnDrag={false}
      nodesConnectable={false}
      nodesDraggable
      proOptions={{ hideAttribution: true }}
      className="h-full w-full rounded-[20px] border border-line bg-[radial-gradient(circle,var(--color-dot)_1px,transparent_1px)] bg-size-[18px_18px] shadow-[inset_0_1px_3px_rgb(20_22_40/0.06)]"
    >
      <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="var(--color-dot)" />
      <p
        className={cn(
          'pointer-events-none absolute bottom-3 left-3 z-10 hidden items-center gap-3 rounded-full border border-line bg-panel px-3 py-1.5 text-xs text-muted shadow-float backdrop-blur-md motion-safe:transition-opacity motion-safe:duration-200 lg:[@media(any-pointer:fine)]:flex',
          // The action bar takes this spot while a node is selected.
          selectedId && 'opacity-0',
        )}
      >
        <span className="flex items-center gap-1.5">
          <kbd>Tab</kbd> child
        </span>
        <span className="flex items-center gap-1.5">
          <kbd>Enter</kbd> sibling
        </span>
        <span className="flex items-center gap-1.5">
          <kbd>F2</kbd> edit
        </span>
        <span className="flex items-center gap-1.5">
          Drag a node to move its branch
        </span>
        <span className="flex items-center gap-1.5">
          <kbd>⌥</kbd> drag to re-parent
        </span>
      </p>
      <button
        type="button"
        data-tour="reparent"
        aria-pressed={reparentMode}
        onClick={() => onReparentModeChange(!reparentMode)}
        className={cn(
          'absolute right-3 top-3 z-10 hidden min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium shadow-float backdrop-blur-md motion-safe:transition-colors motion-safe:duration-150 lg:flex',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          reparentMode
            ? 'border-accent bg-accent text-white'
            : 'border-line bg-panel text-muted hover:text-ink',
        )}
      >
        <GitFork className="size-3.5" aria-hidden />
        Re-parent
      </button>
      <p
        role="status"
        className={cn(
          'pointer-events-none absolute left-1/2 top-3 z-10 max-w-[min(32rem,80%)] -translate-x-1/2 truncate rounded-full border border-line bg-panel px-3.5 py-1.5 text-xs shadow-float backdrop-blur-md motion-safe:transition-opacity motion-safe:duration-150',
          drag ? 'opacity-100' : reparentMode ? 'opacity-100' : 'opacity-0',
        )}
      >
        {!drag && reparentMode
          ? 'Tap the node that should become its new parent · Esc to cancel'
          : !drag
            ? ''
            : drag.reparenting
            ? dragTargetText !== undefined
              ? `Release to move under “${dragTargetText || 'Untitled'}”`
              : 'Drop onto a node to make it the new parent · Esc to cancel'
            : 'Release to place the branch here · Esc to cancel'}
      </p>
    </ReactFlow>
  );
}

const MapFlow = forwardRef(MapFlowInner);

function MapCanvasWithProvider(props: Props, ref: React.ForwardedRef<MapCanvasHandle>) {
  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full touch-none overflow-hidden">
        <MapFlow ref={ref} {...props} />
      </div>
    </ReactFlowProvider>
  );
}

export const MapCanvas = forwardRef(MapCanvasWithProvider);
