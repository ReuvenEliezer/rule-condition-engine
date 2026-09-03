// The scope selector (FR-014). Opens UNSELECTED with the run action disabled; offers GLOBAL and
// CASE_SCOPED with each one's meaning stated. GET /rules/{id}/matches defaults to GLOBAL
// server-side, but the client always sends the parameter explicitly, so the default never applies.

import type { MatchScope } from '../api/rules';

export type ScopeSelectorProps = {
  value: MatchScope | null;
  onChange: (scope: MatchScope) => void;
  /** true when this run is pinned to a case workspace (US4) */
  locked?: boolean;
};

export function ScopeSelector({ value, onChange, locked = false }: ScopeSelectorProps) {
  return (
    <fieldset>
      <legend>Scope</legend>
      <label>
        <input
          type="radio"
          name="run-scope"
          checked={value === 'GLOBAL'}
          disabled={locked}
          onChange={() => onChange('GLOBAL')}
        />{' '}
        Whole population — every person the service holds
      </label>
      <br />
      <label>
        <input
          type="radio"
          name="run-scope"
          checked={value === 'CASE_SCOPED'}
          disabled={locked}
          onChange={() => onChange('CASE_SCOPED')}
        />{' '}
        This rule&rsquo;s case only — persons already linked to it
      </label>
      {value === null && <p>Choose a scope to run the rule.</p>}
    </fieldset>
  );
}
