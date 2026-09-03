// Wire types — each mirrors a Java record in src/main/java/com/eliezer/ruleengine/ (data-model.md §1).
// Two rules govern this file:
//   1. Summary and detail are SEPARATE types, never one type with optional fields. Reading
//      `nationalId` from a list row must be a compile error, not a runtime `undefined`
//      (FR-016, FR-043, SC-004).
//   2. Server-owned fields are `readonly` and are never sent (FR-029, FR-030).

import type { RuleNode } from './tree';
import type { ErrorCode } from './errors';

// ---- 1.1 Envelope and failure ------------------------------------------------------------------

/** api/dto/PageResponse.java — every listing arrives in this. */
export type PageResponse<T> = {
  content: T[];
  /** zero-based */
  page: number;
  /** the size the SERVER applied; may be < requested (FR-022) */
  size: number;
  totalElements: number;
  totalPages: number;
};

/** api/dto/ErrorResponse.java — every refusal arrives in this. `message` is display-only. */
export type ErrorResponse = { code: ErrorCode; message: string; timestamp: string };

// ---- Enumerations (domain/*.java) ------------------------------------------------------------

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type CaseStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED';
export type PersonRole = 'SUBJECT' | 'ASSOCIATE' | 'WITNESS';

// ---- 1.2 Person — api/dto/PersonVm.java ------------------------------------------------------

export type PersonSummary = {
  readonly id: string;
  readonly version: number;
  readonly type: 'person';
  name: string;
  age: number;
  city: string | null;
  risk: RiskLevel;
};

export type PersonDetail = PersonSummary & {
  /** @NotBlank — DETAIL ONLY. Appears in exactly one response across the whole API. */
  nationalId: string;
  readonly caseLinks: PersonCaseSummary[];
  readonly caseLinkCount: number;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export type PersonWrite = {
  id?: string;
  version?: number;
  name: string;
  age: number;
  city: string | null;
  risk: RiskLevel;
  nationalId: string;
};

// ---- 1.3 Case — api/dto/CaseFileVm.java ----------------------------------------------------

export type CaseSummary = {
  readonly id: string;
  readonly version: number;
  readonly type: 'case';
  title: string;
  status: CaseStatus;
  /** the entity's createdAt under its domain name */
  readonly openedAt: string;
};

export type CaseDetail = CaseSummary & {
  /** null ⇒ offer to author a rule (FR-033) */
  readonly ruleId: string | null;
  readonly linkedPersons: PersonSummary[];
  readonly linkedPersonCount: number;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export type CaseWrite = {
  id?: string;
  version?: number;
  title: string;
  status: CaseStatus;
};

// ---- 1.4 Rule — api/dto/RuleVm.java ------------------------------------------------------

export type RuleSummary = {
  readonly id: string;
  readonly version: number;
  readonly type: 'rule';
  caseId: string;
  name: string;
  enabled: boolean;
};

export type RuleDetail = RuleSummary & {
  /** @NotNull — DETAIL ONLY. The rule list carries no condition. */
  condition: RuleNode;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export type RuleWrite = {
  id?: string;
  version?: number;
  caseId: string;
  name: string;
  enabled: boolean;
  condition: RuleNode;
};

// ---- 1.5 Person-case link — api/dto/PersonCaseVm.java -------------------------------------

export type PersonCaseSummary = {
  /** "<personUuid>:<caseUuid>" — DERIVED server-side, never constructed by the client */
  readonly id: string;
  readonly version: number;
  readonly type: 'person-case';
  personId: string;
  caseId: string;
  role: PersonRole;
  readonly linkedAt: string;
};

export type PersonCaseDetail = PersonCaseSummary & {
  readonly person: PersonSummary;
  readonly caseFile: CaseSummary;
  readonly createdBy: string;
  readonly updatedAt: string;
  readonly updatedBy: string;
};

export type PersonCaseWrite = {
  /** no `id` — the composite id is derived server-side; a disagreeing client id is a 400 */
  personId: string;
  caseId: string;
  role: PersonRole;
};

// ---- 1.6 Audit entry — audit/AuditEntryVm.java -------------------------------------------

export type RecordType = 'person' | 'case' | 'rule' | 'person-case';

export type AuditScalar = string | number | boolean | null;
export type AuditChanges = Record<string, { from?: AuditScalar; to?: AuditScalar }>;

export type AuditEntry = {
  readonly recordType: RecordType;
  readonly recordId: string;
  readonly operation: 'CREATE' | 'UPDATE' | 'DELETE';
  /** always "system" until authentication exists (FR-045) */
  readonly actor: string;
  readonly occurredAt: string;
  readonly entityVersion: number | null;
  readonly changes: AuditChanges | null;
};

// ---- Discriminated helpers ------------------------------------------------------------------

export type AnySummary =
  | PersonSummary
  | CaseSummary
  | RuleSummary
  | PersonCaseSummary;
