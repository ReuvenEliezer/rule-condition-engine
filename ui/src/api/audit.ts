// Audit trail — GET /audit-entries (contract §3). Read-only: no create/update/delete route exists.
//
// The filter type STRUCTURALLY prevents `recordId` without `recordType` (FR-035, contract §6.4):
// the server silently ignores that combination, so it must be impossible to send.

import { request } from './client';
import type { AuditEntry, PageResponse, RecordType } from './types';
import type { AuditSortKey, SortDir } from './resources';

export type AuditFilter =
  | { recordType?: undefined; recordId?: undefined }
  | { recordType: RecordType; recordId?: undefined }
  | { recordType: RecordType; recordId: string };

export type AuditListParams = {
  filter?: AuditFilter;
  page?: number;
  size?: number;
  sort?: { key: AuditSortKey; dir: SortDir };
};

export async function auditEntries(
  params: AuditListParams = {},
  signal?: AbortSignal,
): Promise<PageResponse<AuditEntry>> {
  const { filter, page, size, sort } = params;
  const res = await request<PageResponse<AuditEntry>>('/audit-entries', {
    query: {
      recordType: filter?.recordType,
      recordId: filter?.recordType ? filter.recordId : undefined,
      page,
      size,
      sort: sort ? (sort.dir === 'desc' ? `${sort.key},desc` : sort.key) : undefined,
    },
    ...(signal ? { signal } : {}),
  });
  return res.data;
}
