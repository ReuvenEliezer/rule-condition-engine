// Rule creation and the one-to-one case rule (FR-010, research R7).
//
//   - POST /api/v1/rules with a null id creates. On success the created rule's identity and its
//     case are shown.
//   - A case holds at most one rule. Before offering to author, read CaseDetail.ruleId: a non-null
//     value means the offer is to OPEN the existing rule, not create one.
//   - If a create is still rejected with INVALID_RULE, re-read the case; a now-present ruleId
//     produces the explanation and the offer to open it. DRIVEN BY ruleId, NEVER by message text.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { cases, rules } from '../api/resources';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { FailureBanner } from '../ui/FailureBanner';
import { useAnnounce } from '../ui/LiveRegion';
import type { RuleNode } from '../api/tree';
import type { RuleDetail } from '../api/types';

export type SaveRuleProps = {
  caseId: string;
  tree: RuleNode;
  canSave: boolean;
};

export function SaveRule({ caseId, tree, canSave }: SaveRuleProps) {
  const announce = useAnnounce();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<RuleDetail | null>(null);
  const [failure, setFailure] = useState<ApiFailure['failure'] | null>(null);
  const [saving, setSaving] = useState(false);

  const caseQuery = useQuery({
    queryKey: qk.cases.detail(caseId),
    queryFn: ({ signal }) => cases.get(caseId, signal),
  });

  const existingRuleId = caseQuery.data?.ruleId ?? null;

  const save = async () => {
    setSaving(true);
    setFailure(null);
    try {
      const { detail } = await rules.save({ caseId, name: name.trim(), enabled: true, condition: tree });
      setSaved(detail);
      announce(`Rule "${detail.name}" saved to its case.`);
    } catch (e) {
      if (!(e instanceof ApiFailure)) throw e;
      if (e.failure.kind === 'refusal' && e.failure.code === 'INVALID_RULE') {
        // Re-read the case: a now-present ruleId means "this case already has a rule".
        const fresh = await cases.get(caseId).catch(() => null);
        if (fresh?.ruleId) {
          await caseQuery.refetch();
          setFailure(e.failure);
        } else {
          setFailure(e.failure); // a genuine tree-compile rejection
        }
      } else {
        setFailure(e.failure);
      }
      announce('Could not save the rule.', 'assertive');
    } finally {
      setSaving(false);
    }
  };

  if (saved) {
    return (
      <div role="status">
        <p>
          Saved rule <strong>{saved.name}</strong> (<code>{saved.id}</code>) to case{' '}
          <Link to={`/cases/${saved.caseId}`}>{saved.caseId}</Link>.
        </p>
      </div>
    );
  }

  if (existingRuleId) {
    return (
      <div>
        <p>This case already has a rule — a case holds at most one.</p>
        <Link to={`/rules/${existingRuleId}/condition`}>Open the existing rule</Link>
      </div>
    );
  }

  return (
    <div>
      <label>
        Rule name{' '}
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
      </label>{' '}
      <button type="button" onClick={() => void save()} disabled={!canSave || saving || name.trim() === ''}>
        {saving ? 'Saving…' : 'Save rule to this case'}
      </button>
      {failure && (
        <FailureBanner failure={failure}>
          {failure.kind === 'refusal' && caseQuery.data?.ruleId && (
            <Link to={`/rules/${caseQuery.data.ruleId}/condition`}>Open the existing rule</Link>
          )}
        </FailureBanner>
      )}
    </div>
  );
}
