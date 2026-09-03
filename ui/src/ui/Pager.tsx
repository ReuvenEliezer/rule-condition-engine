// Renders PageResponse.page / totalPages / totalElements and the APPLIED size — never a requested
// one (FR-015, FR-022). The total always comes from the envelope; the pager never triggers extra
// fetches to count (SC-006).

import type { PageResponse } from '../api/types';

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
    <nav className="pager" aria-label="Pagination">
      <button type="button" disabled={!hasPrev || busy} onClick={() => onPage(current - 1)}>
        Previous
      </button>
      <span>
        {' '}
        Page {current + 1} of {Math.max(totalPages, 1)} — {totalElements}{' '}
        {totalElements === 1 ? 'record' : 'records'}, showing up to {size} per page{' '}
      </span>
      <button type="button" disabled={!hasNext || busy} onClick={() => onPage(current + 1)}>
        Next
      </button>
    </nav>
  );
}
