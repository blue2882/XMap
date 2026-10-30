import { LayoutGrid, Maximize2, Minus, Palette, Plus } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

type EditorMapToolbarProps = {
  onZoom: (direction: 'in' | 'out') => void;
  onFit: () => void;
  onTidy: () => void;
  onCycleColor: () => void;
  cycleColorDisabled?: boolean;
  className?: string;
};

export function EditorMapToolbar({
  onZoom,
  onFit,
  onTidy,
  onCycleColor,
  cycleColorDisabled = false,
  className,
}: EditorMapToolbarProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-5 gap-0.5 rounded-full border border-line bg-raised p-0.5 shadow-[0_1px_1px_rgb(20_22_40/0.04)] sm:inline-grid sm:w-auto sm:grid-cols-none sm:auto-cols-fr sm:grid-flow-col',
        className,
      )}
      role="toolbar"
      aria-label="Map view controls"
    >
      <IconButton label="Zoom out" onClick={() => onZoom('out')}>
        <Minus />
      </IconButton>
      <IconButton label="Zoom in" onClick={() => onZoom('in')}>
        <Plus />
      </IconButton>
      <IconButton label="Fit map to view" onClick={onFit}>
        <Maximize2 />
      </IconButton>
      <IconButton label="Tidy layout" data-tour="tidy" onClick={onTidy}>
        <LayoutGrid />
      </IconButton>
      <IconButton label="Cycle branch color" disabled={cycleColorDisabled} onClick={onCycleColor}>
        <Palette />
      </IconButton>
    </div>
  );
}
