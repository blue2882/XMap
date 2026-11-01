import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { MoreHorizontal } from 'lucide-react';
import { MapPreview } from '@/components/MapPreview';
import { IconButton } from '@/components/ui/icon-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MindMapDocument } from '@/domain/schemas';
import { formatCount, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

type Props = {
  map: MindMapDocument;
  onOpen: () => void;
  onRename: () => void;
  onExport: () => void;
  onDelete: () => void;
};

export function MapLibraryCard({ map, onOpen, onRename, onExport, onDelete }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: map.id,
    data: { type: 'map' as const, mapId: map.id },
  });

  const dragStyle = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <article
      ref={setNodeRef}
      style={dragStyle}
      className={cn(
        'group relative flex min-w-0 flex-col overflow-hidden rounded-[18px] border border-line bg-raised shadow-card transition-[box-shadow,border-color,opacity] duration-200 has-[[data-open]:focus-visible]:ring-2 has-[[data-open]:focus-visible]:ring-accent hover:border-ink/25 hover:shadow-card-hover',
        isDragging && 'z-20 opacity-40',
      )}
    >
      <div
        className="relative aspect-16/10 cursor-grab bg-sunken bg-[radial-gradient(circle,var(--color-dot)_1px,transparent_1px)] bg-size-[14px_14px] active:cursor-grabbing"
        {...listeners}
        {...attributes}
      >
        <div className="pointer-events-none absolute inset-5">
          <MapPreview map={map} />
        </div>
        <div className="absolute top-2 right-2 z-10 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100 has-data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label="Map actions" variant="default">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
              <DropdownMenuItem onSelect={onExport}>Export JSON</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex flex-col gap-1 px-4 pt-3 pb-4">
        <button
          type="button"
          data-open
          onClick={onOpen}
          className="type-title line-clamp-2 text-left outline-none after:absolute after:inset-0 after:content-['']"
        >
          {map.name}
        </button>
        <p className="type-meta flex items-baseline justify-between gap-3">
          <time dateTime={map.updatedAt} title={new Date(map.updatedAt).toLocaleString()}>
            {formatRelative(map.updatedAt)}
          </time>
          <span>{formatCount(map.nodes.length, 'node')}</span>
        </p>
      </div>
    </article>
  );
}
