// Renders PageResponse.page / totalPages / totalElements and the APPLIED size — never a requested
// one (FR-015, FR-022). The total always comes from the envelope; the pager never triggers extra
// fetches to count (SC-006).

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PageResponse } from '../api/types';
import { Button } from './components/Button';

export type PagerProps = {
  page: Pick<PageResponse<unknown>, 'page' | 'size' | 'totalElements' | 'totalPages'>;
  onPage: (nextZeroBased: number) => void;
  busy?: boolean;
};

export function Pager({ page, onPage, busy = false }: PagerProps) {
  const { page: current, size, totalElements, totalPages } = page;
  const hasPrev = current > 0;
  const hasNext = current + 1 < totalPages;

  return (
    <nav
      className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Pagination"
    >
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Page <span className="font-medium text-slate-700 dark:text-slate-200">{current + 1}</span> of{' '}
        {Math.max(totalPages, 1)} · {totalElements} {totalElements === 1 ? 'record' : 'records'}, showing up to{' '}
        {size} per page
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" disabled={!hasPrev || busy} onClick={() => onPage(current - 1)}>
          <ChevronLeft className="size-4" aria-hidden />
          Previous
        </Button>
        <Button size="sm" disabled={!hasNext || busy} onClick={() => onPage(current + 1)}>
          Next
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
