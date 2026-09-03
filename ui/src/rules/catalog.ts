// The client field catalog — the documented stopgap for the type/operator/enum metadata that
// GET /api/v1/rules/fields does not publish (contracts/field-catalog.md, spec dependency #2).
//
// This is a COPY of server-side truth and will drift the moment a field is added, retyped or
// removed. The start-up check in catalogValidation.ts converts silent drift into a loud error.
//
// Derivation rule (field-catalog §1): an operator is offered only if it survives BOTH
// FieldDescriptor.requireCompatible AND FieldDescriptor.coerce. Ordered operators
// (GT/GTE/LT/LTE/BETWEEN) are gated on isNumeric() — NOT isOrdered(), which is true for String
// and Instant and would offer operators that die in coercion (research R4).

import type { ComparisonOperator } from '../api/tree';

export type ValueKind = 'TEXT' | 'NUMBER' | 'ENUM' | 'INSTANT';

export type FieldCatalogEntry = {
  logicalName: string;
  label: string;
  valueKind: ValueKind;
  /** binary operators offered — presence tests (IS_NULL/IS_NOT_NULL) are offered on every field */
  operators: readonly ComparisonOperator[];
  allowsPresenceTest: true;
  /** ENUM only — closed choice (FR-004) */
  enumValues?: readonly string[];
};

const TEXT_OPS: readonly ComparisonOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'STARTS_WITH',
  'ENDS_WITH',
  'IN',
  'NOT_IN',
];

const NUMBER_OPS: readonly ComparisonOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'BETWEEN',
  'IN',
  'NOT_IN',
];

const ENUM_OPS: readonly ComparisonOperator[] = ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN'];

// Instant: only exact equality and IN survive coercion — coerceNumber has no Instant branch, so
// every ordered/range comparison over createdAt fails (field-catalog §2.1).
const INSTANT_OPS: readonly ComparisonOperator[] = ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN'];

export const FIELD_CATALOG: readonly FieldCatalogEntry[] = [
  { logicalName: 'name', label: 'Name', valueKind: 'TEXT', operators: TEXT_OPS, allowsPresenceTest: true },
  { logicalName: 'age', label: 'Age', valueKind: 'NUMBER', operators: NUMBER_OPS, allowsPresenceTest: true },
  { logicalName: 'city', label: 'City', valueKind: 'TEXT', operators: TEXT_OPS, allowsPresenceTest: true },
  {
    logicalName: 'risk',
    label: 'Risk level',
    valueKind: 'ENUM',
    operators: ENUM_OPS,
    allowsPresenceTest: true,
    enumValues: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
  },
  {
    logicalName: 'createdAt',
    label: 'Created at (exact instant only — no ranges)',
    valueKind: 'INSTANT',
    operators: INSTANT_OPS,
    allowsPresenceTest: true,
  },
  {
    logicalName: 'case.role',
    label: 'Linked case — role',
    valueKind: 'ENUM',
    operators: ENUM_OPS,
    allowsPresenceTest: true,
    enumValues: ['SUBJECT', 'ASSOCIATE', 'WITNESS'],
  },
  {
    logicalName: 'case.status',
    label: 'Linked case — status',
    valueKind: 'ENUM',
    operators: ENUM_OPS,
    allowsPresenceTest: true,
    enumValues: ['OPEN', 'UNDER_REVIEW', 'CLOSED'],
  },
  {
    logicalName: 'case.title',
    label: 'Linked case — title',
    valueKind: 'TEXT',
    operators: TEXT_OPS,
    allowsPresenceTest: true,
  },
];

export const CATALOG_BY_NAME: ReadonlyMap<string, FieldCatalogEntry> = new Map(
  FIELD_CATALOG.map((e) => [e.logicalName, e]),
);

export const CATALOG_FIELD_NAMES: readonly string[] = FIELD_CATALOG.map((e) => e.logicalName);

/** The operand shape a given field + operator expects. Drives which value control is rendered. */
export type OperandShape = 'STRING' | 'NUMBER' | 'RANGE' | 'LIST' | 'ENUM' | 'ENUM_LIST' | 'NONE';

export function operandShape(entry: FieldCatalogEntry, operator: ComparisonOperator): OperandShape {
  if (operator === 'BETWEEN') return 'RANGE';
  if (operator === 'IN' || operator === 'NOT_IN') return entry.valueKind === 'ENUM' ? 'ENUM_LIST' : 'LIST';
  if (entry.valueKind === 'ENUM') return 'ENUM';
  if (entry.valueKind === 'NUMBER') return 'NUMBER';
  return 'STRING';
}
