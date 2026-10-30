import type { NodeProps } from '@xyflow/react';

/** Dashed outline left at a node's original spot while its branch is being dragged. */
export function DragGhostNode({ width, height }: NodeProps) {
  return (
    <div
      aria-hidden
      className="rounded-2xl border-2 border-dashed border-accent/50 bg-accent/5"
      style={{ width, height }}
    />
  );
}
