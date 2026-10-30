import type { MindMapNode } from '@/domain/schemas';

export const NODE_W = 168;
export const NODE_H = 44;
/** Vertical padding (py-2) plus one line of body text in the canvas node. */
const NODE_PAD_Y = 16;
const NODE_LINE_H = 21;
/** Conservative characters per wrapped line at the fixed node width (15px semibold). */
const CHARS_PER_LINE = 17;

export type NodeBounds = { x: number; y: number; w: number; h: number };

export function nodeBounds(node: MindMapNode, text?: string): NodeBounds {
  const lineCount = (text ?? node.text)
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / CHARS_PER_LINE)), 0);
  const h = Math.max(NODE_H, NODE_PAD_Y + lineCount * NODE_LINE_H);
  return { x: node.x, y: node.y, w: NODE_W, h };
}

type Side = 'left' | 'right' | 'top' | 'bottom';

function sidePoint(bounds: NodeBounds, side: Side): { x: number; y: number } {
  const midX = bounds.x + bounds.w / 2;
  const midY = bounds.y + bounds.h / 2;
  switch (side) {
    case 'left':
      return { x: bounds.x, y: midY };
    case 'right':
      return { x: bounds.x + bounds.w, y: midY };
    case 'top':
      return { x: midX, y: bounds.y };
    case 'bottom':
      return { x: midX, y: bounds.y + bounds.h };
    default: {
      const _exhaustive: never = side;
      return _exhaustive;
    }
  }
}

function connectSides(source: NodeBounds, target: NodeBounds): [Side, Side] {
  const dx = target.x + target.w / 2 - (source.x + source.w / 2);
  const dy = target.y + target.h / 2 - (source.y + source.h / 2);
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? ['right', 'left'] : ['left', 'right'];
  }
  return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom'];
}

/** Spread sibling strokes along the parent side so they do not share one point. */
export function fanAlongSide(span: number, count: number, index: number): number {
  if (count <= 1 || index < 0) return 0;
  const offset = ((index + 0.5) / count - 0.5) * span * 0.65;
  const limit = Math.max(0, span / 2 - 4);
  return Math.max(-limit, Math.min(limit, offset));
}

export function edgePath(source: MindMapNode, target: MindMapNode, fanY = 0): string {
  const sb = nodeBounds(source);
  const tb = nodeBounds(target);
  const [fromSide, toSide] = connectSides(sb, tb);
  const p1 = sidePoint(sb, fromSide);
  const p2 = sidePoint(tb, toSide);
  if (fromSide === 'left' || fromSide === 'right') p1.y += fanY;
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const cx = (p1.x + p2.x) / 2;
    return `M ${p1.x} ${p1.y} C ${cx} ${p1.y}, ${cx} ${p2.y}, ${p2.x} ${p2.y}`;
  }
  const cy = (p1.y + p2.y) / 2;
  return `M ${p1.x} ${p1.y} C ${p1.x} ${cy}, ${p2.x} ${cy}, ${p2.x} ${p2.y}`;
}

export type Box = { x: number; y: number; w: number; h: number };

/** Slide a rigid group until its boxes clear every obstacle. */
export function separateBoxes(
  moving: Box[],
  obstacles: Box[],
  dx: number,
  dy: number,
  pad = 10,
): { dx: number; dy: number } {
  let x = dx;
  let y = dy;
  for (let pass = 0; pass < 16; pass += 1) {
    let pushed = false;
    for (const box of moving) {
      const moved = {
        x: box.x + x - pad,
        y: box.y + y - pad,
        w: box.w + pad * 2,
        h: box.h + pad * 2,
      };
      for (const obstacle of obstacles) {
        const push = pushOut(moved, obstacle);
        if (push.dx === 0 && push.dy === 0) continue;
        x += push.dx;
        y += push.dy;
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return { dx: x, dy: y };
}

function pushOut(moving: Box, fixed: Box): { dx: number; dy: number } {
  const overlapX = Math.min(moving.x + moving.w, fixed.x + fixed.w) - Math.max(moving.x, fixed.x);
  const overlapY = Math.min(moving.y + moving.h, fixed.y + fixed.h) - Math.max(moving.y, fixed.y);
  if (overlapX <= 0.5 || overlapY <= 0.5) return { dx: 0, dy: 0 };
  if (overlapX < overlapY) {
    const movingMid = moving.x + moving.w / 2;
    const fixedMid = fixed.x + fixed.w / 2;
    return { dx: movingMid < fixedMid ? -overlapX : overlapX, dy: 0 };
  }
  const movingMid = moving.y + moving.h / 2;
  const fixedMid = fixed.y + fixed.h / 2;
  return { dx: 0, dy: movingMid < fixedMid ? -overlapY : overlapY };
}
