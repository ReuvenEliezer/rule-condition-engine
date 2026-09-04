// Published field metadata — GET /api/v1/rules/fields/metadata (contracts/field-metadata.md).
//
// This is the client's ONLY source of field names, labels, types, per-field operators and
// enumeration values. No hand-maintained copy of any of it may exist anywhere in ui/ (FR-038,
// SC-008): the copy that used to live in rules/catalog.ts is what this replaces, along with the
// start-up drift check that guarded it.
//
// Plain JSON.parse, deliberately: this response carries no decimals, so lossless parsing stays
// scoped to the condition subtree where a BigDecimal operand actually needs it.

import { request } from './client';
import type { ComparisonOperator } from './tree';

export type FieldValueKind = 'TEXT' | 'NUMBER' | 'ENUM' | 'INSTANT';

/** Every property is readonly: this is RECEIVED data, never constructed by the client. */
export type FieldMetadata = {
  readonly logicalName: string;
  readonly label: string;
  readonly valueKind: FieldValueKind;
  /**
   * The EFFECTIVE operator set — those that survive both the service's compatibility check and its
   * operand coercion. An ordered comparison is absent from a text or timestamp field because it
   * would be rejected on save (FR-037).
   */
  readonly operators: readonly ComparisonOperator[];
  readonly presenceTestable: boolean;
  /** Non-null exactly when valueKind is ENUM, in declaration order. */
  readonly enumValues?: readonly string[] | null;
};

export async function fieldMetadata(signal?: AbortSignal): Promise<FieldMetadata[]> {
  const res = await request<FieldMetadata[]>('/rules/fields/metadata', signal ? { signal } : {});
  return res.data;
}
