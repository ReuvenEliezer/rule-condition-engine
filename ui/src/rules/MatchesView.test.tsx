import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { LiveRegionProvider } from '../ui/LiveRegion';
import { MatchesView } from './MatchesView';
import { page, personSummary } from '../test/fixtures';

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveRegionProvider>
        <MemoryRouter>
          <MatchesView ruleId="r1" caseId="c1" />
        </MemoryRouter>
      </LiveRegionProvider>
    </QueryClientProvider>,
  );
}

describe('MatchesView (US2)', () => {
  it('the run action is unavailable until a scope is chosen (FR-014)', async () => {
    renderView();
    const runButton = screen.getByRole('button', { name: /run rule/i });
    expect(runButton).toBeDisabled();

    await userEvent.click(screen.getByLabelText(/whole population/i));
    expect(runButton).toBeEnabled();
  });

  it('the scope shown beside results is the one sent (FR-014)', async () => {
    renderView();
    await userEvent.click(screen.getByLabelText(/this rule.s case only/i));
    await userEvent.click(screen.getByRole('button', { name: /run rule/i }));
    await waitFor(() => expect(screen.getByText(/Scope:/)).toBeInTheDocument());
    expect(screen.getByText('CASE_SCOPED')).toBeInTheDocument();
  });

  it('a match row renders no nationalId and offers no affordance implying it (FR-016, SC-004)', async () => {
    server.use(
      http.get('/api/v1/rules/:id/matches', () =>
        HttpResponse.json(page([personSummary({ name: 'AVI COHEN' })], { totalElements: 1 })),
      ),
    );
    const { container } = renderView();
    await userEvent.click(screen.getByLabelText(/whole population/i));
    await userEvent.click(screen.getByRole('button', { name: /run rule/i }));
    await waitFor(() => expect(screen.getByText('AVI COHEN')).toBeInTheDocument());

    expect(container.textContent).not.toMatch(/national/i);
    expect(screen.queryByText(/111111111/)).not.toBeInTheDocument();
  });

  it('an empty result is an explicit empty state, distinct from a failure (FR-018, SC-007)', async () => {
    server.use(
      http.get('/api/v1/rules/:id/matches', () => HttpResponse.json(page([], { totalElements: 0 }))),
    );
    renderView();
    await userEvent.click(screen.getByLabelText(/whole population/i));
    await userEvent.click(screen.getByRole('button', { name: /run rule/i }));
    await waitFor(() => expect(screen.getByText(/no person matches this rule/i)).toBeInTheDocument());
  });

  it('a broken stored rule names the fault and offers to open the rule (FR-019)', async () => {
    server.use(
      http.get('/api/v1/rules/:id/matches', () =>
        HttpResponse.json(
          { code: 'UNKNOWN_FIELD', message: "field 'nickname' is not queryable", timestamp: 't' },
          { status: 400 },
        ),
      ),
    );
    renderView();
    await userEvent.click(screen.getByLabelText(/whole population/i));
    await userEvent.click(screen.getByRole('button', { name: /run rule/i }));
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /open the rule to edit its condition/i })).toBeInTheDocument(),
    );
    expect(screen.getByText(/nickname/)).toBeInTheDocument();
  });
});
