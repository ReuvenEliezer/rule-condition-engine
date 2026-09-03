// The link form (FR-028). Posts { personId, caseId, role } to /api/v1/person-cases WITHOUT an id —
// the composite id is derived server-side and a client-constructed one that disagrees is a 400
// (data-model.md §1.5).
//
// A CONSTRAINT_VIOLATION on this request means the link already exists, explained in those terms,
// stating that the existing role was NOT changed (contract §5.1). Disambiguation is by the request
// in flight, never by message text.

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { personCases } from '../api/resources';
import { ApiFailure } from '../api/client';
import { qk } from '../api/queries';
import { useAnnounce } from '../ui/LiveRegion';
import type { PersonRole } from '../api/types';

const ROLES: readonly PersonRole[] = ['SUBJECT', 'ASSOCIATE', 'WITNESS'];

export type LinkPersonToCaseProps = {
  personId: string;
  caseId: string;
  onLinked?: () => void;
};

export function LinkPersonToCase({ personId, caseId, onLinked }: LinkPersonToCaseProps) {
  const announce = useAnnounce();
  const queryClient = useQueryClient();
  const [role, setRole] = useState<PersonRole>('SUBJECT');
  const [state, setState] = useState<'idle' | 'linked' | 'duplicate' | 'error'>('idle');
  const [errorTitle, setErrorTitle] = useState('');

  const submit = async () => {
    setState('idle');
    try {
      await personCases.save({ personId, caseId, role });
      setState('linked');
      announce('Person linked to the case.');
      await queryClient.invalidateQueries({ queryKey: qk.cases.detail(caseId) });
      await queryClient.invalidateQueries({ queryKey: qk.persons.detail(personId) });
      onLinked?.();
    } catch (e) {
      if (!(e instanceof ApiFailure)) throw e;
      if (e.failure.kind === 'refusal' && e.failure.code === 'CONSTRAINT_VIOLATION') {
        setState('duplicate'); // POST /person-cases + CONSTRAINT_VIOLATION ⇒ link already exists
        announce('That person is already linked to this case.', 'assertive');
      } else {
        setState('error');
        setErrorTitle(e.failure.kind === 'refusal' ? e.failure.message : 'The service could not be reached.');
        announce('Could not create the link.', 'assertive');
      }
    }
  };

  if (state === 'linked') return <p role="status">Linked as {role}.</p>;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label>
        Role{' '}
        <select value={role} onChange={(e) => setRole(e.target.value as PersonRole)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>{' '}
      <button type="submit">Link to this case</button>
      {state === 'duplicate' && (
        <p className="failure-banner" role="alert">
          That person is already linked to this case. The existing link&rsquo;s role was not changed.
        </p>
      )}
      {state === 'error' && (
        <p className="failure-banner" role="alert">
          {errorTitle}
        </p>
      )}
    </form>
  );
}
