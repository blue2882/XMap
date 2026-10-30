import { useEffect } from 'react';
import { useLibraryStore } from '@/stores/library-store';
import type { ThemePreference } from '@/domain/schemas';

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return systemPrefersDark() ? 'dark' : 'light';
  }
  return preference;
}

export function useTheme() {
  const themePref = useLibraryStore((s) => s.settings.theme);
  const setTheme = useLibraryStore((s) => s.setTheme);

  const resolved = resolveTheme(themePref);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.dataset.theme = resolved;
  }, [resolved]);

  useEffect(() => {
    if (themePref !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      document.documentElement.classList.toggle('dark', mq.matches);
      document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light';
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [themePref]);

  return { themePref, setTheme, resolved };
}
