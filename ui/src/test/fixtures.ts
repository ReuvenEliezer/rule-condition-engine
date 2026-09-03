// Shared fixtures for MSW handlers and component tests. Shapes mirror the VMs in
// src/main/java/com/eliezer/ruleengine/api/dto/ exactly (data-model.md §1).

import type {
  AuditEntry,
  CaseDetail,
  CaseSummary,
  PersonCaseSummary,
  PersonDetail,
  PersonSummary,
  RuleDetail,
  RuleSummary,
} from '../api/types';
import type { RuleNode } from '../api/tree';

export const QUERYABLE_FIELDS: string[] = [
  'age',
  'case.role',
  'case.status',
  'case.title',
  'city',
  'createdAt',
  'name',
  'risk',
];

export const personSummary = (over: Partial<PersonSummary> = {}): PersonSummary => ({
  id: '11111111-1111-1111-1111-111111111111',
  version: 0,
  type: 'person',
  name: 'AVI COHEN',
  age: 35,
  city: 'Haifa',
  risk: 'HIGH',
  ...over,
});

export const personDetail = (over: Partial<PersonDetail> = {}): PersonDetail => ({
  ...personSummary(),
  nationalId: '111111111',
  caseLinks: [],
  caseLinkCount: 0,
  createdAt: '2026-09-03T10:15:30Z',
  createdBy: 'system',
  updatedAt: '2026-09-03T10:15:30Z',
  updatedBy: 'system',
  ...over,
});

export const caseSummary = (over: Partial<CaseSummary> = {}): CaseSummary => ({
  id: '22222222-2222-2222-2222-222222222222',
  version: 0,
  type: 'case',
  title: 'Operation Northwind',
  status: 'OPEN',
  openedAt: '2026-09-03T09:00:00Z',
  ...over,
});

export const caseDetail = (over: Partial<CaseDetail> = {}): CaseDetail => ({
  ...caseSummary(),
  ruleId: null,
  linkedPersons: [],
  linkedPersonCount: 0,
  createdBy: 'system',
  updatedAt: '2026-09-03T09:00:00Z',
  updatedBy: 'system',
  ...over,
});

export const canonicalTree: RuleNode = {
  type: 'GROUP',
  operator: 'AND',
  children: [
    { type: 'CONDITION', field: 'name', operator: 'CONTAINS', value: { type: 'STRING', value: 'AVI' } },
    { type: 'CONDITION', field: 'age', operator: 'BETWEEN', value: { type: 'RANGE', from: '30', to: '40' } },
    { type: 'CONDITION', field: 'risk', operator: 'EQUALS', value: { type: 'STRING', value: 'HIGH' } },
  ],
};

export const ruleSummary = (over: Partial<RuleSummary> = {}): RuleSummary => ({
  id: '33333333-3333-3333-3333-333333333333',
  version: 0,
  type: 'rule',
  caseId: caseSummary().id,
  name: 'High-risk Avis',
  enabled: true,
  ...over,
});

export const ruleDetail = (over: Partial<RuleDetail> = {}): RuleDetail => ({
  ...ruleSummary(),
  condition: canonicalTree,
  createdAt: '2026-09-03T10:20:00Z',
  createdBy: 'system',
  updatedAt: '2026-09-03T10:20:00Z',
  updatedBy: 'system',
  ...over,
});

export const personCaseSummary = (over: Partial<PersonCaseSummary> = {}): PersonCaseSummary => ({
  id: `${personSummary().id}:${caseSummary().id}`,
  version: 0,
  type: 'person-case',
  personId: personSummary().id,
  caseId: caseSummary().id,
  role: 'SUBJECT',
  linkedAt: '2026-09-03T11:00:00Z',
  ...over,
});

export const auditEntry = (over: Partial<AuditEntry> = {}): AuditEntry => ({
  recordType: 'person',
  recordId: personSummary().id,
  operation: 'UPDATE',
  actor: 'system',
  occurredAt: '2026-09-03T12:00:00Z',
  entityVersion: 1,
  changes: { city: { from: 'Haifa', to: 'Tel Aviv' } },
  ...over,
});

export const page = <T>(content: T[], over: Partial<{ page: number; size: number; totalElements: number; totalPages: number }> = {}) => ({
  content,
  page: over.page ?? 0,
  size: over.size ?? 50,
  totalElements: over.totalElements ?? content.length,
  totalPages: over.totalPages ?? 1,
});
