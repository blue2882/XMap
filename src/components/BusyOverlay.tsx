import type { ReactNode } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  open: boolean;
  title: string;
  message?: ReactNode;
};

export function BusyOverlay({ open, title, message }: Props) {
  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        hideClose
        className="max-w-105"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {message ? <DialogDescription>{message}</DialogDescription> : null}
        </DialogHeader>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <i className="block h-full w-[30%] rounded-full bg-(--color-branch-0) animate-busy-slide" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
