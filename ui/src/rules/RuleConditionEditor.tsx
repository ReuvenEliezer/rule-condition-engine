// The condition tree as the page's main section: a plain-language summary above it, the tree
// below, and the blocking violations listed together (FR-001, FR-004, FR-026).
//
// The root may legitimately be a bare leaf. A stored tree whose root is a CONDITION or a UNARY is
// rendered and edited IN PLACE — never wrapped in a synthetic group the author did not create and
// cannot see the point of (spec Edge Cases). Wrapping only happens when the author asks for it, by
// adding a second condition.

import { useMemo } from 'react';
import { isGroup, type RuleNode } from '../api/tree';
import { summarise } from './summary';
import { validateTree } from './tree/validate';
import { GroupNodeEditor } from './tree/GroupNodeEditor';
import { ConditionLeafEditor } from './tree/ConditionLeafEditor';
import { UnaryLeafEditor } from './tree/UnaryLeafEditor';
import { type FieldMetadata } from './metadata';

export type RuleConditionEditorProps = {
  tree: RuleNode;
  fields: readonly FieldMetadata[];
  onChange: (next: RuleNode) => void;
};

export function RuleConditionEditor({ tree, fields, onChange }: RuleConditionEditorProps) {
  const summary = useMemo(() => summarise(tree, fields), [tree, fields]);
  const violations = useMemo(() => validateTree(tree, fields), [tree, fields]);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <p
        aria-label="What this rule checks"
        className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300"
      >
        {summary}
      </p>

      {isGroup(tree) ? (
        <GroupNodeEditor node={tree} fields={fields} path={[]} depth={0} isRoot onChange={onChange} />
      ) : tree.type === 'CONDITION' ? (
        <ConditionLeafEditor
          node={tree}
          fields={fields}
          onChange={onChange}
          violationMessage={violations.find((v) => v.path.length === 0)?.message}
        />
      ) : (
        <UnaryLeafEditor
          node={tree}
          fields={fields}
          onChange={onChange}
          violationMessage={violations.find((v) => v.path.length === 0)?.message}
        />
      )}

      {violations.length > 0 && (
        <ul aria-label="Why this rule cannot be saved yet" className="flex flex-col gap-1">
          {violations.map((v, i) => (
            <li key={i} className="field-error">
              {v.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
