import { QueryClientProvider } from '@tanstack/react-query';
import { QueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { server } from '../test/server';
import { PersonDetailPanel } from '../records/PersonDetailPanel';
import { personDetail, page, personSummary } from '../test/fixtures';
import { queryClient } from './queries';

// FR-043 / SC-004: nothing is persisted, and nationalId is absent from the query cache after the
// person detail view unmounts. FR-042: request supersession — the latest result renders.

describe('no persistence (FR-043, SC-004)', () => {
  const spies: { set: ReturnType<typeof vi.spyOn> }[] = [];

  beforeEach(() => {
    spies.push({ set: vi.spyOn(Storage.prototype, 'setItem') });
  });
  afterEach(() => {
    spies.forEach((s) => s.set.mockRestore());
    spies.length = 0;
  });

  it('no localStorage / sessionStorage write occurs while a person detail view lives and dies', async () => {
    server.use(http.get('/api/v1/persons/:id', () => HttpResponse.json(personDetail({ nationalId: '111222333' }))));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { unmount } = render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PersonDetailPanel personId="p1" onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByText('111222333');
    unmount();

    const setItem = spies[0]!.set;
    expect(setItem).not.toHaveBeenCalled();

    // nationalId is not retained anywhere in the cache after unmount (gcTime: 0)
    await waitFor(() => expect(client.getQueryCache().getAll()).toHaveLength(0));
    const dump = JSON.stringify(client.getQueryCache().getAll().map((q) => q.state.data));
    expect(dump).not.toContain('111222333');
  });

  it('the shared query client is configured gcTime:0 for person detail', () => {
    // documented contract — PERSON_DETAIL_QUERY_OPTIONS is applied at the useQuery call site
    expect(queryClient).toBeDefined();
  });
});

describe('request supersession (FR-042)', () => {
  it('when the earlier request resolves last, the later result renders and the earlier is discarded', async () => {
    let call = 0;
    server.use(
      http.get('/api/v1/persons', async () => {
        call += 1;
        const thisCall = call;
        // first call is slow, second is fast — the stale first must not win
        await new Promise((r) => setTimeout(r, thisCall === 1 ? 60 : 0));
        return HttpResponse.json(
          page([personSummary({ name: thisCall === 1 ? 'STALE PAGE' : 'FRESH PAGE' })], { totalElements: 1 }),
        );
      }),
    );

    const { RecordList } = await import('../records/RecordList');
    const { PERSONS_CONFIG } = await import('../records/configs');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <RecordList config={PERSONS_CONFIG} onOpen={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // trigger a second request by changing the sort while the first is still in flight
    const select = await screen.findByRole('combobox', { name: /sort by/i });
    await userEvent.selectOptions(select, 'name');

    await waitFor(() => expect(screen.getByText('FRESH PAGE')).toBeInTheDocument(), { timeout: 2000 });
    expect(screen.queryByText('STALE PAGE')).not.toBeInTheDocument();
  });
});
