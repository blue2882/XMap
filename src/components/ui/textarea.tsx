import * as React from 'react';
import { fieldClass } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(fieldClass, 'min-h-35 resize-y py-2.5 leading-snug', className)}
      {...props}
    />
  );
}
