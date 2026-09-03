import { describe, expect, it } from 'vitest';
import { ALL_COMPARISON_OPERATORS, type ComparisonOperator } from '../api/tree';
import { CATALOG_BY_NAME, FIELD_CATALOG, operandShape } from './catalog';

// SC-002: for all eight fields × twelve comparison operators, every offered pair is one the
// service accepts and every withheld pair is one it would reject. The acceptance matrix below is
// the derivation table from contracts/field-catalog.md §1–2 — an operator survives ONLY if it
// passes both FieldDescriptor.requireCompatible AND FieldDescriptor.coerce.

const TEXT_ACCEPTS: ComparisonOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'STARTS_WITH',
  'ENDS_WITH',
  'IN',
  'NOT_IN',
];
const NUMBER_ACCEPTS: ComparisonOperator[] = [
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
const ENUM_ACCEPTS: ComparisonOperator[] = ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN'];
const INSTANT_ACCEPTS: ComparisonOperator[] = ['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN'];

const EXPECTED: Record<string, ComparisonOperator[]> = {
  name: TEXT_ACCEPTS,
  city: TEXT_ACCEPTS,
  'case.title': TEXT_ACCEPTS,
  age: NUMBER_ACCEPTS,
  risk: ENUM_ACCEPTS,
  'case.role': ENUM_ACCEPTS,
  'case.status': ENUM_ACCEPTS,
  createdAt: INSTANT_ACCEPTS,
};

describe('field catalog operator gating (SC-002)', () => {
  it('covers exactly the eight registered fields', () => {
    expect([...CATALOG_BY_NAME.keys()].sort()).toEqual(Object.keys(EXPECTED).sort());
  });

  for (const entry of FIELD_CATALOG) {
    const accepted = new Set(EXPECTED[entry.logicalName]);

    for (const op of ALL_COMPARISON_OPERATORS) {
      const offered = entry.operators.includes(op);
      it(`${entry.logicalName} ${offered ? 'offers' : 'withholds'} ${op}`, () => {
        expect(offered).toBe(accepted.has(op));
      });
    }
  }
});

describe('the three traps (field-catalog §2)', () => {
  it('no ordered operators on textual fields name / city / case.title', () => {
    for (const f of ['name', 'city', 'case.title']) {
      const ops = CATALOG_BY_NAME.get(f)!.operators;
      for (const ordered of ['GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] as const) {
        expect(ops).not.toContain(ordered);
      }
    }
  });

  it('no ordered or range operators on createdAt (Instant coercion has no number branch)', () => {
    const ops = CATALOG_BY_NAME.get('createdAt')!.operators;
    for (const ordered of ['GT', 'GTE', 'LT', 'LTE', 'BETWEEN'] as const) {
      expect(ops).not.toContain(ordered);
    }
  });

  it('enum fields never take a NUMBER operand shape', () => {
    for (const f of ['risk', 'case.role', 'case.status']) {
      const entry = CATALOG_BY_NAME.get(f)!;
      for (const op of entry.operators) {
        expect(operandShape(entry, op)).not.toBe('NUMBER');
      }
      expect(entry.enumValues && entry.enumValues.length).toBeGreaterThan(0);
    }
  });
});

describe('presence tests', () => {
  it('IS_NULL / IS_NOT_NULL are offered on all eight fields (FR-005)', () => {
    for (const entry of FIELD_CATALOG) {
      expect(entry.allowsPresenceTest).toBe(true);
    }
  });
});
