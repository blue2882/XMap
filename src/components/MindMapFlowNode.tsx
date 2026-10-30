import {
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { getMindMapNodeEditorHandlers } from '@/components/mind-map-node-editor-handlers';
import type { MindMapFlowNodeData } from '@/domain/flow-adapter';
import { nodeBounds } from '@/domain/node-geometry';
import { cn, isCoarsePointer } from '@/lib/utils';

const HANDLES = [
  { id: 'left-in', type: 'target', position: Position.Left },
  { id: 'right-in', type: 'target', position: Position.Right },
  { id: 'left-out', type: 'source', position: Position.Left },
  { id: 'right-out', type: 'source', position: Position.Right },
] as const;

const TAP_MOVE_THRESHOLD_SQ = 100;

const SHADOW_CARD = 'var(--shadow-card)';
const SHADOW_FLOAT = 'var(--shadow-float)';

type NodeRing = 'selected' | 'drop' | null;

const RING_COLOR: Record<'selected' | 'drop', string> = {
  // ink is near-white in dark mode and near-black in light mode, so the outline contrasts in both.
  selected: 'var(--color-ink)',
  drop: 'var(--color-accent)',
};

// Every call returns the same list shape (gap, ring, depth) so box-shadow
// transitions interpolate smoothly between selected and unselected.
const nodeShellBoxShadow = (lifted: boolean, ring: NodeRing): string => {
  const depth = lifted || ring === 'selected' ? SHADOW_FLOAT : SHADOW_CARD;
  const gap = ring ? '0 0 0 2px var(--color-surface)' : '0 0 0 0 var(--color-surface)';
  const outline = ring ? `0 0 0 4px ${RING_COLOR[ring]}` : '0 0 0 0 transparent';
  return `${gap}, ${outline}, ${depth}`;
};

type ShellInput = {
  bounds: { w: number; h: number };
  depth: number;
  color: string;
  isQuestion: boolean;
  lifted: boolean;
  ring: NodeRing;
};

/**
 * Depth sets the weight: the root is solid ink, main branches are solid colour,
 * everything below is a tinted card outlined in its branch colour.
 */
const nodeShellStyle = ({
  bounds,
  depth,
  color,
  isQuestion,
  lifted,
  ring,
}: ShellInput): CSSProperties => {
  const base: CSSProperties = {
    width: bounds.w,
    minHeight: bounds.h,
    borderWidth: 1.5,
    borderStyle: isQuestion ? 'dashed' : 'solid',
    boxShadow: nodeShellBoxShadow(lifted, ring),
  };
  if (depth === 0) {
    return { ...base, background: 'var(--color-ink)', color: 'var(--color-surface)', borderColor: 'var(--color-ink)' };
  }
  if (depth === 1 && !isQuestion) {
    return { ...base, background: color, color: 'var(--color-node-ink)', borderColor: color };
  }
  return {
    ...base,
    background: `color-mix(in srgb, ${color} ${isQuestion ? 6 : 14}%, var(--color-raised))`,
    color: 'var(--color-ink)',
    borderColor: color,
  };
};

const stopEditPointerPropagation = (event: PointerEvent<HTMLTextAreaElement>) => {
  event.stopPropagation();
};

const labelClass = (depth: number) =>
  cn(
    'wrap-break-word whitespace-pre-wrap',
    depth === 0 && 'font-display text-[17px] leading-tight font-bold text-center',
    depth === 1 && 'font-display text-[14.5px] leading-tight font-bold',
    depth > 1 && 'text-[13.5px] leading-snug font-medium',
  );

export function MindMapFlowNode({ id, data }: NodeProps<Node<MindMapFlowNodeData>>) {
  const {
    domainNode,
    isRoot,
    depth,
    side,
    color,
    descendantCount,
    hasChildren,
    selected,
    editing,
    editText = '',
    dropTarget,
    lifted,
  } = data;
  const handlers = getMindMapNodeEditorHandlers();
  const bounds = nodeBounds(domainNode, editing ? editText : undefined);
  const shellRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pointerRef = useRef<{ x: number; y: number; wasSelected: boolean } | null>(null);

  useLayoutEffect(() => {
    if (!editing || !handlers) return;
    const textarea = textareaRef.current;
    const shell = shellRef.current;
    if (!textarea || !shell) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
    handlers.setEditBoxHeight(shell.offsetHeight);
  }, [editText, editing, handlers]);

  const handleDoubleClick = () => {
    handlers?.onEditStart(id);
  };

  const handleShellPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (editing) return;
    event.stopPropagation();
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      wasSelected: selected,
    };
    handlers?.onSelect(id);
  };

  const handleShellPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (editing || !handlers || !pointerRef.current) return;
    const start = pointerRef.current;
    pointerRef.current = null;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    const tapped = dx * dx + dy * dy < TAP_MOVE_THRESHOLD_SQ;
    if (isCoarsePointer() && start.wasSelected && selected && tapped) {
      handlers.onEditStart(id);
    }
  };

  const handleEditChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    handlers?.setEditText(event.target.value);
  };

  const handleEditBlur = () => {
    if (!handlers) return;
    handlers.onEditEnd(id, handlers.editText);
  };

  const handleEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!handlers) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handlers.onEditEnd(id, handlers.editText);
    }
    if (event.key === 'Escape') {
      handlers.onEditEnd(id, domainNode.text);
    }
  };

  const ring: NodeRing = dropTarget ? 'drop' : selected && !editing ? 'selected' : null;
  const isQuestion = domainNode.kind === 'question' && !isRoot;
  const shellStyle = nodeShellStyle({
    bounds,
    depth,
    color,
    isQuestion,
    lifted: lifted === true,
    ring,
  });
  const solid = depth <= 1 && !isQuestion;
  const showToggle = hasChildren && !isRoot && !editing;
  const hasNotes = (domainNode.notes ?? '').trim().length > 0;

  return (
    <>
      {HANDLES.map((h) => (
        <Handle
          key={h.id}
          id={h.id}
          type={h.type}
          position={h.position}
          isConnectable={false}
          className="border-0! bg-transparent! opacity-0!"
        />
      ))}
      <div
        ref={shellRef}
        data-node
        className={cn(
          'relative flex min-h-11 flex-col justify-center px-3 py-2 motion-safe:transition-[box-shadow,transform] motion-safe:duration-200',
          depth === 0 ? 'rounded-[14px]' : depth === 1 ? 'rounded-[11px]' : 'rounded-[9px]',
          !editing && 'cursor-grab active:cursor-grabbing',
          editing && 'z-1000 cursor-text shadow-float',
          ring === 'selected' && 'node-select-pop',
          dropTarget && 'scale-[1.04]',
        )}
        style={shellStyle}
        title={domainNode.notes || undefined}
        onDoubleClick={handleDoubleClick}
        onPointerDown={handleShellPointerDown}
        onPointerUp={handleShellPointerUp}
      >
        {hasNotes && (
          <span
            aria-label="Has notes"
            className={cn(
              'pointer-events-none absolute -top-1 size-2 rounded-full border-2',
              side === 'left' ? '-left-1' : '-right-1',
            )}
            style={{
              background: solid ? 'var(--color-surface)' : color,
              borderColor: solid ? color : 'var(--color-surface)',
            }}
          />
        )}
        {domainNode.image && (
          <img
            src={domainNode.image}
            alt={`Picture for ${domainNode.text}`}
            draggable={false}
            className="mb-[7px] h-[100px] w-full rounded-lg object-contain"
          />
        )}
        {editing && handlers ? (
          <textarea
            ref={textareaRef}
            autoFocus
            rows={1}
            inputMode="text"
            enterKeyHint="done"
            autoCapitalize="sentences"
            autoCorrect="on"
            spellCheck
            value={editText}
            onChange={handleEditChange}
            onBlur={handleEditBlur}
            onPointerDown={stopEditPointerPropagation}
            onKeyDown={handleEditKeyDown}
            className={cn(
              'block w-full resize-none overflow-hidden rounded-md border-none px-1 outline-none focus:ring-0',
              labelClass(depth),
              depth === 0 ? 'bg-white/10' : 'bg-sunken',
            )}
          />
        ) : (
          <span className={labelClass(depth)}>
            {isQuestion && (
              <span
                className="mb-0.5 block font-mono text-[9px] font-medium tracking-[0.1em] uppercase"
                style={{ color }}
              >
                Check
              </span>
            )}
            {domainNode.text}
          </span>
        )}
        {showToggle && (
          <button
            type="button"
            aria-label={descendantCount > 0 && domainNode.collapsed ? 'Expand branch' : 'Collapse branch'}
            aria-expanded={!domainNode.collapsed}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              handlers?.onToggleCollapse(id);
            }}
            className={cn(
              'nodrag nopan absolute top-1/2 grid size-[26px] -translate-y-1/2 cursor-pointer place-items-center rounded-full border-[1.5px] bg-raised p-0 font-mono text-[11px] leading-none font-semibold',
              'before:absolute before:-inset-2 before:content-[""]',
              'motion-safe:transition-transform motion-safe:duration-150 active:scale-90',
              'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent',
              side === 'left' ? '-left-[15px]' : '-right-[15px]',
            )}
            style={{ borderColor: color, color }}
          >
            {domainNode.collapsed ? descendantCount : '−'}
          </button>
        )}
      </div>
    </>
  );
}
