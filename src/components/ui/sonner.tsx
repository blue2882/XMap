import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useThemeMode } from '@/hooks/useThemeMode';

export function Toaster(props: ToasterProps) {
  const mode = useThemeMode();
  return (
    <Sonner
      theme={mode === 'dark' ? 'dark' : 'light'}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'glass-panel group toast group-[.toaster]:rounded-2xl group-[.toaster]:border-line group-[.toaster]:shadow-float',
          title: 'font-display font-semibold text-ink',
          description: 'text-muted text-sm',
          actionButton: 'rounded-full bg-ink text-surface',
          cancelButton: 'rounded-full border border-line',
          error: 'group-[.toaster]:border-[var(--color-branch-1)]',
        },
      }}
      {...props}
    />
  );
}
