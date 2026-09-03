// The generic listing (FR-020, FR-021, FR-022, FR-041). Paging, total record and page counts,
// and column sorting RESTRICTED to the configured keys — an out-of-list key cannot be constructed.
// The displayed page size is the APPLIED PageResponse.size, which may be smaller than requested;
// clamping is silent server-side.

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Search } from 'lucide-react';
import { byResource } from '../api/resources';
import type { SortDir } from '../api/resources';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { Pager } from '../ui/Pager';
import { EmptyState } from '../ui/EmptyState';
import { FailureBanner } from '../ui/FailureBanner';
import { PageHeader } from '../ui/PageHeader';
import { Button } from '../ui/components/Button';
import { Select } from '../ui/components/Select';
import { Input } from '../ui/components/Input';
import { Card } from '../ui/components/Card';
import { Badge, toneForRisk, toneForRole, toneForStatus } from '../ui/components/Badge';
import { cn } from '../lib/cn';
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
  const [filter, setFilter] = useState('');

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

  const singular = config.resource.replace(/s$/, '').replace(/-/g, ' ');
  const data = query.data;
  const allRows = useMemo(() => data?.content ?? [], [data]);

  // Page-local text filter — narrows what is shown from THIS page only (the list API carries no
  // text search). The pager and totals below always reflect the server set.
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter((row) =>
      config.columns.some((c) => c.render(row).toLowerCase().includes(q)),
    );
  }, [allRows, filter, config.columns]);

  const actions = (
    <>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <Input
          type="search"
          aria-label={`Filter ${config.title.toLowerCase()} on this page`}
          placeholder="Filter this page…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full pl-8 sm:w-56"
        />
      </div>
      <label className="flex items-center gap-1.5 text-sm text-slate-500">
        <ArrowUpDown className="size-4 text-slate-400" aria-hidden />
        <span className="sr-only sm:not-sr-only">Sort</span>
        <Select
          aria-label="Sort by"
          value={sortKey ?? ''}
          onChange={(e) => {
            if (e.target.value) toggleSort(e.target.value);
            else {
              setSortKey(null);
              setPage(0);
            }
          }}
        >
          <option value="">Default order</option>
          {config.sortKeys.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </Select>
      </label>
      {sortKey && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => toggleSort(sortKey)}
          aria-label={`Toggle sort direction, currently ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
        >
          {sortDir === 'asc' ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />}
          {sortDir === 'asc' ? 'Ascending' : 'Descending'}
        </Button>
      )}
      {config.creatable && onCreate && (
        <Button variant="primary" onClick={onCreate}>
          <Plus className="size-4" aria-hidden />
          New {singular}
        </Button>
      )}
    </>
  );

  return (
    <div>
      <PageHeader
        title={config.title}
        eyebrow={
          data
            ? `${data.totalElements} ${data.totalElements === 1 ? 'record' : 'records'}${
                filter.trim() ? ` · ${rows.length} shown` : ''
              }`
            : undefined
        }
        actions={actions}
      />

      {query.isError && (
        <FailureBanner
          failure={
            query.error instanceof ApiFailure
              ? query.error.failure
              : { kind: 'transport', cause: 'unknown' }
          }
          onRetry={() => void query.refetch()}
        />
      )}

      {data && allRows.length === 0 && (
        <EmptyState
          title={`No ${config.title.toLowerCase()} yet`}
          message={
            config.creatable
              ? `Create the first ${singular} to start working with ${config.title.toLowerCase()}.`
              : `${config.title} appear here once they exist.`
          }
          action={
            config.creatable && onCreate ? (
              <Button variant="primary" onClick={onCreate}>
                <Plus className="size-4" aria-hidden />
                Create the first one
              </Button>
            ) : (
              <span className="text-sm text-slate-500">Nothing to do here yet.</span>
            )
          }
        />
      )}

      {data && allRows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                  {config.columns.map((c) => {
                    const sortable = config.sortKeys.includes(c.key);
                    const active = sortKey === c.key;
                    return (
                      <th key={c.key} scope="col" className="px-4 py-3 font-medium">
                        {sortable ? (
                          <button
                            type="button"
                            onClick={() => toggleSort(c.key)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded transition-colors hover:text-slate-800 dark:hover:text-slate-200',
                              active && 'text-slate-800 dark:text-slate-100',
                            )}
                          >
                            {c.label}
                            {active ? (
                              sortDir === 'asc' ? (
                                <ArrowUp className="size-3.5" aria-hidden />
                              ) : (
                                <ArrowDown className="size-3.5" aria-hidden />
                              )
                            ) : (
                              <ArrowUpDown className="size-3.5 text-slate-300 dark:text-slate-600" aria-hidden />
                            )}
                          </button>
                        ) : (
                          c.label
                        )}
                      </th>
                    );
                  })}
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="group transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    {config.columns.map((c) => (
                      <td key={c.key} className="px-4 py-3 align-middle text-slate-700 dark:text-slate-300">
                        <Cell resource={config.resource} columnKey={c.key} value={c.render(row)} />
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      {config.resource === 'cases' ? (
                        <Link
                          to={`/cases/${row.id}`}
                          className="text-sm font-medium text-brand-600 no-underline hover:underline dark:text-brand-300"
                        >
                          Open workspace →
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onOpen(row.id)}
                          className="text-sm font-medium text-slate-400 transition-colors hover:text-brand-600 group-hover:text-brand-600 dark:hover:text-brand-300"
                        >
                          Open →
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={config.columns.length + 1}
                      className="px-4 py-10 text-center text-sm text-slate-500"
                    >
                      Nothing on this page matches “{filter.trim()}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {data && allRows.length > 0 && <Pager page={data} onPage={setPage} busy={query.isFetching} />}
    </div>
  );
}

/** Render a cell — domain enums become colour-coded badges, everything else is plain text. */
function Cell({ resource, columnKey, value }: { resource: string; columnKey: string; value: string }) {
  if (resource === 'persons' && columnKey === 'risk') return <Badge tone={toneForRisk(value)}>{value}</Badge>;
  if (resource === 'cases' && columnKey === 'status') return <Badge tone={toneForStatus(value)}>{value}</Badge>;
  if (resource === 'person-cases' && columnKey === 'role') return <Badge tone={toneForRole(value)}>{value}</Badge>;
  if (resource === 'rules' && columnKey === 'enabled') {
    return <Badge tone={value === 'yes' ? 'green' : 'neutral'}>{value === 'yes' ? 'Enabled' : 'Disabled'}</Badge>;
  }
  if ((columnKey === 'name' || columnKey === 'title') && value)
    return <span className="font-medium text-slate-900 dark:text-slate-100">{value}</span>;
  return <span>{value}</span>;
}

function camel(resource: ResourceConfig['resource']): 'persons' | 'cases' | 'rules' | 'personCases' {
  return resource === 'person-cases' ? 'personCases' : resource;
}
