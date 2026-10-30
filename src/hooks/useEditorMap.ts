import { useCallback, useReducer } from 'react';
import type { MindMapDocument } from '@/domain/schemas';

const MAX_UNDO = 80;

type EditorHistory = {
  past: MindMapDocument[];
  present: MindMapDocument;
  future: MindMapDocument[];
};

type EditorHistoryAction =
  | { type: 'commit'; next: MindMapDocument | ((prev: MindMapDocument) => MindMapDocument) }
  | { type: 'replace'; next: MindMapDocument }
  | { type: 'undo' }
  | { type: 'redo' };

export function editorHistoryReducer(state: EditorHistory, action: EditorHistoryAction): EditorHistory {
  switch (action.type) {
    case 'commit': {
      const resolved =
        typeof action.next === 'function' ? action.next(state.present) : action.next;
      if (resolved === state.present) return state;
      return {
        past: [...state.past.slice(-MAX_UNDO + 1), state.present],
        present: resolved,
        future: [],
      };
    }
    case 'replace':
      return { past: [], present: action.next, future: [] };
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        past: state.past.slice(0, -1),
        present: previous,
        future: [state.present, ...state.future],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        past: [...state.past, state.present],
        present: next,
        future: state.future.slice(1),
      };
    }
    default:
      return state;
  }
}

export function useEditorMap(initial: MindMapDocument) {
  const [state, dispatch] = useReducer(editorHistoryReducer, {
    past: [],
    present: initial,
    future: [],
  });

  const commit = useCallback(
    (next: MindMapDocument | ((prev: MindMapDocument) => MindMapDocument)) => {
      dispatch({ type: 'commit', next });
    },
    [],
  );

  const replace = useCallback((next: MindMapDocument) => {
    dispatch({ type: 'replace', next });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'undo' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'redo' });
  }, []);

  return {
    map: state.present,
    commit,
    replace,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
