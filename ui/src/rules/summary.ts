// The plain-language summary above the tree (FR-004, FR-005).
//
// Pure and total: it is computed from the DRAFT tree with useMemo, so it cannot fall out of step
// with what is on screen — there is no update path to forget. An incomplete node renders as an
// ellipsis rather than an empty string, so a half-built tree still reads as a sentence.
//
// Numeric operands are printed as the stored string, never through Number(): re-rounding "10.50"
// to "10.5" in the summary would contradict the tree it claims to describe (SC-004).

import { OPERATOR_LABELS, isCondition, isGroup, isUnary, type ConditionValue, type RuleNode } from '../api/tree';
import { isPublished, labelFor, type FieldMetadata } from './metadata';

/** Stands in for anything the author has not filled in yet. */
const BLANK = '…';

export function summarise(node: RuleNode, fields: readonly FieldMetadata[] = []): string {
  return render(node, fields, true);
}

function render(node: RuleNode, fields: readonly FieldMetadata[], isRoot: boolean): string {
  if (isGroup(node)) {
    if (node.children.length === 0) return BLANK;
    // A negation is ALWAYS parenthesised, even around a single leaf: "NOT Age is at least 30"
    // reads as though the negation binds to "Age" alone.
    if (node.operator === 'NOT') {
      return `NOT (${node.children.map((c) => render(c, fields, false)).join(' AND ')})`;
    }
    const joined = node.children.map((c) => render(c, fields, false)).join(` ${node.operator} `);
    // The root carries no parentheses — nesting is what the parentheses are for.
    return isRoot ? joined : `(${joined})`;
  }

  if (isUnary(node)) {
    return `${fieldName(node.field, fields)} ${OPERATOR_LABELS[node.operator]}`;
  }

  if (isCondition(node)) {
    return `${fieldName(node.field, fields)} ${OPERATOR_LABELS[node.operator]} ${renderValue(node.value)}`.trimEnd();
  }

  return BLANK;
}

/** An unpublished field keeps its stored name and is marked — never silently swapped (FR-039). */
function fieldName(logicalName: string, fields: readonly FieldMetadata[]): string {
  if (!logicalName) return BLANK;
  if (fields.length > 0 && !isPublished(fields, logicalName)) return `${logicalName} (unavailable)`;
  return labelFor(fields, logicalName);
}

function renderValue(value: ConditionValue): string {
  switch (value.type) {
    case 'STRING':
      return value.value === '' ? BLANK : `"${value.value}"`;
    case 'NUMBER':
      return value.value === '' ? BLANK : value.value;
    case 'RANGE':
      return value.from === '' || value.to === '' ? BLANK : `${value.from} and ${value.to}`;
    case 'LIST':
      return value.values.length === 0 ? BLANK : value.values.join(', ');
  }
}
