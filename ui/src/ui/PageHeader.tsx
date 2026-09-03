// A consistent page header: title + optional eyebrow/count on the left, a controls slot on the
// right that wraps onto its own row on narrow screens (FR-020's "controls layout inline with the
// action button").

import { cn } from '../lib/cn';

export type PageHeaderProps = {
  title: string;
  /** small dim text above the title, e.g. a breadcrumb or record count */
  eyebrow?: React.ReactNode;
  description?: React.ReactNode;
  /** right-aligned controls: search, sort, primary action */
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, eyebrow, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}
