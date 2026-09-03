import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuditChanges } from './AuditChanges';
import { auditEntry } from '../test/fixtures';

// FR-036: the three operations render differently. FR-037: a @Sensitive field is changed-but-hidden
// with no reveal affordance anywhere.

describe('AuditChanges (FR-036)', () => {
  it('UPDATE shows previous and new for each dirty field', () => {
    render(<AuditChanges entry={auditEntry({ operation: 'UPDATE', changes: { city: { from: 'Haifa', to: 'Eilat' } } })} />);
    expect(screen.getByText('Haifa')).toBeInTheDocument();
    expect(screen.getByText('Eilat')).toBeInTheDocument();
    expect(screen.getByText('Previous')).toBeInTheDocument();
  });

  it('CREATE shows initial values with no implied previous column', () => {
    render(
      <AuditChanges
        entry={auditEntry({ operation: 'CREATE', entityVersion: 0, changes: { name: { to: 'AVI COHEN' }, age: { to: 35 } } })}
      />,
    );
    expect(screen.getByText('Initial value')).toBeInTheDocument();
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.getByText('AVI COHEN')).toBeInTheDocument();
  });

  it('DELETE shows an explicit statement, never an empty change list', () => {
    render(<AuditChanges entry={auditEntry({ operation: 'DELETE', changes: null })} />);
    expect(screen.getByText(/deletions record no field-level detail/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('AuditChanges masking (FR-037)', () => {
  it('a @Sensitive field renders as changed with both values masked and NO reveal affordance', () => {
    const { container } = render(
      <AuditChanges
        entry={auditEntry({ operation: 'UPDATE', changes: { nationalId: { from: '***', to: '***' } } })}
      />,
    );
    expect(screen.getByText('nationalId')).toBeInTheDocument();
    // the actual values never appear
    expect(container.textContent).not.toMatch(/\d{9}/);
    // no button, link, or disclosure that could reveal them
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText(/reveal|show value|unmask/i)).not.toBeInTheDocument();
  });
});
