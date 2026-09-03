// Condition replacement (FR-011, contract §2.3) via PUT /api/v1/rules/{ruleId}/condition.
//
// Replaces the tree and nothing else. This route carries NO optimistic-lock token, so it is
// last-write-wins and can never return CONCURRENT_MODIFICATION — the UI must not claim conflict
// protection here.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateCondition } from '../api/rules';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { FailureBanner } from '../ui/FailureBanner';
import { useAnnounce } from '../ui/LiveRegion';
import type { RuleNode } from '../api/tree';

export type EditConditionProps = {
  ruleId: string;
  tree: RuleNode;
  canSave: boolean;
};

export function EditCondition({ ruleId, tree, canSave }: EditConditionProps) {
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<ApiFailure['failure'] | null>(null);
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setFailure(null);
    try {
      const updated = await updateCondition(ruleId, tree);
      queryClient.setQueryData(qk.rules.detail(ruleId), updated);
      setDone(true);
      announce('Condition replaced.');
    } catch (e) {
      if (!(e instanceof ApiFailure)) throw e;
      setFailure(e.failure);
      announce('Could not replace the condition.', 'assertive');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <p>
        <small>
          Replacing a condition is last-write-wins: this route carries no version, so a concurrent
          edit is not detected.
        </small>
      </p>
      <button type="button" onClick={() => void save()} disabled={!canSave || saving}>
        {saving ? 'Replacing…' : 'Replace the condition'}
      </button>
      {done && <p role="status">The condition has been replaced. Every other rule attribute is unchanged.</p>}
      {failure && <FailureBanner failure={failure} />}
    </div>
  );
}
