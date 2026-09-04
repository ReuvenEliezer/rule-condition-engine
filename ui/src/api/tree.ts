// The condition tree — the one wire type the UI *constructs* rather than merely displays, and the
// reason this feature exists. Mirrors rule/model/ exactly, including both "type" discriminators
// (data-model.md §2).
//
// Numeric operands (NUMBER, RANGE) are held as STRINGS, never as JS `number`. `NumberValue` is a
// BigDecimal on the wire; `JSON.parse` would re-round `10.50` to `10.5`. The client parses and
// serialises tree-carrying payloads with lossless-json and keeps operands verbatim, so FR-013's
// byte-for-byte round-trip and SC-010's identical-tree claim hold (research R5).

export type RuleNode = GroupNode | ConditionNode | UnaryConditionNode;

export type GroupOperator = 'AND' | 'OR' | 'NOT';

export type GroupNode = {
  type: 'GROUP';
  operator: GroupOperator;
  children: RuleNode[];
};

export type ConditionNode = {
  type: 'CONDITION';
  field: string;
  operator: ComparisonOperator;
  value: ConditionValue;
};

export type UnaryConditionNode = {
  type: 'UNARY';
  field: string;
  operator: PresenceOperator;
};

export type PresenceOperator = 'IS_NULL' | 'IS_NOT_NULL';

export type ConditionValue =
  | { type: 'STRING'; value: string }
  | { type: 'NUMBER'; value: string } // BigDecimal on the wire, kept verbatim — §2.2
  | { type: 'RANGE'; from: string; to: string }
  | { type: 'LIST'; values: string[] };

export type ConditionValueKind = ConditionValue['type'];

/** The twelve binary comparison operators (rule/model/ComparisonOperator.java). */
export type ComparisonOperator =
  | 'EQUALS'
  | 'NOT_EQUALS'
  | 'CONTAINS'
  | 'STARTS_WITH'
  | 'ENDS_WITH'
  | 'BETWEEN'
  | 'GT'
  | 'GTE'
  | 'LT'
  | 'LTE'
  | 'IN'
  | 'NOT_IN';

export const ALL_COMPARISON_OPERATORS: readonly ComparisonOperator[] = [
  'EQUALS',
  'NOT_EQUALS',
  'CONTAINS',
  'STARTS_WITH',
  'ENDS_WITH',
  'BETWEEN',
  'GT',
  'GTE',
  'LT',
  'LTE',
  'IN',
  'NOT_IN',
];

/**
 * Group headers in words. A bare AND/OR/NOT is jargon to an analyst reading a rule for the first
 * time, and FR-006 forbids a raw operator name being the only text an author sees.
 */
export const GROUP_OPERATOR_LABELS: Record<GroupOperator, string> = {
  AND: 'Match all of the following',
  OR: 'Match any of the following',
  NOT: 'Match records that do NOT satisfy',
};

export const OPERATOR_LABELS: Record<ComparisonOperator | PresenceOperator, string> = {
  EQUALS: 'equals',
  NOT_EQUALS: 'does not equal',
  CONTAINS: 'contains',
  STARTS_WITH: 'starts with',
  ENDS_WITH: 'ends with',
  BETWEEN: 'is between',
  GT: 'is greater than',
  GTE: 'is at least',
  LT: 'is less than',
  LTE: 'is at most',
  IN: 'is one of',
  NOT_IN: 'is none of',
  IS_NULL: 'has no value',
  IS_NOT_NULL: 'has a value',
};

// ---- Node constructors used by the builder ---------------------------------------------------

export const emptyGroup = (operator: GroupOperator = 'AND'): GroupNode => ({
  type: 'GROUP',
  operator,
  children: [],
});

export const isGroup = (n: RuleNode): n is GroupNode => n.type === 'GROUP';
export const isCondition = (n: RuleNode): n is ConditionNode => n.type === 'CONDITION';
export const isUnary = (n: RuleNode): n is UnaryConditionNode => n.type === 'UNARY';

/** Count every node in the tree (a group counts as one, plus its descendants). */
export const countNodes = (n: RuleNode): number =>
  isGroup(n) ? 1 + n.children.reduce((sum, c) => sum + countNodes(c), 0) : 1;

/** Maximum depth: a bare leaf is depth 1. */
export const treeDepth = (n: RuleNode): number =>
  isGroup(n) ? 1 + n.children.reduce((max, c) => Math.max(max, treeDepth(c)), 0) : 1;
