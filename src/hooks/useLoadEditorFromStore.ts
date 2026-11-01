import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { MindMapDocument } from '@/domain/schemas';
import { getCloudApplyGeneration, subscribeCloudApply } from '@/features/cloud/library-sync';

/**
 * Loads the library map into the editor once per route visit. Cloud applies reload
 * the open map so autosave does not push stale editor state over a remote update.
 */
export function useLoadEditorFromStore(
  stored: MindMapDocument | undefined,
  mapId: string | undefined,
  replace: (map: MindMapDocument) => void,
) {
  const loadedMapIdRef = useRef<string | null>(null);
  const lastCloudGenRef = useRef(getCloudApplyGeneration());
  const cloudGen = useSyncExternalStore(subscribeCloudApply, getCloudApplyGeneration, getCloudApplyGeneration);

  useEffect(() => {
    loadedMapIdRef.current = null;
    lastCloudGenRef.current = getCloudApplyGeneration();
  }, [mapId]);

  useEffect(() => {
    if (!stored || !mapId || stored.id !== mapId) return;
    if (loadedMapIdRef.current === mapId) return;
    loadedMapIdRef.current = mapId;
    lastCloudGenRef.current = getCloudApplyGeneration();
    replace(stored);
  }, [stored, mapId, replace]);

  useEffect(() => {
    if (!stored || !mapId || stored.id !== mapId) return;
    if (loadedMapIdRef.current !== mapId) return;
    if (cloudGen === lastCloudGenRef.current) return;
    lastCloudGenRef.current = cloudGen;
    replace(stored);
  }, [cloudGen, stored, mapId, replace]);
}
