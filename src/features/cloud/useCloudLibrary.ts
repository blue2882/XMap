import { useEffect, useSyncExternalStore } from 'react';
import { getAuthSnapshot, startCloudSync, subscribeAuth } from '@/features/cloud/library-sync';

export function useCloudLibrary() {
  useEffect(() => {
    startCloudSync();
  }, []);

  return useSyncExternalStore(subscribeAuth, getAuthSnapshot, getAuthSnapshot);
}
