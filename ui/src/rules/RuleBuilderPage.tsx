// Routes the three rule views: create (the builder), edit (the rule page, which owns name,
// enabled state and conditions together), and matches.

import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rules } from '../api/resources';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { FailureBanner } from '../ui/FailureBanner';
import { RuleBuilder } from './RuleBuilder';
import { RulePage } from './RulePage';
import { MatchesView } from './MatchesView';

export function RuleBuilderPage({ mode }: { mode: 'create' | 'edit' | 'matches' }) {
  if (mode === 'create') {
    return (
      <section>
        <h2>New rule</h2>
        <RuleBuilder mode="create" />
      </section>
    );
  }
  // The rule page fetches the rule itself — it must hold the version it read, so a second fetch
  // here would be a second source of truth for exactly the value the staleness check depends on.
  if (mode === 'edit') return <RuleForEdit />;
  return <RuleMatches />;
}

function RuleForEdit() {
  const { id } = useParams<{ id: string }>();
  return <RulePage ruleId={id ?? ''} />;
}

function RuleMatches() {
  const { id } = useParams<{ id: string }>();
  const ruleId = id ?? '';
  const query = useQuery({
    queryKey: qk.rules.detail(ruleId),
    queryFn: ({ signal }) => rules.get(ruleId, signal),
    enabled: ruleId !== '',
  });

  if (query.isLoading) return <p>Loading rule…</p>;
  if (query.isError) {
    const failure =
      query.error instanceof ApiFailure ? query.error.failure : { kind: 'transport' as const, cause: 'unknown' };
    return <FailureBanner failure={failure} onRetry={() => void query.refetch()} />;
  }
  const rule = query.data;
  if (!rule) return <p>Rule not found.</p>;

  return (
    <section>
      <h2>Run rule: {rule.name}</h2>
      <MatchesView ruleId={rule.id} caseId={rule.caseId} />
    </section>
  );
}
