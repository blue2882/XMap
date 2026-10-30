import { Link2, Unlink } from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';

type DetachNodeButtonProps = {
  detached: boolean;
  disabled: boolean;
  onClick: () => void;
};

export function DetachNodeButton({ detached, disabled, onClick }: DetachNodeButtonProps) {
  const label = detached ? 'Attach to root' : 'Detach from parent';

  return (
    <IconButton label={label} disabled={disabled} onClick={onClick}>
      {detached ? <Link2 /> : <Unlink />}
    </IconButton>
  );
}
