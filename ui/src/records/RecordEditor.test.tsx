import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '../test/server';
import { LiveRegionProvider } from '../ui/LiveRegion';
import { RecordEditor } from './RecordEditor';
import { splitValidation } from './RecordEditor';
import { PERSONS_CONFIG } from './configs';
import { personDetail } from '../test/fixtures';

function renderEditor(recordId: string | null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveRegionProvider>
        <MemoryRouter>
          <RecordEditor config={PERSONS_CONFIG} recordId={recordId} onSaved={vi.fn()} onDeleted={vi.fn()} />
        </MemoryRouter>
      </LiveRegionProvider>
    </QueryClientProvider>,
  );
}

describe('RecordEditor concurrency (FR-024, SC-005)', () => {
  it('after a CONCURRENT_MODIFICATION rejection, 100% of unsaved edits are still on screen and no silent re-read occurs', async () => {
    let getCalls = 0;
    server.use(
      http.get('/api/v1/persons/:id', ({ params }) => {
        getCalls += 1;
        return HttpResponse.json(personDetail({ id: String(params.id), name: 'ORIGINAL' }));
      }),
      http.post('/api/v1/persons', () =>
        HttpResponse.json(
          { code: 'CONCURRENT_MODIFICATION', message: 'stale version', timestamp: 't' },
          { status: 409 },
        ),
      ),
    );

    renderEditor('p1');
    const nameInput = await screen.findByLabelText('Name');
    await waitFor(() => expect(nameInput).toHaveValue('ORIGINAL'));

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'MY UNSAVED EDIT');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(screen.getByText(/changed in the service/i)).toBeInTheDocument());
    // the edit survived
    expect(screen.getByLabelText('Name')).toHaveValue('MY UNSAVED EDIT');
    // re-read is offered, not performed — GET count is still 1
    expect(getCalls).toBe(1);
    expect(screen.getByRole('button', { name: /reload the current record/i })).toBeInTheDocument();
  });
});

describe('splitValidation (contract §5.2)', () => {
  it('binds each "; "-separated part to its field', () => {
    const out = splitValidation('name must not be blank; age must be at most 149', PERSONS_CONFIG.writableFields);
    expect(out.name).toMatch(/blank/);
    expect(out.age).toMatch(/149/);
  });
});
