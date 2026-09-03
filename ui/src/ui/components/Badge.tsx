// Small status pills. `tone` is chosen by the caller from the domain value (risk level, case
// status, link role) so the colour carries meaning, not decoration.

import { cn } from '../../lib/cn';

export type BadgeTone = 'neutral' | 'blue' | 'green' | 'amber' | 'red' | 'violet';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:ring-sky-900',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-900',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-900',
  red: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:ring-rose-900',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:ring-violet-900',
};

export function Badge({
  tone = 'neutral',
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

const RISK_TONE: Record<string, BadgeTone> = {
  LOW: 'green',
  MEDIUM: 'blue',
  HIGH: 'amber',
  CRITICAL: 'red',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  OPEN: 'blue',
  UNDER_REVIEW: 'amber',
  CLOSED: 'neutral',
};

const ROLE_TONE: Record<string, BadgeTone> = {
  SUBJECT: 'violet',
  ASSOCIATE: 'blue',
  WITNESS: 'neutral',
};

export const toneForRisk = (risk: string): BadgeTone => RISK_TONE[risk] ?? 'neutral';
export const toneForStatus = (status: string): BadgeTone => STATUS_TONE[status] ?? 'neutral';
export const toneForRole = (role: string): BadgeTone => ROLE_TONE[role] ?? 'neutral';
