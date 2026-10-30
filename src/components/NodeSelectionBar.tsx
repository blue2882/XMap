import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, GitFork, Link2, Pencil, Plus, StickyNote, Trash2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type NodeSelectionBarProps = {
  selectedId: string | null;
  onAddChild: () => void;
  onEdit: () => void;
  onNotes: () => void;
  onDetach: () => void;
  detached?: boolean;
  detachDisabled?: boolean;
  onDelete: () => void;
  onCollapseToggle: () => void;
  reparentActive?: boolean;
  reparentDisabled?: boolean;
  onReparentToggle?: () => void;
  collapsed?: boolean;
  className?: string;
};

export function NodeSelectionBar({
  selectedId,
  onAddChild,
  onEdit,
  onNotes,
  onDetach,
  detached = false,
  detachDisabled = false,
  onDelete,
  onCollapseToggle,
  reparentActive = false,
  reparentDisabled = false,
  onReparentToggle,
  collapsed = false,
  className,
}: NodeSelectionBarProps) {
  const visible = selectedId !== null;
  const collapseActionLabel = collapsed ? 'Expand branch' : 'Collapse branch';
  const collapseShortLabel = collapsed ? 'Expand' : 'Collapse';

  return (
    // Zero-height overlay: the bar floats over the canvas and reserves no layout space.
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] z-30 flex justify-center px-3',
        className,
      )}
    >
    <div
      role="toolbar"
      aria-label="Selected node actions"
      aria-hidden={!visible}
      inert={!visible}
      data-tour="node-actions"
      data-state={visible ? 'open' : 'closed'}
      className={cn(
        'glass-panel pointer-events-auto flex w-max max-w-full snap-x snap-mandatory gap-0.5 overflow-x-auto overscroll-x-contain rounded-[22px] border border-ink/15 bg-panel/95 p-1.5 shadow-float backdrop-blur-md',
        'motion-safe:transition-[transform,opacity] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]',
        'focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/30',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-[calc(100%+1.5rem)] opacity-0',
      )}
    >
      <ToolbarButton label="Add child" shortLabel="Add" onClick={onAddChild}>
        <Plus />
      </ToolbarButton>
      <ToolbarButton label="Edit label" shortLabel="Edit" onClick={onEdit}>
        <Pencil />
      </ToolbarButton>
      <ToolbarButton label="Edit notes" shortLabel="Notes" onClick={onNotes}>
        <StickyNote />
      </ToolbarButton>
      {onReparentToggle ? (
        <ToolbarButton
          label={reparentActive ? 'Cancel move' : 'Move under another node'}
          shortLabel="Move"
          onClick={onReparentToggle}
          disabled={reparentDisabled}
          pressed={reparentActive}
        >
          <GitFork />
        </ToolbarButton>
      ) : null}
      <ToolbarButton
        label={detached ? 'Attach to root' : 'Detach from parent'}
        shortLabel={detached ? 'Attach' : 'Detach'}
        onClick={onDetach}
        disabled={detachDisabled}
      >
        {detached ? <Link2 /> : <Unlink />}
      </ToolbarButton>
      <ToolbarButton
        label={collapseActionLabel}
        shortLabel={collapseShortLabel}
        onClick={onCollapseToggle}
      >
        {collapsed ? <ChevronRight /> : <ChevronDown />}
      </ToolbarButton>
      <ToolbarButton label="Delete node" shortLabel="Delete" variant="destructive" onClick={onDelete}>
        <Trash2 />
      </ToolbarButton>
    </div>
    </div>
  );
}

type ToolbarButtonProps = {
  label: string;
  shortLabel: string;
  onClick: () => void;
  variant?: 'ghost' | 'destructive';
  disabled?: boolean;
  pressed?: boolean;
  children: ReactNode;
};

function ToolbarButton({
  label,
  shortLabel,
  onClick,
  variant = 'ghost',
  disabled = false,
  pressed = false,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant={pressed ? 'primary' : variant}
      disabled={disabled}
      aria-pressed={pressed}
      className="h-auto min-h-11 min-w-[4.25rem] shrink-0 snap-start flex-col gap-1 rounded-2xl border-transparent px-2.5 py-2 text-[11px] leading-tight font-medium touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent active:scale-95 motion-safe:transition-transform [&_svg]:size-5"
      aria-label={label}
      onClick={onClick}
    >
      {children}
      <span>{shortLabel}</span>
    </Button>
  );
}
