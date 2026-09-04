// Pre-send tree validators (FR-006, FR-007). Each mirrors a compact constructor in rule/model/
// that would otherwise reject the request, moved one layer earlier (constitution principle II).
// Client validation MIRRORS, never replaces — a rejection that still gets through is surfaced,
// not suppressed.
//
// Structural budgets (depth 8, 128 nodes, 500 list entries) are deliberately NOT checked here.
// The server owns them and its RULE_TREE_TOO_COMPLEX rejection names which one was exceeded
// (FR-012, data-model.md §2.1).

import { isCondition, isGroup, isUnary, type ConditionValue, type RuleNode } from '../../api/tree';
import { isPublished, operandShape, type FieldMetadata } from '../metadata';
import { OPERATOR_LABELS } from '../../api/tree';

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

/**
 * @param fields the PUBLISHED metadata. A field the service no longer publishes is reported here
 *   rather than at save time: the service would reject it with UNKNOWN_FIELD, and a check the
 *   interface can make is a check it must make (FR-026, FR-039).
 */
export function validateTree(
  node: RuleNode,
  fields: readonly FieldMetadata[] = [],
  path: number[] = [],
): TreeViolation[] {
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
      out.push(...validateTree(child, fields, [...path, i]));
    });
    return out;
  }

  if (isUnary(node)) {
    if (!node.field) out.push({ path, message: 'Choose a field for this presence test.' });
    else out.push(...unavailableField(node.field, fields, path));
    return out;
  }

  if (isCondition(node)) {
    if (!node.field) out.push({ path, message: 'Choose a field for this condition.' });
    else out.push(...unavailableField(node.field, fields, path));

    const field = fields.find((f) => f.logicalName === node.field);
    if (field) {
      // The service decides field/operator compatibility and publishes the answer; an operator
      // outside that set is a rejection the interface can see coming (FR-027).
      if (!field.operators.includes(node.operator)) {
        out.push({
          path,
          message: `"${OPERATOR_LABELS[node.operator]}" cannot be used with ${field.label}.`,
        });
      }
      // A value whose shape does not match the operator is exactly what SC-003 forbids reaching
      // the wire, and what the node's compact constructor would reject on arrival.
      const expected = expectedValueType(operandShape(field, node.operator));
      if (expected && node.value.type !== expected) {
        out.push({
          path,
          message: `The value for ${field.label} does not match "${OPERATOR_LABELS[node.operator]}".`,
        });
      }
      out.push(...enumMembership(node.value, field, path));
    }

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

/**
 * Reported only when metadata is actually loaded: with an empty list every field would look
 * withdrawn, which would turn a still-loading page into a wall of false errors.
 */
function unavailableField(field: string, fields: readonly FieldMetadata[], path: number[]): TreeViolation[] {
  if (fields.length === 0 || isPublished(fields, field)) return [];
  return [{
    path,
    message: `The field "${field}" is no longer available. Choose another field or remove this condition.`,
  }];
}

/** The ConditionValue discriminator each operand shape requires, or null where any is acceptable. */
function expectedValueType(shape: ReturnType<typeof operandShape>): ConditionValue['type'] | null {
  switch (shape) {
    case 'RANGE':
      return 'RANGE';
    case 'LIST':
    case 'ENUM_LIST':
      return 'LIST';
    case 'NUMBER':
      return 'NUMBER';
    case 'STRING':
    case 'ENUM':
      return 'STRING';
    default:
      return null;
  }
}

/** An enumerated field accepts only its published values — the service rejects anything else. */
function enumMembership(
  value: ConditionValue,
  field: FieldMetadata,
  path: number[],
): TreeViolation[] {
  const permitted = field.enumValues;
  if (!permitted || permitted.length === 0) return [];
  const offending =
    value.type === 'STRING'
      ? [value.value].filter((v) => v !== '' && !permitted.includes(v))
      : value.type === 'LIST'
        ? value.values.filter((v) => v !== '' && !permitted.includes(v))
        : [];
  if (offending.length === 0) return [];
  return [{
    path,
    message: `${offending.join(', ')} is not a permitted value for ${field.label}. Allowed: ${permitted.join(', ')}.`,
  }];
}

export const isTreeValid = (node: RuleNode, fields: readonly FieldMetadata[] = []): boolean =>
  validateTree(node, fields).length === 0;
