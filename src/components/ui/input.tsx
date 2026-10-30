import * as React from 'react';
import { cn } from '@/lib/utils';

export const fieldClass =
  'w-full rounded-xl border border-line bg-raised px-3 text-[15px] text-ink shadow-[inset_0_1px_2px_rgb(20_22_40/0.05)] placeholder:text-muted/80 transition-[border-color,box-shadow] duration-150 focus:border-accent focus:ring-[3px] focus:ring-accent/25 focus:outline-none';

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return <input type={type} className={cn(fieldClass, 'min-h-[42px] py-2', className)} {...props} />;
}
