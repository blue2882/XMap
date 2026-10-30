import { Button, type ButtonProps } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type Props = Omit<ButtonProps, 'aria-label'> & { label: string };

export function IconButton({ label, size = 'icon', variant = 'ghost', children, ...props }: Props) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" size={size} variant={variant} aria-label={label} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
