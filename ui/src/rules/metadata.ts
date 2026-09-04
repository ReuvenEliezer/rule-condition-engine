// Derivations over the PUBLISHED field metadata. Everything here computes a UI decision from data
// the service sent; nothing here restates that data.
//
// The distinction is the whole point of this module. `operandShape` derives which control to
// render from a published valueKind and operator — that is a derivation, and it stays. A table of
// "which operators a TEXT field accepts" would be a copy, and copies drift; that is what
// rules/catalog.ts was, and it is deleted (FR-038, SC-008).

import type { FieldMetadata, FieldValueKind } from '../api/fieldMetadata';
import type { ComparisonOperator } from '../api/tree';

export type { FieldMetadata, FieldValueKind };

/** The operand shape a field + operator pair expects. Drives which value control is rendered. */
export type OperandShape = 'STRING' | 'NUMBER' | 'RANGE' | 'LIST' | 'ENUM' | 'ENUM_LIST' | 'NONE';

export const byLogicalName = (fields: readonly FieldMetadata[]): ReadonlyMap<string, FieldMetadata> =>
  new Map(fields.map((f) => [f.logicalName, f]));

/**
 * A field referenced by a stored rule but no longer published. Rendered with its name verbatim and
 * marked unavailable — never silently substituted, and never hidden (FR-039).
 */
export const isPublished = (fields: readonly FieldMetadata[], logicalName: string): boolean =>
  fields.some((f) => f.logicalName === logicalName);

/** The published label, or the raw logical name when the field is no longer published. */
export const labelFor = (fields: readonly FieldMetadata[], logicalName: string): string =>
  fields.find((f) => f.logicalName === logicalName)?.label ?? logicalName;

export const operatorsFor = (
  fields: readonly FieldMetadata[],
  logicalName: string,
): readonly ComparisonOperator[] => fields.find((f) => f.logicalName === logicalName)?.operators ?? [];

export const enumValuesFor = (
  fields: readonly FieldMetadata[],
  logicalName: string,
): readonly string[] => fields.find((f) => f.logicalName === logicalName)?.enumValues ?? [];

export function operandShape(field: FieldMetadata | undefined, operator: ComparisonOperator): OperandShape {
  if (!field) return 'STRING';
  if (operator === 'BETWEEN') return 'RANGE';
  if (operator === 'IN' || operator === 'NOT_IN') {
    return field.valueKind === 'ENUM' ? 'ENUM_LIST' : 'LIST';
  }
  if (field.valueKind === 'ENUM') return 'ENUM';
  if (field.valueKind === 'NUMBER') return 'NUMBER';
  return 'STRING';
}
