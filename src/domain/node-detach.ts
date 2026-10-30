import type { MindMapDocument, MindMapEdge } from '@/domain/schemas';

function touch(map: MindMapDocument): MindMapDocument {
  return { ...map, updatedAt: new Date().toISOString() };
}

export function setNodeDetached(
  map: MindMapDocument,
  nodeId: string,
  detached: boolean,
): MindMapDocument {
  if (nodeId === map.rootId) {
    return map;
  }

  if (!map.nodes.some((n) => n.id === nodeId)) {
    return map;
  }

  if (detached) {
    return touch({
      ...map,
      nodes: map.nodes.map((n) => (n.id === nodeId ? { ...n, detached: true } : n)),
      edges: map.edges.filter((e) => e.targetId !== nodeId),
    });
  }

  const hasIncoming = map.edges.some((e) => e.targetId === nodeId);
  const edges: MindMapEdge[] = hasIncoming
    ? map.edges
    : [
        ...map.edges,
        {
          id: `edge_${map.rootId}_${nodeId}`,
          sourceId: map.rootId,
          targetId: nodeId,
        },
      ];

  return touch({
    ...map,
    nodes: map.nodes.map((n) => (n.id === nodeId ? { ...n, detached: false } : n)),
    edges,
  });
}
