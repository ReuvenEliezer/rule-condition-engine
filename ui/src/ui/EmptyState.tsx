// An empty region can never ship without a next action — the `action` prop is required (FR-041).
// Visibly distinct from a failure and from "not yet run" (SC-007).

export type EmptyStateProps = {
  message: string;
  /** the next useful action — required, not optional */
  action: React.ReactNode;
};

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <p>{message}</p>
      <div>{action}</div>
    </div>
  );
}
