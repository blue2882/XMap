import { useEffect, useRef } from 'react';
import type { MindMapDocument } from '@/domain/schemas';

/**
 * Loads the library map into the editor once per route visit. Store updates from
 * autosave or cloud sync must not call replace again or undo history is cleared.
 */
export function useLoadEditorFromStore(
  stored: MindMapDocument | undefined,
  mapId: string | undefined,
  replace: (map: MindMapDocument) => void,
) {
  const loadedMapIdRef = useRef<string | null>(null);

  useEffect(() => {
    loadedMapIdRef.current = null;
  }, [mapId]);

  useEffect(() => {
    if (!stored || !mapId || stored.id !== mapId) return;
    if (loadedMapIdRef.current === mapId) return;
    loadedMapIdRef.current = mapId;
    replace(stored);
  }, [stored, mapId, replace]);
}
