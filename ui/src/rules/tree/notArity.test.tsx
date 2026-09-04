// FR-019 / FR-020: a negation takes exactly one child, and no path to enforcing that may discard a
// child the author put there.

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GroupNode, RuleNode } from '../../api/tree';
import { GroupNodeEditor } from './GroupNodeEditor';
import type { FieldMetadata } from '../metadata';
import { FIELD_METADATA } from '../../test/fixtures';

const FIELDS: readonly FieldMetadata[] = FIELD_METADATA;

const cmp = (value: string): RuleNode => ({
  type: 'CONDITION',
  field: 'name',
  operator: 'EQUALS',
  value: { type: 'STRING', value },
});

function renderGroup(node: GroupNode) {
  const onChange = vi.fn<(next: RuleNode) => void>();
  render(<GroupNodeEditor node={node} fields={FIELDS} path={[]} depth={0} isRoot onChange={onChange} />);
  return onChange;
}

describe('NOT arity (US2)', () => {
  it('leaves the Add controls PRESENT but disabled once a NOT holds one child', () => {
    renderGroup({ type: 'GROUP', operator: 'NOT', children: [cmp('a')] });

    for (const name of [/add condition/i, /add presence test/i, /add nested group/i]) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByText(/a negation takes exactly one child/i)).toBeInTheDocument();
    expect(screen.getByText(/wrap them in an explicit and or or group/i)).toBeInTheDocument();
  });

  it('allows adding to a NOT that is still empty', () => {
    renderGroup({ type: 'GROUP', operator: 'NOT', children: [] });
    expect(screen.getByRole('button', { name: /add condition/i })).toBeEnabled();
  });

  it('disables NOT while a group holds several children, rather than truncating them', () => {
    renderGroup({ type: 'GROUP', operator: 'AND', children: [cmp('a'), cmp('b'), cmp('c')] });

    const logic = screen.getByLabelText('Group logic');
    const notOption = within(logic).getByRole('option', { name: 'NOT' });
    expect(notOption).toBeDisabled();
    expect(screen.getByText(/NOT is unavailable while this group holds 3 children/i)).toBeInTheDocument();
  });

  it('wraps the children in an AND group, preserving all of them in order', async () => {
    const onChange = renderGroup({ type: 'GROUP', operator: 'AND', children: [cmp('a'), cmp('b'), cmp('c')] });
    await userEvent.click(screen.getByRole('button', { name: /wrap children in and/i }));

    const next = onChange.mock.calls[0]![0] as GroupNode;
    expect(next.children).toHaveLength(1);
    const wrapped = next.children[0] as GroupNode;
    expect(wrapped.type).toBe('GROUP');
    expect(wrapped.operator).toBe('AND');
    expect(wrapped.children).toHaveLength(3);
    expect(wrapped.children.map((c) => JSON.stringify(c))).toEqual(
      [cmp('a'), cmp('b'), cmp('c')].map((c) => JSON.stringify(c)),
    );
  });

  it('permits NOT once the children have been wrapped', () => {
    renderGroup({
      type: 'GROUP',
      operator: 'AND',
      children: [{ type: 'GROUP', operator: 'AND', children: [cmp('a'), cmp('b')] }],
    });

    const logic = screen.getAllByLabelText('Group logic')[0] as HTMLSelectElement;
    expect(within(logic).getByRole('option', { name: 'NOT' })).toBeEnabled();
  });

  it('reports an empty group and does not offer to wrap nothing', () => {
    renderGroup({ type: 'GROUP', operator: 'AND', children: [] });

    expect(screen.getByText(/empty/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /wrap children/i })).not.toBeInTheDocument();
  });
});
