// US1: the tree is laid out visually — bounded, labelled containers with children indented inside
// their parent's bounds, and nothing participating in the condition hidden without a count.

import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RuleNode } from '../api/tree';
import { RuleConditionEditor } from './RuleConditionEditor';
import type { FieldMetadata } from './metadata';
import { FIELD_METADATA } from '../test/fixtures';

const FIELDS: readonly FieldMetadata[] = FIELD_METADATA;

const cmp = (field: string, operator: string, value: unknown): RuleNode =>
  ({ type: 'CONDITION', field, operator, value }) as RuleNode;
const group = (operator: 'AND' | 'OR' | 'NOT', ...children: RuleNode[]): RuleNode => ({
  type: 'GROUP',
  operator,
  children,
});

/** The US1 Independent Test fixture: two comparisons and a nested disjunction of two more. */
const nested = group(
  'AND',
  cmp('name', 'CONTAINS', { type: 'STRING', value: 'cohen' }),
  group(
    'OR',
    cmp('age', 'GTE', { type: 'NUMBER', value: '30' }),
    cmp('risk', 'IN', { type: 'LIST', values: ['HIGH'] }),
  ),
);

const renderTree = (tree: RuleNode) =>
  render(<RuleConditionEditor tree={tree} fields={FIELDS} onChange={vi.fn()} />);

/**
 * Condition groups, addressed by their header wording. Queried by NAME rather than by role alone
 * because an enum multi-select value control is legitimately a <fieldset> too, and a bare
 * getAllByRole('group') would count it as a condition group.
 */
const conditionGroups = () => screen.getAllByRole('group', { name: /Match (all|any) of the following/ });

describe('RuleConditionEditor (US1)', () => {
  it('renders a distinct bounded container per group', () => {
    renderTree(nested);
    expect(conditionGroups()).toHaveLength(2);
  });

  it('renders a nested group INSIDE its parent, not as a peer of its parent’s children', () => {
    renderTree(nested);
    const [outer, inner] = conditionGroups();
    expect(outer).not.toBe(inner);
    expect(outer!.contains(inner!)).toBe(true);
  });

  it('states each group’s logic in words, not only as a bare operator name (FR-006)', () => {
    renderTree(nested);
    expect(screen.getByText('Match all of the following')).toBeInTheDocument();
    expect(screen.getByText('Match any of the following')).toBeInTheDocument();
  });

  it('shows the plain-language summary above the tree, with the nested group parenthesised', () => {
    renderTree(nested);
    expect(screen.getByLabelText('What this rule checks')).toHaveTextContent(
      'Name contains "cohen" AND (Age is at least 30 OR Risk level is one of HIGH)',
    );
  });

  it('keeps every level distinguishable at depth 5', () => {
    let tree: RuleNode = cmp('age', 'GTE', { type: 'NUMBER', value: '1' });
    for (let i = 0; i < 4; i += 1) tree = group('AND', tree);
    renderTree(tree);

    const groups = conditionGroups();
    expect(groups).toHaveLength(4);
    // each level contains the next: membership is never ambiguous
    for (let i = 0; i < groups.length - 1; i += 1) {
      expect(groups[i]!.contains(groups[i + 1]!)).toBe(true);
    }
  });

  it('states how many nodes a collapsed group conceals (FR-007)', async () => {
    renderTree(nested);
    const [outer] = conditionGroups();
    await userEvent.click(within(outer!).getAllByRole('button', { name: /collapse/i })[0]!);

    // The container itself stays visible; the four nodes it contains are what it conceals.
    expect(screen.getByText(/4 nodes hidden/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand \(4 hidden\)/i })).toBeInTheDocument();
  });

  it('renders and edits a BARE LEAF root in place, with no wrapper group', () => {
    renderTree(cmp('name', 'EQUALS', { type: 'STRING', value: 'AVI' }));

    expect(screen.queryAllByRole('group', { name: /Match/ })).toHaveLength(0);
    expect(screen.getByLabelText('What this rule checks')).toHaveTextContent('Name equals "AVI"');
    expect(screen.getByDisplayValue('AVI')).toBeInTheDocument();
  });

  it('reorders a child and updates the summary with it (US4, FR-005)', async () => {
    function Harness() {
      const [tree, setTree] = useState<RuleNode>(nested);
      return <RuleConditionEditor tree={tree} fields={FIELDS} onChange={setTree} />;
    }
    render(<Harness />);

    expect(screen.getByLabelText('What this rule checks')).toHaveTextContent(
      'Name contains "cohen" AND (Age is at least 30 OR Risk level is one of HIGH)',
    );

    await userEvent.click(screen.getByRole('button', { name: /move group 2 up/i }));

    // the nested group is now first, and the summary says so
    expect(screen.getByLabelText('What this rule checks')).toHaveTextContent(
      '(Age is at least 30 OR Risk level is one of HIGH) AND Name contains "cohen"',
    );
    // nesting is unchanged: still exactly two condition groups, one inside the other
    expect(conditionGroups()).toHaveLength(2);
  });

  it('keeps the move controls present but disabled at the ends (FR-024)', () => {
    renderTree(nested);
    // outer group: [condition 1, group 2]
    expect(screen.getByRole('button', { name: 'Move condition 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move condition 1 down' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move group 2 down' })).toBeDisabled();
    // inner group: [condition 2.1, condition 2.2] — names are path-qualified, so unique
    expect(screen.getByRole('button', { name: 'Move condition 2.1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move condition 2.2 down' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move condition 2.1 down' })).toBeEnabled();
  });

  it('gives every move control a unique accessible name across nesting levels (FR-044)', () => {
    renderTree(nested);
    const names = screen
      .getAllByRole('button', { name: /^Move / })
      .map((b) => b.getAttribute('aria-label'));
    expect(new Set(names).size).toBe(names.length);
  });

  it('disables both move controls in a one-child group', () => {
    renderTree(group('AND', cmp('name', 'EQUALS', { type: 'STRING', value: 'A' })));
    expect(screen.getByRole('button', { name: /move condition 1 up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move condition 1 down/i })).toBeDisabled();
  });

  it('lists the reasons a tree cannot be saved yet', () => {
    renderTree(group('AND'));
    const reasons = screen.getByRole('list', { name: /why this rule cannot be saved yet/i });
    expect(within(reasons).getByText(/empty/i)).toBeInTheDocument();
  });
});
