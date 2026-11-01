import { branchColor } from '@/domain/colors';
import { edgePath, fanAlongSide, nodeBounds } from '@/domain/node-geometry';
import type { MindMapDocument, MindMapNode } from '@/domain/schemas';

const PAD = 40;
const MIN_W = 640;
const MIN_H = 400;

type Props = { map: MindMapDocument };

function previewGeometry(map: MindMapDocument) {
  const byId = new Map(map.nodes.map((n) => [n.id, n]));
  const bounds = map.nodes.map((n) => nodeBounds(n));
  const minX = Math.min(...bounds.map((b) => b.x));
  const minY = Math.min(...bounds.map((b) => b.y));
  const maxX = Math.max(...bounds.map((b) => b.x + b.w));
  const maxY = Math.max(...bounds.map((b) => b.y + b.h));
  const width = Math.max(maxX - minX + PAD * 2, MIN_W);
  const height = Math.max(maxY - minY + PAD * 2, MIN_H);
  const originX = (minX + maxX) / 2 - width / 2;
  const originY = (minY + maxY) / 2 - height / 2;
  return {
    viewBox: `${originX} ${originY} ${width} ${height}`,
    nodes: map.nodes,
    edges: map.edges.flatMap((e) => {
      const source = byId.get(e.sourceId);
      const target = byId.get(e.targetId);
      return source && target
        ? [{ id: e.id, d: edgePath(source, target, previewFan(map, source, target)), color: target.colorIndex }]
        : [];
    }),
  };
}

function previewFan(map: MindMapDocument, source: MindMapNode, target: MindMapNode): number {
  const byId = new Map(map.nodes.map((node) => [node.id, node]));
  const sourceMid = source.x + nodeBounds(source).w / 2;
  const toRight = target.x + nodeBounds(target).w / 2 >= sourceMid;
  const sameSide = map.edges
    .filter((edge) => edge.sourceId === source.id)
    .map((edge) => byId.get(edge.targetId))
    .filter((node): node is MindMapNode => node !== undefined)
    .filter((node) => (node.x + nodeBounds(node).w / 2 >= sourceMid) === toRight)
    .sort((a, b) => a.y - b.y);
  return fanAlongSide(
    nodeBounds(source).h,
    sameSide.length,
    sameSide.findIndex((node) => node.id === target.id),
  );
}

export function MapPreview({ map }: Props) {
  const { viewBox, nodes, edges } = previewGeometry(map);

  if (map.nodes.length === 0) return null;

  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="xMidYMid meet"
      className="size-full"
      aria-hidden="true"
    >
      {edges.map((e) => (
        <path
          key={e.id}
          d={e.d}
          fill="none"
          stroke={branchColor(e.color)}
          strokeOpacity={0.55}
          strokeWidth={5}
          strokeLinecap="round"
        />
      ))}
      {nodes.map((n) => {
        const b = nodeBounds(n);
        const root = n.id === map.rootId;
        return (
          <g key={n.id}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={14}
              fill={root ? 'var(--color-ink)' : 'var(--color-raised)'}
              stroke={root ? 'none' : 'var(--color-line)'}
            />
            {root ? null : (
              <rect x={b.x} y={b.y + 8} width={4} height={Math.max(8, b.h - 16)} rx={2} fill={branchColor(n.colorIndex)} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
