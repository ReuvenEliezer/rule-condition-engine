import { describe, expect, it } from 'vitest';
import { parseTree, serializeTree } from './treeCodec';

// FR-013 / SC-010: parse → builder model → serialise is byte-identical for a corpus of trees,
// including nested groups, every operand shape, and decimals such as 10.50 that JSON.parse would
// re-round. Inputs are written in the codec's canonical key order and compact form.

const CORPUS: { name: string; json: string }[] = [
  {
    name: 'single string condition',
    json: '{"type":"CONDITION","field":"name","operator":"CONTAINS","value":{"type":"STRING","value":"AVI"}}',
  },
  {
    name: 'canonical three-condition AND',
    json:
      '{"type":"GROUP","operator":"AND","children":[' +
      '{"type":"CONDITION","field":"name","operator":"CONTAINS","value":{"type":"STRING","value":"AVI"}},' +
      '{"type":"CONDITION","field":"age","operator":"BETWEEN","value":{"type":"RANGE","from":30,"to":40}},' +
      '{"type":"CONDITION","field":"risk","operator":"EQUALS","value":{"type":"STRING","value":"HIGH"}}]}',
  },
  {
    name: 'decimal operand preserved as 10.50, not 10.5',
    json: '{"type":"CONDITION","field":"age","operator":"GT","value":{"type":"NUMBER","value":10.50}}',
  },
  {
    name: 'high-precision decimal tail preserved',
    json: '{"type":"CONDITION","field":"age","operator":"LT","value":{"type":"NUMBER","value":123456789012345678.9}}',
  },
  {
    name: 'range with trailing zero bounds',
    json: '{"type":"CONDITION","field":"age","operator":"BETWEEN","value":{"type":"RANGE","from":1.10,"to":2.00}}',
  },
  {
    name: 'nested NOT wrapping an OR',
    json:
      '{"type":"GROUP","operator":"NOT","children":[' +
      '{"type":"GROUP","operator":"OR","children":[' +
      '{"type":"CONDITION","field":"city","operator":"IN","value":{"type":"LIST","values":["Haifa","Eilat"]}},' +
      '{"type":"UNARY","field":"city","operator":"IS_NULL"}]}]}',
  },
];

describe('condition tree round-trip (FR-013, SC-010)', () => {
  for (const { name, json } of CORPUS) {
    it(`is byte-identical: ${name}`, () => {
      expect(serializeTree(parseTree(json))).toBe(json);
    });

    it(`is stable across a second round-trip: ${name}`, () => {
      const once = serializeTree(parseTree(json));
      expect(serializeTree(parseTree(once))).toBe(once);
    });
  }

  it('a tree posted directly and one rebuilt from the model serialise identically', () => {
    const direct =
      '{"type":"CONDITION","field":"age","operator":"BETWEEN","value":{"type":"RANGE","from":30,"to":40}}';
    const model = parseTree(direct);
    expect(serializeTree(model)).toBe(direct);
  });
});
