# Contract: the API surface this UI consumes

**Feature**: `002-rule-engine-ui` | **Date**: 2026-09-03

This feature exposes no interface of its own — it is a browser client. Its contract is therefore the
**consumed** one: every endpoint the UI is permitted to call, the exact shape it may send, and the
failures it must handle. Nothing here is new; it is the existing service, pinned so a client change
cannot silently drift from it.

Base path: `${VITE_API_BASE_URL ?? '/api/v1'}` (research R11). Payload shapes are in
[../data-model.md](../data-model.md).

---

## 1. The uniform record contract

Four resources inherit `CrudController` unchanged and behave identically (FR-020):

| Resource | Path | `{id}` |
|---|---|---|
| Person | `/persons` | UUID |
| Case | `/cases` | UUID |
| Rule | `/rules` | UUID |
| Person-case link | `/person-cases` | `"<personUuid>:<caseUuid>"` |

| Operation | Request | Success | View |
|---|---|---|---|
| List | `GET {path}?page&size&sort` | 200 `PageResponse<Summary>` | Summary |
| Read | `GET {path}/{id}` | 200 `Detail` | Detail |
| Create | `POST {path}` body without `id` | 201 + `Location` | Detail |
| Update | `POST {path}` body with `id` **and** `version` | 200 `Detail` | Detail |
| Delete | `DELETE {path}/{id}` | 204 | — |

**Create and update are the same route.** A null `id` creates, a present one updates
(`CrudController.saveOrUpdate`). There is no `PUT` on these resources.

### 1.1 Paging

- `page` is zero-based; a negative value clamps to 0.
- `size` is clamped to `[1, 500]` and defaults to 50 (`rule-engine.max-page-size` /
  `default-page-size`). Clamping is **silent** — the UI renders `PageResponse.size`, never the
  requested value (FR-022).
- `sort` is `field` or `field,desc` — **one field only** (`split(",", 2)`). An identity sort is
  appended server-side so pages neither repeat nor skip rows.

### 1.2 Allowed sort keys (FR-021, FR-038)

The UI must be unable to construct a request outside these sets; an `INVALID_SORT_FIELD` reaching a
user is a client defect, not a user error (spec edge case).

| Resource | Allowed `sort` fields | Source |
|---|---|---|
| `/persons` | `id`, `name`, `age`, `city`, `risk`, `createdAt` | `PersonVmMapper` — derived from the non-joined entries of `PersonFieldRegistry`, plus `id` |
| `/cases` | `id`, `title`, `status`, `createdAt` | `CaseFileVmMapper.SORT_FIELDS` |
| `/rules` | `id`, `name`, `enabled`, `createdAt`, `updatedAt` | `RuleVmMapper.SORT_FIELDS` |
| `/person-cases` | `role`, `createdAt` | `PersonCaseVmMapper.SORT_FIELDS` |
| `/audit-entries` | `occurredAt`, `recordType`, `operation` | `AuditEntryController.SORT_FIELDS` |

Two traps: `/persons` sorts by the **entity attribute** `createdAt`, but `/cases` also uses
`createdAt` even though the field is displayed as `openedAt` (an `@AttributeOverride` maps it to the
`opened_at` column). And `/person-cases` allows neither `id` nor `personId`/`caseId`.

### 1.3 Concurrency (FR-023, FR-024)

An update **must** carry both `id` and the `version` read with the record:

- `version` omitted on an update → 400 `VERSION_REQUIRED`. This is a client defect and must never be
  produced; if it is, it is not presented as though the user erred (spec edge case).
- `version` present and stale → 409 `CONCURRENT_MODIFICATION`. The user's unsaved input survives,
  the situation is explained, and re-reading is *offered* — never performed silently (SC-005).

### 1.4 Deletion (FR-025, FR-026, FR-027)

| Resource | `DELETE` | Meaning |
|---|---|---|
| `/persons/{id}` | 204 | Links hard-deleted, then person soft-deleted. Retired, not erased. |
| `/person-cases/{personId}:{caseId}` | 204 | The link row only. Person and case untouched. |
| `/cases/{id}` | 405 `DELETION_NOT_SUPPORTED` | "Cases are closed, not deleted: POST /api/v1/cases with status=CLOSED" |
| `/rules/{id}` | 405 `DELETION_NOT_SUPPORTED` | "Rules are disabled, not deleted: POST /api/v1/rules with enabled=false" |

The two 405s are presented as an **offered action** — close the case, disable the rule — not as an
error the user has to interpret.

### 1.5 Request bodies

`fail-on-unknown-properties: true`. A field the target record does not declare is 400
`VALIDATION_FAILED` naming the offending property and listing the accepted ones. The client sends
only declared, writable fields and adds nothing of its own (FR-029). `READ_ONLY` fields are ignored
if sent; they are omitted anyway (FR-030).

---

## 2. Rule-specific endpoints

### 2.1 Dry-run preview — `POST /rules/preview?page&size` (FR-008)

```
Body:     { "condition": <RuleNode> }
Response: 200 PageResponse<PersonSummary>     // @JsonView(Summary) — no nationalId
```

Saves nothing. **Always searches the whole population** — the dry run has no scope parameter,
because scope is derived from a saved rule's case (spec: known gaps). An author previewing an
unsaved tree therefore cannot see what a case-scoped run would return, and the UI does not imply
otherwise.

Same page clamping as §1.1, applied locally in `RuleController.pageable`.

### 2.2 Run a saved rule — `GET /rules/{ruleId}/matches?scope&page&size` (FR-014, FR-015)

```
scope:    GLOBAL | CASE_SCOPED     (server default GLOBAL; the client always sends it explicitly)
Response: 200 PageResponse<PersonSummary>     // @JsonView(Summary) — no nationalId
```

`GLOBAL` searches the whole population; `CASE_SCOPED` restricts to persons already linked to the
rule's case. The scope that produced the results is displayed beside them.

The total comes from `PageResponse.totalElements`. The UI never fetches further pages to count or to
render (FR-015, SC-006) — the population is unbounded by design.

**This route compiles the stored tree lazily**, so a rule whose condition no longer resolves fails
*here*, not at read time: 400 `UNKNOWN_FIELD` / `INCOMPATIBLE_OPERATOR` / `INVALID_RULE`. The rule
stays openable and editable; only running it fails (FR-019).

### 2.3 Replace a condition — `PUT /rules/{ruleId}/condition` (FR-011)

```
Body:     { "condition": <RuleNode> }
Response: 200 RuleDetail
```

Replaces the tree and nothing else. This route exists because `RuleVm.condition` is `@NotNull`, so
the `POST /rules` update path cannot edit a rule without resending its tree.

**It carries no optimistic-lock token.** `RuleService.updateCondition` loads by id and mutates; there
is no `version` on the body and no staleness check, so a concurrent condition edit is last-write-wins
and this route can never return `CONCURRENT_MODIFICATION`. The UI must not claim conflict protection
here (research R11 / unresolved items).

### 2.4 Queryable fields — `GET /rules/fields` (FR-001)

```
Response: 200 string[]     // sorted logical names, NAMES ONLY
```

Eight names today. It carries no type, no operators, and no enum values, which is why the client
holds a catalog and validates it against this list at start-up
([field-catalog.md](./field-catalog.md), spec dependency #2).

### 2.5 Rule creation and the one-to-one relation (FR-010)

A case holds at most one rule. `POST /rules` with a null `id` against a case that already has one is
400 `INVALID_RULE` from `RuleCrudService.beforeSave` — the **same code** a tree that fails to compile
produces. Disambiguation is by `CaseDetail.ruleId`, never by message text (research R7):

1. Before offering to author, the UI reads the case; a non-null `ruleId` means the offer is to
   *open* the existing rule, not create one.
2. If a create is still rejected with `INVALID_RULE`, the case is re-read; a now-present `ruleId`
   produces the one-to-one explanation and the offer to open it.

---

## 3. Audit trail — `GET /audit-entries` (FR-034, FR-035)

```
Query:    recordType, recordId, page, size, sort
Response: 200 PageResponse<AuditEntry>
```

Read-only. There is no create, update or delete route, and no affordance for one appears anywhere on
the view.

**Filter combinations the server actually honours** (`AuditEntryController.list`):

| `recordType` | `recordId` | Behaviour |
|---|---|---|
| absent | absent | whole trail |
| present | absent | filtered by type |
| present | present | that record's history |
| absent | **present** | **`recordId` is ignored** — the whole trail is returned |

The last row is why FR-035 forbids offering filtering by record identity alone: the control is
disabled until a record type is chosen, so the UI can never send a combination the server silently
discards.

Default sort is `occurredAt DESC, id DESC` — newest first, totally ordered. A supplied sort key gets
`id DESC` appended.

Rendering rules for `changes` (FR-036, FR-037) are in
[../data-model.md §1.6](../data-model.md#16-audit-entry--auditauditentryvmjava).

---

## 4. Response depth — the exposure boundary (FR-016, FR-043, SC-004)

| Response | View | `nationalId` |
|---|---|---|
| `GET /persons` (list) | Summary | absent |
| `GET /persons/{id}` | Detail | **present** |
| `POST /rules/preview` | Summary | absent |
| `GET /rules/{id}/matches` | Summary | absent |
| `GET /cases/{id}` → `linkedPersons[]` | Summary (built by hand in `CaseFileVmMapper`) | absent |

`nationalId` appears in exactly one response in the whole API. The client types it in exactly one
place to match, so reading it from a list row is a compile error, and it is never logged, never
persisted, and dropped when its view unmounts.

---

## 5. Failures

Every refusal is `ErrorResponse { code, message, timestamp }`. **The client branches on `code`
only**; `message` is display detail and may change without notice (FR-039).

| Code | Status | Presented as |
|---|---|---|
| `RECORD_NOT_FOUND` | 404 | this record no longer exists — e.g. a soft-deleted person opened from a stale row |
| `RULE_NOT_FOUND` | 404 | this rule no longer exists |
| `DELETION_NOT_SUPPORTED` | 405 | the retirement route, as an offered action (§1.4) |
| `INVALID_SORT_FIELD` | 400 | **client defect** — reported as such, not as user error |
| `INVALID_ARGUMENT` | 400 | a supplied value was not acceptable; message names it |
| `VERSION_REQUIRED` | 400 | **client defect** — must never be produced |
| `CONCURRENT_MODIFICATION` | 409 | changed underneath you; input kept, re-read offered |
| `CONSTRAINT_VIOLATION` | 409 | domain-specific by request (§5.1) |
| `UNKNOWN_FIELD` | 400 | the stored condition names a field the service no longer knows; offer to edit |
| `INCOMPATIBLE_OPERATOR` | 400 | operator no longer suits the field's type; offer to edit |
| `RULE_TREE_TOO_COMPLEX` | 413 | **show the message** — only it names the budget and its limit (FR-012) |
| `INVALID_RULE` | 400 | the tree was rejected; §2.5 for the one-to-one case |
| `VALIDATION_FAILED` | 400 | per-field detail, split on `; ` and attached to the offending inputs (FR-020-9) |
| `MALFORMED_REQUEST` | 400 | **client defect** |
| `AUDIT_RECORDING_FAILED` | 500 | the change was rolled back; nothing was saved |
| `RULE_STORAGE_ERROR` | 500 | a stored rule could not be read |

Sixteen codes, exhaustively mapped. A transport failure (the service unreachable) is a
**seventeenth, distinct** presentation with a retry that preserves input — never conflated with a
refusal or with an empty result (FR-040).

### 5.1 `CONSTRAINT_VIOLATION` by request

The server's message is fixed and generic, so the domain meaning comes from the request in flight
(FR-028):

| Request | Meaning |
|---|---|
| `POST /persons` | a live person already has that national identifier (partial unique index `ux_person_national_id_active`) |
| `POST /person-cases` | that person is already linked to that case — the existing link's role is **not** changed |

### 5.2 `VALIDATION_FAILED` detail

`GlobalExceptionHandler.handleBeanValidation` joins field errors as `"field message; field message"`.
Splitting on `"; "` recovers per-field detail for FR-020-9's "offending fields identified
individually". Constraints worth mirroring client-side: `name`/`title` non-blank ≤ 200 chars,
`age` 0–149, `nationalId` non-blank, `risk`/`status`/`role` required.

---

## 6. What the UI must never do

1. **Never construct a sort key outside §1.2.**
2. **Never request more than one page to render or count anything** (SC-006). Totals come from
   `PageResponse.totalElements`.
3. **Never send a field outside a VM's declared writable set** — it is a 400, not an ignore.
4. **Never send `recordId` without `recordType`** to `/audit-entries`.
5. **Never present `nationalId` outside `GET /persons/{id}`.**
6. **Never branch on `ErrorResponse.message`.**
7. **Never re-read and re-submit silently after a 409.**
8. **Never auto-run a preview or a rule.** Both are full-population queries; the user asks.
9. **Never show a sign-in, user menu, or permission affordance** — there is no authentication and
   every change is attributed to `system` (FR-045).
