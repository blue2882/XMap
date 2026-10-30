import type { MindMapDocument } from '@/domain/schemas';

export function updateNodeNotes(
  map: MindMapDocument,
  nodeId: string,
  notes: string,
): MindMapDocument {
  if (!map.nodes.some((n) => n.id === nodeId)) {
    return map;
  }
  return {
    ...map,
    updatedAt: new Date().toISOString(),
    nodes: map.nodes.map((n) => (n.id === nodeId ? { ...n, notes } : n)),
  };
}
