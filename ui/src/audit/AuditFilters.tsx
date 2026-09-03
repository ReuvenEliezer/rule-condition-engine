// Audit filters (FR-035, contract §3). The record-identity control is DISABLED until a record type
// is chosen, so the combination the server silently ignores (recordId without recordType) can
// never be sent.

import type { RecordType } from '../api/types';
import type { AuditFilter } from '../api/audit';

const RECORD_TYPES: readonly RecordType[] = ['person', 'case', 'rule', 'person-case'];

export type AuditFiltersProps = {
  filter: AuditFilter;
  onChange: (next: AuditFilter) => void;
};

export function AuditFilters({ filter, onChange }: AuditFiltersProps) {
  const recordType = filter.recordType;
  const recordId = filter.recordType ? filter.recordId : undefined;

  return (
    <fieldset>
      <legend>Filter</legend>
      <label>
        Record type{' '}
        <select
          value={recordType ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? {} : { recordType: v as RecordType });
          }}
        >
          <option value="">(whole trail)</option>
          {RECORD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>{' '}
      <label>
        Record id{' '}
        <input
          type="text"
          value={recordId ?? ''}
          disabled={!recordType}
          placeholder={recordType ? 'optional' : 'choose a record type first'}
          onChange={(e) => {
            if (!recordType) return;
            const id = e.target.value.trim();
            onChange(id === '' ? { recordType } : { recordType, recordId: id });
          }}
        />
      </label>
    </fieldset>
  );
}
