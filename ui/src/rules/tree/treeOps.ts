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
import { CATALOG_BY_NAME, operandShape, type FieldCatalogEntry } from '../catalog';

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

// ---- default operand values ------------------------------------------------------------------

export function defaultValueFor(entry: FieldCatalogEntry, operator: ComparisonOperator): ConditionValue {
  switch (operandShape(entry, operator)) {
    case 'RANGE':
      return { type: 'RANGE', from: '', to: '' };
    case 'LIST':
    case 'ENUM_LIST':
      return { type: 'LIST', values: [] };
    case 'NUMBER':
      return { type: 'NUMBER', value: '' };
    case 'ENUM':
      return { type: 'STRING', value: entry.enumValues?.[0] ?? '' };
    default:
      return { type: 'STRING', value: '' };
  }
}

/** A fresh CONDITION leaf seeded to the first catalog field and its first operator. */
export function newConditionLeaf(fieldName = CATALOG_BY_NAME.keys().next().value ?? 'name'): RuleNode {
  const entry = CATALOG_BY_NAME.get(fieldName);
  const operator: ComparisonOperator = entry?.operators[0] ?? 'EQUALS';
  return {
    type: 'CONDITION',
    field: fieldName,
    operator,
    value: entry ? defaultValueFor(entry, operator) : { type: 'STRING', value: '' },
  };
}

export const newUnaryLeaf = (fieldName = 'name'): RuleNode => ({
  type: 'UNARY',
  field: fieldName,
  operator: 'IS_NULL',
});

export const newGroup = (operator: GroupOperator = 'AND'): RuleNode => emptyGroup(operator);
