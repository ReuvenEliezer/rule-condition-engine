// The generic listing (FR-020, FR-021, FR-022, FR-041). Paging, total record and page counts,
// and column sorting RESTRICTED to the configured keys — an out-of-list key cannot be constructed.
// The displayed page size is the APPLIED PageResponse.size, which may be smaller than requested;
// clamping is silent server-side.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { byResource } from '../api/resources';
import type { SortDir } from '../api/resources';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { Pager } from '../ui/Pager';
import { EmptyState } from '../ui/EmptyState';
import { FailureBanner } from '../ui/FailureBanner';
import type { ResourceConfig } from './resourceConfig';

export type RecordListProps = {
  config: ResourceConfig;
  onOpen: (id: string) => void;
  onCreate?: (() => void) | undefined;
};

export function RecordList({ config, onOpen, onCreate }: RecordListProps) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const params = {
    page,
    size: 20,
    ...(sortKey ? { sort: { key: sortKey, dir: sortDir } } : {}),
  };

  const query = useQuery({
    queryKey: qk[camel(config.resource)].list(params),
    queryFn: ({ signal }) => byResource[config.resource].list(params, signal),
  });

  const toggleSort = (key: string) => {
    // key is always one of config.sortKeys — the header only renders those
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  };

  if (query.isError) {
    const failure =
      query.error instanceof ApiFailure ? query.error.failure : { kind: 'transport' as const, cause: 'unknown' };
    return <FailureBanner failure={failure} onRetry={() => void query.refetch()} />;
  }

  const data = query.data;
  const rows = data?.content ?? [];

  return (
    <div>
      <div>
        <label>
          Sort by{' '}
          <select
            value={sortKey ?? ''}
            onChange={(e) => (e.target.value ? toggleSort(e.target.value) : (setSortKey(null), setPage(0)))}
          >
            <option value="">(default order)</option>
            {config.sortKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>{' '}
        {sortKey && (
          <button type="button" onClick={() => toggleSort(sortKey)}>
            {sortDir === 'asc' ? 'Ascending' : 'Descending'}
          </button>
        )}
        {config.creatable && onCreate && (
          <button type="button" onClick={onCreate}>
            New {config.resource.replace(/s$/, '')}
          </button>
        )}
      </div>

      {data && rows.length === 0 ? (
        <EmptyState
          message={`No ${config.title.toLowerCase()} yet.`}
          action={
            config.creatable && onCreate ? (
              <button type="button" onClick={onCreate}>
                Create the first one
              </button>
            ) : (
              <span>Records appear here once they exist.</span>
            )
          }
        />
      ) : (
        <table>
          <thead>
            <tr>
              {config.columns.map((c) => (
                <th key={c.key}>
                  {config.sortKeys.includes(c.key) ? (
                    <button type="button" onClick={() => toggleSort(c.key)}>
                      {c.label}
                      {sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
              <th> </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {config.columns.map((c) => (
                  <td key={c.key}>{c.render(row)}</td>
                ))}
                <td>
                  {config.resource === 'cases' ? (
                    <Link to={`/cases/${row.id}`}>Open workspace</Link>
                  ) : (
                    <button type="button" onClick={() => onOpen(row.id)}>
                      Open
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {data && rows.length > 0 && <Pager page={data} onPage={setPage} busy={query.isFetching} />}
    </div>
  );
}

function camel(resource: ResourceConfig['resource']): 'persons' | 'cases' | 'rules' | 'personCases' {
  return resource === 'person-cases' ? 'personCases' : resource;
}
