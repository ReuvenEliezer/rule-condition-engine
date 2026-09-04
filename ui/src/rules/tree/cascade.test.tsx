// US2: no sequence of field / operator / value edits may produce a condition whose value shape
// does not match its operator (SC-003), and no operator may be offered that the service would
// reject (FR-011).

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ConditionNode, RuleNode, UnaryConditionNode } from '../../api/tree';
import { ConditionLeafEditor } from './ConditionLeafEditor';
import { UnaryLeafEditor } from './UnaryLeafEditor';
import type { FieldMetadata } from '../metadata';
import { FIELD_METADATA } from '../../test/fixtures';

const FIELDS: readonly FieldMetadata[] = FIELD_METADATA;

const condition = (over: Partial<ConditionNode> = {}): ConditionNode => ({
  type: 'CONDITION',
  field: 'name',
  operator: 'CONTAINS',
  value: { type: 'STRING', value: 'cohen' },
  ...over,
});

/** Option values of a <select>, read through a typed DOM query rather than a type assertion. */
const optionValues = (select: HTMLElement): string[] =>
  Array.from(select.querySelectorAll('option'), (o) => o.value);

const optionLabels = (select: HTMLElement): string[] =>
  Array.from(select.querySelectorAll('option'), (o) => o.textContent ?? '');

function renderLeaf(node: ConditionNode) {
  const onChange = vi.fn<(next: RuleNode) => void>();
  render(<ConditionLeafEditor node={node} fields={FIELDS} onChange={onChange} />);
  return onChange;
}

describe('field → operator → value cascade (US2)', () => {
  it('resets the operator AND the value when the field changes to a different type (FR-015)', async () => {
    const onChange = renderLeaf(condition());
    await userEvent.selectOptions(screen.getByLabelText(/field/i), 'age');

    const next = onChange.mock.calls[0]![0] as ConditionNode;
    expect(next.field).toBe('age');
    // CONTAINS is not published for a NUMBER field, so it cannot survive
    expect(next.operator).not.toBe('CONTAINS');
    expect(FIELD_METADATA.find((f) => f.logicalName === 'age')!.operators).toContain(next.operator);
    expect(next.value).toEqual({ type: 'NUMBER', value: '' });
  });

  it('keeps the operator when the new field still publishes it, but still resets the value', async () => {
    const onChange = renderLeaf(condition({ field: 'name', operator: 'EQUALS' }));
    await userEvent.selectOptions(screen.getByLabelText(/field/i), 'city');

    const next = onChange.mock.calls[0]![0] as ConditionNode;
    expect(next.operator).toBe('EQUALS');
    expect(next.value).toEqual({ type: 'STRING', value: '' });
  });

  it('discards the value when the operator’s shape changes (FR-014, SC-003)', async () => {
    const onChange = renderLeaf(condition({ field: 'age', operator: 'GTE', value: { type: 'NUMBER', value: '30' } }));
    await userEvent.selectOptions(screen.getByLabelText(/operator/i), 'BETWEEN');

    const next = onChange.mock.calls[0]![0] as ConditionNode;
    expect(next.value).toEqual({ type: 'RANGE', from: '', to: '' });
  });

  it('carries the value across when the shape is unchanged', async () => {
    const onChange = renderLeaf(condition({ field: 'age', operator: 'GTE', value: { type: 'NUMBER', value: '30' } }));
    await userEvent.selectOptions(screen.getByLabelText(/operator/i), 'LT');

    const next = onChange.mock.calls[0]![0] as ConditionNode;
    expect(next.value).toEqual({ type: 'NUMBER', value: '30' });
  });

  it('discards the surplus bound when a range operator is replaced by a single-value one', async () => {
    const onChange = renderLeaf(
      condition({ field: 'age', operator: 'BETWEEN', value: { type: 'RANGE', from: '30', to: '45' } }),
    );
    await userEvent.selectOptions(screen.getByLabelText(/operator/i), 'GTE');

    const next = onChange.mock.calls[0]![0] as ConditionNode;
    expect(next.value).toEqual({ type: 'NUMBER', value: '' });
    expect(JSON.stringify(next.value)).not.toContain('45');
  });

  it('offers no ordered operator on a text or timestamp field (FR-011)', () => {
    for (const field of ['name', 'createdAt'] as const) {
      const { unmount } = render(
        <ConditionLeafEditor node={condition({ field, operator: 'EQUALS' })} fields={FIELDS} onChange={vi.fn()} />,
      );
      const options = optionValues(screen.getByLabelText(/operator/i));
      expect(options).not.toContain('GT');
      expect(options).not.toContain('BETWEEN');
      unmount();
    }
  });

  it('offers presence tests on every field, labelled in plain language', () => {
    render(<ConditionLeafEditor node={condition()} fields={FIELDS} onChange={vi.fn()} />);
    const operator = screen.getByLabelText(/operator/i);
    expect(optionValues(operator)).toEqual(expect.arrayContaining(['IS_NULL', 'IS_NOT_NULL']));
    expect(optionLabels(operator)).toEqual(expect.arrayContaining(['has no value']));
  });

  it('offers an enumerated field’s value as a closed choice, never free text (FR-013)', () => {
    render(
      <ConditionLeafEditor
        node={condition({ field: 'risk', operator: 'EQUALS', value: { type: 'STRING', value: 'HIGH' } })}
        fields={FIELDS}
        onChange={vi.fn()}
      />,
    );
    const value = screen.getByLabelText('Value');
    expect(value.tagName).toBe('SELECT');
    expect(optionValues(value)).toEqual(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
  });

  it('converts to a presence test and back, dropping then restoring the value (FR-016)', async () => {
    const toUnary = renderLeaf(condition());
    await userEvent.selectOptions(screen.getByLabelText(/operator/i), 'IS_NULL');

    const unary = toUnary.mock.calls[0]![0] as UnaryConditionNode;
    expect(unary).toEqual({ type: 'UNARY', field: 'name', operator: 'IS_NULL' });
    expect(unary).not.toHaveProperty('value');

    const back = vi.fn<(next: RuleNode) => void>();
    const { rerender } = render(<div />);
    rerender(<UnaryLeafEditor node={unary} fields={FIELDS} onChange={back} />);
    await userEvent.selectOptions(screen.getAllByLabelText(/operator/i)[1]!, 'EQUALS');

    expect(back.mock.calls[0]![0]).toEqual({
      type: 'CONDITION',
      field: 'name',
      operator: 'EQUALS',
      value: { type: 'STRING', value: '' },
    });
  });

  it('shows an unpublished field verbatim and never substitutes another (FR-039)', () => {
    render(
      <ConditionLeafEditor
        node={condition({ field: 'nickname' })}
        fields={FIELDS}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/field/i)).toHaveValue('nickname');
    expect(screen.getByRole('option', { name: /nickname — no longer available/i })).toBeDisabled();
  });
});
