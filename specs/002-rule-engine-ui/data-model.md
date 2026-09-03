# Phase 1 Data Model: Rule Condition Engine UI

**Feature**: `002-rule-engine-ui` | **Date**: 2026-09-03

This feature introduces **no persisted state**. Everything below is a client-side type describing
data the service already owns, plus the small amount of state that exists only while a view is open.
Every wire type mirrors a Java record in `src/main/java/com/eliezer/ruleengine/`, cited inline —
where the two disagree, the Java record is right.

Two rules govern the whole model:

1. **Summary and detail are separate types, never one type with optional fields.** The server
   decides depth through `@JsonView` (`api/dto/Vms.java`); modelling that as `nationalId?: string`
   would make an accidental read from a list row a runtime `undefined` instead of a compile error
   (FR-016, FR-043, SC-004).
2. **Server-owned fields are readonly and are never sent.** `@JsonProperty(access = READ_ONLY)` on
   the Java side means they are emitted on reads and dropped on writes; the client's request types
   simply do not contain them (FR-029, FR-030).

---

## 1. Wire types

### 1.1 Envelope and failure

```ts
// api/dto/PageResponse.java — every listing arrives in this
type PageResponse<T> = {
  content: T[];
  page: number;          // zero-based
  size: number;          // the size the SERVER applied; may be < requested (FR-022)
  totalElements: number;
  totalPages: number;
};

// api/dto/ErrorResponse.java — every refusal arrives in this
type ErrorResponse = { code: ErrorCode; message: string; timestamp: string };
```

`size` is the applied size, not the requested one. `CrudController.pageable` clamps silently via
`Math.clamp(size, 1, maxPageSize)` (500 in `application.yml`), and a negative `page` clamps to 0.
The UI displays what came back (FR-022).

`ErrorCode` is the closed union of the sixteen codes in [contracts/api-contract.md](./contracts/api-contract.md#5-failures);
`message` is display-only and is never branched on (FR-039).

### 1.2 Person — `api/dto/PersonVm.java`

```ts
type PersonSummary = {                 // @JsonView(Summary) fields only
  readonly id: string;                 // UUID
  readonly version: number;
  readonly type: 'person';
  name: string;                        // @NotBlank @Size(max = 200)
  age: number;                         // @NotNull @Min(0) @Max(149)
  city: string | null;
  risk: RiskLevel;                     // @NotNull
};

type PersonDetail = PersonSummary & {
  nationalId: string;                  // @NotBlank — DETAIL ONLY. See §4.
  readonly caseLinks: PersonCaseSummary[];   // first 20, PersonVmMapper.FIRST_PAGE
  readonly caseLinkCount: number;            // the true total
  readonly createdAt: string; readonly createdBy: string;
  readonly updatedAt: string; readonly updatedBy: string;
};

type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';   // domain/RiskLevel.java
```

**Write shape**: `{ id?, version?, name, age, city, risk, nationalId }`. Sending `type`,
`createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `caseLinks` or `caseLinkCount` is harmless
(they are `READ_ONLY`) but the client does not send them; sending anything *not* on `PersonVm` is a
400 `VALIDATION_FAILED`, because `fail-on-unknown-properties: true` (FR-029).

`caseLinks` is a first page of twenty, `caseLinkCount` the total — the UI shows the total and marks
the list partial (FR-032's person-side twin, spec edge case).

### 1.3 Case — `api/dto/CaseFileVm.java`

```ts
type CaseSummary = {
  readonly id: string; readonly version: number; readonly type: 'case';
  title: string;                       // @NotBlank @Size(max = 200)
  status: CaseStatus;                  // @NotNull
  readonly openedAt: string;           // the entity's createdAt under its domain name
};

type CaseDetail = CaseSummary & {
  readonly ruleId: string | null;      // null ⇒ offer to author one (FR-033)
  readonly linkedPersons: PersonSummary[];   // first 20, CaseFileVmMapper.FIRST_PAGE
  readonly linkedPersonCount: number;        // the true total (FR-032)
  readonly createdBy: string; readonly updatedAt: string; readonly updatedBy: string;
};

type CaseStatus = 'OPEN' | 'UNDER_REVIEW' | 'CLOSED';       // domain/CaseStatus.java
```

**Write shape**: `{ id?, version?, title, status }`. There is deliberately no `createdAt` field —
`openedAt` *is* it, under its domain name.

`ruleId` is what settles the FR-010 one-to-one question without matching on message text (research
R7). Closing a case (FR-031, US4-4) is `POST /api/v1/cases` with `status: 'CLOSED'`, `id` and
`version` — the same route as any other edit.

### 1.4 Rule — `api/dto/RuleVm.java`

```ts
type RuleSummary = {
  readonly id: string; readonly version: number; readonly type: 'rule';
  caseId: string;                      // @NotNull
  name: string;                        // @NotBlank @Size(max = 200)
  enabled: boolean;
};

type RuleDetail = RuleSummary & {
  condition: RuleNode;                 // @NotNull — DETAIL ONLY
  readonly createdAt: string; readonly createdBy: string;
  readonly updatedAt: string; readonly updatedBy: string;
};
```

**Write shape**: `{ id?, version?, caseId, name, enabled, condition }`. `condition` is `@NotNull`
on every `saveOrUpdate`, so a rule cannot be renamed without resending its tree — which is why
FR-011's "replace only the condition" uses the dedicated route instead
(`PUT /api/v1/rules/{ruleId}/condition`, body `{ condition }`).

The rule **list** carries no `condition` (`@JsonView(Summary)`), so a rule must be opened by id
before its tree can be edited.

### 1.5 Person-case link — `api/dto/PersonCaseVm.java`

```ts
type PersonCaseSummary = {
  readonly id: string;                 // "<personUuid>:<caseUuid>" — DERIVED, see below
  readonly version: number;
  readonly type: 'person-case';
  personId: string;                    // @NotNull
  caseId: string;                      // @NotNull
  role: PersonRole;                    // @NotNull
  readonly linkedAt: string;           // the entity's createdAt under its domain name
};

type PersonCaseDetail = PersonCaseSummary & {
  readonly person: PersonSummary;
  readonly caseFile: CaseSummary;
  readonly createdBy: string; readonly updatedAt: string; readonly updatedBy: string;
};

type PersonRole = 'SUBJECT' | 'ASSOCIATE' | 'WITNESS';      // domain/PersonRole.java
```

`id` is derived from the pair, not chosen. `PersonCaseCrudService.beforeSave`:

- `id` present and disagreeing with `personId`/`caseId` → 400 `INVALID_ARGUMENT`. The client never
  constructs an `id`; it sends the pair and omits `id` on create.
- `id` absent and the pair already exists → 409 `CONSTRAINT_VIOLATION`, *not* a silent role change.
  That is FR-028's "the link already exists" case (US2-6).

The composite id is the `{id}` path segment for `GET`/`DELETE`, bound by
`WebConfig.PersonCaseIdConverter`.

### 1.6 Audit entry — `audit/AuditEntryVm.java`

```ts
type AuditEntry = {
  readonly recordType: 'person' | 'case' | 'rule' | 'person-case';   // audit/RecordTypes.java
  readonly recordId: string;
  readonly operation: 'CREATE' | 'UPDATE' | 'DELETE';
  readonly actor: string;              // always "system" until authn exists (FR-045)
  readonly occurredAt: string;
  readonly entityVersion: number | null;
  readonly changes: AuditChanges | null;
};

type AuditChanges = Record<string, { from?: AuditScalar; to?: AuditScalar }>;
type AuditScalar = string | number | boolean | null;
```

`changes` is shaped by the operation (`AuditTrailListener`), and FR-036 renders each case
differently:

| operation | `changes` | rendering |
|---|---|---|
| `CREATE` | `{field: {to}}`, **null-valued fields omitted** | initial value only, no "previous" column |
| `UPDATE` | `{field: {from, to}}`, dirty properties only | previous → new |
| `DELETE` | `null` | explicit "deletions record no field-level detail" — never an empty change list, which reads as "nothing changed" |

A `@Sensitive` field (today only `Person.nationalId`) appears with **both** values replaced by
`"***"`. It is shown as changed-but-hidden with no reveal affordance anywhere (FR-037). Association
and collection properties are skipped entirely by the listener, so they never appear.

`recordType` values are identical to each VM's `type` discriminator by construction, so one filter
vocabulary serves both the trail and the record views.

---

## 2. Condition tree

The tree is the one wire type the UI *constructs* rather than merely displays, and it is the reason
this feature exists. It mirrors `rule/model/` exactly, including both discriminators.

```ts
type RuleNode = GroupNode | ConditionNode | UnaryConditionNode;

type GroupNode = { type: 'GROUP'; operator: 'AND' | 'OR' | 'NOT'; children: RuleNode[] };
type ConditionNode = { type: 'CONDITION'; field: string; operator: ComparisonOperator; value: ConditionValue };
type UnaryConditionNode = { type: 'UNARY'; field: string; operator: 'IS_NULL' | 'IS_NOT_NULL' };

type ConditionValue =
  | { type: 'STRING'; value: string }
  | { type: 'NUMBER'; value: LosslessNumber }   // BigDecimal on the wire — see §2.2
  | { type: 'RANGE';  from: LosslessNumber; to: LosslessNumber }
  | { type: 'LIST';   values: string[] };

type ComparisonOperator =
  | 'EQUALS' | 'NOT_EQUALS'
  | 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH'
  | 'BETWEEN' | 'GT' | 'GTE' | 'LT' | 'LTE'
  | 'IN' | 'NOT_IN';
```

Two discriminators, both `"type"`, at different levels: `RuleNode.type` names the node kind
(`@JsonTypeInfo` on `RuleNode`), `ConditionValue.type` names the operand shape (`@JsonTypeInfo` on
`ConditionValue`). The value's discriminator lives on the value object rather than as a sibling
field on the node, so there is no second copy to drift.

### 2.1 Invariants the builder enforces before any request (FR-006, FR-007)

Each mirrors a compact constructor that would otherwise reject the request:

| Invariant | Enforced server-side by | Message |
|---|---|---|
| A group has ≥ 1 child | `GroupNode` | names the empty group (US1-6) |
| `NOT` has exactly 1 child | `GroupNode` | "wrap multiple children in an explicit AND/OR" (US1-5) |
| `RANGE.from <= RANGE.to` | `RangeValue` | refused before sending, with the reason (US1-4) |
| `LIST` is non-empty and null-free | `ListValue` | — |
| `STRING` is non-empty | `StringValue` | — |
| operator accepts the value shape | `ConditionNode` | — |
| operator suits the field's type | `FieldDescriptor` (via the catalog, §3) | control never offers it |

Structural budgets are **not** mirrored — depth 8, 128 nodes, 500 list entries
(`application.yml`, enforced by `RuleTreeValidator`). The server owns those, and a client copy would
be one more thing to drift. A `RULE_TREE_TOO_COMPLEX` rejection is surfaced with its message, which
names the budget and its limit (FR-012).

### 2.2 Lossless numbers

`NumberValue` is a `BigDecimal` and `RangeValue` holds two. `LosslessNumber` is `lossless-json`'s
string-backed number: operands live in builder state as strings and are emitted verbatim, so
`10.50` does not become `10.5` (research R5). This is what makes FR-013's byte-for-byte round-trip
and SC-010's identical-tree claim true rather than merely usually-true.

`ListValue` is **deduplicated server-side** (`LinkedHashSet`, first occurrence wins). A tree read
back from the server is already deduplicated, so opening and re-saving it is stable; the builder
also deduplicates on entry so the author sees what will be stored.

---

## 3. Field catalog (client-side, validated at start-up)

Not a wire type — the local stopgap for the metadata `GET /api/v1/rules/fields` does not publish
(research R4, spec dependency #2).

```ts
type FieldCatalogEntry = {
  logicalName: string;                 // must match a name the server publishes
  label: string;                       // display only
  valueKind: 'TEXT' | 'NUMBER' | 'ENUM' | 'INSTANT';
  operators: readonly ComparisonOperator[];   // binary operators offered
  allowsPresenceTest: true;                   // IS_NULL / IS_NOT_NULL, offered on every field
  enumValues?: readonly string[];             // ENUM only — closed choice (FR-004)
};
```

The eight entries and the derivation that produced them are in
[contracts/field-catalog.md](./contracts/field-catalog.md). Their key set is compared for equality
against `GET /api/v1/rules/fields` at start-up; any difference is a blocking configuration error
and the builder refuses to open (FR-001, spec dependency #2).

---

## 4. Client-only state

State that exists while a view is open and nowhere else.

| State | Lives in | Lifetime | Requirement |
|---|---|---|---|
| Builder draft tree | component state | until saved or discarded | FR-006, FR-007 |
| `previewResult` + `previewTreeHash` | component state | until the view closes | FR-008 |
| `isPreviewStale` = `hash(currentTree) !== previewTreeHash` | derived, not stored | — | FR-009 |
| Run scope (`GLOBAL` \| `CASE_SCOPED`) | component state, no default | until the view closes | FR-014 |
| Edit buffer surviving a rejected save | component state, **not cleared on 409** | until resolved | FR-024, SC-005 |
| `version` read with a record | inside the edit buffer | resent on save | FR-023 |
| Catalog validation result | app state, once at start-up | process | spec dependency #2 |

**Nothing is persisted.** No `localStorage`, no `sessionStorage`, no IndexedDB, no persisted query
cache. Person **detail** queries additionally use `gcTime: 0`, so `nationalId` is dropped when the
view unmounts rather than lingering in the cache for the default five minutes (FR-043, SC-004,
research R8).

Run scope has no default value — FR-014 requires the user to state it, so the control opens
unselected and the run action is disabled until it is chosen. Note that `GET /rules/{id}/matches`
defaults to `GLOBAL` server-side; the client always sends the parameter explicitly, so the default
never applies and the scope shown beside the results is always the one the user picked.

---

## 5. State transitions

**Case status** (`CaseStatus`) — the only entity state machine, and it is unconstrained: the service
accepts any status on any update. Cases are never deleted; `DELETE /api/v1/cases/{id}` is 405
`DELETION_NOT_SUPPORTED` with "Cases are closed, not deleted: POST /api/v1/cases with status=CLOSED",
which the UI presents as an offered action rather than an error (FR-025).

```
OPEN ⇄ UNDER_REVIEW ⇄ CLOSED        (any transition; a closed case stays readable, US4-5)
```

**Rule enablement** — `enabled: boolean`. `DELETE /api/v1/rules/{id}` is 405 with "Rules are
disabled, not deleted: POST /api/v1/rules with enabled=false". Same treatment.

**Person retirement** — `DELETE /api/v1/persons/{id}` is 204 and does two things in one transaction
(`PersonCrudService.innerDelete`): hard-deletes every `person_case` link, then soft-deletes the
person. The confirmation must say both — retired rather than erased, and links removed (FR-026,
spec dependency #4). Afterwards the person is absent from every listing and every rule match, and
opening a stale row is `RECORD_NOT_FOUND` rather than a blank record.

**Link removal** — `DELETE /api/v1/person-cases/{personId}:{caseId}` is a genuine hard delete of the
link row only; neither the person nor the case is affected, and the UI says so (FR-027).

**Preview freshness** — the one state machine this feature introduces:

```
NEVER_RUN ──preview──▶ FRESH ──tree edited──▶ STALE ──preview──▶ FRESH
                         │                      │
                         └────── failed ────────┴──▶ FAILED (specific code, FR-039)
```

`NEVER_RUN`, an empty `FRESH` (zero matches), and `FAILED` are three visibly different states —
FR-018 and SC-007 both turn on not conflating them.
