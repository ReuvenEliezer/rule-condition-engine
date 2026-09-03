// Routes the rule builder / condition editor / matches views (User Stories 1 and 2).

import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { rules } from '../api/resources';
import { qk } from '../api/queries';
import { ApiFailure } from '../api/client';
import { FailureBanner } from '../ui/FailureBanner';
import { RuleBuilder } from './RuleBuilder';
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
  return <RuleForId mode={mode} />;
}

function RuleForId({ mode }: { mode: 'edit' | 'matches' }) {
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

  if (mode === 'matches') {
    return (
      <section>
        <h2>Run rule: {rule.name}</h2>
        <MatchesView ruleId={rule.id} caseId={rule.caseId} />
      </section>
    );
  }

  return (
    <section>
      <h2>Edit condition: {rule.name}</h2>
      <RuleBuilder mode="edit" ruleId={rule.id} initialTree={rule.condition} />
    </section>
  );
}
