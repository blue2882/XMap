import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ArrowDown, ArrowUp, ImageOff, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { fieldClass } from '@/components/ui/input';
import { BRANCH_COLORS } from '@/domain/colors';
import { updateNodeText } from '@/domain/map-edits';
import {
  canMoveSibling,
  mainBranchId,
  MAX_NODE_IMAGE_BYTES,
  moveSibling,
  parentIdOf,
  setBranchColor,
  setNodeColor,
  setNodeImage,
  setNodeKind,
} from '@/domain/node-details';
import { updateNodeNotes } from '@/domain/node-notes';
import type { MindMapDocument } from '@/domain/schemas';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

type Commit = (update: (prev: MindMapDocument) => MindMapDocument) => void;

type Props = {
  map: MindMapDocument;
  selectedId: string | null;
  onCommit: Commit;
  onClose: () => void;
  className?: string;
};

const DEFAULT_CUSTOM_COLOR = '#7c8da6';
const COLOR_COMMIT_DELAY_MS = 350;

const labelClass = 'font-mono text-[11px] font-medium tracking-[0.1em] text-muted uppercase';

function kindLabel(map: MindMapDocument, nodeId: string | null): string {
  if (!nodeId) return 'Nothing selected';
  const node = map.nodes.find((n) => n.id === nodeId);
  if (!node) return 'Nothing selected';
  if (nodeId === map.rootId) return 'Central topic';
  if (parentIdOf(map, nodeId) === map.rootId) return 'Main branch';
  return node.kind === 'question' ? 'Self-check question' : 'Idea';
}

export function NodeDetailsPanel({ map, selectedId, onCommit, onClose, className }: Props) {
  const node = selectedId ? map.nodes.find((n) => n.id === selectedId) : undefined;
  const isRoot = node?.id === map.rootId;
  const branchId = node ? mainBranchId(map, node.id) : null;
  const branchColorIndex = branchId ? map.nodes.find((n) => n.id === branchId)?.colorIndex : undefined;
  const canBeQuestion = !!node && !isRoot && parentIdOf(map, node.id) !== map.rootId;

  const handleImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!node || !file) return;
    if (!file.type.startsWith('image/')) {
      notify.error('Choose an image file');
      return;
    }
    if (file.size > MAX_NODE_IMAGE_BYTES) {
      notify.error('Image is too large', 'Pick one smaller than 1.8 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        const image = reader.result;
        onCommit((prev) => setNodeImage(prev, node.id, image));
      }
    };
    reader.onerror = () => notify.error('Could not read that image');
    reader.readAsDataURL(file);
  };

  return (
    <aside
      aria-label="Node details"
      data-tour="details"
      className={cn(
        'glass-panel flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto overscroll-contain rounded-[20px] border border-ink/15 bg-panel p-3.5 shadow-float backdrop-blur-md',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 className={labelClass}>{kindLabel(map, selectedId)}</h2>
        <IconButton label="Close details" size="icon-sm" onClick={onClose}>
          <X />
        </IconButton>
      </div>

      {/* key remounts the draft when the node, or its stored value, changes elsewhere (undo, inline edit). */}
      <TextDraft
        key={`title:${node?.id}:${node?.text}`}
        label="Title"
        value={node?.text ?? ''}
        disabled={!node}
        onCommit={(text) => node && onCommit((prev) => updateNodeText(prev, node.id, text))}
      />
      <TextDraft
        key={`notes:${node?.id}:${node?.notes}`}
        label="Notes"
        multiline
        value={node?.notes ?? ''}
        placeholder="Add detail, an example or the answer to a question."
        disabled={!node}
        onCommit={(notes) => node && onCommit((prev) => updateNodeNotes(prev, node.id, notes))}
      />

      <label className="flex min-h-9 cursor-pointer items-center gap-2.5 text-sm">
        <input
          type="checkbox"
          className="size-[22px] cursor-pointer accent-accent disabled:cursor-not-allowed"
          checked={node?.kind === 'question'}
          disabled={!canBeQuestion}
          onChange={(event) =>
            node &&
            onCommit((prev) => setNodeKind(prev, node.id, event.target.checked ? 'question' : 'topic'))
          }
        />
        Self-check question
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={labelClass}>Branch color</span>
        <div className="flex flex-wrap gap-2.5" role="group" aria-label="Branch color">
          {BRANCH_COLORS.map((color, index) => (
            <button
              key={color}
              type="button"
              aria-label={`Branch color ${index + 1}`}
              aria-pressed={branchColorIndex === index}
              disabled={!branchId}
              onClick={() => node && onCommit((prev) => setBranchColor(prev, node.id, index))}
              className={cn(
                'size-[34px] cursor-pointer rounded-full border-2 border-panel p-0 shadow-[0_0_0_1px_var(--color-line)]',
                'motion-safe:transition-[box-shadow,transform] motion-safe:duration-150 active:scale-90',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                'aria-pressed:shadow-[0_0_0_3px_var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-30',
              )}
              style={{ background: color }}
            />
          ))}
        </div>
      </div>

      <CustomColorField
        key={`color:${node?.id}`}
        value={node?.color}
        disabled={!node}
        onCommit={(color) => node && onCommit((prev) => setNodeColor(prev, node.id, color))}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="node-picture" className={labelClass}>
          Node picture
        </label>
        <input
          id="node-picture"
          type="file"
          accept="image/*"
          disabled={!node}
          onChange={handleImage}
          className="w-full cursor-pointer text-sm file:mr-2 file:cursor-pointer file:rounded-full file:border file:border-line file:bg-raised file:px-3 file:py-1.5 file:text-sm file:text-ink disabled:opacity-40"
        />
        <Button
          type="button"
          size="sm"
          disabled={!node?.image}
          onClick={() => node && onCommit((prev) => setNodeImage(prev, node.id, undefined))}
        >
          <ImageOff />
          Remove picture
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!node || !canMoveSibling(map, node.id, -1)}
          onClick={() => node && onCommit((prev) => moveSibling(prev, node.id, -1))}
        >
          <ArrowUp />
          Move up
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!node || !canMoveSibling(map, node.id, 1)}
          onClick={() => node && onCommit((prev) => moveSibling(prev, node.id, 1))}
        >
          <ArrowDown />
          Move down
        </Button>
      </div>
    </aside>
  );
}

type TextDraftProps = {
  label: string;
  value: string;
  disabled: boolean;
  multiline?: boolean;
  placeholder?: string;
  onCommit: (value: string) => void;
};

/** Edits locally and commits once on blur, so one edit is one undo step. */
function TextDraft({ label, value, disabled, multiline = false, placeholder, onCommit }: TextDraftProps) {
  const [draft, setDraft] = useState(value);
  const id = `node-${label.toLowerCase()}`;
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', multiline && 'min-h-32 flex-1')}>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          value={draft}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          className={cn(fieldClass, 'min-h-28 flex-1 resize-none py-2.5 leading-snug disabled:opacity-50')}
        />
      ) : (
        <input
          id={id}
          type="text"
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className={cn(fieldClass, 'min-h-[42px] py-2 disabled:opacity-50')}
        />
      )}
    </div>
  );
}

type CustomColorFieldProps = {
  value: string | undefined;
  disabled: boolean;
  onCommit: (color: string | undefined) => void;
};

/** The native picker fires continuously while dragging; commit once it settles. */
function CustomColorField({ value, disabled, onCommit }: CustomColorFieldProps) {
  const [draft, setDraft] = useState(value ?? DEFAULT_CUSTOM_COLOR);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<string | null>(null);
  const commitRef = useRef(onCommit);

  useEffect(() => {
    commitRef.current = onCommit;
  });

  useEffect(
    () => () => {
      // Flush an unsettled pick if the panel unmounts or the node changes.
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (pendingRef.current) commitRef.current(pendingRef.current);
    },
    [],
  );

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setDraft(next);
    pendingRef.current = next;
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      pendingRef.current = null;
      onCommit(next);
    }, COLOR_COMMIT_DELAY_MS);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="node-custom-color" className={labelClass}>
        Custom node color
      </label>
      <div className="flex items-center gap-2">
        <input
          id="node-custom-color"
          type="color"
          value={draft}
          disabled={disabled}
          onChange={handleChange}
          className="h-[38px] w-full cursor-pointer rounded-lg border border-line bg-raised p-1 disabled:cursor-not-allowed disabled:opacity-40"
        />
        <IconButton
          label="Reset to branch color"
          size="icon-sm"
          disabled={disabled || !value}
          onClick={() => {
            pendingRef.current = null;
            setDraft(DEFAULT_CUSTOM_COLOR);
            onCommit(undefined);
          }}
        >
          <RotateCcw />
        </IconButton>
      </div>
    </div>
  );
}
