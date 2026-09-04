// The rule page (US3): name, enabled state and conditions on ONE page, committed in ONE action.
//
// Three regions, top to bottom: a header carrying the editable name and enabled state alongside the
// service-owned metadata as read-only text (FR-032); the conditions as the main body (FR-031); the
// actions below.
//
// The save is POST /api/v1/rules carrying id + the version read at load — one atomic change, one
// audit entry (FR-033, SC-009), and a concurrent edit refused rather than overwritten (FR-033a).
// The unversioned condition route is not used here: it carries no version and so cannot detect one.
//
// FR-032a: no rule is read-only. A DISABLED rule's name, enabled state and conditions all stay
// editable — there is no authorization model in this service to make one otherwise.

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../api/queries';
import { rules } from '../api/resources';
import { fieldMetadata } from '../api/fieldMetadata';
import { ApiFailure } from '../api/client';
import type { RuleDetail } from '../api/types';
import type { RuleNode } from '../api/tree';
import { validateTree } from './tree/validate';
import { RuleConditionEditor } from './RuleConditionEditor';
import { PageHeader } from '../ui/PageHeader';
import { FailureBanner } from '../ui/FailureBanner';
import { HistoryLink } from '../audit/HistoryLink';
import { Button } from '../ui/components/Button';
import { Input } from '../ui/components/Input';
import { Card } from '../ui/components/Card';
import { useAnnounce } from '../ui/LiveRegion';
import { PreviewPanel } from './PreviewPanel';
import { formatInstant } from '../lib/format';

/** What the author may change, held as one draft so a single save commits all of it. */
type Draft = { name: string; enabled: boolean; condition: RuleNode };

export function RulePage({ ruleId }: { ruleId: string }) {
  const announce = useAnnounce();
  const queryClient = useQueryClient();

  const ruleQuery = useQuery({
    queryKey: qk.rules.detail(ruleId),
    queryFn: ({ signal }) => rules.get(ruleId, signal),
    enabled: ruleId !== '',
  });

  // A SEPARATE query from the rule, so each fails, reports and retries on its own (FR-040).
  const metadataQuery = useQuery({
    queryKey: qk.fieldMetadata(),
    queryFn: ({ signal }) => fieldMetadata(signal),
  });
  const fields = useMemo(() => metadataQuery.data ?? [], [metadataQuery.data]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<ApiFailure['failure'] | null>(null);
  const [stale, setStale] = useState(false);

  const loaded = ruleQuery.data;
  const current: Draft | null = draft ?? (loaded ? toDraft(loaded) : null);

  const nameError = current && current.name.trim() === '' ? 'Enter a name for this rule.' : undefined;
  const violations = current ? validateTree(current.condition, fields) : [];
  const canSave = current !== null && !nameError && violations.length === 0 && !saving;

  const save = async () => {
    if (!loaded || !current) return;
    setSaving(true);
    setFailure(null);
    setStale(false);
    try {
      // The version read at LOAD, never a refreshed one — refreshing it would defeat the very
      // check it exists to trigger.
      const { detail } = await rules.save({
        id: loaded.id,
        version: loaded.version,
        caseId: loaded.caseId,
        name: current.name.trim(),
        enabled: current.enabled,
        condition: current.condition,
      });
      queryClient.setQueryData(qk.rules.detail(ruleId), detail);
      setDraft(null);
      announce(`Rule "${detail.name}" saved.`);
    } catch (e) {
      if (!(e instanceof ApiFailure)) throw e;
      // The author's unsaved work stays on screen in EVERY refusal (FR-030).
      if (e.failure.kind === 'refusal' && e.failure.code === 'CONCURRENT_MODIFICATION') {
        setStale(true);
        announce('This rule changed elsewhere since you opened it. Your changes are still here.', 'assertive');
      } else {
        setFailure(e.failure);
      }
    } finally {
      setSaving(false);
    }
  };

  const reload = async () => {
    setStale(false);
    setDraft(null);
    setFailure(null);
    await ruleQuery.refetch();
    announce('Reloaded the current version of this rule.');
  };

  if (ruleQuery.isLoading) return <p>Loading rule…</p>;
  if (ruleQuery.isError) {
    return (
      <FailureBanner
        failure={asFailure(ruleQuery.error)}
        onRetry={() => void ruleQuery.refetch()}
      />
    );
  }
  if (!loaded || !current) return <p>Rule not found.</p>;

  return (
    <section>
      <PageHeader
        title={loaded.name}
        eyebrow="Rule"
        description="Name, state and conditions are saved together, as one change."
        actions={
          <>
            <HistoryLink recordType="rule" recordId={loaded.id} />
            <Button type="button" onClick={() => void save()} disabled={!canSave} aria-busy={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </>
        }
      />

      {stale && (
        <div className="failure-banner mb-4" role="alert">
          <p>
            <strong>Your copy is out of date.</strong>
          </p>
          <p>
            This rule changed elsewhere since you opened it, so the save was refused rather than
            overwriting that change. Your edits are still on screen.
          </p>
          <Button type="button" variant="secondary" size="sm" onClick={() => void reload()}>
            Reload the current version
          </Button>
        </div>
      )}

      {failure && <FailureBanner failure={failure} onRetry={() => void save()} />}

      <Card className="mb-6 p-5">
        <div className="flex flex-col gap-4">
          <label className="flex max-w-md flex-col gap-1.5 text-sm">
            <span className="font-medium text-slate-700 dark:text-slate-300">Name</span>
            <Input
              value={current.name}
              aria-invalid={nameError !== undefined}
              aria-describedby={nameError ? 'rule-name-error' : undefined}
              onChange={(e) => setDraft({ ...current, name: e.target.value })}
            />
            {nameError && (
              <span className="field-error" id="rule-name-error">
                {nameError}
              </span>
            )}
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={current.enabled}
              onChange={(e) => setDraft({ ...current, enabled: e.target.checked })}
            />
            <span className="font-medium text-slate-700 dark:text-slate-300">Enabled</span>
          </label>

          {/*
            Service-owned values: displayed as text, with no editable control anywhere (FR-032).
            These are the WHOLE of "server-owned" for a rule — nothing else here is restricted.
          */}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <Fact label="Rule id" value={loaded.id} />
            <Fact label="Case" value={loaded.caseId} />
            <Fact label="Created" value={`${formatInstant(loaded.createdAt)} by ${loaded.createdBy}`} />
            <Fact label="Last changed" value={`${formatInstant(loaded.updatedAt)} by ${loaded.updatedBy}`} />
          </dl>
        </div>
      </Card>

      <h2 className="mb-3 text-lg font-semibold">Conditions</h2>

      {metadataQuery.isError ? (
        <div>
          <p>The field choices could not be loaded, so conditions cannot be edited yet.</p>
          <FailureBanner
            failure={asFailure(metadataQuery.error)}
            onRetry={() => void metadataQuery.refetch()}
          />
        </div>
      ) : (
        <RuleConditionEditor
          tree={current.condition}
          fields={fields}
          onChange={(condition) => setDraft({ ...current, condition })}
        />
      )}

      <div className="mt-6">
        <PreviewPanel tree={current.condition} canPreview={violations.length === 0} />
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="truncate font-medium text-slate-700 dark:text-slate-300">{value}</dd>
    </div>
  );
}

const toDraft = (rule: RuleDetail): Draft => ({
  name: rule.name,
  enabled: rule.enabled,
  condition: rule.condition,
});

const asFailure = (error: unknown): ApiFailure['failure'] =>
  error instanceof ApiFailure ? error.failure : { kind: 'transport', cause: 'unknown' };
