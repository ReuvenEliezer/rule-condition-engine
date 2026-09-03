// The one button in the system. Native <button> underneath — keyboard, form submission and
// screen-reader semantics are unchanged; only the paint is new.

import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

const base =
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap ' +
  'transition-[background-color,box-shadow,transform,color] duration-150 ease-out ' +
  'active:translate-y-px disabled:pointer-events-none disabled:opacity-50 ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900';

const variants: Record<Variant, string> = {
  primary:
    'bg-brand-600 text-white shadow-sm hover:bg-brand-700 hover:shadow ' +
    'dark:bg-brand-500 dark:hover:bg-brand-600',
  secondary:
    'border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50 ' +
    'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750 dark:hover:bg-slate-700',
  ghost:
    'text-slate-600 hover:bg-slate-100 hover:text-slate-900 ' +
    'dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
  danger:
    'bg-rose-600 text-white shadow-sm hover:bg-rose-700 dark:bg-rose-600 dark:hover:bg-rose-500',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />
  );
});
