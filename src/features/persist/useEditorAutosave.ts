import { useEffect, useRef } from 'react';
import type { MindMapDocument } from '@/domain/schemas';
import { flushLibraryToDisk } from '@/features/persist/library-autosave';
import { useLibraryStore } from '@/stores/library-store';

const EDITOR_FLUSH_DEBOUNCE_MS = 1500;
const EDITOR_FLUSH_HEARTBEAT_MS = 30_000;

const parseUpdatedAtMs = (iso: string): number => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
};

const shouldSkipUpsertForNewerStoreMap = (editorMap: MindMapDocument): boolean => {
  const storeMap = useLibraryStore.getState().maps.find((map) => map.id === editorMap.id);
  if (!storeMap) return false;
  return parseUpdatedAtMs(storeMap.updatedAt) > parseUpdatedAtMs(editorMap.updatedAt);
};

export function useEditorAutosave(
  map: MindMapDocument,
  enabled: boolean,
  upsertMap: (map: MindMapDocument) => void,
) {
  const mapRef = useRef(map);
  mapRef.current = map;

  const upsertIfNotStale = () => {
    const current = mapRef.current;
    if (shouldSkipUpsertForNewerStoreMap(current)) return;
    upsertMap(current);
  };

  useEffect(() => {
    if (!enabled) return;
    const id = window.setTimeout(() => {
      upsertIfNotStale();
    }, EDITOR_FLUSH_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [map, enabled, upsertMap]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      upsertIfNotStale();
    }, EDITOR_FLUSH_HEARTBEAT_MS);
    return () => window.clearInterval(id);
  }, [enabled, upsertMap]);

  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      upsertIfNotStale();
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
