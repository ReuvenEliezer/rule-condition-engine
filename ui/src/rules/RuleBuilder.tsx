// The builder (FR-006, FR-007, FR-044). Holds the draft tree, blocks preview and save while any
// validator in tree/validate.ts fails, and announces validation failures through the assertive
// live region.
//
// RULE_TREE_TOO_COMPLEX (FR-029) is surfaced by the FailureBanner inside PreviewPanel / SaveRule:
// only the server message names which of the three budgets was exceeded and its limit, so the
// client does NOT mirror the budgets — it shows the message.
//
// Field choices come from GET /rules/fields/metadata. There is no start-up drift check any more:
// it existed to detect divergence between two copies of the metadata, and there is now one copy.
// A metadata failure is its own retryable failure, distinct from the rule being unavailable (FR-040).

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { RuleNode } from '../api/tree';
import type { FieldMetadata } from './metadata';
import { qk } from '../api/queries';
import { fieldMetadata } from '../api/fieldMetadata';
import { RuleConditionEditor } from './RuleConditionEditor';
import { newConditionLeaf, newGroup } from './tree/treeOps';
import { validateTree } from './tree/validate';
import { PreviewPanel } from './PreviewPanel';
import { SaveRule } from './SaveRule';
import { CasePicker } from './CasePicker';
import { useAnnounce } from '../ui/LiveRegion';
import { FailureBanner } from '../ui/FailureBanner';
import { ApiFailure } from '../api/client';

export type RuleBuilderProps =
  | { mode: 'create'; initialTree?: RuleNode }
  | { mode: 'edit'; ruleId: string; initialTree: RuleNode };

export function RuleBuilder(props: RuleBuilderProps) {
  const announce = useAnnounce();
  const [tree, setTree] = useState<RuleNode | null>(
    'initialTree' in props && props.initialTree ? props.initialTree : null,
  );
  const [targetCaseId, setTargetCaseId] = useState<string | null>(null);

  const metadataQuery = useQuery({
    queryKey: qk.fieldMetadata(),
    queryFn: ({ signal }) => fieldMetadata(signal),
  });
  const fields = useMemo(() => metadataQuery.data ?? [], [metadataQuery.data]);

  // A create starts from one empty comparison on the first published field, so the seed waits for
  // the metadata rather than guessing a field name the service may not publish.
  const draft = tree ?? (fields.length > 0 ? seedTree(fields) : null);

  const violations = useMemo(() => (draft ? validateTree(draft, fields) : []), [draft, fields]);
  const valid = draft !== null && violations.length === 0;

  useEffect(() => {
    if (draft && !valid && violations[0]) {
      announce(`Condition not ready: ${violations[0].message}`, 'assertive');
    }
  }, [draft, valid, violations, announce]);

  if (metadataQuery.isLoading) return <p>Loading the available fields…</p>;

  if (metadataQuery.isError) {
    const failure =
      metadataQuery.error instanceof ApiFailure
        ? metadataQuery.error.failure
        : { kind: 'transport' as const, cause: 'unknown' };
    return (
      <div>
        <p>The field choices could not be loaded, so conditions cannot be edited yet.</p>
        <FailureBanner failure={failure} onRetry={() => void metadataQuery.refetch()} />
      </div>
    );
  }

  if (!draft) return <p>No fields are published, so a condition cannot be built.</p>;

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

      <RuleConditionEditor tree={draft} fields={fields} onChange={setTree} />

      <PreviewPanel tree={draft} canPreview={valid} />

      {props.mode === 'create' ? (
        <section aria-labelledby="save-heading">
          <h3 id="save-heading">Save</h3>
          <p>Choose the case this rule belongs to. A case holds at most one rule.</p>
          <CasePicker selectedCaseId={targetCaseId} onSelect={setTargetCaseId} />
          {targetCaseId && <SaveRule caseId={targetCaseId} tree={draft} canSave={valid} />}
        </section>
      ) : null}
    </div>
  );
}

const seedTree = (fields: readonly FieldMetadata[]): RuleNode => {
  const group = newGroup('AND');
  return { ...group, children: [newConditionLeaf(fields)] } as RuleNode;
};
