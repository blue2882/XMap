import type { MindMapDocument } from '@/domain/schemas';

function touch(map: MindMapDocument): MindMapDocument {
  return { ...map, updatedAt: new Date().toISOString() };
}

function linksOf(map: MindMapDocument) {
  return map.links ?? [];
}

function hasManualLinkBetween(map: MindMapDocument, a: string, b: string): boolean {
  return linksOf(map).some(
    (link) =>
      (link.sourceId === a && link.targetId === b) ||
      (link.sourceId === b && link.targetId === a),
  );
}

function hasParentEdge(map: MindMapDocument, sourceId: string, targetId: string): boolean {
  return map.edges.some((edge) => edge.sourceId === sourceId && edge.targetId === targetId);
}

export function addManualLink(
  map: MindMapDocument,
  sourceId: string,
  targetId: string,
): MindMapDocument {
  if (sourceId === targetId) return map;
  if (hasManualLinkBetween(map, sourceId, targetId)) return map;
  if (hasParentEdge(map, sourceId, targetId)) return map;

  const link = { id: `link_${sourceId}_${targetId}`, sourceId, targetId };
  return touch({ ...map, links: [...linksOf(map), link] });
}

export function removeManualLink(map: MindMapDocument, linkId: string): MindMapDocument {
  const next = linksOf(map).filter((link) => link.id !== linkId);
  if (next.length === linksOf(map).length) return map;
  return touch({ ...map, links: next });
}
