import { useEffect, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { Compass, Keyboard, Plus, Settings, Upload } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { BusyOverlay } from '@/components/BusyOverlay';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FolderFilter } from '@/components/FolderFilter';
import { ImportDialog } from '@/components/ImportDialog';
import { MapLibraryCard } from '@/components/MapLibraryCard';
import { PromptDialog } from '@/components/PromptDialog';
import { QuarantineButton } from '@/components/QuarantineDialog';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { AuthDialog } from '@/features/cloud/AuthDialog';
import { useCloudLibrary } from '@/features/cloud/useCloudLibrary';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { supabase } from '@/lib/supabase';
import { formatCount } from '@/lib/format';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { startLibraryTour, tourSeen, LIBRARY_TOUR_KEY } from '@/features/tour/start-tour';
import { useLibraryStore } from '@/stores/library-store';

type Busy = { title: string; message?: string } | null;

type PromptState =
  | { kind: 'folder' }
  | { kind: 'rename'; mapId: string; defaultValue: string }
  | null;

export function LibraryPage() {
  const navigate = useNavigate();
  const maps = useLibraryStore((s) => s.maps);
  const folders = useLibraryStore((s) => s.folders);
  const folderFilterId = useLibraryStore((s) => s.folderFilterId);
  const setFolderFilter = useLibraryStore((s) => s.setFolderFilter);
  const createMap = useLibraryStore((s) => s.createMap);
  const deleteMap = useLibraryStore((s) => s.deleteMap);
  const renameMapById = useLibraryStore((s) => s.renameMapById);
  const moveMapToFolder = useLibraryStore((s) => s.moveMapToFolder);
  const exportMapJson = useLibraryStore((s) => s.exportMapJson);
  const createFolder = useLibraryStore((s) => s.createFolder);

  const [importOpen, setImportOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [dropActive, setDropActive] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [prompt, setPrompt] = useState<PromptState>(null);
  const [deleteMapId, setDeleteMapId] = useState<string | null>(null);
  const [draggingMapId, setDraggingMapId] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const auth = useCloudLibrary();

  useEffect(() => {
    if (tourSeen(LIBRARY_TOUR_KEY)) return;
    const timer = window.setTimeout(() => startLibraryTour(), 500);
    return () => window.clearTimeout(timer);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const visibleMaps = !folderFilterId
    ? maps
    : maps.filter((m) => m.folderId === folderFilterId);

  const countByFolder = new Map<string, number>();
  for (const m of maps) {
    if (m.folderId) {
      countByFolder.set(m.folderId, (countByFolder.get(m.folderId) ?? 0) + 1);
    }
  }

  const deleteTarget = deleteMapId ? maps.find((m) => m.id === deleteMapId) : null;

  const openNew = () => {
    const id = createMap(undefined, folderFilterId);
    navigate(`/editor/${id}`);
  };

  useGlobalShortcuts({
    onNew: openNew,
    onOpen: () => setImportOpen(true),
    onSave: () => undefined,
    onHelp: () => setHelpOpen(true),
  });

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDropActive(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.json') || lower.endsWith('.pptx')) {
      setPendingFile(file);
      setImportOpen(true);
    } else {
      notify.error('Unsupported file', 'Drop a .json or .pptx file.');
    }
  };

  const handleLibraryDragStart = (event: DragStartEvent) => {
    if (event.active.data.current?.type === 'map') {
      setDraggingMapId(String(event.active.id));
    }
  };

  const handleLibraryDragEnd = (event: DragEndEvent) => {
    setDraggingMapId(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overData = over.data.current;
    if (activeData?.type !== 'map' || overData?.type !== 'folder') return;

    const mapId = activeData.mapId;
    const folderId = overData.folderId as string | null;
    const map = maps.find((m) => m.id === mapId);
    if (!map || map.folderId === folderId) return;

    moveMapToFolder(mapId, folderId);
    if (folderId === null) {
      notify.success('Moved out of folders', map.name);
    } else {
      const folderName = folders.find((f) => f.id === folderId)?.name ?? 'Folder';
      notify.success('Moved to folder', folderName);
    }
  };

  const draggingMap = draggingMapId ? maps.find((m) => m.id === draggingMapId) : null;

  const handleExportMap = (id: string, name: string) => {
    const json = exportMapJson(id);
    if (!json) {
      notify.error('Export failed', 'Map could not be read.');
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '-').toLowerCase() || 'map'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success('Exported', name);
  };

  return (
    <div
      className="h-full overflow-y-auto pt-[clamp(20px,4vh,44px)] pb-12"
      onDragOver={(event) => {
        if (![...event.dataTransfer.types].includes('Files')) return;
        event.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={handleDrop}
    >
      <div
        aria-hidden={!dropActive}
        className={cn(
          'pointer-events-none fixed inset-3 z-30 grid place-items-center rounded-[28px] border-2 border-dashed border-accent bg-[color-mix(in_srgb,var(--color-surface)_82%,transparent)] backdrop-blur-sm transition-opacity duration-150',
          dropActive ? 'opacity-100' : 'opacity-0',
        )}
      >
        <p className="type-title">Drop a .json or .pptx file to import</p>
      </div>
      <p className="sr-only" aria-live="polite">
        {dropActive ? 'Drop .json or .pptx to import' : ''}
      </p>
      <div className="mx-auto flex w-full max-w-270 flex-col gap-6 px-1 sm:px-0">
        <DndContext
          sensors={sensors}
          onDragStart={handleLibraryDragStart}
          onDragEnd={handleLibraryDragEnd}
        >
          <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="type-page" data-tour="library-title">Mind Maps</h1>
            <p className="type-meta">
              {formatCount(maps.length, 'map')}
              {auth.user ? `, saved to ${auth.user.email ?? 'your account'}` : ', on this device until you sign in'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {auth.user ? (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  void supabase.auth.signOut();
                }}
              >
                Sign out
              </Button>
            ) : (
              <Button type="button" size="sm" variant="primary" data-tour="sign-in" onClick={() => setAuthOpen(true)}>
                Sign in
              </Button>
            )}
            <QuarantineButton />
            <IconButton label="Settings" asChild>
              <Link to="/settings">
                <Settings />
              </Link>
            </IconButton>
            <IconButton label="Show the tour" onClick={() => startLibraryTour()}>
              <Compass />
            </IconButton>
            <IconButton label="Keyboard shortcuts" onClick={() => setHelpOpen(true)}>
              <Keyboard />
            </IconButton>
            <Button type="button" onClick={() => setImportOpen(true)}>
              <Upload />
              Import
            </Button>
            <Button type="button" variant="primary" data-tour="new-map" onClick={openNew}>
              <Plus />
              New map
            </Button>
          </div>
        </header>
        <FolderFilter
          folders={folders}
          activeId={folderFilterId}
          total={maps.length}
          countByFolder={countByFolder}
          onSelect={setFolderFilter}
          onCreate={() => setPrompt({ kind: 'folder' })}
        />
        {visibleMaps.length === 0 ? (
          <div className="page-enter flex flex-col items-start gap-4 rounded-[18px] border border-dashed border-line px-6 py-12 sm:items-center sm:text-center">
            <div className="flex flex-col gap-1.5">
              <h2 className="type-title">
                {folderFilterId ? 'This folder is empty' : 'No maps yet'}
              </h2>
              <p className="max-w-[44ch] text-sm text-muted">
                {folderFilterId
                  ? 'Create a map, or pick another folder to see its maps.'
                  : 'Start from a blank map, or import a JSON export or a PowerPoint deck.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="primary" onClick={openNew}>
                <Plus />
                New map
              </Button>
              <Button type="button" onClick={() => setImportOpen(true)}>
                <Upload />
                Import
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleMaps.map((map) => (
              <MapLibraryCard
                key={map.id}
                map={map}
                onOpen={() => navigate(`/editor/${map.id}`)}
                onRename={() => setPrompt({ kind: 'rename', mapId: map.id, defaultValue: map.name })}
                onExport={() => handleExportMap(map.id, map.name)}
                onDelete={() => setDeleteMapId(map.id)}
              />
            ))}
          </div>
        )}
          <DragOverlay dropAnimation={null}>
            {draggingMap ? (
              <div className="type-title max-w-[16rem] truncate rounded-[14px] border border-line bg-raised px-4 py-3 shadow-card-hover">
                {draggingMap.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
      <ImportDialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setPendingFile(null);
        }}
        initialFile={pendingFile}
        onImported={(id) => navigate(`/editor/${id}`)}
        onBusy={setBusy}
      />
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <BusyOverlay open={!!busy} title={busy?.title ?? ''} message={busy?.message} />
      <PromptDialog
        open={prompt?.kind === 'folder'}
        onOpenChange={(open) => {
          if (!open) setPrompt(null);
        }}
        title="New folder"
        description="Organize maps by project or course."
        label="Folder name"
        confirmLabel="Create"
        onConfirm={(name) => {
          createFolder(name);
          notify.success('Folder created', name);
        }}
      />
      <PromptDialog
        open={prompt?.kind === 'rename'}
        onOpenChange={(open) => {
          if (!open) setPrompt(null);
        }}
        title="Rename map"
        label="Map name"
        defaultValue={prompt?.kind === 'rename' ? prompt.defaultValue : ''}
        onConfirm={(name) => {
          if (prompt?.kind === 'rename') {
            renameMapById(prompt.mapId, name);
            notify.success('Renamed', name);
          }
        }}
      />
      <ConfirmDialog
        open={!!deleteMapId}
        onOpenChange={(open) => {
          if (!open) setDeleteMapId(null);
        }}
        title="Delete map?"
        description={
          deleteTarget
            ? `"${deleteTarget.name}" will be removed from this device. Export JSON first if you need a backup.`
            : 'This map will be removed from this device.'
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteMapId) {
            deleteMap(deleteMapId);
            notify.success('Map deleted');
            setDeleteMapId(null);
          }
        }}
      />
    </div>
  );
}
