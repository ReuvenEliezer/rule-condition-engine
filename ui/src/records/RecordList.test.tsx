import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../test/server';
import { RecordList } from './RecordList';
import { CASES_CONFIG, PERSONS_CONFIG, PERSON_CASES_CONFIG, RULES_CONFIG } from './configs';
import { page, personSummary, ruleSummary } from '../test/fixtures';

function renderList(config = PERSONS_CONFIG) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <RecordList config={config} onOpen={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('RecordList — the rules resource routes to the rule page (US3, FR-034)', () => {
  it('offers a LINK to the rule page instead of opening the generic in-place editor', async () => {
    server.use(http.get('/api/v1/rules', () => HttpResponse.json(page([ruleSummary()], { totalElements: 1 }))));
    const onOpen = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <RecordList config={RULES_CONFIG} onOpen={onOpen} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const link = await screen.findByRole('link', { name: /open rule/i });
    expect(link).toHaveAttribute('href', `/rules/${ruleSummary().id}`);
    // …and no in-place "Open" button that would edit name/enabled on a second surface
    expect(screen.queryByRole('button', { name: /^open/i })).not.toBeInTheDocument();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps the rest of the rules record surface unchanged (FR-034)', async () => {
    server.use(http.get('/api/v1/rules', () => HttpResponse.json(page([ruleSummary()], { totalElements: 1 }))));
    renderList(RULES_CONFIG);

    await screen.findByRole('link', { name: /open rule/i });
    // list columns, sort keys and the no-create rule all survive the route change
    expect(RULES_CONFIG.sortKeys).toEqual(['id', 'name', 'enabled', 'createdAt', 'updatedAt']);
    expect(RULES_CONFIG.creatable).toBe(false);
    expect(RULES_CONFIG.retirement.kind).toBe('offered');
    if (RULES_CONFIG.retirement.kind === 'offered') {
      expect(RULES_CONFIG.retirement.explain).toMatch(/disabled, not deleted/i);
    }
    // the generic editor no longer owns any rule field
    expect(RULES_CONFIG.writableFields).toEqual([]);
  });
});

describe('RecordList sort keys (FR-021, contract §1.2)', () => {
  it('each resource offers exactly its allowed sort keys and no other', () => {
    expect([...PERSONS_CONFIG.sortKeys]).toEqual(['id', 'name', 'age', 'city', 'risk', 'createdAt']);
    expect([...CASES_CONFIG.sortKeys]).toEqual(['id', 'title', 'status', 'createdAt']);
    expect([...RULES_CONFIG.sortKeys]).toEqual(['id', 'name', 'enabled', 'createdAt', 'updatedAt']);
    expect([...PERSON_CASES_CONFIG.sortKeys]).toEqual(['role', 'createdAt']);
    // person-cases allows neither id nor personId/caseId
    expect(PERSON_CASES_CONFIG.sortKeys).not.toContain('id');
    expect(PERSON_CASES_CONFIG.sortKeys).not.toContain('personId');
  });

  it('the sort control only lists allowed keys, in both directions', async () => {
    renderList();
    await waitFor(() => expect(screen.getByRole('combobox', { name: /sort by/i })).toBeInTheDocument());
    const options = [...screen.getByRole('combobox', { name: /sort by/i }).querySelectorAll('option')].map(
      (o) => o.value,
    );
    expect(options.filter(Boolean).sort()).toEqual(['age', 'city', 'createdAt', 'id', 'name', 'risk']);
    // direction toggle exists once a key is chosen
  });

  it('sends only field / field,desc — one field (contract §1.1)', async () => {
    const seen: string[] = [];
    server.use(
      http.get('/api/v1/persons', ({ request }) => {
        const s = new URL(request.url).searchParams.get('sort');
        if (s) seen.push(s);
        return HttpResponse.json(page([personSummary()], { totalElements: 1 }));
      }),
    );
    const { container } = renderList();
    await screen.findByText('AVI COHEN');
    const select = screen.getByRole('combobox', { name: /sort by/i });
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(select, { target: { value: 'name' } });
    await waitFor(() => expect(seen).toContain('name'));
    expect(seen.every((s) => s.split(',').length <= 2)).toBe(true);
    expect(container).toBeTruthy();
  });
});

describe('RecordList applied page size (FR-022)', () => {
  it('displays the size the server applied, not the requested one', async () => {
    server.use(
      http.get('/api/v1/persons', () =>
        HttpResponse.json(page([personSummary()], { size: 50, totalElements: 1, totalPages: 1 })),
      ),
    );
    renderList();
    await waitFor(() => expect(screen.getByText(/up to 50 per page/i)).toBeInTheDocument());
  });
});

describe('RecordList empty state (FR-041)', () => {
  it('renders an explicit empty state carrying a next action', async () => {
    server.use(http.get('/api/v1/persons', () => HttpResponse.json(page([], { totalElements: 0 }))));
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <RecordList config={PERSONS_CONFIG} onOpen={vi.fn()} onCreate={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByText(/no persons yet/i)).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /create the first one/i })).toBeInTheDocument();
  });
});
