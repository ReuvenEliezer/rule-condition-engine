// Per-resource configuration (FR-020). The four record types differ ONLY by data described here —
// columns, sort keys, writable fields, retirement route — so RecordList and RecordEditor stay
// generic. Adding a field to a request that the VM does not declare is a 400, not an ignore
// (FR-029), so `writableFields` is the exact allow-list the editor submits.

import type { AnySummary } from '../api/types';
import type { CaseSortKey, PersonCaseSortKey, PersonSortKey, RuleSortKey } from '../api/resources';

export type RecordsResource = 'persons' | 'cases' | 'rules' | 'person-cases';

export type FieldKind = 'text' | 'number' | 'enum' | 'boolean';

export type WritableField = {
  name: string;
  label: string;
  kind: FieldKind;
  /** enum options for kind === 'enum' */
  options?: readonly string[];
  required?: boolean;
  /** client-side mirror of the server bean-validation constraint (contract §5.2) */
  min?: number;
  max?: number;
  maxLength?: number;
  nullable?: boolean;
};

export type Column = {
  key: string;
  label: string;
  render: (row: AnySummary) => string;
};

export type RetirementRoute =
  | { kind: 'delete'; confirm: 'person' | 'link' }
  | { kind: 'offered'; via: 'status' | 'flag'; explain: string };

export type ResourceConfig = {
  resource: RecordsResource;
  path: string;
  title: string;
  sortKeys: readonly string[];
  columns: readonly Column[];
  writableFields: readonly WritableField[];
  /** blank form defaults for create mode */
  createDefaults: Record<string, unknown>;
  retirement: RetirementRoute;
  /** person-cases has no create-through-this-surface path — it is created from a person or case */
  creatable: boolean;
};

export type { PersonSortKey, CaseSortKey, RuleSortKey, PersonCaseSortKey };
