// A UNARY leaf: IS_NULL / IS_NOT_NULL with NO operand control (FR-005). Field select is the
// catalog only. Offered on all eight fields (field-catalog §2); the accepted limitation that a
// presence test on a non-nullable column matches nothing is stated in the builder's help text.

import { useId } from 'react';
import type { PresenceOperator, UnaryConditionNode } from '../../api/tree';
import { OPERATOR_LABELS } from '../../api/tree';
import { FIELD_CATALOG } from '../catalog';

export type UnaryLeafEditorProps = {
  node: UnaryConditionNode;
  onChange: (next: UnaryConditionNode) => void;
  violationMessage?: string | undefined;
};

const PRESENCE_OPS: readonly PresenceOperator[] = ['IS_NULL', 'IS_NOT_NULL'];

export function UnaryLeafEditor({ node, onChange, violationMessage }: UnaryLeafEditorProps) {
  const msgId = useId();
  return (
    <div className="unary-leaf">
      <label>
        Field{' '}
        <select value={node.field} onChange={(e) => onChange({ ...node, field: e.target.value })}>
          {FIELD_CATALOG.map((f) => (
            <option key={f.logicalName} value={f.logicalName}>
              {f.label}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Test{' '}
        <select
          value={node.operator}
          aria-describedby={violationMessage ? msgId : undefined}
          onChange={(e) => onChange({ ...node, operator: e.target.value as PresenceOperator })}
        >
          {PRESENCE_OPS.map((op) => (
            <option key={op} value={op}>
              {OPERATOR_LABELS[op]}
            </option>
          ))}
        </select>
      </label>
      {violationMessage && (
        <span className="field-error" id={msgId}>
          {violationMessage}
        </span>
      )}
    </div>
  );
}
