// "History for this record" deep link (SC-009, T090) — to the trail filtered by this record's
// type and id, reachable in at most three interactions.

import { Link } from 'react-router-dom';
import type { RecordType } from '../api/types';

const RESOURCE_TO_RECORD_TYPE: Record<string, RecordType> = {
  persons: 'person',
  cases: 'case',
  rules: 'rule',
  'person-cases': 'person-case',
};

export function HistoryLink({ recordType, recordId }: { recordType: string; recordId: string }) {
  const rt = RESOURCE_TO_RECORD_TYPE[recordType] ?? (recordType as RecordType);
  const params = new URLSearchParams({ recordType: rt, recordId });
  return <Link to={`/audit?${params.toString()}`}>History for this record</Link>;
}
