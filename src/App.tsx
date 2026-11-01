import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PageTransitionLayout } from '@/components/PageTransitionLayout';
import { RouteFallback } from '@/components/RouteFallback';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useCloudLibrary } from '@/features/cloud/useCloudLibrary';
import { startLibraryAutosave, stopLibraryAutosave } from '@/features/persist/library-autosave';
import { ThemeProvider } from '@/providers/ThemeProvider';
import { useLibraryStore } from '@/stores/library-store';

const LibraryPage = lazy(() =>
  import('@/pages/LibraryPage').then((m) => ({ default: m.LibraryPage })),
);
const EditorPage = lazy(() =>
  import('@/pages/EditorPage').then((m) => ({ default: m.EditorPage })),
);
const SettingsPage = lazy(() =>
  import('@/pages/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);

export function App() {
  useCloudLibrary();
  useEffect(() => {
    startLibraryAutosave();
    let cancelled = false;
    if (import.meta.env.DEV) {
      void (async () => {
        await useLibraryStore.persist.rehydrate();
        if (cancelled) return;
        const { seedReferenceLibrary } = await import('@/features/dev/seed-reference-library');
        await seedReferenceLibrary();
      })();
    }
    return () => {
      cancelled = true;
      stopLibraryAutosave();
    };
  }, []);
  return (
    <BrowserRouter>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster position="top-center" richColors closeButton />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route element={<PageTransitionLayout />}>
                <Route path="/" element={<LibraryPage />} />
                <Route path="/editor/:mapId" element={<EditorPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
