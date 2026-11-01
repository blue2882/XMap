import dagre from '@dagrejs/dagre';
import type { MindMapDocument, MindMapNode } from '@/domain/schemas';
import { nodeBounds } from '@/domain/node-geometry';

const RANK_SEP = 52;
const NODE_SEP = 28;

/** Horizontal tree layout via dagre; node x/y are top-left in canvas space. */
export function layoutNodesWithDagre(map: MindMapDocument): MindMapNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({ rankdir: 'LR', nodesep: NODE_SEP, ranksep: RANK_SEP });

  for (const node of map.nodes) {
    const bounds = nodeBounds(node);
    graph.setNode(node.id, { width: bounds.w, height: bounds.h });
  }
  for (const edge of map.edges) {
    graph.setEdge(edge.sourceId, edge.targetId);
  }

  dagre.layout(graph);

  return map.nodes.map((node) => {
    const laidOut = graph.node(node.id);
    if (!laidOut) {
      return node;
    }
    return {
      ...node,
      x: laidOut.x - laidOut.width / 2,
      y: laidOut.y - laidOut.height / 2,
    };
  });
}
