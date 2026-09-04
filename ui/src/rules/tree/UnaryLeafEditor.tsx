// A presence test as one compact row: field, test, no value control (FR-012's NONE shape).
//
// Choosing a comparison operator here converts the node back to a CONDITION with an empty value of
// the right shape (FR-016), which is why onChange returns a RuleNode rather than a UnaryConditionNode.
// Presence tests are offered on every published field; the accepted limitation that one on a
// non-nullable column matches nobody is stated in the builder's help text.

import { useId } from 'react';
import type { ComparisonOperator, PresenceOperator, RuleNode, UnaryConditionNode } from '../../api/tree';
import { OPERATOR_LABELS } from '../../api/tree';
import { type FieldMetadata } from '../metadata';
import { defaultValueFor } from './treeOps';
import { Select } from '../../ui/components/Select';
import { cn } from '../../lib/cn';

export type UnaryLeafEditorProps = {
  node: UnaryConditionNode;
  fields: readonly FieldMetadata[];
  onChange: (next: RuleNode) => void;
  violationMessage?: string | undefined;
};

const PRESENCE_OPS: readonly PresenceOperator[] = ['IS_NULL', 'IS_NOT_NULL'];

export function UnaryLeafEditor({ node, fields, onChange, violationMessage }: UnaryLeafEditorProps) {
  const msgId = useId();
  const field = fields.find((f) => f.logicalName === node.field);
  const unavailable = fields.length > 0 && !field;

  const onOperator = (chosen: string) => {
    if ((PRESENCE_OPS as readonly string[]).includes(chosen)) {
      onChange({ ...node, operator: chosen as PresenceOperator });
      return;
    }
    const operator = chosen as ComparisonOperator;
    onChange({ type: 'CONDITION', field: node.field, operator, value: defaultValueFor(field, operator) });
  };

  return (
    <div className={cn('unary-leaf', violationMessage && 'border-amber-300 dark:border-amber-800/70')}>
      <label className="flex min-w-0 flex-1 basis-40 items-center gap-1.5">
        <span className="text-slate-500 dark:text-slate-400">Field</span>
        <Select
          className="h-9 w-full"
          value={node.field}
          onChange={(e) => onChange({ ...node, field: e.target.value })}
        >
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
        <Select
          className="h-9 w-full"
          value={node.operator}
          aria-describedby={violationMessage ? msgId : undefined}
          onChange={(e) => onOperator(e.target.value)}
        >
          {(field?.operators ?? []).map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
          {PRESENCE_OPS.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
        </Select>
      </label>
      {violationMessage && (
        <span className="field-error" id={msgId}>
          {violationMessage}
        </span>
      )}
    </div>
  );
}
