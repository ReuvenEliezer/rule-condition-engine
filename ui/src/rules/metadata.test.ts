// T060: the derivations over published metadata. These compute a UI decision from what the service
// sent — none of them restates the service's data, which is the line SC-008 draws.

import { describe, expect, it } from 'vitest';
import { enumValuesFor, isPublished, labelFor, operandShape, operatorsFor, type FieldMetadata } from './metadata';
import { FIELD_METADATA } from '../test/fixtures';

const FIELDS: readonly FieldMetadata[] = FIELD_METADATA;
const field = (name: string) => FIELDS.find((f) => f.logicalName === name)!;

describe('operandShape', () => {
  it('gives BETWEEN a range on every kind', () => {
    for (const name of ['age', 'name', 'risk', 'createdAt']) {
      expect(operandShape(field(name), 'BETWEEN')).toBe('RANGE');
    }
  });

  it('gives IN / NOT_IN a closed multi-choice on an enum and a free list otherwise', () => {
    for (const op of ['IN', 'NOT_IN'] as const) {
      expect(operandShape(field('risk'), op)).toBe('ENUM_LIST');
      expect(operandShape(field('name'), op)).toBe('LIST');
      expect(operandShape(field('age'), op)).toBe('LIST');
      expect(operandShape(field('createdAt'), op)).toBe('LIST');
    }
  });

  it('gives a single control keyed to the value kind for every other operator', () => {
    expect(operandShape(field('risk'), 'EQUALS')).toBe('ENUM');
    expect(operandShape(field('age'), 'EQUALS')).toBe('NUMBER');
    expect(operandShape(field('name'), 'EQUALS')).toBe('STRING');
    expect(operandShape(field('createdAt'), 'EQUALS')).toBe('STRING');
  });

  it('falls back to a text control for an unknown field rather than throwing', () => {
    expect(operandShape(undefined, 'EQUALS')).toBe('STRING');
  });
});

describe('lookups', () => {
  it('resolves a published field’s label, operators and enum values', () => {
    expect(labelFor(FIELDS, 'risk')).toBe('Risk level');
    expect(operatorsFor(FIELDS, 'createdAt')).toEqual(['EQUALS', 'NOT_EQUALS', 'IN', 'NOT_IN']);
    expect(enumValuesFor(FIELDS, 'case.status')).toEqual(['OPEN', 'UNDER_REVIEW', 'CLOSED']);
  });

  it('resolves an UNKNOWN field to its own name, never to a substitute (FR-039)', () => {
    expect(isPublished(FIELDS, 'nickname')).toBe(false);
    expect(labelFor(FIELDS, 'nickname')).toBe('nickname');
    expect(operatorsFor(FIELDS, 'nickname')).toEqual([]);
    expect(enumValuesFor(FIELDS, 'nickname')).toEqual([]);
  });
});
