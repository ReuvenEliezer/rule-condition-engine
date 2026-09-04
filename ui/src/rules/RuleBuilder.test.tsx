import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { LiveRegionProvider } from '../ui/LiveRegion';
import { RuleBuilder } from './RuleBuilder';
import { canonicalTree } from '../test/fixtures';

function renderBuilder(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LiveRegionProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </LiveRegionProvider>
    </QueryClientProvider>,
  );
}

// The drift-check test that lived here is deliberately gone with its subject: it asserted the
// blocked-builder state produced when the client's field catalog disagreed with the service. There
// is now one copy of that metadata, so there is nothing to disagree, and SC-007 requires that the
// builder never enter a blocked state at all.
describe('RuleBuilder', () => {
  it('previews explicitly, on demand — count comes from totalElements', async () => {
    renderBuilder(<RuleBuilder mode="edit" ruleId="r1" initialTree={canonicalTree} />);
    const runButton = await screen.findByRole('button', { name: /run preview/i });
    await userEvent.click(runButton);
    await waitFor(() => expect(screen.getByText(/people match this condition/i)).toBeInTheDocument());
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('marks the previous count stale after the tree is edited', async () => {
    renderBuilder(<RuleBuilder mode="edit" ruleId="r1" initialTree={canonicalTree} />);
    await userEvent.click(await screen.findByRole('button', { name: /run preview/i }));
    await waitFor(() => expect(screen.getByText(/people match/i)).toBeInTheDocument());

    // change the AND to OR at the root
    const groupSelect = screen.getAllByRole('combobox')[0]!;
    await userEvent.selectOptions(groupSelect, 'OR');
    await waitFor(() => expect(screen.getByText(/condition has changed since this count/i)).toBeInTheDocument());
  });
});
