import { createId } from '@/lib/id';
import type { MindMapDocument } from '@/domain/schemas';

const DEFAULT_VIEWPORT = { x: 0, y: 0, scale: 1 };

export function createEmptyMap(name: string, folderId: string | null = null): MindMapDocument {
  const rootId = createId('node');
  const now = new Date().toISOString();
  return {
    id: createId('map'),
    name: name.trim() || 'Untitled map',
    rootId,
    nodes: [
      {
        id: rootId,
        text: name.trim() || 'Central idea',
        x: 0,
        y: 0,
        colorIndex: 0,
        collapsed: false,
      },
    ],
    edges: [],
    viewport: { ...DEFAULT_VIEWPORT },
    folderId,
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneMapDocument(map: MindMapDocument, newName?: string): MindMapDocument {
  const now = new Date().toISOString();
  const idMap = new Map<string, string>();
  for (const node of map.nodes) {
    idMap.set(node.id, createId('node'));
  }
  const newRootId = idMap.get(map.rootId) ?? createId('node');
  return {
    id: createId('map'),
    name: newName ?? `${map.name} copy`,
    rootId: newRootId,
    nodes: map.nodes.map((node) => ({
      ...node,
      id: idMap.get(node.id) ?? createId('node'),
    })),
    edges: map.edges.map((edge) => ({
      id: createId('edge'),
      sourceId: idMap.get(edge.sourceId) ?? edge.sourceId,
      targetId: idMap.get(edge.targetId) ?? edge.targetId,
    })),
    viewport: { ...map.viewport },
    folderId: map.folderId,
    createdAt: now,
    updatedAt: now,
  };
}
