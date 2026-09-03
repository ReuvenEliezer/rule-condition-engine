// Renders a FailureKind through the exhaustive presentation map (errors.ts). Shows the server
// `message` only where the map says to (RULE_TREE_TOO_COMPLEX, VALIDATION_FAILED, the "open the
// rule" codes). Offers retry ONLY on transport failures — a refusal is never retried blindly
// (FR-039, FR-040, FR-012).

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { presentationFor, type FailureKind } from '../api/errors';
import { Button } from './components/Button';

export type FailureBannerProps = {
  failure: FailureKind;
  onRetry?: () => void;
  /** extra actions the caller offers, e.g. "Open the existing rule" */
  children?: React.ReactNode;
};

export function FailureBanner({ failure, onRetry, children }: FailureBannerProps) {
  const p = presentationFor(failure);
  const serverMessage =
    p.showServerMessage && failure.kind === 'refusal' && failure.message ? failure.message : null;

  return (
    <div
      role="alert"
      className="flex gap-3 rounded-[var(--radius-card)] border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/50 dark:text-rose-200"
    >
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-500" aria-hidden />
      <div className="min-w-0 space-y-2">
        <p className="font-medium">{p.title}</p>
        {serverMessage && <p className="text-rose-700 dark:text-rose-300">{serverMessage}</p>}
        {p.clientDefect && (
          <p className="text-xs text-rose-600 dark:text-rose-400">
            Please report this — it is not something you did wrong.
          </p>
        )}
        {(p.retryable && onRetry) || children ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {p.retryable && onRetry && (
              <Button size="sm" variant="secondary" onClick={onRetry}>
                <RotateCcw className="size-4" aria-hidden />
                Try again
              </Button>
            )}
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
