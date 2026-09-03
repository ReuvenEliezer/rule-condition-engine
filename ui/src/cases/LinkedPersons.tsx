// Linked persons on the case workspace (FR-032, spec dependency #3).
//
// Shows the TRUE linkedPersonCount and marks the embedded twenty a PARTIAL SUBSET — never
// presented as complete. Records inline that the twenty-first link is unreachable because
// /person-cases cannot be filtered by case.

import { useState } from 'react';
import type { CaseDetail } from '../api/types';
import { PersonDetailPanel } from '../records/PersonDetailPanel';
import { LinkPersonToCase } from '../records/LinkPersonToCase';
import { EmptyState } from '../ui/EmptyState';

export function LinkedPersons({ caseFile }: { caseFile: CaseDetail }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [linkPersonId, setLinkPersonId] = useState('');

  const partial = caseFile.linkedPersonCount > caseFile.linkedPersons.length;

  return (
    <div>
      <p>
        {caseFile.linkedPersonCount} linked in total.
        {partial &&
          ` Showing the first ${caseFile.linkedPersons.length}. The rest cannot be listed here — the link listing cannot be filtered by case.`}
      </p>

      {caseFile.linkedPersons.length === 0 ? (
        <EmptyState
          message="No person is linked to this case yet."
          action={<span>Run the rule, or link a person by id below.</span>}
        />
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Age</th>
              <th>City</th>
              <th>Risk</th>
              <th> </th>
            </tr>
          </thead>
          <tbody>
            {caseFile.linkedPersons.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.age}</td>
                <td>{p.city ?? '—'}</td>
                <td>{p.risk}</td>
                <td>
                  <button type="button" onClick={() => setOpenId(p.id)}>
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label>
          Link a person by id{' '}
          <input type="text" value={linkPersonId} onChange={(e) => setLinkPersonId(e.target.value)} />
        </label>
        {linkPersonId.trim() !== '' && (
          <LinkPersonToCase personId={linkPersonId.trim()} caseId={caseFile.id} onLinked={() => setLinkPersonId('')} />
        )}
      </form>

      {openId && <PersonDetailPanel personId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
