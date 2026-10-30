import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

type Shortcut = { keys: string[]; action: string };
type Group = { title: string; rows: Shortcut[] };

const GROUPS: Group[] = [
  {
    title: 'Library and files',
    rows: [
      { keys: ['⌘/Ctrl', 'N'], action: 'New map' },
      { keys: ['⌘/Ctrl', 'O'], action: 'Import' },
      { keys: ['⌘/Ctrl', 'S'], action: 'Save' },
      { keys: ['⇧', '⌘/Ctrl', 'F'], action: 'Toggle full-screen canvas' },
      { keys: ['⌘/Ctrl', '/'], action: 'Show shortcuts' },
    ],
  },
  {
    title: 'Editing a map',
    rows: [
      { keys: ['Tab'], action: 'Add child node' },
      { keys: ['Enter'], action: 'Add sibling node' },
      { keys: ['F2'], action: 'Edit node text (or double-click)' },
      { keys: ['Delete'], action: 'Delete node' },
      { keys: ['←', '↑', '↓', '→'], action: 'Move selection' },
      { keys: ['L'], action: 'Tidy layout' },
      { keys: ['⇧', '⌘/Ctrl', 'L'], action: 'Tidy layout' },
      { keys: ['0'], action: 'Fit map to view' },
      { keys: ['⌘/Ctrl', '0'], action: 'Fit map to view' },
      { keys: ['⌘/Ctrl', 'Z'], action: 'Undo' },
      { keys: ['⇧', '⌘/Ctrl', 'Z'], action: 'Redo' },
    ],
  },
];

type Props = { open: boolean; onOpenChange: (open: boolean) => void };

export function ShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Works on desktop and iPad with an external keyboard.</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh] pr-3">
          <div className="flex flex-col gap-5">
            {GROUPS.map((group) => (
              <section key={group.title} aria-label={group.title}>
                <h3 className="mb-1.5 text-[13px] font-semibold">{group.title}</h3>
                <ul className="flex flex-col divide-y divide-line text-sm">
                  {group.rows.map((row) => (
                    <li
                      key={`${row.action}-${row.keys.join('-')}`}
                      className="flex items-center justify-between gap-4 py-2"
                    >
                      <span>{row.action}</span>
                      <span className="flex shrink-0 gap-1">
                        {row.keys.map((key) => (
                          <kbd key={key}>{key}</kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="primary" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
