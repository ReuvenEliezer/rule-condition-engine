// US3: name, enabled state and conditions on one page, committed in ONE action carrying the
// version read at load. Plus US5's two page-level obligations: an unpublished field is shown and
// blocks saving, and a metadata failure is its own retryable failure.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { LiveRegionProvider } from '../ui/LiveRegion';
import { RulePage } from './RulePage';
import { ruleDetail } from '../test/fixtures';

const RULE_ID = '33333333-3333-3333-3333-333333333333';

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveRegionProvider>
        <MemoryRouter>
          <RulePage ruleId={RULE_ID} />
        </MemoryRouter>
      </LiveRegionProvider>
    </QueryClientProvider>,
  );
}

/** Captures every POST /rules body the page sends. */
function captureSaves() {
  const bodies: Record<string, unknown>[] = [];
  server.use(
    http.post('/api/v1/rules', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      bodies.push(body);
      return HttpResponse.json(ruleDetail({ name: String(body.name), version: 1 }));
    }),
  );
  return bodies;
}

describe('RulePage (US3)', () => {
  it('commits a name change AND a condition change in exactly ONE request (FR-033, SC-009)', async () => {
    const bodies = captureSaves();
    renderPage();

    const name = await screen.findByRole('textbox', { name: /name/i });
    await userEvent.clear(name);
    await userEvent.type(name, 'Renamed rule');

    // change a condition value too, so the save carries both
    const values = screen.getAllByLabelText('From');
    await userEvent.clear(values[0]!);
    await userEvent.type(values[0]!, '31');

    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ id: RULE_ID, name: 'Renamed rule', enabled: true });
    // A RANGE bound is a BigDecimal on the wire, emitted as a bare number by the lossless codec —
    // "from":31, never "from":"31". Asserting the quoted form would be asserting a bug.
    expect(JSON.stringify(bodies[0]!.condition)).toContain('"from":31');
  });

  it('carries the version READ AT LOAD, and never the service-owned fields (FR-033a, FR-032)', async () => {
    const bodies = captureSaves();
    renderPage();

    await screen.findByRole('textbox', { name: /name/i });
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toHaveProperty('version', 0);
    for (const owned of ['type', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy']) {
      expect(bodies[0]).not.toHaveProperty(owned);
    }
  });

  it('refuses a stale save, preserves the draft, and offers a reload (FR-033b)', async () => {
    server.use(
      http.post('/api/v1/rules', () =>
        HttpResponse.json(
          { code: 'CONCURRENT_MODIFICATION', message: 'The record was modified by another request' },
          { status: 409 },
        ),
      ),
    );
    renderPage();

    const name = await screen.findByRole('textbox', { name: /name/i });
    await userEvent.clear(name);
    await userEvent.type(name, 'My unsaved edit');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText(/your copy is out of date/i)).toBeInTheDocument();
    // the author's work is STILL on screen
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('My unsaved edit');
    expect(screen.getByRole('button', { name: /reload the current version/i })).toBeInTheDocument();
  });

  it('blocks the save on an empty name, with the message on the name control (US3 scenario 4)', async () => {
    renderPage();
    const name = await screen.findByRole('textbox', { name: /name/i });
    await userEvent.clear(name);

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription(/enter a name for this rule/i);
  });

  it('shows service-owned values as text with no editable control (FR-032)', async () => {
    renderPage();
    await screen.findByRole('textbox', { name: /name/i });

    // present as text…
    expect(screen.getByText('Rule id')).toBeInTheDocument();
    expect(screen.getByText(RULE_ID)).toBeInTheDocument();
    // twice: created by, and last changed by
    expect(screen.getAllByText(/by system/)).toHaveLength(2);

    // …and editable only as name, enabled and the condition controls
    const textboxes = screen.getAllByRole('textbox').map((el) => el.getAttribute('aria-label') ?? 'name');
    expect(textboxes).not.toContain('Rule id');
    expect(screen.queryByRole('textbox', { name: /case/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /created/i })).not.toBeInTheDocument();
  });

  it('keeps a DISABLED rule fully editable (FR-032a, US3 scenario 7)', async () => {
    server.use(http.get('/api/v1/rules/:id', () => HttpResponse.json(ruleDetail({ enabled: false }))));
    renderPage();

    const enabled = await screen.findByRole('checkbox', { name: /enabled/i });
    expect(enabled).not.toBeChecked();
    expect(enabled).toBeEnabled();
    expect(screen.getByRole('textbox', { name: /name/i })).toBeEnabled();
    expect(screen.getAllByLabelText(/^field$/i)[0]).toBeEnabled();
  });

  it('reaches the rule’s history from the page (FR-035)', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /history for this record/i });
    expect(link).toHaveAttribute('href', expect.stringContaining(`recordId=${RULE_ID}`));
  });
});

describe('RulePage — published metadata (US5)', () => {
  it('shows an unpublished field verbatim and blocks the save (FR-039)', async () => {
    server.use(
      http.get('/api/v1/rules/:id', () =>
        HttpResponse.json(
          ruleDetail({
            condition: { type: 'CONDITION', field: 'nickname', operator: 'EQUALS', value: { type: 'STRING', value: 'avi' } },
          }),
        ),
      ),
    );
    renderPage();

    expect(await screen.findByRole('option', { name: /nickname — no longer available/i })).toBeDisabled();
    const reasons = screen.getByRole('list', { name: /why this rule cannot be saved yet/i });
    expect(within(reasons).getByText(/"nickname" is no longer available/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('reports a metadata failure as its OWN retryable failure, distinct from the rule (FR-040)', async () => {
    server.use(http.get('/api/v1/rules/fields/metadata', () => HttpResponse.error()));
    renderPage();

    expect(await screen.findByText(/field choices could not be loaded/i)).toBeInTheDocument();
    // the rule itself loaded fine, and says so
    expect(screen.getByRole('textbox', { name: /name/i })).toHaveValue('High-risk Avis');
    expect(screen.queryByText(/this rule no longer exists/i)).not.toBeInTheDocument();
  });
});
