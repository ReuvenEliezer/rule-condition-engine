// The four resource configurations (FR-020). Each supplies only its columns, sort keys and
// writable fields; sort keys are exactly contract §1.2.

import type { AnySummary, CaseSummary, PersonCaseSummary, PersonSummary, RuleSummary } from '../../api/types';
import type { RecordsResource, ResourceConfig } from '../resourceConfig';
import { formatInstant } from '../../lib/format';

const asPerson = (r: AnySummary) => r as PersonSummary;
const asCase = (r: AnySummary) => r as CaseSummary;
const asRule = (r: AnySummary) => r as RuleSummary;
const asLink = (r: AnySummary) => r as PersonCaseSummary;

export const PERSONS_CONFIG: ResourceConfig = {
  resource: 'persons',
  path: '/persons',
  title: 'Persons',
  sortKeys: ['id', 'name', 'age', 'city', 'risk', 'createdAt'],
  columns: [
    { key: 'name', label: 'Name', render: (r) => asPerson(r).name },
    { key: 'age', label: 'Age', render: (r) => String(asPerson(r).age) },
    { key: 'city', label: 'City', render: (r) => asPerson(r).city ?? '—' },
    { key: 'risk', label: 'Risk', render: (r) => asPerson(r).risk },
  ],
  writableFields: [
    { name: 'name', label: 'Name', kind: 'text', required: true, maxLength: 200 },
    { name: 'age', label: 'Age', kind: 'number', required: true, min: 0, max: 149 },
    { name: 'city', label: 'City', kind: 'text', nullable: true },
    { name: 'risk', label: 'Risk', kind: 'enum', required: true, options: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
    { name: 'nationalId', label: 'National identifier', kind: 'text', required: true },
  ],
  createDefaults: { name: '', age: 0, city: null, risk: 'LOW', nationalId: '' },
  retirement: { kind: 'delete', confirm: 'person' },
  creatable: true,
};

export const CASES_CONFIG: ResourceConfig = {
  resource: 'cases',
  path: '/cases',
  title: 'Cases',
  sortKeys: ['id', 'title', 'status', 'createdAt'],
  columns: [
    { key: 'title', label: 'Title', render: (r) => asCase(r).title },
    { key: 'status', label: 'Status', render: (r) => asCase(r).status },
    { key: 'openedAt', label: 'Opened', render: (r) => formatInstant(asCase(r).openedAt) },
  ],
  writableFields: [
    { name: 'title', label: 'Title', kind: 'text', required: true, maxLength: 200 },
    { name: 'status', label: 'Status', kind: 'enum', required: true, options: ['OPEN', 'UNDER_REVIEW', 'CLOSED'] },
  ],
  createDefaults: { title: '', status: 'OPEN' },
  retirement: {
    kind: 'offered',
    via: 'status',
    explain: 'Cases are closed, not deleted. Set the status to CLOSED instead.',
  },
  creatable: true,
};

export const RULES_CONFIG: ResourceConfig = {
  resource: 'rules',
  path: '/rules',
  title: 'Rules',
  sortKeys: ['id', 'name', 'enabled', 'createdAt', 'updatedAt'],
  columns: [
    { key: 'name', label: 'Name', render: (r) => asRule(r).name },
    { key: 'caseId', label: 'Case', render: (r) => asRule(r).caseId },
    { key: 'enabled', label: 'Enabled', render: (r) => (asRule(r).enabled ? 'yes' : 'no') },
  ],
  // A rule is neither created nor edited here. Its condition needs the builder, and its name and
  // enabled state are saved together WITH the condition on the rule page, as one change producing
  // one audit entry. Editing them here would be the second surface this feature exists to remove.
  writableFields: [],
  createDefaults: {},
  retirement: {
    kind: 'offered',
    via: 'flag',
    explain: 'Rules are disabled, not deleted. Set "enabled" to no instead.',
  },
  creatable: false,
};

export const PERSON_CASES_CONFIG: ResourceConfig = {
  resource: 'person-cases',
  path: '/person-cases',
  title: 'Person–case links',
  sortKeys: ['role', 'createdAt'],
  columns: [
    { key: 'personId', label: 'Person', render: (r) => asLink(r).personId },
    { key: 'caseId', label: 'Case', render: (r) => asLink(r).caseId },
    { key: 'role', label: 'Role', render: (r) => asLink(r).role },
  ],
  writableFields: [
    { name: 'role', label: 'Role', kind: 'enum', required: true, options: ['SUBJECT', 'ASSOCIATE', 'WITNESS'] },
  ],
  createDefaults: {},
  retirement: { kind: 'delete', confirm: 'link' },
  creatable: false,
};

export const RESOURCE_CONFIGS: Record<RecordsResource, ResourceConfig> = {
  persons: PERSONS_CONFIG,
  cases: CASES_CONFIG,
  rules: RULES_CONFIG,
  'person-cases': PERSON_CASES_CONFIG,
};
