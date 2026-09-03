// The builder (FR-006, FR-007, FR-044). Holds the draft tree, blocks preview and save while any
// validator in tree/validate.ts fails, and announces validation failures through the assertive
// live region.
//
// RULE_TREE_TOO_COMPLEX (FR-012) is surfaced by the FailureBanner inside PreviewPanel / SaveRule /
// EditCondition: only the server message names which of the three budgets was exceeded and its
// limit, so the client does NOT mirror the budgets — it shows the message.

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RuleNode } from '../api/tree';
import { qk } from '../api/queries';
import { queryableFields } from '../api/rules';
import { compareFieldSets } from './catalogValidation';
import { GroupNodeEditor } from './tree/GroupNodeEditor';
import { newConditionLeaf, newGroup } from './tree/treeOps';
import { validateTree } from './tree/validate';
import { PreviewPanel } from './PreviewPanel';
import { SaveRule } from './SaveRule';
import { EditCondition } from './EditCondition';
import { CasePicker } from './CasePicker';
import { useAnnounce } from '../ui/LiveRegion';
import { FailureBanner } from '../ui/FailureBanner';
import { ApiFailure } from '../api/client';

export type RuleBuilderProps =
  | { mode: 'create'; initialTree?: RuleNode }
  | { mode: 'edit'; ruleId: string; initialTree: RuleNode };

const freshTree = (): RuleNode => {
  const g = newGroup('AND');
  return { ...g, children: [newConditionLeaf()] } as RuleNode;
};

export function RuleBuilder(props: RuleBuilderProps) {
  const announce = useAnnounce();
  const [tree, setTree] = useState<RuleNode>(
    'initialTree' in props && props.initialTree ? props.initialTree : freshTree(),
  );
  const [targetCaseId, setTargetCaseId] = useState<string | null>(null);

  // Start-up catalog validation — blocks the builder specifically on a mismatch (spec dependency #2).
  const fieldsQuery = useQuery({
    queryKey: qk.queryableFields(),
    queryFn: ({ signal }) => queryableFields(signal),
  });

  const check = useMemo(
    () => (fieldsQuery.isSuccess ? compareFieldSets(fieldsQuery.data) : null),
    [fieldsQuery.isSuccess, fieldsQuery.data],
  );
  const builderActive = check?.status === 'ok';

  const violations = useMemo(() => validateTree(tree), [tree]);
  const valid = violations.length === 0;

  useEffect(() => {
    if (builderActive && !valid && violations[0]) {
      announce(`Condition not ready: ${violations[0].message}`, 'assertive');
    }
  }, [builderActive, valid, violations, announce]);

  if (fieldsQuery.isLoading) return <p>Checking the field catalog…</p>;

  if (fieldsQuery.isError) {
    const failure =
      fieldsQuery.error instanceof ApiFailure
        ? fieldsQuery.error.failure
        : { kind: 'transport' as const, cause: 'unknown' };
    return <FailureBanner failure={failure} onRetry={() => void fieldsQuery.refetch()} />;
  }

  if (check && check.status === 'mismatch') {
    return (
      <div className="failure-banner" role="alert">
        <p>
          <strong>The rule builder is unavailable.</strong>
        </p>
        <p>{check.message}</p>
      </div>
    );
  }

  return (
    <div>
      <details>
        <summary>How conditions behave</summary>
        <ul>
          <li>
            Presence tests are offered on every field. On a field that always has a value they
            produce a rule that matches nobody, rather than an error.
          </li>
          <li>
            &ldquo;does not equal&rdquo; and &ldquo;is none of&rdquo; also match records where the
            field has no value recorded.
          </li>
          <li>
            Multiple linked-case conditions must all hold for the <em>same</em> case, not different
            ones.
          </li>
        </ul>
      </details>

      <GroupNodeEditor
        node={tree.type === 'GROUP' ? tree : { type: 'GROUP', operator: 'AND', children: [tree] }}
        path={[]}
        depth={0}
        isRoot
        onChange={setTree}
      />

      {!valid && (
        <ul aria-label="Why preview and save are blocked">
          {violations.map((v, i) => (
            <li key={i} className="field-error">
              {v.message}
            </li>
          ))}
        </ul>
      )}

      <PreviewPanel tree={tree} canPreview={valid} />

      {props.mode === 'create' ? (
        <section aria-labelledby="save-heading">
          <h3 id="save-heading">Save</h3>
          <p>Choose the case this rule belongs to. A case holds at most one rule.</p>
          <CasePicker selectedCaseId={targetCaseId} onSelect={setTargetCaseId} />
          {targetCaseId && <SaveRule caseId={targetCaseId} tree={tree} canSave={valid} />}
        </section>
      ) : (
        <section aria-labelledby="replace-heading">
          <h3 id="replace-heading">Replace this rule&rsquo;s condition</h3>
          <EditCondition ruleId={props.ruleId} tree={tree} canSave={valid} />
        </section>
      )}
    </div>
  );
}
