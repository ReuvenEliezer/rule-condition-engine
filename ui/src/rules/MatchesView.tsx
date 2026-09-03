// Run a saved rule and work its matches (FR-014–FR-019, FR-043, SC-004, SC-006).
//
//   - The run is unavailable until a scope is chosen; `scope` is always sent explicitly and shown
//     beside the results.
//   - Paging goes through the shared Pager; the total comes from PageResponse.totalElements and no
//     second page is ever fetched to render or count anything.
//   - An empty result is an explicit empty state, visibly distinct from a failure and from a run
//     not yet performed.
//   - UNKNOWN_FIELD / INCOMPATIBLE_OPERATOR / INVALID_RULE from the matches route name the fault
//     and offer to open the rule for editing — the rule stays openable.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { matches, type MatchScope } from '../api/rules';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { Pager } from '../ui/Pager';
import { EmptyState } from '../ui/EmptyState';
import { FailureBanner } from '../ui/FailureBanner';
import { useAnnounce } from '../ui/LiveRegion';
import { ScopeSelector } from './ScopeSelector';
import { MatchRow } from './MatchRow';
import { PersonDetailPanel } from '../records/PersonDetailPanel';
import { LinkPersonToCase } from '../records/LinkPersonToCase';

export type MatchesViewProps = {
  ruleId: string;
  caseId: string;
  /** when embedded in a case workspace the scope is pinned to CASE_SCOPED (US4, T078) */
  lockedScope?: MatchScope;
};

const EDIT_OFFER_CODES = new Set(['UNKNOWN_FIELD', 'INCOMPATIBLE_OPERATOR', 'INVALID_RULE', 'RULE_STORAGE_ERROR']);

export function MatchesView({ ruleId, caseId, lockedScope }: MatchesViewProps) {
  const announce = useAnnounce();
  const [scope, setScope] = useState<MatchScope | null>(lockedScope ?? null);
  const [runToken, setRunToken] = useState(0);
  const [page, setPage] = useState(0);
  const [openPersonId, setOpenPersonId] = useState<string | null>(null);

  const enabled = scope !== null && runToken > 0;
  const params = { page, size: 20 };

  const query = useQuery({
    queryKey: qk.rules.matches(ruleId, scope ?? 'NONE', { ...params, runToken }),
    queryFn: ({ signal }) => matches(ruleId, scope as MatchScope, params, signal),
    enabled,
  });

  const run = () => {
    setPage(0);
    setRunToken((t) => t + 1);
    announce('Running the rule…');
  };

  return (
    <div>
      <ScopeSelector value={scope} onChange={setScope} locked={lockedScope !== undefined} />
      <p>
        <button type="button" onClick={run} disabled={scope === null || query.isFetching}>
          {query.isFetching ? 'Running…' : 'Run rule'}
        </button>
      </p>

      {enabled && query.isError && (
        <RunFailure error={query.error} ruleId={ruleId} onRetry={() => void query.refetch()} />
      )}

      {enabled && query.data && (
        <section aria-label="Matches">
          <p>
            Scope: <strong>{scope}</strong>. <strong>{query.data.totalElements}</strong>{' '}
            {query.data.totalElements === 1 ? 'person matches' : 'people match'}.
          </p>
          {query.data.totalElements === 0 ? (
            <EmptyState
              message="No person matches this rule in the selected scope."
              action={<span>Try the other scope, or edit the rule&rsquo;s condition.</span>}
            />
          ) : (
            <>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Age</th>
                    <th>City</th>
                    <th>Risk</th>
                    <th> </th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.content.map((p) => (
                    <MatchRow key={p.id} person={p} onOpen={setOpenPersonId} />
                  ))}
                </tbody>
              </table>
              <Pager page={query.data} onPage={setPage} busy={query.isFetching} />
            </>
          )}
        </section>
      )}

      {openPersonId && (
        <div>
          <PersonDetailPanel personId={openPersonId} onClose={() => setOpenPersonId(null)} />
          <h4>Link this person to the case</h4>
          <LinkPersonToCase personId={openPersonId} caseId={caseId} />
        </div>
      )}
    </div>
  );
}

function RunFailure({ error, ruleId, onRetry }: { error: unknown; ruleId: string; onRetry: () => void }) {
  const failure =
    error instanceof ApiFailure ? error.failure : { kind: 'transport' as const, cause: 'unknown' };
  const offerEdit = failure.kind === 'refusal' && EDIT_OFFER_CODES.has(failure.code);
  return (
    <FailureBanner failure={failure} onRetry={onRetry}>
      {offerEdit && (
        <p>
          <Link to={`/rules/${ruleId}/condition`}>Open the rule to edit its condition</Link>
        </p>
      )}
    </FailureBanner>
  );
}
