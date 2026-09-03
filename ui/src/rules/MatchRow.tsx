// A match row, rendered from PersonSummary ONLY. The prop type makes `nationalId` unreachable —
// there is no field to read and no affordance implying it is available at this depth (FR-016,
// SC-004).

import type { PersonSummary } from '../api/types';

export type MatchRowProps = {
  person: PersonSummary;
  onOpen: (id: string) => void;
};

export function MatchRow({ person, onOpen }: MatchRowProps) {
  return (
    <tr>
      <td>{person.name}</td>
      <td>{person.age}</td>
      <td>{person.city ?? '—'}</td>
      <td>{person.risk}</td>
      <td>
        <button type="button" onClick={() => onOpen(person.id)}>
          Open full record
        </button>
      </td>
    </tr>
  );
}
