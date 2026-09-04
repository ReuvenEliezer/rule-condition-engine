// FR-027: the checks the interface owns. Every one mirrors a server-side check moved one layer
// earlier — and FR-029's three structural budgets are deliberately NOT among them.

import { describe, expect, it } from 'vitest';
import type { RuleNode } from '../../api/tree';
import { validateTree } from './validate';
import type { FieldMetadata } from '../metadata';
import { FIELD_METADATA } from '../../test/fixtures';

const FIELDS: readonly FieldMetadata[] = FIELD_METADATA;
const messages = (node: RuleNode) => validateTree(node, FIELDS).map((v) => v.message);

const cmp = (field: string, operator: string, value: unknown): RuleNode =>
  ({ type: 'CONDITION', field, operator, value }) as RuleNode;

describe('validateTree (US2)', () => {
  it('accepts a well-formed tree', () => {
    expect(messages(cmp('age', 'GTE', { type: 'NUMBER', value: '30' }))).toEqual([]);
  });

  it('reports an empty group', () => {
    expect(messages({ type: 'GROUP', operator: 'AND', children: [] })).toContainEqual(
      expect.stringMatching(/empty/i),
    );
  });

  it('reports a NOT with more than one child', () => {
    const node: RuleNode = {
      type: 'GROUP',
      operator: 'NOT',
      children: [cmp('age', 'GTE', { type: 'NUMBER', value: '1' }), cmp('age', 'LT', { type: 'NUMBER', value: '9' })],
    };
    expect(messages(node)).toContainEqual(expect.stringMatching(/exactly one child/i));
  });

  it('reports an operator the field does not publish', () => {
    expect(messages(cmp('createdAt', 'GT', { type: 'NUMBER', value: '1' }))).toContainEqual(
      expect.stringMatching(/cannot be used with Created at/i),
    );
  });

  it('reports a value whose shape does not match the operator', () => {
    expect(messages(cmp('age', 'BETWEEN', { type: 'NUMBER', value: '30' }))).toContainEqual(
      expect.stringMatching(/does not match "is between"/i),
    );
  });

  it('reports an enum value outside the published permitted values', () => {
    expect(messages(cmp('risk', 'EQUALS', { type: 'STRING', value: 'SEVERE' }))).toContainEqual(
      expect.stringMatching(/SEVERE is not a permitted value.*LOW, MEDIUM, HIGH, CRITICAL/i),
    );
  });

  it('accepts a permitted enum value, and a permitted enum list', () => {
    expect(messages(cmp('risk', 'EQUALS', { type: 'STRING', value: 'HIGH' }))).toEqual([]);
    expect(messages(cmp('risk', 'IN', { type: 'LIST', values: ['HIGH', 'CRITICAL'] }))).toEqual([]);
  });

  it('reports an inverted range, naming both bounds', () => {
    expect(messages(cmp('age', 'BETWEEN', { type: 'RANGE', from: '45', to: '30' }))).toContainEqual(
      expect.stringMatching(/inverted: 45 is greater than 30/i),
    );
  });

  it('reports an empty list and a blank list entry', () => {
    expect(messages(cmp('city', 'IN', { type: 'LIST', values: [] }))).toContainEqual(
      expect.stringMatching(/at least one value/i),
    );
    expect(messages(cmp('city', 'IN', { type: 'LIST', values: ['Haifa', ' '] }))).toContainEqual(
      expect.stringMatching(/blank entry/i),
    );
  });

  it('reports an empty text value and a non-numeric number', () => {
    expect(messages(cmp('name', 'EQUALS', { type: 'STRING', value: '' }))).toContainEqual(
      expect.stringMatching(/enter a value/i),
    );
    expect(messages(cmp('age', 'GTE', { type: 'NUMBER', value: 'abc' }))).toContainEqual(
      expect.stringMatching(/enter a number/i),
    );
  });

  it('reports a field the service no longer publishes (FR-039)', () => {
    expect(messages(cmp('nickname', 'EQUALS', { type: 'STRING', value: 'avi' }))).toContainEqual(
      expect.stringMatching(/"nickname" is no longer available/i),
    );
  });

  it('reports nothing about an unknown field when metadata has not loaded yet', () => {
    // With an empty list every field would look withdrawn — a loading page must not read as a
    // wall of errors.
    expect(validateTree(cmp('nickname', 'EQUALS', { type: 'STRING', value: 'avi' }), [])).toEqual([]);
  });

  it('does NOT mirror the server’s depth, node-count or list-length budgets (FR-029)', () => {
    let deep: RuleNode = cmp('age', 'GTE', { type: 'NUMBER', value: '1' });
    for (let i = 0; i < 20; i += 1) deep = { type: 'GROUP', operator: 'AND', children: [deep] };
    expect(messages(deep)).toEqual([]);

    const longList = cmp('city', 'IN', {
      type: 'LIST',
      values: Array.from({ length: 900 }, (_, i) => `city-${i}`),
    });
    expect(messages(longList)).toEqual([]);
  });
});
