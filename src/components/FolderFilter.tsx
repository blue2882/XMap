import { useDroppable } from '@dnd-kit/core';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Folder } from '@/domain/schemas';
import { cn } from '@/lib/utils';

type Props = {
  folders: Folder[];
  activeId: string | null;
  total: number;
  countByFolder: ReadonlyMap<string, number>;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
};

type Option = { id: string | null; name: string; count: number };

function folderDroppableId(folderId: string | null): string {
  return folderId === null ? 'folder-all' : `folder-${folderId}`;
}

function FolderChip({
  option,
  active,
  onSelect,
}: {
  option: Option;
  active: boolean;
  onSelect: (id: string | null) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: folderDroppableId(option.id),
    data: { type: 'folder' as const, folderId: option.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'inline-flex rounded-full transition-shadow',
        isOver && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
      )}
    >
      <Button
        type="button"
        size="sm"
        variant={active ? 'primary' : 'ghost'}
        aria-pressed={active}
        onClick={() => onSelect(option.id)}
      >
        {option.name}
        <span className={active ? 'text-surface/60 tabular-nums' : 'text-muted tabular-nums'}>
          {option.count}
        </span>
      </Button>
    </div>
  );
}

export function FolderFilter({ folders, activeId, total, countByFolder, onSelect, onCreate }: Props) {
  const options: Option[] = [
    { id: null, name: 'All maps', count: total },
    ...folders.map((f) => ({ id: f.id, name: f.name, count: countByFolder.get(f.id) ?? 0 })),
  ];

  return (
    <nav aria-label="Folders" className="-mx-1 flex flex-wrap items-center gap-1.5">
      {options.map((option) => (
        <FolderChip
          key={option.id ?? 'all'}
          option={option}
          active={option.id === activeId}
          onSelect={onSelect}
        />
      ))}
      <Button type="button" size="sm" variant="ghost" className="text-muted" onClick={onCreate}>
        <Plus />
        New folder
      </Button>
    </nav>
  );
}
