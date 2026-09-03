import { forwardRef } from 'react';
import { cn } from '../../lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, type = 'text', ...props }, ref) {
  return (
    <input
      ref={ref}
      type={type}
      className={cn(
        'h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400',
        'transition-colors focus-visible:border-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40',
        'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:ring-rose-400/30',
        'dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100',
        className,
      )}
      {...props}
    />
  );
});
