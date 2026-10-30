import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight, Link2, Pencil, Plus, StickyNote, Trash2, Unlink } from 'lucide-react';
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
  collapsed = false,
  className,
}: NodeSelectionBarProps) {
  if (!selectedId) {
    return null;
  }

  const collapseActionLabel = collapsed ? 'Expand branch' : 'Collapse branch';
  const collapseShortLabel = collapsed ? 'Expand' : 'Collapse';

  return (
    <div
      role="toolbar"
      aria-label="Selected node actions"
      data-tour="node-actions"
      className={cn(
        'glass-panel fixed inset-x-3 bottom-3 z-30 mx-auto max-w-xl items-stretch justify-around gap-1 rounded-[22px] px-2 py-2 shadow-float',
        'pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]',
        'hidden max-lg:flex [@media(any-pointer:coarse)]:flex',
        className,
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
  );
}

type ToolbarButtonProps = {
  label: string;
  shortLabel: string;
  onClick: () => void;
  variant?: 'ghost' | 'destructive';
  disabled?: boolean;
  children: ReactNode;
};

function ToolbarButton({
  label,
  shortLabel,
  onClick,
  variant = 'ghost',
  disabled = false,
  children,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant={variant}
      disabled={disabled}
      className="h-auto min-h-13 min-w-17 flex-col gap-1 rounded-2xl border-transparent px-2 py-2 text-[11px] leading-tight font-medium [&_svg]:size-5"
      aria-label={label}
      onClick={onClick}
    >
      {children}
      <span>{shortLabel}</span>
    </Button>
  );
}
