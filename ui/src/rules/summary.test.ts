// SC-006: the summary must be correct for every tree in the corpus — a single comparison, a flat
// conjunction, a flat disjunction, a negation, a presence test, and groups nested to the service's
// maximum permitted depth.

import { describe, expect, it } from 'vitest';
import type { RuleNode } from '../api/tree';
import { summarise } from './summary';
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

describe('summarise (FR-004, SC-006)', () => {
  it('states a single comparison in one line, with the published label', () => {
    expect(summarise(cmp('name', 'CONTAINS', { type: 'STRING', value: 'cohen' }), FIELDS)).toBe(
      'Name contains "cohen"',
    );
  });

  it('joins a flat conjunction with AND and does not parenthesise the root', () => {
    const tree = group(
      'AND',
      cmp('name', 'CONTAINS', { type: 'STRING', value: 'cohen' }),
      cmp('age', 'GTE', { type: 'NUMBER', value: '30' }),
    );
    expect(summarise(tree, FIELDS)).toBe('Name contains "cohen" AND Age is at least 30');
  });

  it('joins a flat disjunction with OR', () => {
    const tree = group(
      'OR',
      cmp('city', 'EQUALS', { type: 'STRING', value: 'Haifa' }),
      cmp('city', 'EQUALS', { type: 'STRING', value: 'Acre' }),
    );
    expect(summarise(tree, FIELDS)).toBe('City equals "Haifa" OR City equals "Acre"');
  });

  it('parenthesises a NESTED group but not the root', () => {
    const tree = group(
      'AND',
      cmp('name', 'CONTAINS', { type: 'STRING', value: 'cohen' }),
      group(
        'OR',
        cmp('age', 'GTE', { type: 'NUMBER', value: '30' }),
        cmp('risk', 'IN', { type: 'LIST', values: ['HIGH', 'CRITICAL'] }),
      ),
    );
    expect(summarise(tree, FIELDS)).toBe(
      'Name contains "cohen" AND (Age is at least 30 OR Risk level is one of HIGH, CRITICAL)',
    );
  });

  it('always parenthesises a negation, even around a single leaf', () => {
    const tree = group('NOT', cmp('age', 'GTE', { type: 'NUMBER', value: '30' }));
    expect(summarise(tree, FIELDS)).toBe('NOT (Age is at least 30)');
  });

  it('renders a presence test in plain language, never as IS_NULL', () => {
    const tree: RuleNode = { type: 'UNARY', field: 'city', operator: 'IS_NULL' };
    expect(summarise(tree, FIELDS)).toBe('City has no value');
    expect(summarise(tree, FIELDS)).not.toContain('IS_NULL');
  });

  it('renders a range as two bounds', () => {
    expect(summarise(cmp('age', 'BETWEEN', { type: 'RANGE', from: '30', to: '45' }), FIELDS)).toBe(
      'Age is between 30 and 45',
    );
  });

  it('prints a numeric operand verbatim — never re-rounded (SC-004)', () => {
    expect(summarise(cmp('age', 'GTE', { type: 'NUMBER', value: '10.50' }), FIELDS)).toBe(
      'Age is at least 10.50',
    );
  });

  it('stays a sentence when a node is incomplete', () => {
    expect(summarise(cmp('name', 'EQUALS', { type: 'STRING', value: '' }), FIELDS)).toBe('Name equals …');
    expect(summarise(group('AND'), FIELDS)).toBe('…');
  });

  it('marks a field the service no longer publishes, without substituting another', () => {
    const summary = summarise(cmp('nickname', 'EQUALS', { type: 'STRING', value: 'avi' }), FIELDS);
    expect(summary).toBe('nickname (unavailable) equals "avi"');
    expect(summary).not.toContain('Name');
  });

  it('is correct at the maximum permitted nesting depth', () => {
    // depth 8: seven nested groups around one leaf
    let tree: RuleNode = cmp('age', 'GTE', { type: 'NUMBER', value: '1' });
    for (let i = 0; i < 7; i += 1) tree = group('AND', tree);

    const summary = summarise(tree, FIELDS);
    // the root sheds its parentheses; the six inner groups keep theirs
    expect(summary).toBe('((((((Age is at least 1))))))');
  });
});
