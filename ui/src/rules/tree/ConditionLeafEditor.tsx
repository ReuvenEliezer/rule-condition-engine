// A CONDITION leaf: field select driven ONLY by the catalog (no free-text entry), operator select
// filtered to that field's offered operators, and the value control chosen by operand shape
// (FR-001, FR-002, FR-003). Each control's validation message is wired via aria-describedby (T043).

import { useId } from 'react';
import type { ComparisonOperator, ConditionNode } from '../../api/tree';
import { OPERATOR_LABELS } from '../../api/tree';
import { CATALOG_BY_NAME, FIELD_CATALOG, operandShape } from '../catalog';
import { defaultValueFor } from './treeOps';
import { ValueControl } from './values';

export type ConditionLeafEditorProps = {
  node: ConditionNode;
  onChange: (next: ConditionNode) => void;
  violationMessage?: string | undefined;
};

const PRESENCE = ['IS_NULL', 'IS_NOT_NULL'] as const;

export function ConditionLeafEditor({ node, onChange, violationMessage }: ConditionLeafEditorProps) {
  const msgId = useId();
  const entry = CATALOG_BY_NAME.get(node.field);

  const onField = (fieldName: string) => {
    const next = CATALOG_BY_NAME.get(fieldName);
    if (!next) return;
    const operator = next.operators.includes(node.operator) ? node.operator : (next.operators[0] as ComparisonOperator);
    onChange({ type: 'CONDITION', field: fieldName, operator, value: defaultValueFor(next, operator) });
  };

  const onOperator = (op: string) => {
    if ((PRESENCE as readonly string[]).includes(op)) {
      // handled by the parent, which swaps this CONDITION for a UNARY node
      return;
    }
    if (!entry) return;
    const operator = op as ComparisonOperator;
    onChange({ ...node, operator, value: defaultValueFor(entry, operator) });
  };

  return (
    <div className="condition-leaf">
      <label>
        Field{' '}
        <select value={node.field} onChange={(e) => onField(e.target.value)}>
          {FIELD_CATALOG.map((f) => (
            <option key={f.logicalName} value={f.logicalName}>
              {f.label}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Operator{' '}
        <select value={node.operator} onChange={(e) => onOperator(e.target.value)}>
          {(entry?.operators ?? []).map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
        </select>
      </label>{' '}
      {entry && (
        <ValueControl
          shape={operandShape(entry, node.operator)}
          value={node.value}
          entry={entry}
          describedById={violationMessage ? msgId : undefined}
          onChange={(value) => onChange({ ...node, value })}
        />
      )}
      {violationMessage && (
        <span className="field-error" id={msgId}>
          {violationMessage}
        </span>
      )}
    </div>
  );
}
