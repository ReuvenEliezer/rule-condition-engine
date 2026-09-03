// The rule-target case picker (FR-010) over GET /api/v1/cases, paged, showing which cases already
// hold a rule so the author is not led toward one that will be rejected by the one-to-one rule.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cases } from '../api/resources';
import { qk } from '../api/queries';
import { Pager } from '../ui/Pager';
import { FailureBanner } from '../ui/FailureBanner';
import { ApiFailure } from '../api/client';

export type CasePickerProps = {
  selectedCaseId: string | null;
  onSelect: (caseId: string) => void;
};

export function CasePicker({ selectedCaseId, onSelect }: CasePickerProps) {
  const [page, setPage] = useState(0);
  const params = { page, size: 20, sort: { key: 'title', dir: 'asc' } as const };
  const query = useQuery({
    queryKey: qk.cases.list(params),
    queryFn: ({ signal }) => cases.list(params, signal),
  });

  if (query.isError) {
    const failure = query.error instanceof ApiFailure ? query.error.failure : { kind: 'transport' as const, cause: 'unknown' };
    return <FailureBanner failure={failure} onRetry={() => void query.refetch()} />;
  }

  return (
    <div>
      <table>
        <thead>
          <tr>
            <th> </th>
            <th>Title</th>
            <th>Status</th>
            <th>Has a rule?</th>
          </tr>
        </thead>
        <tbody>
          {(query.data?.content ?? []).map((c) => (
            <tr key={c.id}>
              <td>
                <label>
                  <input
                    type="radio"
                    name="target-case"
                    checked={selectedCaseId === c.id}
                    onChange={() => onSelect(c.id)}
                  />
                  <span className="visually-hidden">Select {c.title}</span>
                </label>
              </td>
              <td>{c.title}</td>
              <td>{c.status}</td>
              {/* the summary carries no ruleId; the workspace resolves it — shown as unknown here */}
              <td>open the case to see</td>
            </tr>
          ))}
        </tbody>
      </table>
      {query.data && <Pager page={query.data} onPage={setPage} busy={query.isFetching} />}
    </div>
  );
}
