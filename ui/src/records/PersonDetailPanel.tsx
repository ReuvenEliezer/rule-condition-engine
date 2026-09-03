// The person detail drill-down (FR-017, FR-043, SC-004) over GET /api/v1/persons/{id}.
//
//   - `nationalId` is shown HERE and only here, on a query configured gcTime: 0 so it is dropped
//     the moment this view unmounts (research R8).
//   - `caseLinkCount` is the true total; the embedded `caseLinks` are marked a PARTIAL SUBSET of
//     twenty — the same treatment the case side gets, and subject to the same dead end, since
//     /person-cases cannot be filtered by person either (spec dependency #3).
//   - A RECORD_NOT_FOUND on a soft-deleted person reports not-found rather than a blank record
//     (spec edge case, T057).

import { useQuery } from '@tanstack/react-query';
import { persons } from '../api/resources';
import { qk, PERSON_DETAIL_QUERY_OPTIONS } from '../api/queries';
import { ApiFailure } from '../api/client';
import { FailureBanner } from '../ui/FailureBanner';
import { formatInstant } from '../lib/format';

export type PersonDetailPanelProps = {
  personId: string;
  onClose: () => void;
};

export function PersonDetailPanel({ personId, onClose }: PersonDetailPanelProps) {
  const query = useQuery({
    queryKey: qk.persons.detail(personId),
    queryFn: ({ signal }) => persons.get(personId, signal),
    ...PERSON_DETAIL_QUERY_OPTIONS,
  });

  return (
    <aside aria-label="Person detail">
      <button type="button" onClick={onClose}>
        Close
      </button>
      {query.isLoading && <p>Loading…</p>}
      {query.isError &&
        (() => {
          const failure =
            query.error instanceof ApiFailure ? query.error.failure : { kind: 'transport' as const, cause: 'unknown' };
          return <FailureBanner failure={failure} onRetry={() => void query.refetch()} />;
        })()}
      {query.data && (
        <dl>
          <dt>Name</dt>
          <dd>{query.data.name}</dd>
          <dt>Age</dt>
          <dd>{query.data.age}</dd>
          <dt>City</dt>
          <dd>{query.data.city ?? '—'}</dd>
          <dt>Risk</dt>
          <dd>{query.data.risk}</dd>
          <dt>National identifier</dt>
          <dd>{query.data.nationalId}</dd>
          <dt>Case links</dt>
          <dd>
            {query.data.caseLinkCount} in total.
            {query.data.caseLinkCount > query.data.caseLinks.length &&
              ` Showing the first ${query.data.caseLinks.length} — the rest cannot be listed (the link listing cannot be filtered by person).`}
            <ul>
              {query.data.caseLinks.map((l) => (
                <li key={l.id}>
                  {l.caseId} — {l.role}
                </li>
              ))}
            </ul>
          </dd>
          <dt>Created</dt>
          <dd>
            {formatInstant(query.data.createdAt)} by {query.data.createdBy}
          </dd>
        </dl>
      )}
    </aside>
  );
}
