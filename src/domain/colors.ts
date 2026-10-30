export const BRANCH_COLORS = [
  'var(--color-branch-0)',
  'var(--color-branch-1)',
  'var(--color-branch-2)',
  'var(--color-branch-3)',
  'var(--color-branch-4)',
  'var(--color-branch-5)',
] as const;

export function branchColor(index: number): string {
  return BRANCH_COLORS[((index % BRANCH_COLORS.length) + BRANCH_COLORS.length) % BRANCH_COLORS.length];
}
