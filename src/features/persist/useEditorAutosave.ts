import { useEffect, useRef } from 'react';
import type { MindMapDocument } from '@/domain/schemas';
import { flushLibraryToDisk } from '@/features/persist/library-autosave';

const EDITOR_FLUSH_DEBOUNCE_MS = 1500;
const EDITOR_FLUSH_HEARTBEAT_MS = 30_000;

export function useEditorAutosave(
  map: MindMapDocument,
  enabled: boolean,
  upsertMap: (map: MindMapDocument) => void,
) {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => {
      upsertMap(mapRef.current);
    }, EDITOR_FLUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [map, enabled, upsertMap]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      upsertMap(mapRef.current);
    }, EDITOR_FLUSH_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [enabled, upsertMap]);

  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      upsertMap(mapRef.current);
      void flushLibraryToDisk();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, upsertMap]);
}
