import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { getMindMapNodeEditorHandlers } from '@/components/mind-map-node-editor-handlers';
import { branchColor } from '@/domain/colors';
import type { MindMapFlowNodeData } from '@/domain/flow-adapter';
import { nodeBounds } from '@/domain/node-geometry';
import { cn } from '@/lib/utils';

const HANDLES = [
  { id: 'left-in', type: 'target', position: Position.Left },
  { id: 'right-in', type: 'target', position: Position.Right },
  { id: 'left-out', type: 'source', position: Position.Left },
  { id: 'right-out', type: 'source', position: Position.Right },
] as const;

export function MindMapFlowNode({ id, data }: NodeProps<Node<MindMapFlowNodeData>>) {
  const { domainNode, isRoot, selected, editing, editText = '', dropTarget, lifted } = data;
  const handlers = getMindMapNodeEditorHandlers();
  const bounds = nodeBounds(domainNode, editing ? editText : undefined);
  const displayText = editing ? editText : domainNode.text;
  const accent = branchColor(domainNode.colorIndex);

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
        data-node
        className={cn(
          'flex min-h-11 cursor-grab flex-col justify-center rounded-2xl border px-3.5 py-2 motion-safe:transition-[box-shadow,transform,ring-width] motion-safe:duration-200 active:cursor-grabbing',
          isRoot ? 'border-transparent' : 'border-line',
          selected && 'ring-[3px] ring-accent ring-offset-2 ring-offset-surface',
          dropTarget && 'scale-[1.04] ring-[3px] ring-accent ring-offset-2 ring-offset-surface',
        )}
        style={{
          width: bounds.w,
          minHeight: bounds.h,
          background: isRoot ? 'var(--color-ink)' : 'var(--color-raised)',
          color: isRoot ? 'var(--color-surface)' : 'var(--color-ink)',
          boxShadow: isRoot
            ? lifted
              ? 'var(--shadow-float)'
              : 'var(--shadow-card)'
            : lifted
              ? `inset 4px 0 0 ${accent}, var(--shadow-float)`
              : `inset 4px 0 0 ${accent}, var(--shadow-card)`,
        }}
        title={domainNode.notes || undefined}
        onDoubleClick={() => handlers?.onEditStart(id)}
        onPointerDown={(e) => {
          e.stopPropagation();
          handlers?.onSelect(id);
        }}
      >
        {editing && handlers ? (
          <textarea
            autoFocus
            rows={Math.max(1, displayText.split('\n').length)}
            value={editText}
            onChange={(e) => handlers.setEditText(e.target.value)}
            onBlur={() => handlers.onEditEnd(id, handlers.editText)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handlers.onEditEnd(id, handlers.editText);
              }
              if (e.key === 'Escape') {
                handlers.onEditEnd(id, domainNode.text);
              }
            }}
            className={cn(
              'w-full resize-none rounded-md border-none px-1 text-base outline-none focus:ring-0',
              isRoot ? 'bg-white/10' : 'bg-sunken',
            )}
          />
        ) : (
          <span
            className={cn(
              'font-display leading-snug wrap-break-word whitespace-pre-wrap',
              isRoot ? 'text-base font-bold' : 'text-[15px] font-semibold',
            )}
          >
            {domainNode.kind === 'question' && (
              <span aria-label="Question" className="mr-1.5 font-bold opacity-70">?</span>
            )}
            {domainNode.text}
          </span>
        )}
      </div>
    </>
  );
}
