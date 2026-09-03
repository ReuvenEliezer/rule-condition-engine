// The dry-run preview panel (FR-008, FR-009, spec assumptions).
//
//   - The request is EXPLICITLY made — never on keystroke, never on a timer.
//   - Shows the total match count (from PageResponse.totalElements) and a first page of matched
//     persons at summary depth. Nothing is saved.
//   - When the tree has changed since the shown count, the count is visibly marked stale.
//   - NEVER_RUN, empty FRESH, and FAILED are visibly distinct (SC-007).

import { useState } from 'react';
import { useAnnounce } from '../ui/LiveRegion';
import { FailureBanner } from '../ui/FailureBanner';
import { EmptyState } from '../ui/EmptyState';
import { ApiFailure } from '../api/client';
import { preview } from '../api/rules';
import type { RuleNode } from '../api/tree';
import {
  afterPreviewFailure,
  afterPreviewSuccess,
  initialPreviewState,
  reconcile,
  type PreviewState,
} from './previewState';

export type PreviewPanelProps = {
  tree: RuleNode;
  /** false while the tree fails local validation — preview is blocked (FR-006, FR-007) */
  canPreview: boolean;
};

export function PreviewPanel({ tree, canPreview }: PreviewPanelProps) {
  const announce = useAnnounce();
  const [state, setState] = useState<PreviewState>(initialPreviewState);
  const [running, setRunning] = useState(false);

  const view = reconcile(state, tree);

  const run = async () => {
    setRunning(true);
    try {
      const result = await preview(tree, { page: 0, size: 20 });
      setState(afterPreviewSuccess(tree, result));
      announce(`Preview: ${result.totalElements} ${result.totalElements === 1 ? 'person matches' : 'people match'}.`);
    } catch (e) {
      if (e instanceof ApiFailure) {
        setState(afterPreviewFailure(tree, e.failure));
        announce('Preview failed.', 'assertive');
      } else {
        throw e;
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <section aria-labelledby="preview-heading">
      <h3 id="preview-heading">Preview</h3>
      <p>
        <button type="button" onClick={() => void run()} disabled={!canPreview || running}>
          {running ? 'Running preview…' : 'Run preview'}
        </button>{' '}
        <span>Runs against the whole population. Nothing is saved.</span>
      </p>

      {view.status === 'NEVER_RUN' && <p>No preview has been run for this condition yet.</p>}

      {view.status === 'STALE' && view.result && (
        <p className="preview-stale" role="status">
          The condition has changed since this count. Previously {view.result.totalElements}{' '}
          {view.result.totalElements === 1 ? 'match' : 'matches'} — run the preview again.
        </p>
      )}

      {view.status === 'FAILED' && view.failure && <FailureBanner failure={view.failure} />}

      {(view.status === 'FRESH' || view.status === 'STALE') && view.result && (
        <div>
          {view.result.totalElements === 0 ? (
            <EmptyState
              message="No person matches this condition."
              action={<span>Adjust a condition and run the preview again.</span>}
            />
          ) : (
            <>
              <p>
                <strong>{view.result.totalElements}</strong>{' '}
                {view.result.totalElements === 1 ? 'person matches' : 'people match'} this condition.
                {view.result.totalElements > view.result.content.length &&
                  ` Showing the first ${view.result.content.length}.`}
              </p>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Age</th>
                    <th>City</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {view.result.content.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{p.age}</td>
                      <td>{p.city ?? '—'}</td>
                      <td>{p.risk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </section>
  );
}
