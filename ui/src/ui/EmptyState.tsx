// An empty region can never ship without a next action — the `action` prop is required (FR-041).
// Visibly distinct from a failure and from "not yet run" (SC-007): a calm, centred card with a
// subtle icon, never a red banner.

import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn';

export type EmptyStateProps = {
  /** supporting sentence under the title */
  message: string;
  /** the next useful action — required, not optional. A <Button> or a short explanatory <span>. */
  action: React.ReactNode;
  /** short headline; defaults to the message when omitted */
  title?: string;
  icon?: LucideIcon;
  className?: string;
};

export function EmptyState({ message, action, title, icon: Icon = Inbox, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center',
        'dark:border-slate-700 dark:bg-slate-900/40',
        className,
      )}
    >
      <span className="mb-4 grid size-12 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Icon className="size-6" aria-hidden />
      </span>
      {title && <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>}
      <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{message}</p>
      <div className="mt-5">{action}</div>
    </div>
  );
}
