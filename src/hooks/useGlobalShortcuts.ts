import { useEffect } from 'react';

type Handlers = {
  onNew?: () => void;
  onOpen?: () => void;
  onSave?: () => void;
  onFullscreen?: () => void;
  onHelp?: () => void;
  onTidy?: () => void;
  onFit?: () => void;
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function useGlobalShortcuts(handlers: Handlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === 'n' && handlers.onNew) {
        event.preventDefault();
        handlers.onNew();
      } else if (key === 'o' && handlers.onOpen) {
        event.preventDefault();
        handlers.onOpen();
      } else if (key === 's' && handlers.onSave) {
        event.preventDefault();
        handlers.onSave();
      } else if (key === 'f' && event.shiftKey && handlers.onFullscreen) {
        event.preventDefault();
        handlers.onFullscreen();
      } else if ((key === '/' || event.key === '?') && handlers.onHelp) {
        event.preventDefault();
        handlers.onHelp();
      } else if (key === 'l' && event.shiftKey && handlers.onTidy) {
        event.preventDefault();
        handlers.onTidy();
      } else if (key === '0' && handlers.onFit) {
        event.preventDefault();
        handlers.onFit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, handlers]);
}
