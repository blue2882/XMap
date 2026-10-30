export type MindMapNodeEditorHandlers = {
  editingId: string | null;
  editText: string;
  setEditText: (text: string) => void;
  onEditStart: (id: string) => void;
  onEditEnd: (id: string, text: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
};

let editorHandlers: MindMapNodeEditorHandlers | null = null;

export function setMindMapNodeEditorHandlers(handlers: MindMapNodeEditorHandlers | null) {
  editorHandlers = handlers;
}

export function getMindMapNodeEditorHandlers(): MindMapNodeEditorHandlers | null {
  return editorHandlers;
}
