import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { LiveRegionProvider } from '../ui/LiveRegion';
import { CaseWorkspace } from './CaseWorkspace';
import { caseOverlinked, caseWithRule, caseWithoutRule } from '../test/handlers/cases';

function renderWorkspace() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveRegionProvider>
        <MemoryRouter>
          <CaseWorkspace caseId="c1" />
        </MemoryRouter>
      </LiveRegionProvider>
    </QueryClientProvider>,
  );
}

describe('CaseWorkspace (US4)', () => {
  it('a case with no rule offers to author one (FR-033)', async () => {
    server.use(http.get('/api/v1/cases/:id', () => HttpResponse.json(caseWithoutRule('c1'))));
    renderWorkspace();
    expect(await screen.findByRole('link', { name: /author one/i })).toHaveAttribute('href', '/rules/new');
  });

  it('a case with a rule offers to open it and run it case-scoped (FR-031, FR-033)', async () => {
    server.use(http.get('/api/v1/cases/:id', () => HttpResponse.json(caseWithRule('c1'))));
    renderWorkspace();
    expect(await screen.findByRole('link', { name: /open it to edit the condition/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /run this rule against the case/i }));
    // scope is pinned to CASE_SCOPED and locked
    const globalRadio = await screen.findByLabelText(/whole population/i);
    expect(globalRadio).toBeDisabled();
  });

  it('an over-linked case shows the true count and marks the subset partial (FR-032)', async () => {
    server.use(http.get('/api/v1/cases/:id', () => HttpResponse.json(caseOverlinked('c1'))));
    renderWorkspace();
    await waitFor(() => expect(screen.getByText(/41 linked in total/i)).toBeInTheDocument());
    expect(screen.getByText(/cannot be listed here/i)).toBeInTheDocument();
  });

  it('closing the case reflects immediately and it stays readable (US4-4, US4-5)', async () => {
    let status = 'OPEN';
    server.use(
      http.get('/api/v1/cases/:id', () => HttpResponse.json({ ...caseWithoutRule('c1'), status })),
      http.post('/api/v1/cases', async ({ request }) => {
        const body = (await request.json()) as { status: string };
        status = body.status;
        return HttpResponse.json({ ...caseWithoutRule('c1'), status });
      }),
    );
    renderWorkspace();
    await userEvent.click(await screen.findByRole('button', { name: /close this case/i }));
    await waitFor(() => expect(screen.getByText(/this case is closed but stays fully readable/i)).toBeInTheDocument());
  });
});
