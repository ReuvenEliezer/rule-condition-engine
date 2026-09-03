// Render field-level changes per operation (FR-036, FR-037, data-model.md §1.6).
//
//   CREATE  → initial values only, no implied "previous" column
//   UPDATE  → previous → new for each dirty field
//   DELETE  → `changes` is null: an EXPLICIT statement that deletions record no field-level
//             detail — never an empty change list, which would read as "nothing changed"
//
// A @Sensitive field arrives with BOTH values already replaced by "***". It is shown as
// changed-but-hidden with NO reveal affordance anywhere in the tree.

import type { AuditChanges as Changes, AuditEntry, AuditScalar } from '../api/types';

const MASK = '***';

const show = (v: AuditScalar | undefined): string => {
  if (v === undefined) return '—';
  if (v === null) return '(none)';
  return String(v);
};

const isMasked = (pair: { from?: AuditScalar; to?: AuditScalar }): boolean =>
  pair.from === MASK || pair.to === MASK;

export function AuditChanges({ entry }: { entry: AuditEntry }) {
  if (entry.operation === 'DELETE') {
    return <p>This record was deleted. Deletions record no field-level detail.</p>;
  }

  const changes: Changes = entry.changes ?? {};
  const fields = Object.keys(changes);

  if (fields.length === 0) {
    return <p>No field-level changes were recorded for this {entry.operation.toLowerCase()}.</p>;
  }

  if (entry.operation === 'CREATE') {
    return (
      <table>
        <thead>
          <tr>
            <th>Field</th>
            <th>Initial value</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => {
            const pair = changes[f] ?? {};
            return (
              <tr key={f}>
                <td>{f}</td>
                <td>{isMasked(pair) ? <MaskedCell /> : show(pair.to)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Field</th>
          <th>Previous</th>
          <th>New</th>
        </tr>
      </thead>
      <tbody>
        {fields.map((f) => {
          const pair = changes[f] ?? {};
          const masked = isMasked(pair);
          return (
            <tr key={f}>
              <td>{f}</td>
              <td>{masked ? <MaskedCell /> : show(pair.from)}</td>
              <td>{masked ? <MaskedCell /> : show(pair.to)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function MaskedCell() {
  return (
    <span title="This field is sensitive; its values are not shown.">
      <span aria-hidden="true">•••</span>
      <span className="visually-hidden">value hidden — sensitive field</span>
    </span>
  );
}
