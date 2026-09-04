// A CONDITION leaf as one compact row: field, operator, value, actions (FR-041).
//
// Every choice comes from the PUBLISHED metadata (FR-010, FR-011): the field control is a closed
// select over published fields, never a free-text input, so the client is structurally unable to
// originate a field name. The operator control offers exactly that field's effective operators,
// plus the two presence tests, which are valid on every field.
//
// A field a stored rule references but the service no longer publishes is shown verbatim as a
// disabled, selected option — never silently substituted (FR-039).

import { useId } from 'react';
import type { ComparisonOperator, ConditionNode, PresenceOperator, RuleNode } from '../../api/tree';
import { OPERATOR_LABELS } from '../../api/tree';
import { operandShape, type FieldMetadata } from '../metadata';
import { defaultValueFor } from './treeOps';
import { ValueControl } from './values';
import { Select } from '../../ui/components/Select';
import { cn } from '../../lib/cn';

export type ConditionLeafEditorProps = {
  node: ConditionNode;
  fields: readonly FieldMetadata[];
  /** Replaces the node — a presence test is a different node shape, so this may return a UNARY. */
  onChange: (next: RuleNode) => void;
  violationMessage?: string | undefined;
};

const PRESENCE_OPS: readonly PresenceOperator[] = ['IS_NULL', 'IS_NOT_NULL'];
const isPresence = (op: string): op is PresenceOperator =>
  (PRESENCE_OPS as readonly string[]).includes(op);

export function ConditionLeafEditor({ node, fields, onChange, violationMessage }: ConditionLeafEditorProps) {
  const msgId = useId();
  const field = fields.find((f) => f.logicalName === node.field);
  const unavailable = fields.length > 0 && !field;

  /**
   * FR-015: the operator survives only if the new field still publishes it; the value is reset
   * either way, because a value meaningful for one field's type rarely is for another's.
   */
  const onField = (logicalName: string) => {
    const next = fields.find((f) => f.logicalName === logicalName);
    if (!next) return;
    const operator = next.operators.includes(node.operator)
      ? node.operator
      : (next.operators[0] as ComparisonOperator);
    onChange({ type: 'CONDITION', field: logicalName, operator, value: defaultValueFor(next, operator) });
  };

  /**
   * FR-014 and FR-016: a presence test converts the node to a UNARY, dropping the value. Otherwise
   * the value is carried across only when the operand shape is unchanged, and discarded when it is
   * not — never retained in a shape the new operator does not accept.
   */
  const onOperator = (chosen: string) => {
    if (isPresence(chosen)) {
      onChange({ type: 'UNARY', field: node.field, operator: chosen });
      return;
    }
    const operator = chosen as ComparisonOperator;
    const shapeUnchanged = operandShape(field, operator) === operandShape(field, node.operator);
    onChange({
      ...node,
      operator,
      value: shapeUnchanged ? node.value : defaultValueFor(field, operator),
    });
  };

  return (
    <div className={cn('condition-leaf', violationMessage && 'border-amber-300 dark:border-amber-800/70')}>
      <label className="flex min-w-0 flex-1 basis-40 items-center gap-1.5">
        <span className="text-slate-500 dark:text-slate-400">Field</span>
        <Select className="h-9 w-full" value={node.field} onChange={(e) => onField(e.target.value)}>
          {unavailable && (
            <option value={node.field} disabled>
              {node.field} — no longer available
            </option>
          )}
          {fields.map((f) => (
            <option key={f.logicalName} value={f.logicalName}>
              {f.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex min-w-0 flex-1 basis-40 items-center gap-1.5">
        <span className="text-slate-500 dark:text-slate-400">Operator</span>
        <Select className="h-9 w-full" value={node.operator} onChange={(e) => onOperator(e.target.value)}>
          {(field?.operators ?? []).map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
          {field?.presenceTestable &&
            PRESENCE_OPS.map((op) => (
              <option key={op} value={op}>
                {OPERATOR_LABELS[op]}
              </option>
            ))}
        </Select>
      </label>
      <ValueControl
        shape={operandShape(field, node.operator)}
        value={node.value}
        field={field}
        describedById={violationMessage ? msgId : undefined}
        onChange={(value) => onChange({ ...node, value })}
      />
      {violationMessage && (
        <span className="field-error" id={msgId}>
          {violationMessage}
        </span>
      )}
    </div>
  );
}
