// Tree-aware (de)serialisation for the four routes whose payload carries a condition tree
// (research R5, FR-013). Only the NUMBER / RANGE operands INSIDE the condition need lossless
// handling — the surrounding fields (version, page, size) are ordinary safe integers, so they go
// through plain JSON. Lossless-parsing a whole response would turn every number into a
// LosslessNumber object and break rendering.

import { parse as losslessParse, stringify as losslessStringify } from 'lossless-json';
import { parseTree, serializeTree } from './treeCodec';
import type { RuleDetail } from './types';
import type { RuleNode } from './tree';

type RuleBodyScalars = {
  id?: string | undefined;
  version?: number | undefined;
  caseId?: string | undefined;
  name?: string | undefined;
  enabled?: boolean | undefined;
};

/** Serialise a rule request body, emitting the condition tree with operands verbatim. */
export function serializeRuleBody(body: RuleBodyScalars & { condition: RuleNode }): string {
  const { condition, ...rest } = body;
  const head = Object.entries(rest)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`);
  head.push(`"condition":${serializeTree(condition)}`);
  return `{${head.join(',')}}`;
}

/** Parse a RuleDetail response: plain JSON for the scalar fields, lossless for the condition. */
export function decodeRuleDetail(text: string): RuleDetail {
  const flat = JSON.parse(text) as Omit<RuleDetail, 'condition'>;
  const raw = losslessParse(text);
  const conditionText = losslessStringify((raw as { condition: unknown }).condition);
  if (conditionText === undefined) throw new Error('rule response carried no condition');
  const condition = parseTree(conditionText);
  return { ...flat, condition };
}
