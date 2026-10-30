import { useEffect, useState } from 'react';

export function useThemeMode(): 'light' | 'dark' {
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  );

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => {
      setMode(root.classList.contains('dark') ? 'dark' : 'light');
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  return mode;
}
