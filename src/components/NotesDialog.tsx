import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';

export type NotesDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeLabel: string;
  notes: string;
  onSave: (notes: string) => void;
};

export function NotesDialog({
  open,
  onOpenChange,
  nodeLabel,
  notes,
  onSave,
}: NotesDialogProps) {
  const [draft, setDraft] = useState(notes);

  useEffect(() => {
    if (open) {
      setDraft(notes);
    }
  }, [open, notes]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{nodeLabel}</DialogTitle>
          <DialogDescription>Notes for this node. Saved on the map document.</DialogDescription>
        </DialogHeader>
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          aria-label="Node notes"
        />
        <DialogFooter>
          <Button type="button" variant="default" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
