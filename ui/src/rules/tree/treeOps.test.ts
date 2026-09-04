// US4: a move changes the ORDER of a group's children and nothing else (FR-022, FR-023).

import { describe, expect, it } from 'vitest';
import { countNodes, treeDepth, type GroupNode, type RuleNode } from '../../api/tree';
import { moveChild, wrapChildren } from './treeOps';

const cmp = (value: string): RuleNode => ({
  type: 'CONDITION',
  field: 'name',
  operator: 'EQUALS',
  value: { type: 'STRING', value },
});

const nested: GroupNode = {
  type: 'GROUP',
  operator: 'AND',
  children: [
    cmp('a'),
    { type: 'GROUP', operator: 'OR', children: [cmp('x'), cmp('y')] },
    cmp('c'),
  ],
};

const values = (n: RuleNode): string[] =>
  n.type === 'GROUP'
    ? n.children.map((c) => (c.type === 'GROUP' ? `(${values(c).join(',')})` : values(c)[0]!))
    : [n.type === 'CONDITION' && n.value.type === 'STRING' ? n.value.value : '?'];

describe('moveChild (US4)', () => {
  it('swaps a child with the one above it', () => {
    expect(values(moveChild(nested, [], 1, -1))).toEqual(['(x,y)', 'a', 'c']);
  });

  it('swaps a child with the one below it', () => {
    expect(values(moveChild(nested, [], 1, 1))).toEqual(['a', 'c', '(x,y)']);
  });

  it('is a no-op past either end', () => {
    expect(moveChild(nested, [], 0, -1)).toEqual(nested);
    expect(moveChild(nested, [], 2, 1)).toEqual(nested);
  });

  it('moves a nested group as a whole, leaving its own children untouched', () => {
    const moved = moveChild(nested, [], 1, -1) as GroupNode;
    const inner = moved.children[0] as GroupNode;
    expect(inner.type).toBe('GROUP');
    expect(inner.operator).toBe('OR');
    expect(values(inner)).toEqual(['x', 'y']);
  });

  it('changes neither the parent’s operator, nor the depth, nor the node count', () => {
    const moved = moveChild(nested, [], 1, 1) as GroupNode;
    expect(moved.operator).toBe(nested.operator);
    expect(treeDepth(moved)).toBe(treeDepth(nested));
    expect(countNodes(moved)).toBe(countNodes(nested));
    expect(moved.children).toHaveLength(nested.children.length);
  });

  it('does not mutate the input tree', () => {
    const before = JSON.stringify(nested);
    moveChild(nested, [], 1, -1);
    expect(JSON.stringify(nested)).toBe(before);
  });

  it('moves a child of a NESTED group without touching its siblings', () => {
    const moved = moveChild(nested, [1], 0, 1) as GroupNode;
    expect(values(moved)).toEqual(['a', '(y,x)', 'c']);
  });

  it('introduces no ordering attribute — children order is the only representation', () => {
    expect(JSON.stringify(moveChild(nested, [], 1, -1))).not.toContain('position');
  });
});

describe('wrapChildren (US2)', () => {
  it('wraps every child in one new group, preserving order', () => {
    const wrapped = wrapChildren(nested, [], 'AND') as GroupNode;
    expect(wrapped.children).toHaveLength(1);
    expect(values(wrapped.children[0]!)).toEqual(['a', '(x,y)', 'c']);
  });

  it('leaves an empty group alone — there is nothing to wrap', () => {
    const empty: RuleNode = { type: 'GROUP', operator: 'AND', children: [] };
    expect(wrapChildren(empty, [], 'AND')).toEqual(empty);
  });
});
