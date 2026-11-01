import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { importWithAnthropic } from '@/features/import/ai-import';
import { redactApiKeyLikeText } from '@/features/import/ai-import-errors';
import { parseJsonImport } from '@/features/import/json-import';
import { extractPptxSlides, importPptxFile } from '@/features/import/pptx';
import { notify } from '@/lib/notify';
import type { MindMapDocument } from '@/domain/schemas';
import { useLibraryStore } from '@/stores/library-store';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFile?: File | null;
  onImported: (mapId: string) => void;
  onBusy: (busy: { title: string; message?: string } | null) => void;
};

export function ImportDialog({ open, onOpenChange, initialFile, onImported, onBusy }: Props) {
  const [jsonText, setJsonText] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [staleImport, setStaleImport] = useState<{
    map: MindMapDocument;
    existingName: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const apiKey = useLibraryStore((s) => s.settings.anthropicApiKey);
  const importMap = useLibraryStore((s) => s.importMap);

  const finish = (mapId: string, name: string) => {
    onOpenChange(false);
    setJsonText('');
    setPendingFile(null);
    setStaleImport(null);
    notify.success('Import complete', name);
    onImported(mapId);
  };

  const applyImport = (map: MindMapDocument, force = false) => {
    const result = importMap(map, force ? { force: true } : undefined);
    if (!result.ok) {
      if (result.reason === 'stale') {
        setStaleImport({ map, existingName: result.existingName });
      }
      return;
    }
    finish(result.id, map.name);
  };

  const aiMutation = useMutation({
    mutationFn: async (file: File) => {
      onBusy({ title: 'AI import', message: file.name });
      const slides = await extractPptxSlides(file);
      const map = await importWithAnthropic({
        apiKey,
        deckTitle: file.name.replace(/\.pptx$/i, ''),
        slides,
      });
      return map;
    },
    onSettled: () => onBusy(null),
  });

  const handleFile = (file: File | null) => {
    if (!file) return;
    setPendingFile(file);
  };

  const importJson = () => {
    try {
      const map = parseJsonImport(jsonText);
      applyImport(map);
    } catch (err) {
      notify.error('Invalid JSON', err instanceof Error ? err.message : 'Could not parse file.');
    }
  };

  const importBasicPptx = async () => {
    const file = pendingFile ?? initialFile;
    if (!file) return;
    try {
      onBusy({ title: 'Importing deck', message: file.name });
      const map = await importPptxFile(file);
      applyImport(map);
    } catch (err) {
      notify.error('Import failed', err instanceof Error ? err.message : 'Could not read deck.');
    } finally {
      onBusy(null);
    }
  };

  const importAiPptx = async () => {
    const file = pendingFile ?? initialFile;
    if (!file) return;
    if (!apiKey.trim()) {
      notify.error('API key required', 'Add your Anthropic key in Settings to run AI import.');
      return;
    }
    try {
      const map = await aiMutation.mutateAsync(file);
      applyImport(map);
    } catch (err) {
      const message =
        err instanceof Error ? redactApiKeyLikeText(err.message) : 'Request failed.';
      notify.error('AI import failed', message);
    }
  };

  const selectedFile = pendingFile ?? initialFile;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import decks or maps</DialogTitle>
          <DialogDescription>
            Drop a .pptx or .json file, paste exported JSON, or use AI to structure a deck.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>File</Label>
            <input
              ref={fileRef}
              type="file"
              accept=".json,.pptx,application/json"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="default" onClick={() => fileRef.current?.click()}>
                Choose file
              </Button>
              {selectedFile ? (
                <span className="text-sm text-muted">{selectedFile.name}</span>
              ) : (
                <span className="text-sm text-muted">No file selected</span>
              )}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="default"
                disabled={!selectedFile}
                onClick={() => void importBasicPptx()}
              >
                Import PPTX
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={!selectedFile || aiMutation.isPending}
                onClick={() => void importAiPptx()}
              >
                AI import (PPTX)
              </Button>
            </div>
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <Label htmlFor="json-import">Paste JSON</Label>
            <Textarea
              id="json-import"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='{"name":"My map", ...}'
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" variant="primary" disabled={!jsonText.trim()} onClick={importJson}>
            Import JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <AlertDialog open={staleImport != null} onOpenChange={(next) => !next && setStaleImport(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Replace newer map?</AlertDialogTitle>
          <AlertDialogDescription>
            {staleImport
              ? `"${staleImport.existingName}" in your library was edited more recently than this import. Replacing it will discard your newer changes.`
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep library version</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (staleImport) {
                applyImport(staleImport.map, true);
                setStaleImport(null);
              }
            }}
          >
            Replace anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
