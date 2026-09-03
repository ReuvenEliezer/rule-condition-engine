// The case workspace (FR-031–FR-033, US4). A case shows its status, its rule and its linked
// persons in one place, with every action reachable from there — composed from US1–US3, not
// duplicating them.

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { cases } from '../api/resources';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { FailureBanner } from '../ui/FailureBanner';
import { useAnnounce } from '../ui/LiveRegion';
import { LinkedPersons } from './LinkedPersons';
import { MatchesView } from '../rules/MatchesView';
import { HistoryLink } from '../audit/HistoryLink';
import { formatInstant } from '../lib/format';

export function CaseWorkspace({ caseId }: { caseId: string }) {
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const [closing, setClosing] = useState(false);
  const [showRun, setShowRun] = useState(false);

  const query = useQuery({
    queryKey: qk.cases.detail(caseId),
    queryFn: ({ signal }) => cases.get(caseId, signal),
  });

  if (query.isLoading) return <p>Loading case…</p>;
  if (query.isError) {
    const f = query.error instanceof ApiFailure ? query.error.failure : { kind: 'transport' as const, cause: 'x' };
    return <FailureBanner failure={f} onRetry={() => void query.refetch()} />;
  }
  const c = query.data;
  if (!c) return <p>Case not found.</p>;

  const closeCase = async () => {
    setClosing(true);
    try {
      // Closing a case is POST /cases with status CLOSED, id and version — the same route as any edit.
      await cases.save({ id: c.id, version: c.version, title: c.title, status: 'CLOSED' });
      announce('Case closed.');
      await queryClient.invalidateQueries({ queryKey: qk.cases.detail(caseId) });
    } catch (e) {
      if (e instanceof ApiFailure) announce('Could not close the case.', 'assertive');
      else throw e;
    } finally {
      setClosing(false);
    }
  };

  return (
    <section aria-labelledby="case-heading">
      <h2 id="case-heading">{c.title}</h2>
      <p>
        Status: <strong>{c.status}</strong> · Opened {formatInstant(c.openedAt)}
        {c.status === 'CLOSED' && ' · This case is closed but stays fully readable.'}
      </p>

      {c.status !== 'CLOSED' && (
        <button type="button" onClick={() => void closeCase()} disabled={closing}>
          {closing ? 'Closing…' : 'Close this case'}
        </button>
      )}
      <HistoryLink recordType="cases" recordId={c.id} />

      <section aria-labelledby="rule-heading">
        <h3 id="rule-heading">Rule</h3>
        {c.ruleId ? (
          <div>
            <p>
              This case has a rule. <Link to={`/rules/${c.ruleId}/condition`}>Open it to edit the condition</Link>.
            </p>
            <button type="button" onClick={() => setShowRun((s) => !s)}>
              {showRun ? 'Hide run' : 'Run this rule against the case'}
            </button>
            {showRun && <MatchesView ruleId={c.ruleId} caseId={c.id} lockedScope="CASE_SCOPED" />}
          </div>
        ) : (
          <p>
            This case has no rule. <Link to="/rules/new">Author one</Link> — it will be scoped to this case.
          </p>
        )}
      </section>

      <section aria-labelledby="persons-heading">
        <h3 id="persons-heading">Linked persons</h3>
        <LinkedPersons caseFile={c} />
      </section>
    </section>
  );
}
