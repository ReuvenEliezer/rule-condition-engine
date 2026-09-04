// Immutable path-addressed updates for the draft tree. A path is a list of child indices from the
// root; [] is the root. The builder holds one draft RuleNode and threads these helpers through.

import {
  emptyGroup,
  isGroup,
  type ComparisonOperator,
  type ConditionValue,
  type GroupOperator,
  type RuleNode,
} from '../../api/tree';
import { operandShape, type FieldMetadata } from '../metadata';

export type NodePath = number[];

function replaceAt(node: RuleNode, path: NodePath, fn: (n: RuleNode) => RuleNode): RuleNode {
  if (path.length === 0) return fn(node);
  if (!isGroup(node)) return node;
  const [head, ...rest] = path;
  const idx = head ?? 0;
  return {
    ...node,
    children: node.children.map((child, i) => (i === idx ? replaceAt(child, rest, fn) : child)),
  };
}

export const getNode = (node: RuleNode, path: NodePath): RuleNode | undefined => {
  let cur: RuleNode | undefined = node;
  for (const idx of path) {
    if (!cur || !isGroup(cur)) return undefined;
    cur = cur.children[idx];
  }
  return cur;
};

export const setGroupOperator = (root: RuleNode, path: NodePath, operator: GroupOperator): RuleNode =>
  replaceAt(root, path, (n) => (isGroup(n) ? { ...n, operator } : n));

export const addChild = (root: RuleNode, path: NodePath, child: RuleNode): RuleNode =>
  replaceAt(root, path, (n) => (isGroup(n) ? { ...n, children: [...n.children, child] } : n));

export const removeChild = (root: RuleNode, parentPath: NodePath, index: number): RuleNode =>
  replaceAt(root, parentPath, (n) =>
    isGroup(n) ? { ...n, children: n.children.filter((_, i) => i !== index) } : n,
  );

export const replaceNode = (root: RuleNode, path: NodePath, next: RuleNode): RuleNode =>
  replaceAt(root, path, () => next);

/**
 * Wraps a group's children in one new group of the given operator, preserving their order.
 *
 * This is the remedy offered when an author wants to negate several conditions: a NOT takes exactly
 * one child, so the children must be wrapped explicitly. Doing it on request rather than
 * automatically matters — it is a structural edit that changes the tree's depth, and FR-020 forbids
 * silently discarding children to make NOT fit.
 */
export const wrapChildren = (root: RuleNode, path: NodePath, operator: GroupOperator): RuleNode =>
  replaceAt(root, path, (n) =>
    isGroup(n) && n.children.length > 0
      ? { ...n, children: [{ type: 'GROUP', operator, children: n.children }] }
      : n,
  );

/**
 * Moves a child one position within its OWN group. `delta` is -1 (up) or +1 (down); a move that
 * would leave the array is a no-op, which is what lets the controls stay present-but-disabled at
 * the ends rather than vanishing (FR-024).
 *
 * A swap inside `children` cannot change a node's parent, its subtree, or the tree's depth — so
 * FR-022 and FR-023 hold by construction rather than by test. Order needs no new representation:
 * `children` is already an ordered array that round-trips through storage (FR-025).
 */
export const moveChild = (root: RuleNode, parentPath: NodePath, index: number, delta: -1 | 1): RuleNode =>
  replaceAt(root, parentPath, (n) => {
    if (!isGroup(n)) return n;
    const target = index + delta;
    if (index < 0 || index >= n.children.length || target < 0 || target >= n.children.length) return n;
    const children = [...n.children];
    const moved = children[index]!;
    children[index] = children[target]!;
    children[target] = moved;
    return { ...n, children };
  });

// ---- default operand values ------------------------------------------------------------------

export function defaultValueFor(field: FieldMetadata | undefined, operator: ComparisonOperator): ConditionValue {
  switch (operandShape(field, operator)) {
    case 'RANGE':
      return { type: 'RANGE', from: '', to: '' };
    case 'LIST':
    case 'ENUM_LIST':
      return { type: 'LIST', values: [] };
    case 'NUMBER':
      return { type: 'NUMBER', value: '' };
    case 'ENUM':
      // Empty rather than pre-selected: a guessed enum value is a value the author never chose
      // (FR-017 — created empty and visibly incomplete, not pre-filled with a guess).
      return { type: 'STRING', value: '' };
    default:
      return { type: 'STRING', value: '' };
  }
}

/**
 * A fresh CONDITION leaf on the first published field and its first published operator — a valid
 * field/operator pairing by construction, with the value left empty (FR-017).
 */
export function newConditionLeaf(fields: readonly FieldMetadata[], fieldName?: string): RuleNode {
  const field = fields.find((f) => f.logicalName === (fieldName ?? fields[0]?.logicalName));
  const operator: ComparisonOperator = field?.operators[0] ?? 'EQUALS';
  return {
    type: 'CONDITION',
    field: field?.logicalName ?? fieldName ?? '',
    operator,
    value: defaultValueFor(field, operator),
  };
}

export const newUnaryLeaf = (fields: readonly FieldMetadata[], fieldName?: string): RuleNode => ({
  type: 'UNARY',
  field: fieldName ?? fields[0]?.logicalName ?? '',
  operator: 'IS_NULL',
});

export const newGroup = (operator: GroupOperator = 'AND'): RuleNode => emptyGroup(operator);
