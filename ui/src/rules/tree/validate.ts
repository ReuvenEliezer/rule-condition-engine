// Pre-send tree validators (FR-006, FR-007). Each mirrors a compact constructor in rule/model/
// that would otherwise reject the request, moved one layer earlier (constitution principle II).
// Client validation MIRRORS, never replaces — a rejection that still gets through is surfaced,
// not suppressed.
//
// Structural budgets (depth 8, 128 nodes, 500 list entries) are deliberately NOT checked here.
// The server owns them and its RULE_TREE_TOO_COMPLEX rejection names which one was exceeded
// (FR-012, data-model.md §2.1).

import { isCondition, isGroup, isUnary, type RuleNode } from '../../api/tree';

export type TreeViolation = {
  /** a stable path so the offending node can be highlighted; root is [] */
  path: number[];
  message: string;
};

const compare = (a: string, b: string): number => {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a < b ? -1 : a > b ? 1 : 0;
};

export function validateTree(node: RuleNode, path: number[] = []): TreeViolation[] {
  const out: TreeViolation[] = [];

  if (isGroup(node)) {
    if (node.children.length === 0) {
      out.push({ path, message: `This ${node.operator} group is empty — add at least one condition.` });
    }
    if (node.operator === 'NOT' && node.children.length > 1) {
      out.push({
        path,
        message: 'A NOT group takes exactly one child — wrap multiple children in an explicit AND or OR.',
      });
    }
    node.children.forEach((child, i) => {
      out.push(...validateTree(child, [...path, i]));
    });
    return out;
  }

  if (isUnary(node)) {
    if (!node.field) out.push({ path, message: 'Choose a field for this presence test.' });
    return out;
  }

  if (isCondition(node)) {
    if (!node.field) out.push({ path, message: 'Choose a field for this condition.' });
    const v = node.value;
    switch (v.type) {
      case 'STRING':
        if (v.value.trim() === '') out.push({ path, message: `Enter a value for "${node.field}".` });
        break;
      case 'NUMBER':
        if (v.value.trim() === '' || !Number.isFinite(Number(v.value)))
          out.push({ path, message: `Enter a number for "${node.field}".` });
        break;
      case 'RANGE':
        if (v.from.trim() === '' || v.to.trim() === '') {
          out.push({ path, message: `Enter both bounds of the range for "${node.field}".` });
        } else if (compare(v.from, v.to) > 0) {
          out.push({
            path,
            message: `The range for "${node.field}" is inverted: ${v.from} is greater than ${v.to}.`,
          });
        }
        break;
      case 'LIST':
        if (v.values.length === 0) out.push({ path, message: `Add at least one value to the list for "${node.field}".` });
        if (v.values.some((x) => x.trim() === ''))
          out.push({ path, message: `The list for "${node.field}" contains a blank entry.` });
        break;
    }
    return out;
  }

  return out;
}

export const isTreeValid = (node: RuleNode): boolean => validateTree(node).length === 0;
