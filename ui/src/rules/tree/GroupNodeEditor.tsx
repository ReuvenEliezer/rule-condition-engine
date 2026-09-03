// The recursive group node (FR-006, research R9). A nested <fieldset>/<legend> that renders itself
// for each child, with AND/OR/NOT selection and add/remove-child actions.
//
// Collapsing is permitted, but a collapsed group MUST state how many nodes it hides — no node that
// participates in the condition may be silently hidden, at any of the eight permitted depths
// (spec Edge Cases). Native fieldsets give document tab order and group-nesting announcements with
// no custom key handling (research R9).

import { useState } from 'react';
import { countNodes, isCondition, isGroup, isUnary, type GroupNode, type GroupOperator, type RuleNode } from '../../api/tree';
import { validateTree } from './validate';
import { ConditionLeafEditor } from './ConditionLeafEditor';
import { UnaryLeafEditor } from './UnaryLeafEditor';
import { newConditionLeaf, newGroup, newUnaryLeaf } from './treeOps';

export type GroupNodeEditorProps = {
  node: GroupNode;
  /** path from the root; [] is the root group */
  path: number[];
  depth: number;
  onChange: (next: RuleNode) => void;
  /** true only for the root — the root group cannot be removed */
  isRoot?: boolean;
  onRemove?: () => void;
};

const GROUP_OPERATORS: readonly GroupOperator[] = ['AND', 'OR', 'NOT'];

export function GroupNodeEditor({ node, path, depth, onChange, isRoot = false, onRemove }: GroupNodeEditorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const hiddenCount = countNodes(node) - 1;
  const legendId = `group-${path.join('-') || 'root'}`;

  const localViolations = validateTree(node, []).filter((v) => v.path.length === 0);

  const setChild = (index: number, next: RuleNode) =>
    onChange({ ...node, children: node.children.map((c, i) => (i === index ? next : c)) });

  const addChild = (child: RuleNode) => onChange({ ...node, children: [...node.children, child] });
  const removeChild = (index: number) =>
    onChange({ ...node, children: node.children.filter((_, i) => i !== index) });

  return (
    <fieldset aria-labelledby={legendId}>
      <legend id={legendId}>
        <label>
          Match{' '}
          <select
            value={node.operator}
            onChange={(e) => onChange({ ...node, operator: e.target.value as GroupOperator })}
          >
            {GROUP_OPERATORS.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>{' '}
          {node.operator === 'NOT' ? 'the single condition below' : 'the conditions below'}
        </label>{' '}
        <button type="button" aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>
          {collapsed ? `Expand (${hiddenCount} hidden)` : 'Collapse'}
        </button>{' '}
        {!isRoot && onRemove && (
          <button type="button" onClick={onRemove}>
            Remove this group
          </button>
        )}
      </legend>

      {localViolations.map((v, i) => (
        <p key={i} className="field-error">
          {v.message}
        </p>
      ))}

      {collapsed ? (
        <p>
          {hiddenCount} {hiddenCount === 1 ? 'node' : 'nodes'} hidden. Expand to view or edit them.
        </p>
      ) : (
        <>
          <ol>
            {node.children.map((child, i) => (
              <li key={i}>
                {isGroup(child) && (
                  <GroupNodeEditor
                    node={child}
                    path={[...path, i]}
                    depth={depth + 1}
                    onChange={(next) => setChild(i, next)}
                    onRemove={() => removeChild(i)}
                  />
                )}
                {isCondition(child) && (
                  <ConditionLeafEditor
                    node={child}
                    onChange={(next) => setChild(i, next)}
                    violationMessage={firstMessageFor(node, i)}
                  />
                )}
                {isUnary(child) && (
                  <UnaryLeafEditor node={child} onChange={(next) => setChild(i, next)} />
                )}
                {!isGroup(child) && (
                  <button type="button" aria-label={`Remove condition ${i + 1}`} onClick={() => removeChild(i)}>
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ol>

          <div className="group-actions">
            <button type="button" onClick={() => addChild(newConditionLeaf())}>
              Add condition
            </button>{' '}
            <button type="button" onClick={() => addChild(newUnaryLeaf())}>
              Add presence test
            </button>{' '}
            <button type="button" onClick={() => addChild(newGroup())} disabled={depth >= 7}>
              Add nested group
            </button>
            {depth >= 7 && <span> (nesting limit reached)</span>}
          </div>
        </>
      )}
    </fieldset>
  );
}

function firstMessageFor(parent: GroupNode, childIndex: number): string | undefined {
  const child = parent.children[childIndex];
  if (!child) return undefined;
  return validateTree(child, []).find((v) => v.path.length === 0)?.message;
}
