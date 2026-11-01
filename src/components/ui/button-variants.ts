import { cva, type VariantProps } from 'class-variance-authority';

export const buttonVariants = cva(
  'interactive-press inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow] duration-150 ease-out select-none disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[1.1em] [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'border-line bg-raised text-ink shadow-[0_1px_1px_rgb(20_22_40/0.04)] hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,var(--color-raised))] active:bg-[color-mix(in_srgb,var(--color-ink)_9%,var(--color-raised))]',
        primary:
          'border-ink bg-ink text-surface shadow-[0_1px_2px_rgb(20_22_40/0.25)] hover:bg-[color-mix(in_srgb,var(--color-ink)_86%,var(--color-surface))] active:bg-[color-mix(in_srgb,var(--color-ink)_76%,var(--color-surface))]',
        destructive:
          'border-danger bg-danger text-white dark:text-node-ink shadow-[0_1px_2px_rgb(20_22_40/0.25)] hover:brightness-95 active:brightness-90',
        ghost:
          'border-transparent bg-transparent text-ink hover:bg-[color-mix(in_srgb,var(--color-ink)_7%,transparent)] active:bg-[color-mix(in_srgb,var(--color-ink)_12%,transparent)]',
      },
      size: {
        default: 'min-h-[42px] px-[18px] text-sm',
        sm: 'min-h-[34px] px-3 text-[13px]',
        icon: 'size-[42px] p-0',
        'icon-sm': 'size-[34px] p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
