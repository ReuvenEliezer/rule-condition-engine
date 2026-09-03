// Parse a condition tree from wire JSON into the builder model and serialise it back, losslessly.
//
// NUMBER / RANGE operands are BigDecimal on the wire. lossless-json keeps them as string-backed
// LosslessNumber on parse; this codec stores them as plain strings in the model and re-wraps them
// as LosslessNumber on serialise, so `10.50` is emitted verbatim and never re-rounded to `10.5`.
// This is what makes FR-013's byte-for-byte round-trip and SC-010's identical-tree claim true
// (research R5, data-model.md §2.2).
//
// Serialised output uses a canonical key order matching Jackson's field order on the Java records,
// so a tree the UI saved equals one posted directly for the same logical condition.

import { LosslessNumber, parse as losslessParse, stringify as losslessStringify } from 'lossless-json';
import type { ComparisonOperator, ConditionValue, RuleNode } from './tree';

type Json = ReturnType<typeof losslessParse>;

export function parseTree(json: string): RuleNode {
  return normaliseNode(losslessParse(json));
}

export function serializeTree(node: RuleNode): string {
  const out = losslessStringify(toWire(node));
  if (out === undefined) throw new Error('tree failed to serialise');
  return out;
}

// ---- parse -------------------------------------------------------------------------------------

function asRecord(v: Json): Record<string, Json> {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    throw new Error('expected a tree node object');
  }
  return v as Record<string, Json>;
}

function numToString(v: Json): string {
  if (v instanceof LosslessNumber) return v.toString();
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  throw new Error(`expected a numeric operand, got ${typeof v}`);
}

function normaliseNode(raw: Json): RuleNode {
  const o = asRecord(raw);
  switch (o.type) {
    case 'GROUP': {
      const children = Array.isArray(o.children) ? o.children.map(normaliseNode) : [];
      return { type: 'GROUP', operator: o.operator as 'AND' | 'OR' | 'NOT', children };
    }
    case 'UNARY':
      return {
        type: 'UNARY',
        field: String(o.field),
        operator: o.operator as 'IS_NULL' | 'IS_NOT_NULL',
      };
    case 'CONDITION':
      return {
        type: 'CONDITION',
        field: String(o.field),
        operator: o.operator as ComparisonOperator,
        value: normaliseValue(o.value),
      };
    default:
      throw new Error(`unknown node type ${String(o.type)}`);
  }
}

function normaliseValue(raw: Json): ConditionValue {
  const o = asRecord(raw);
  switch (o.type) {
    case 'STRING':
      return { type: 'STRING', value: String(o.value) };
    case 'NUMBER':
      return { type: 'NUMBER', value: numToString(o.value) };
    case 'RANGE':
      return { type: 'RANGE', from: numToString(o.from), to: numToString(o.to) };
    case 'LIST':
      return { type: 'LIST', values: Array.isArray(o.values) ? o.values.map((x) => String(x)) : [] };
    default:
      throw new Error(`unknown value type ${String(o.type)}`);
  }
}

// ---- serialise --------------------------------------------------------------------------------

type WireValue =
  | { type: 'STRING'; value: string }
  | { type: 'NUMBER'; value: LosslessNumber }
  | { type: 'RANGE'; from: LosslessNumber; to: LosslessNumber }
  | { type: 'LIST'; values: string[] };

function toWireValue(v: ConditionValue): WireValue {
  switch (v.type) {
    case 'STRING':
      return { type: 'STRING', value: v.value };
    case 'NUMBER':
      return { type: 'NUMBER', value: new LosslessNumber(v.value) };
    case 'RANGE':
      return { type: 'RANGE', from: new LosslessNumber(v.from), to: new LosslessNumber(v.to) };
    case 'LIST':
      return { type: 'LIST', values: v.values };
  }
}

function toWire(node: RuleNode): unknown {
  switch (node.type) {
    case 'GROUP':
      return { type: 'GROUP', operator: node.operator, children: node.children.map(toWire) };
    case 'UNARY':
      return { type: 'UNARY', field: node.field, operator: node.operator };
    case 'CONDITION':
      return { type: 'CONDITION', field: node.field, operator: node.operator, value: toWireValue(node.value) };
  }
}
