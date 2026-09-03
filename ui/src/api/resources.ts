// Typed resource functions for the four CRUD resources (contract §1). The allowed sort keys from
// contract §1.2 are encoded as literal unions, so a request outside the set cannot be constructed
// (FR-021) — an INVALID_SORT_FIELD reaching a user would be a client defect.

import { request } from './client';
import type {
  CaseDetail,
  CaseSummary,
  CaseWrite,
  PageResponse,
  PersonCaseSummary,
  PersonCaseWrite,
  PersonDetail,
  PersonSummary,
  PersonWrite,
  RuleDetail,
  RuleSummary,
  RuleWrite,
} from './types';

// ---- Allowed sort keys — contract §1.2 -------------------------------------------------------

export type PersonSortKey = 'id' | 'name' | 'age' | 'city' | 'risk' | 'createdAt';
export type CaseSortKey = 'id' | 'title' | 'status' | 'createdAt';
export type RuleSortKey = 'id' | 'name' | 'enabled' | 'createdAt' | 'updatedAt';
export type PersonCaseSortKey = 'role' | 'createdAt';
export type AuditSortKey = 'occurredAt' | 'recordType' | 'operation';

export const PERSON_SORT_KEYS: readonly PersonSortKey[] = ['id', 'name', 'age', 'city', 'risk', 'createdAt'];
export const CASE_SORT_KEYS: readonly CaseSortKey[] = ['id', 'title', 'status', 'createdAt'];
export const RULE_SORT_KEYS: readonly RuleSortKey[] = ['id', 'name', 'enabled', 'createdAt', 'updatedAt'];
export const PERSON_CASE_SORT_KEYS: readonly PersonCaseSortKey[] = ['role', 'createdAt'];
export const AUDIT_SORT_KEYS: readonly AuditSortKey[] = ['occurredAt', 'recordType', 'operation'];

export type SortDir = 'asc' | 'desc';

export type ListParams<K extends string> = {
  page?: number;
  size?: number;
  sort?: { key: K; dir: SortDir };
};

const toQuery = <K extends string>(p: ListParams<K>): Record<string, string | number | undefined> => ({
  page: p.page,
  size: p.size,
  sort: p.sort ? (p.sort.dir === 'desc' ? `${p.sort.key},desc` : p.sort.key) : undefined,
});

// ---- A uniform CRUD factory --------------------------------------------------------------------

type Crud<Summary, Detail, Write, K extends string> = {
  list: (params?: ListParams<K>, signal?: AbortSignal) => Promise<PageResponse<Summary>>;
  get: (id: string, signal?: AbortSignal) => Promise<Detail>;
  /** create (no id) or update (id + version) — the same route (contract §1) */
  save: (body: Write) => Promise<{ detail: Detail; created: boolean; location: string | null }>;
  remove: (id: string) => Promise<void>;
};

const crud = <Summary, Detail, Write, K extends string>(path: string): Crud<Summary, Detail, Write, K> => ({
  async list(params = {}, signal) {
    const res = await request<PageResponse<Summary>>(path, { query: toQuery(params), ...(signal ? { signal } : {}) });
    return res.data;
  },
  async get(id, signal) {
    const res = await request<Detail>(`${path}/${encodeURIComponent(id)}`, signal ? { signal } : {});
    return res.data;
  },
  async save(body) {
    const created = !('id' in (body as Record<string, unknown>)) || (body as { id?: string }).id === undefined;
    const res = await request<Detail>(path, { method: 'POST', body });
    return { detail: res.data, created: res.status === 201 || created, location: res.location };
  },
  async remove(id) {
    await request<void>(`${path}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
});

export const persons = crud<PersonSummary, PersonDetail, PersonWrite, PersonSortKey>('/persons');
export const cases = crud<CaseSummary, CaseDetail, CaseWrite, CaseSortKey>('/cases');
export const rules = crud<RuleSummary, RuleDetail, RuleWrite, RuleSortKey>('/rules');
export const personCases = crud<PersonCaseSummary, PersonCaseSummary, PersonCaseWrite, PersonCaseSortKey>('/person-cases');
