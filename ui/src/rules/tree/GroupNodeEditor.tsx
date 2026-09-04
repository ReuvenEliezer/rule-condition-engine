// The recursive group node (FR-002, FR-003). A bounded container carrying a header that states its
// logical meaning in words, with its children indented inside its bounds.
//
// Native <fieldset>/<legend> is kept, not replaced by divs: it gives group nesting to assistive
// technology and document tab order for free, which is most of FR-044 already satisfied. What
// changes here is paint — a card, an accent rail on the inline-start edge, and indentation.
//
// Depth is conveyed by indentation AND the rail, never by colour alone: the rail's hue cycles for
// legibility, but removing colour entirely still leaves the nesting unambiguous.
//
// Collapsing is permitted, but a collapsed group MUST state how many nodes it hides — no node that
// participates in the condition may be silently hidden, at any of the eight permitted depths
// (FR-007).

import { useState } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react';
import {
  GROUP_OPERATOR_LABELS,
  countNodes,
  isCondition,
  isGroup,
  isUnary,
  type GroupNode,
  type GroupOperator,
  type RuleNode,
} from '../../api/tree';
import { validateTree } from './validate';
import { ConditionLeafEditor } from './ConditionLeafEditor';
import { UnaryLeafEditor } from './UnaryLeafEditor';
import { moveChild, newConditionLeaf, newGroup, newUnaryLeaf } from './treeOps';
import { MoveControls } from './MoveControls';
import { type FieldMetadata } from '../metadata';
import { Button } from '../../ui/components/Button';
import { Select } from '../../ui/components/Select';
import { cn } from '../../lib/cn';

export type GroupNodeEditorProps = {
  node: GroupNode;
  /** published field metadata, threaded to every leaf so no control invents a choice */
  fields: readonly FieldMetadata[];
  /** path from the root; [] is the root group */
  path: number[];
  depth: number;
  onChange: (next: RuleNode) => void;
  /** true only for the root — the root group cannot be removed */
  isRoot?: boolean;
  onRemove?: () => void;
};

const GROUP_OPERATORS: readonly GroupOperator[] = ['AND', 'OR', 'NOT'];

/** Cycles so adjacent levels differ; indentation, not hue, is what carries the nesting. */
const RAIL = [
  'border-s-brand-400 dark:border-s-brand-500',
  'border-s-teal-400 dark:border-s-teal-500',
  'border-s-amber-400 dark:border-s-amber-500',
  'border-s-fuchsia-400 dark:border-s-fuchsia-500',
];

export function GroupNodeEditor({
  node,
  fields,
  path,
  depth,
  onChange,
  isRoot = false,
  onRemove,
}: GroupNodeEditorProps) {
  const [collapsed, setCollapsed] = useState(false);
  const hiddenCount = countNodes(node) - 1;
  const legendId = `group-${path.join('-') || 'root'}`;

  const localViolations = validateTree(node, fields, []).filter((v) => v.path.length === 0);
  const incomplete = localViolations.length > 0;

  // FR-019: a negation takes exactly one child. The Add controls stay PRESENT and disabled rather
  // than disappearing, so the constraint is discoverable instead of mysterious.
  const notIsFull = node.operator === 'NOT' && node.children.length >= 1;
  // FR-020: switching a multi-child group to NOT would have to discard children. Refused, with the
  // remedy offered — never a silent truncation to the first child.
  const notWouldDiscard = node.operator !== 'NOT' && node.children.length > 1;

  const setChild = (index: number, next: RuleNode) =>
    onChange({ ...node, children: node.children.map((c, i) => (i === index ? next : c)) });

  const addChild = (child: RuleNode) => onChange({ ...node, children: [...node.children, child] });
  // moveChild is path-addressed from a root; here the group IS the root of its own subtree, so []
  // addresses this group and the swap stays inside it.
  const move = (index: number, delta: -1 | 1) => onChange(moveChild(node, [], index, delta));
  const removeChild = (index: number) =>
    onChange({ ...node, children: node.children.filter((_, i) => i !== index) });

  return (
    <fieldset
      aria-labelledby={legendId}
      className={cn(
        'min-w-0 rounded-xl border border-s-4 bg-white p-3 sm:p-4 dark:bg-slate-900',
        RAIL[depth % RAIL.length],
        incomplete
          ? 'border-amber-300 dark:border-amber-800/70'
          : 'border-slate-200 dark:border-slate-800',
      )}
    >
      <legend id={legendId} className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {GROUP_OPERATOR_LABELS[node.operator]}
        </span>
        <Select
          aria-label="Group logic"
          className="h-8 w-auto"
          value={node.operator}
          onChange={(e) => onChange({ ...node, operator: e.target.value as GroupOperator })}
        >
          {GROUP_OPERATORS.map((op) => (
            <option key={op} value={op} disabled={op === 'NOT' && notWouldDiscard}>
              {op}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-expanded={!collapsed}
          onClick={() => setCollapsed((c) => !c)}
        >
          {collapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
          {collapsed ? `Expand (${hiddenCount} hidden)` : 'Collapse'}
        </Button>
        {!isRoot && onRemove && (
          <Button type="button" variant="danger" size="sm" onClick={onRemove}>
            <Trash2 className="size-4" aria-hidden />
            Remove this group
          </Button>
        )}
      </legend>

      {localViolations.map((v, i) => (
        <p key={i} className="field-error mt-1">
          {v.message}
        </p>
      ))}

      {collapsed ? (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {hiddenCount} {hiddenCount === 1 ? 'node' : 'nodes'} hidden. Expand to view or edit them.
        </p>
      ) : (
        <>
          <ol className="mt-3 flex min-w-0 list-none flex-col gap-3 ps-1.5 sm:ps-5">
            {node.children.map((child, i) => (
              <li key={i} className="flex min-w-0 flex-wrap items-start gap-2">
                <MoveControls
                  position={i + 1}
                  total={node.children.length}
                  label={childLabel(child, path, i)}
                  onMove={(delta) => move(i, delta)}
                />
                <div className="min-w-0 flex-1">
                  {isGroup(child) && (
                    <GroupNodeEditor
                      node={child}
                      fields={fields}
                      path={[...path, i]}
                      depth={depth + 1}
                      onChange={(next) => setChild(i, next)}
                      onRemove={() => removeChild(i)}
                    />
                  )}
                  {isCondition(child) && (
                    <ConditionLeafEditor
                      node={child}
                      fields={fields}
                      onChange={(next) => setChild(i, next)}
                      violationMessage={firstMessageFor(node, i, fields)}
                    />
                  )}
                  {isUnary(child) && (
                    <UnaryLeafEditor
                      node={child}
                      fields={fields}
                      onChange={(next) => setChild(i, next)}
                      violationMessage={firstMessageFor(node, i, fields)}
                    />
                  )}
                </div>
                {!isGroup(child) && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    aria-label={`Remove condition ${i + 1}`}
                    onClick={() => removeChild(i)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ol>

          <div className="group-actions">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={notIsFull}
              onClick={() => addChild(newConditionLeaf(fields))}
            >
              <Plus className="size-4" aria-hidden />
              Add condition
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={notIsFull}
              onClick={() => addChild(newUnaryLeaf(fields))}
            >
              <Plus className="size-4" aria-hidden />
              Add presence test
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={notIsFull}
              onClick={() => addChild(newGroup())}
            >
              <Plus className="size-4" aria-hidden />
              Add nested group
            </Button>
          </div>
          {notIsFull && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              A negation takes exactly one child. To negate several conditions, wrap them in an
              explicit AND or OR group first.
            </p>
          )}
          {notWouldDiscard && (
            <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                NOT is unavailable while this group holds {node.children.length} children — wrapping
                them keeps every one.
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  onChange({ ...node, children: [{ type: 'GROUP', operator: 'AND', children: node.children }] })
                }
              >
                Wrap children in AND
              </Button>
            </p>
          )}
        </>
      )}
    </fieldset>
  );
}

/**
 * Path-qualified, so no two move controls on the page share an accessible name: the first child of
 * the root is "condition 1", the first child of its second child is "condition 2.1". A bare
 * position would repeat at every nesting level, leaving a screen-reader user with several
 * identically named controls and no way to tell them apart.
 */
const childLabel = (child: RuleNode, path: number[], index: number): string => {
  const position = [...path.map((p) => p + 1), index + 1].join('.');
  return `${isGroup(child) ? 'group' : 'condition'} ${position}`;
};

function firstMessageFor(
  parent: GroupNode,
  childIndex: number,
  fields: readonly FieldMetadata[],
): string | undefined {
  const child = parent.children[childIndex];
  if (!child) return undefined;
  return validateTree(child, fields, []).find((v) => v.path.length === 0)?.message;
}
