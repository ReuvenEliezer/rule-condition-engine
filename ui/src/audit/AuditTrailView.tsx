// The read-only audit trail (FR-034–FR-038, FR-045, SC-009).
//
//   - Paged, newest first, showing record type, identity, operation, actor, time and resulting
//     version. NO create/edit/delete affordance appears anywhere.
//   - Sorting is restricted to occurredAt / recordType / operation (contract §1.2).
//   - `actor` is always `system` until authentication exists — the view says so plainly, so the
//     column is not read as information it does not carry.
//   - Deep-linkable via ?recordType=&recordId= (from HistoryLink), reachable in ≤ 3 interactions.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { auditEntries, type AuditFilter } from '../api/audit';
import { AUDIT_SORT_KEYS, type AuditSortKey, type SortDir } from '../api/resources';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { Pager } from '../ui/Pager';
import { EmptyState } from '../ui/EmptyState';
import { FailureBanner } from '../ui/FailureBanner';
import type { RecordType } from '../api/types';
import { AuditFilters } from './AuditFilters';
import { AuditChanges } from './AuditChanges';
import { formatInstant } from '../lib/format';

const VALID_RECORD_TYPES = new Set<RecordType>(['person', 'case', 'rule', 'person-case']);

function filterFromParams(params: URLSearchParams): AuditFilter {
  const rt = params.get('recordType');
  if (!rt || !VALID_RECORD_TYPES.has(rt as RecordType)) return {};
  const id = params.get('recordId');
  return id ? { recordType: rt as RecordType, recordId: id } : { recordType: rt as RecordType };
}

export function AuditTrailView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<AuditSortKey>('occurredAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expanded, setExpanded] = useState<string | null>(null);

  const filter = useMemo(() => filterFromParams(searchParams), [searchParams]);

  const params = { filter, page, size: 20, sort: { key: sortKey, dir: sortDir } };
  const query = useQuery({
    queryKey: qk.audit.list(params),
    queryFn: ({ signal }) => auditEntries(params, signal),
  });

  const setFilter = (next: AuditFilter) => {
    const sp = new URLSearchParams();
    if (next.recordType) {
      sp.set('recordType', next.recordType);
      if (next.recordId) sp.set('recordId', next.recordId);
    }
    setSearchParams(sp);
    setPage(0);
  };

  return (
    <section aria-labelledby="audit-heading">
      <h2 id="audit-heading">Audit trail</h2>
      <p>
        This trail is read-only. Every change is attributed to <code>system</code> — there is no
        authentication yet, so the actor column carries no more than that.
      </p>

      <AuditFilters filter={filter} onChange={setFilter} />

      <label>
        Sort by{' '}
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as AuditSortKey)}>
          {AUDIT_SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </label>{' '}
      <button type="button" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
        {sortDir === 'asc' ? 'Oldest first' : 'Newest first'}
      </button>

      {query.isError &&
        (() => {
          const f = query.error instanceof ApiFailure ? query.error.failure : { kind: 'transport' as const, cause: 'x' };
          return <FailureBanner failure={f} onRetry={() => void query.refetch()} />;
        })()}

      {query.data && query.data.content.length === 0 && (
        <EmptyState
          message="No audit entries match this filter."
          action={<span>Widen the filter, or perform a change and return here.</span>}
        />
      )}

      {query.data && query.data.content.length > 0 && (
        <>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Record type</th>
                <th>Identity</th>
                <th>Operation</th>
                <th>Actor</th>
                <th>Version</th>
                <th> </th>
              </tr>
            </thead>
            <tbody>
              {query.data.content.map((e) => {
                const rowId = `${e.recordType}:${e.recordId}:${e.occurredAt}`;
                return (
                  <tr key={rowId}>
                    <td className="whitespace-nowrap">{formatInstant(e.occurredAt)}</td>
                    <td>{e.recordType}</td>
                    <td>{e.recordId}</td>
                    <td>{e.operation}</td>
                    <td>{e.actor}</td>
                    <td>{e.entityVersion ?? '—'}</td>
                    <td>
                      <button
                        type="button"
                        aria-expanded={expanded === rowId}
                        onClick={() => setExpanded((cur) => (cur === rowId ? null : rowId))}
                      >
                        {expanded === rowId ? 'Hide changes' : 'Show changes'}
                      </button>
                      {expanded === rowId && <AuditChanges entry={e} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pager page={query.data} onPage={setPage} busy={query.isFetching} />
        </>
      )}
    </section>
  );
}
