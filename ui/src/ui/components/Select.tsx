// A styled NATIVE <select>. Research R9 is explicit that field/operator/enum choices stay native
// for keyboard and screen-reader correctness, so this is `appearance-none` plus a chevron — never
// a JS listbox.

import { forwardRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, children, ...props },
  ref,
) {
  return (
    <div className="relative inline-flex">
      <select
        ref={ref}
        className={cn(
          'h-9 w-full appearance-none rounded-lg border border-slate-300 bg-white pl-3 pr-9 text-sm text-slate-700 shadow-sm',
          'transition-colors hover:bg-slate-50 focus-visible:border-brand-500 focus-visible:outline-none',
          'focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:cursor-not-allowed disabled:opacity-50',
          'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
      />
    </div>
  );
});
