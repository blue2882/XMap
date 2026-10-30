import { useEffect, useMemo, useState } from 'react';
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
import type { QuarantinedMap } from '@/domain/library-migration';
import { quarantineEntryName, readQuarantineList } from '@/domain/quarantine';
import { useLibraryStore } from '@/stores/library-store';

type QuarantineDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function QuarantineDialog({ open, onOpenChange }: QuarantineDialogProps) {
  const quarantineRevision = useLibraryStore((s) => s.quarantineRevision);
  const restoreFromQuarantine = useLibraryStore((s) => s.restoreFromQuarantine);
  const dismissFromQuarantine = useLibraryStore((s) => s.dismissFromQuarantine);
  const [entries, setEntries] = useState<QuarantinedMap[]>(() => readQuarantineList());
  const [restoreErrors, setRestoreErrors] = useState<Record<number, string>>({});

  useEffect(() => {
    if (!open) return;
    setEntries(readQuarantineList());
    setRestoreErrors({});
  }, [open, quarantineRevision]);

  const handleRestore = (index: number) => {
    const result = restoreFromQuarantine(index);
    if (result.ok) {
      setRestoreErrors((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
      return;
    }
    setRestoreErrors((prev) => ({ ...prev, [index]: result.reason }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Maps that could not load</DialogTitle>
          <DialogDescription>
            These maps were kept aside during an update. Restore imports them into your library, or
            dismiss to remove them from this list.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[50vh] pr-3">
          <ul className="flex flex-col divide-y divide-line">
            {entries.map((entry, index) => {
              const reason = restoreErrors[index] ?? entry.reason;
              return (
                <li key={`${index}-${quarantineEntryName(entry.raw)}`} className="flex flex-col gap-2 py-3">
                  <div>
                    <p className="text-sm font-medium">{quarantineEntryName(entry.raw)}</p>
                    <p className="text-sm text-muted">{reason}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="primary" onClick={() => handleRestore(index)}>
                      Restore
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => dismissFromQuarantine(index)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
        <DialogFooter>
          <Button type="button" variant="default" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function QuarantineButton() {
  const quarantineRevision = useLibraryStore((s) => s.quarantineRevision);
  const [open, setOpen] = useState(false);
  const count = useMemo(() => readQuarantineList().length, [quarantineRevision]);

  useEffect(() => {
    if (count === 0) setOpen(false);
  }, [count]);

  if (count === 0) return null;

  return (
    <>
      <Button type="button" size="sm" variant="default" onClick={() => setOpen(true)}>
        Recover maps ({count})
      </Button>
      <QuarantineDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
