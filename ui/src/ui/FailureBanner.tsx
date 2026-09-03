// Renders a FailureKind through the exhaustive presentation map (errors.ts). Shows the server
// `message` only where the map says to (RULE_TREE_TOO_COMPLEX, VALIDATION_FAILED, the "open the
// rule" codes). Offers retry ONLY on transport failures — a refusal is never retried blindly
// (FR-039, FR-040, FR-012).

import { presentationFor, type FailureKind } from '../api/errors';

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
    <div className="failure-banner" role="alert">
      <p>
        <strong>{p.title}</strong>
      </p>
      {serverMessage && <p>{serverMessage}</p>}
      {p.clientDefect && (
        <p>
          <small>Please report this — it is not something you did wrong.</small>
        </p>
      )}
      {p.retryable && onRetry && (
        <button type="button" onClick={onRetry}>
          Try again
        </button>
      )}
      {children}
    </div>
  );
}
