import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, Compass, Keyboard, Maximize2, Minimize2, PanelRight, Redo2, StickyNote, Undo2, Waypoints } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MapCanvas, type MapCanvasHandle } from '@/components/MapCanvas';
import { EditorMapToolbar } from '@/components/EditorMapToolbar';
import { DetachNodeButton } from '@/components/DetachNodeButton';
import { NotesDialog } from '@/components/NotesDialog';
import { NodeDetailsPanel } from '@/components/NodeDetailsPanel';
import { NodeSelectionBar } from '@/components/NodeSelectionBar';
import { ShortcutsDialog } from '@/components/ShortcutsDialog';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import {
  addChildNode,
  addSiblingNode,
  cycleNodeColor,
  deleteNode,
  neighborNodeId,
  relayoutMap,
  reparentNode,
  toggleNodeCollapsed,
  moveSubtree,
  updateNodeText,
  updateViewport,
} from '@/domain/map-edits';
import { addManualLink, removeManualLink } from '@/domain/manual-links';
import { setNodeDetached } from '@/domain/node-detach';
import { updateNodeNotes } from '@/domain/node-notes';
import { flushCloudSave } from '@/features/cloud/library-sync';
import { flushLibraryToDisk } from '@/features/persist/library-autosave';
import { useEditorAutosave } from '@/features/persist/useEditorAutosave';
import { useLoadEditorFromStore } from '@/hooks/useLoadEditorFromStore';
import { useEditorMap } from '@/hooks/useEditorMap';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { notify } from '@/lib/notify';
import { EDITOR_TOUR_KEY, startEditorTour, tourSeen } from '@/features/tour/start-tour';
import { useLibraryStore } from '@/stores/library-store';

const VIEWPORT_ZOOM_STEP = 1.12;
const VIEWPORT_SCALE_MIN = 0.35;
const VIEWPORT_SCALE_MAX = 1.8;

export function EditorPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();
  const stored = useLibraryStore((s) => s.maps.find((m) => m.id === mapId));
  const upsertMap = useLibraryStore((s) => s.upsertMap);

  const { map, commit, replace, undo, redo, canUndo, canRedo } = useEditorMap(
    stored ?? {
      id: mapId ?? '',
      name: 'Missing',
      rootId: '',
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, scale: 1 },
      folderId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [linkSourceId, setLinkSourceId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [reparentMode, setReparentMode] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<MapCanvasHandle>(null);
  const initialFitMapIdRef = useRef<string | null>(null);

  const selectedNode = map.nodes.find((n) => n.id === selectedId);

  useLoadEditorFromStore(stored, mapId, replace);

  useEffect(() => {
    if (!stored && mapId) navigate('/', { replace: true });
  }, [stored, mapId, navigate]);

  const save = () => {
    if (!stored) return;
    upsertMap(map);
    void flushLibraryToDisk().then(() =>
      flushCloudSave().then((result) => {
        if (result.error) {
          notify.error('Saved on this device. Supabase did not take the write.', result.error);
          return;
        }
        notify.success(result.saved ? 'Saved to your account' : 'Saved on this device', map.name);
      }),
    );
  };

  const fitToView = () => {
    canvasRef.current?.fitView();
  };

  const tidyLayout = () => {
    commit((prev) => relayoutMap(prev));
  };

  const storedMapId = stored?.id;

  useEffect(() => {
    if (!storedMapId) return;
    const el = canvasWrapRef.current;
    if (!el) return;

    const runInitialFit = () => {
      if (initialFitMapIdRef.current === storedMapId) return;
      if (el.clientWidth === 0 || el.clientHeight === 0) return;
      initialFitMapIdRef.current = storedMapId;
      canvasRef.current?.fitView(0);
    };

    runInitialFit();
    const observer = new ResizeObserver(runInitialFit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [storedMapId]);

  useEditorAutosave(map, !!stored, upsertMap);

  useEffect(() => {
    if (!stored || tourSeen(EDITOR_TOUR_KEY)) return;
    const timer = window.setTimeout(() => startEditorTour(), 600);
    return () => window.clearTimeout(timer);
  }, [stored]);

  const toggleFullscreen = async () => {
    const el = shellRef.current;
    if (!el) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await el.requestFullscreen();
  };

  useGlobalShortcuts({
    onSave: save,
    onFullscreen: () => {
      void toggleFullscreen();
    },
    onHelp: () => setHelpOpen(true),
    onTidy: tidyLayout,
    onFit: fitToView,
  });

  useEffect(() => {
    const handleEditorKeyDown = (event: KeyboardEvent) => {
      if (editingId) return;
      if (event.key === 'Escape' && reparentMode) {
        setReparentMode(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }

      if (!selectedId) return;

      if (event.key === 'Tab') {
        event.preventDefault();
        commit(addChildNode(map, selectedId).map);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        commit(addSiblingNode(map, selectedId).map);
      } else if (event.key === 'F2') {
        event.preventDefault();
        setEditingId(selectedId);
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        const next = deleteNode(map, selectedId);
        commit(next);
        setSelectedId(map.rootId);
      } else if (event.key === '0') {
        event.preventDefault();
        canvasRef.current?.fitView();
      } else if (event.key.toLowerCase() === 'l' && !mod) {
        event.preventDefault();
        commit((prev) => relayoutMap(prev));
      } else if (event.key.startsWith('Arrow')) {
        event.preventDefault();
        const dir =
          event.key === 'ArrowUp'
            ? 'up'
            : event.key === 'ArrowDown'
              ? 'down'
              : event.key === 'ArrowLeft'
                ? 'left'
                : 'right';
        const nextId = neighborNodeId(map, selectedId, dir);
        if (nextId) setSelectedId(nextId);
      }
    };

    window.addEventListener('keydown', handleEditorKeyDown);
    return () => window.removeEventListener('keydown', handleEditorKeyDown);
  }, [commit, editingId, map, redo, reparentMode, selectedId, undo]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const handleAddChild = () => {
    if (!selectedId) return;
    commit(addChildNode(map, selectedId).map);
  };

  const handleDeleteSelected = () => {
    if (!selectedId) return;
    const next = deleteNode(map, selectedId);
    commit(next);
    setSelectedId(map.rootId);
  };

  const handleCollapseToggle = () => {
    if (!selectedId) return;
    commit(toggleNodeCollapsed(map, selectedId));
  };

  const handleCycleColor = () => {
    if (!selectedId) return;
    commit((prev) => cycleNodeColor(prev, selectedId));
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const rect = canvasWrapRef.current?.getBoundingClientRect();
    const anchorX = rect ? rect.width / 2 : 0;
    const anchorY = rect ? rect.height / 2 : 0;
    const factor = direction === 'in' ? VIEWPORT_ZOOM_STEP : 1 / VIEWPORT_ZOOM_STEP;
    commit((prev) => {
      const nextScale = Math.min(
        VIEWPORT_SCALE_MAX,
        Math.max(VIEWPORT_SCALE_MIN, prev.viewport.scale * factor),
      );
      if (nextScale === prev.viewport.scale) return prev;
      const ratio = nextScale / prev.viewport.scale;
      return updateViewport(prev, {
        scale: nextScale,
        x: anchorX - (anchorX - prev.viewport.x) * ratio,
        y: anchorY - (anchorY - prev.viewport.y) * ratio,
      });
    });
  };

  const handleEditEnd = (id: string, text: string) => {
    setEditingId(null);
    commit((prev) => updateNodeText(prev, id, text));
  };

  const handleCommitMove = (id: string, dx: number, dy: number) => {
    commit((prev) => moveSubtree(prev, id, dx, dy));
  };

  const handleReparent = (nodeId: string, newParentId: string) => {
    const next = reparentNode(map, nodeId, newParentId);
    if (next === map) {
      notify.error('Cannot move there', 'A node cannot go under itself or its own branch, and the root cannot move.');
      return;
    }
    commit(next);
    setReparentMode(false);
  };

  const handleViewportChange = (viewport: { x: number; y: number; scale: number }) => {
    commit((prev) => updateViewport(prev, viewport));
  };

  const handleEditSelected = () => {
    if (selectedId) setEditingId(selectedId);
  };

  const handleFullscreenClick = () => {
    void toggleFullscreen();
  };

  return (
    <div
      ref={shellRef}
      className={
        fullscreen
          ? 'fixed inset-0 z-20 flex min-h-0 flex-col gap-3 bg-surface p-3'
          : 'flex h-full min-h-0 flex-col gap-3 py-3'
      }
    >
      <header className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 items-center gap-2 sm:mr-auto">
          <IconButton label="Back to library" variant="default" asChild>
            <Link to="/">
              <ArrowLeft />
            </Link>
          </IconButton>
          <h1 className="type-title min-w-0 flex-1 truncate text-xl sm:flex-none">{map.name}</h1>
        </div>
        <EditorMapToolbar
          className="w-full sm:order-3 sm:w-auto lg:order-0"
          onZoom={handleZoom}
          onFit={fitToView}
          onTidy={tidyLayout}
          onCycleColor={handleCycleColor}
          cycleColorDisabled={!selectedId}
        />
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="flex items-center rounded-full border border-line bg-raised p-0.5 shadow-[0_1px_1px_rgb(20_22_40/0.04)]">
            <IconButton label="Undo" disabled={!canUndo} onClick={undo}>
              <Undo2 />
            </IconButton>
            <IconButton label="Redo" disabled={!canRedo} onClick={redo}>
              <Redo2 />
            </IconButton>
            <IconButton
              label="Edit notes"
              disabled={!selectedId}
              className="max-lg:hidden"
              onClick={() => setNotesOpen(true)}
            >
              <StickyNote />
            </IconButton>
            <IconButton
              label={linkSourceId ? 'Cancel link' : 'Link to another node'}
              disabled={!selectedId && !linkSourceId}
              className="max-lg:hidden"
              onClick={() => setLinkSourceId((current) => (current ? null : selectedId))}
            >
              <Waypoints />
            </IconButton>
            <span className="max-lg:hidden">
              <DetachNodeButton
                detached={selectedNode?.detached === true}
                disabled={!selectedId || selectedId === map.rootId}
                onClick={() => {
                  if (!selectedId || selectedId === map.rootId) return;
                  commit(setNodeDetached(map, selectedId, selectedNode?.detached !== true));
                }}
              />
            </span>
          </div>
          <Button type="button" size="sm" variant="primary" data-tour="save" onClick={save}>
            <Check />
            Save
          </Button>
          <IconButton
            label={fullscreen ? 'Exit full screen' : 'Full screen'}
            variant="default"
            onClick={handleFullscreenClick}
          >
            {fullscreen ? <Minimize2 /> : <Maximize2 />}
          </IconButton>
          <IconButton
            label={detailsOpen ? 'Hide map details' : 'Show map details'}
            variant="default"
            aria-pressed={detailsOpen}
            data-tour="details-toggle"
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <PanelRight />
          </IconButton>
          <IconButton label="Show the tour" onClick={() => startEditorTour()}>
            <Compass />
          </IconButton>
          <IconButton
            label="Keyboard shortcuts"
            className="max-lg:hidden"
            onClick={() => setHelpOpen(true)}
          >
            <Keyboard />
          </IconButton>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 gap-3">
      <div
        ref={canvasWrapRef}
        data-tour="canvas"
        className="relative min-h-0 min-w-0 flex-1"
      >
        <MapCanvas
          ref={canvasRef}
          map={map}
          selectedId={selectedId}
          editingId={editingId}
          onSelect={(id) => {
            if (reparentMode && selectedId && id && id !== selectedId) {
              handleReparent(selectedId, id);
              return;
            }
            if (linkSourceId && id && id !== linkSourceId) {
              commit(addManualLink(map, linkSourceId, id));
              setLinkSourceId(null);
            }
            setSelectedId(id);
          }}
          onRemoveLink={(linkId) => commit(removeManualLink(map, linkId))}
          onEditStart={setEditingId}
          onToggleCollapse={(id) => commit((prev) => toggleNodeCollapsed(prev, id))}
          onEditEnd={handleEditEnd}
          onCommitMove={handleCommitMove}
          onReparent={handleReparent}
          onViewportChange={handleViewportChange}
          reparentMode={reparentMode}
          onReparentModeChange={setReparentMode}
        />
        <NodeSelectionBar
          selectedId={selectedId}
          collapsed={selectedNode?.collapsed}
          reparentActive={reparentMode}
          reparentDisabled={!selectedId || selectedId === map.rootId}
          onReparentToggle={() => setReparentMode((on) => !on)}
          onAddChild={handleAddChild}
          onEdit={handleEditSelected}
          onNotes={() => setNotesOpen(true)}
          onDetach={() => {
            if (!selectedId || selectedId === map.rootId) return;
            commit(setNodeDetached(map, selectedId, selectedNode?.detached !== true));
          }}
          detached={selectedNode?.detached === true}
          detachDisabled={!selectedId || selectedId === map.rootId}
          onDelete={handleDeleteSelected}
          onCollapseToggle={handleCollapseToggle}
        />
      </div>
      {detailsOpen && (
        <NodeDetailsPanel
          map={map}
          selectedId={selectedId}
          onCommit={commit}
          onClose={() => setDetailsOpen(false)}
          className={
            'motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300 ' +
            'max-lg:absolute max-lg:bg-raised max-lg:inset-x-0 max-lg:bottom-[calc(max(0.75rem,env(safe-area-inset-bottom,0px))+4.75rem)] max-lg:z-40 max-lg:max-h-[55%] max-lg:motion-safe:slide-in-from-bottom-8 ' +
            'lg:w-[300px] lg:shrink-0 lg:motion-safe:slide-in-from-right-8'
          }
        />
      )}
      </div>
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <NotesDialog
        open={notesOpen}
        onOpenChange={setNotesOpen}
        nodeLabel={selectedNode?.text ?? 'Node'}
        notes={selectedNode?.notes ?? ''}
        onSave={(notes) => {
          if (!selectedId) return;
          commit(updateNodeNotes(map, selectedId, notes));
        }}
      />
    </div>
  );
}
