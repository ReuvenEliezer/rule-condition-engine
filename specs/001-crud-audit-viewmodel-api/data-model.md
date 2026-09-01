# Phase 1 Data Model: Uniform CRUD API, Audit Trail, and Response Models

**Feature**: `001-crud-audit-viewmodel-api` | **Date**: 2026-08-30

Entity layer, payload layer, and the migrations that connect them. Decisions referenced as
`R1..R9` are in [research.md](./research.md).

---

## 1. Shared entity base

### `AuditableEntity` (new, `@MappedSuperclass`)

```text
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)   // Spring Data — actor fields only
abstract class AuditableEntity
```

`AuditTrailListener` is **not** in that annotation. It is a Hibernate event-SPI listener
(`PostInsertEventListener` / `PostUpdateEventListener` / `PostDeleteEventListener`) registered on
the `EventListenerRegistry` instead, because a JPA entity callback receives the entity in its new
state and cannot see before/after values — and the field-level delta FR-020 requires is exactly
that difference. See R10 and §9's write path.

| Field | Column | Annotation | Notes |
|---|---|---|---|
| `createdAt` | `created_at` | `@CreationTimestamp`, `updatable = false` | R6 — Hibernate, not a DDL default |
| `updatedAt` | `updated_at` | `@UpdateTimestamp` | R6 |
| `createdBy` | `created_by` | `@CreatedBy`, `updatable = false` | Spring Data; `"system"` until auth exists |
| `updatedBy` | `updated_by` | `@LastModifiedBy` | Spring Data |
| `version` | `version` | `@Version`, primitive `int` | R9 — optimistic locking; a wrapper's `null` would read as "transient" and risk an INSERT on the update path |
| — | — | `abstract Object auditId()` | For the audit listener; `PersonCase` returns a composite |

`updatable = false` on `createdAt`/`createdBy` enforces FR-022 (immutable creation metadata).
FR-023 (clients cannot forge audit values) is enforced separately: the mappers never read audit
fields off an incoming request record — and the request records do not declare them.

**Column-name overrides.** Two entities already have differently named creation columns, kept via
`@AttributeOverride` so no data moves:

| Entity | Existing column | Override |
|---|---|---|
| `CaseFile` | `opened_at` | `@AttributeOverride(name = "createdAt", column = @Column(name = "opened_at", updatable = false))` |
| `PersonCase` | `linked_at` | `@AttributeOverride(name = "createdAt", column = @Column(name = "linked_at", updatable = false))` |

Their response records keep the domain-meaningful names (`openedAt`, `linkedAt`) rather than
exposing `createdAt`.

---

## 2. Entities

All four extend `AuditableEntity`. Only changes are listed.

### `Person` — the only soft-deleted entity (R1)

- `@SoftDelete(columnName = "deleted", strategy = SoftDeleteType.DELETED)`
- Drops its own `createdAt` (inherited)
- Keeps `caseLinks` — the rule compiler joins it by name for `case.*` fields, and a Criteria join
  never materialises the collection (existing javadoc)
- **Effect on rule evaluation**: `@SoftDelete` adds `deleted = false` to the generated SQL of every
  Criteria query rooted at `Person`. `RuleCompiler` and `RuleEvaluationService` need **no change**;
  soft-deleted persons stop appearing in match results automatically.

### `CaseFile`

- **No** `@SoftDelete` — retired via `status = CLOSED` (R1)
- `@AttributeOverride` for `opened_at`
- Still no `personLinks` collection — the existing javadoc's reasoning stands, and the detail
  response pages the relation through `PersonCaseRepository` (R8)

### `Rule`

- **No** `@SoftDelete` — retired via `enabled = false` (R1)
- Drops its own `createdAt`/`updatedAt` (inherited)
- `case_id UNIQUE` stays a plain inline `UNIQUE` in the baseline — no partial index is needed,
  because a rule row is never retained-but-hidden

### `PersonCase`

- **No** `@SoftDelete` — hard-deleted (R1)
- `@AttributeOverride` for `linked_at`
- `auditId()` returns the `PersonCaseId`

---

## 3. Referential-integrity consequences of soft delete

Confined to `Person`, which is the point of keeping soft delete narrow.

**Problem 1 — the cascade stops firing.** `person_case` declares
`REFERENCES person(id) ON DELETE CASCADE`. Soft delete issues no `DELETE`, so the cascade never runs.
Link rows survive pointing at a person no query can see, and because `PersonCase.person` is
`optional = false`, loading such a link throws `EntityNotFoundException`.

**Resolution** — explicit cleanup in `PersonCrudService.innerDelete`, same transaction:
`personCaseRepository.deleteByIdPersonId(id)` **then** soft-delete the person.

`case_file` and `rule` are never soft-deleted, so `person_case.case_id` and `rule.case_id` keep their
working cascades. No application-level emulation for them.

**Problem 2 — uniqueness is permanently consumed.** A soft-deleted row still occupies its UNIQUE
slot, so `person.national_id UNIQUE` would mean a deleted person's national id can never be
re-registered — surfacing as a constraint violation naming a row the user cannot retrieve. Resolved
by a partial unique index in §4. This is the **only** constraint rewrite in the feature.

---

## 4. Migrations

### One baseline, not an increment

`V1__init.sql` is **rewritten** to state the whole target schema — the four managed tables with
their audit and versioning columns, `person.deleted`, and `audit_entry`. There is no
`V2__auditing_and_versioning.sql`, no `V3__person_soft_delete.sql` and no `V4__audit_entry.sql`.

Nothing has shipped this schema, so there is no history to preserve, nothing to backfill, and no
generated constraint name to discover before dropping it. Splitting the same end state across four
migrations would buy rollback granularity for a deployment that does not exist, at the cost of a
backfill-then-`SET NOT NULL`-then-`DROP DEFAULT` sequence whose only purpose is to reach the shape
the baseline can simply declare.

**The trade**: rewriting `V1` changes its checksum, so any database that already ran the old `V1`
fails Flyway validation at startup and must be dropped and recreated. That is acceptable exactly
once, before first release, and stops being acceptable the moment this schema exists anywhere
shared. Every change after this one is forward-only (Principle V).

### What the baseline declares

| Table | Audit and versioning columns | Type-specific |
|---|---|---|
| `person` | `created_at`, `updated_at`, `created_by`, `updated_by`, `version` | `deleted BOOLEAN NOT NULL DEFAULT FALSE` |
| `case_file` | `opened_at` (as `createdAt`), `updated_at`, `created_by`, `updated_by`, `version` | — |
| `person_case` | `linked_at` (as `createdAt`), `updated_at`, `created_by`, `updated_by`, `version` | — |
| `rule` | `created_at`, `updated_at`, `created_by`, `updated_by`, `version` | `case_id UNIQUE` unchanged |
| `audit_entry` | none — insert-only, never itself audited | §9 |

**No timestamp column carries a DDL default.** `created_at`, `updated_at`, `opened_at`, `linked_at`
and `occurred_at` are owned by `@CreationTimestamp` / `@UpdateTimestamp` (R6, Principle V). The old
`V1` gave all five a `DEFAULT now()`, which would have been a second source of truth disagreeing
with Hibernate on any insert made outside it. The defaults that remain — `version`, `enabled`,
`deleted` — are non-timestamp constants, kept so a hand-written `INSERT` from psql lands in a valid
state. `TestData` builds entities through their Lombok builders and persists them through JPA, so it
needs no default at all.

`created_by` / `updated_by` are `NOT NULL` with **no** default, so `SystemAuditorAware` populates
them or the insert fails loudly. This is why T006/T006a/T006b are foundational rather than part of
US3: between the schema landing and the actor plumbing landing, no insert succeeds.

### `national_id` uniqueness

Declared as a partial unique index rather than an inline `UNIQUE`:

```sql
CREATE UNIQUE INDEX ux_person_national_id_active ON person (national_id) WHERE deleted = false;
CREATE INDEX idx_person_active ON person (id) WHERE deleted = false;
```

A plain `UNIQUE` would let one soft-deleted row permanently ban re-registering that national id,
failing with a constraint violation naming a row the caller cannot retrieve (§3, Problem 2).
Because this is the baseline, the index is simply declared — nothing is dropped.

**`ddl-auto: validate` interaction**: Hibernate validates that `deleted` exists but does not map it
as a field — `@SoftDelete` handles it below the mapping layer. `idx_person_name_trgm` and
`idx_person_risk_age` still serve the compiler's predicates, now with an extra `deleted = false`
conjunct.

---

## 5. UI objects (R2, R8)

One record per entity, in the existing `api.dto` package. No `api.viewmodel` package, no mutable
class hierarchy — every VM is a record, used in both directions.

### `ResourceVm` (new interface) and `Vms` (view markers)

```java
public interface ResourceVm {
    Object id();      // null => create, present => update (FR-003)
    Integer version();// optimistic-lock token; boxed so an omitted value is null, not 0 (R9)
    String type();    // discriminator (FR-014)
}

public final class Vms {
    public interface Summary { }                  // list responses
    public interface Detail extends Summary { }   // single-record responses
}
```

`Object id()` because `PersonCase` is keyed by a composite rendered as `"<personUuid>:<caseUuid>"`;
a record component `UUID id` implements it covariantly, so the UUID-keyed VMs keep their precise
type.

### The four VMs

| VM | `Vms.Summary` fields | `Vms.Detail` adds |
|---|---|---|
| `PersonVm` | `id`, `version`, `type`, `name`, `age`, `city`, `risk` | `nationalId`, `caseLinks` (first page), `caseLinkCount`, audit metadata |
| `CaseFileVm` | `id`, `version`, `type`, `title`, `status`, `openedAt` | `ruleId`, `linkedPersons` (first page), `linkedPersonCount`, audit metadata (`createdBy`/`updatedAt`/`updatedBy` — `openedAt` *is* `createdAt`) |
| `RuleVm` | `id`, `version`, `type`, `caseId`, `name`, `enabled` | `condition`, audit metadata |
| `PersonCaseVm` | `id`, `version`, `type`, `personId`, `caseId`, `role`, `linkedAt` | `person`, `caseFile` (summary views), audit metadata (`createdBy`/`updatedAt`/`updatedBy` — `linkedAt` *is* `createdAt`) |

### The two annotations that carry the contract

| Annotation | Effect | Requirement |
|---|---|---|
| `@JsonView(Vms.Detail.class)` | Field serialised only on single-record responses | FR-015, FR-017 |
| `@JsonProperty(access = READ_ONLY)` | Field emitted but **ignored on deserialisation** | FR-023 |

`nationalId` is `Vms.Detail` only, so it is absent from `/persons` listings and from
`/rules/{id}/matches`. All four audit fields plus `type` are `READ_ONLY`, so a client posting
`"createdBy": "attacker"` has it dropped before validation runs — no filtering step, no separate
request record.

**Validation** (FR-018) is Jakarta Bean Validation on the VM, so it runs before any entity is
touched: `@NotBlank @Size(max = 200)` on names/titles, `@NotNull` on enums and required
associations, `@Min(0) @Max(149)` on `age` mirroring the `person_age_check` constraint.

### Effect on existing files

See [research.md R2, "Effect on existing files"](./research.md#r2--one-vm-per-entity-views-for-depth).
Kept in one place so the two documents cannot drift.

---

## 6. Mappers

```java
interface VmMapper<E extends AuditableEntity, V extends ResourceVm> {
    E toEntity(V vm);                 // create, or load-and-mutate when vm.id() != null
    V toVm(E entity);                 // no child collections loaded
    V toVmWithChildren(E entity);     // detail path only
    Set<String> allowedSortFields();  // R9
}
```

`AbstractVmMapper` implements the create-vs-load dispatch (`vm.id() == null`) — which is what makes
FR-003's single save operation work — and leaves three hooks per type: `createInstance()`,
`findById(ID)`, `applyToEntity(E, V)`. This mirrors the reference's `AbstractEntityVmConverter`,
minus its `includeChildren` boolean.

**Why two methods and not just a view**: a `@JsonView` controls serialisation, not loading. Child
collections must not be *fetched* for a list, so `AbstractEntityCrudService.findAll` calls `toVm`
and `findById` calls `toVmWithChildren`. That is the one place the two depths differ in code rather
than in annotation, and it is what keeps `CaseFile`'s unbounded link relation off the list path.

`PersonVmMapper.allowedSortFields()` derives from `PersonFieldRegistry`, so the sort vocabulary and
the rule-condition vocabulary cannot drift (R9).

---

## 7. Service layer

```java
interface EntityCrudService<E, V extends ResourceVm, ID> {
    V saveOrUpdate(V vm);
    V findById(ID id);
    Page<V> findAll(Pageable pageable);
    void delete(ID id);
    Set<String> allowedSortFields();
    Sort identitySort();
}
```

Three type parameters throughout — **DB entity, UI object, identifier** — so a concrete controller
reads `CrudController<Person, PersonVm, UUID>`.

`AbstractEntityCrudService` implements all four operations with `@Transactional` (R4) and exposes
the override hooks FR-010 requires: `beforeSave`, `innerSave`, `innerDelete`, `innerFindAll`,
`findEntityById`.

**The hooks are called by `this`, not through the proxy.** They inherit the entry point's
transaction, which is what makes `PersonCrudService.innerDelete`'s link-cleanup-then-soft-delete
atomic. The corollary is a silent trap: `@Transactional` on an override does nothing at all — no
warning, no error, and a hook annotated `REQUIRES_NEW` runs in the caller's transaction anyway.
A hook that genuinely needs its own transaction has to move to a separate bean.

**`saveOrUpdate` compares the client's version explicitly** before applying any change. Because the
mapper loads the managed entity and mutates it, Hibernate's own `@Version` check compares the
freshly loaded version against the database and always agrees — a stale *client* would otherwise
overwrite silently. See R9.

**`delete` is optional (R1).** The base implementation throws `DeletionNotSupportedException`,
carrying the message the 405 will show:

| Service | `delete` |
|---|---|
| `PersonCrudService` | overrides — hard-delete links, then soft-delete the person |
| `PersonCaseCrudService` | overrides — hard delete |
| `CaseFileCrudService` | inherits the throw — *"Cases are closed, not deleted: POST /api/v1/cases with status=CLOSED"* |
| `RuleCrudService` | inherits the throw — *"Rules are disabled, not deleted: POST /api/v1/rules with enabled=false"* |

`RuleCrudService.beforeSave` runs the existing `assertCompilable` check, preserving write-time rule
validation (FR-012).

---

## 8. Repository changes

| Repository | Change |
|---|---|
| `PersonCaseRepository` | `+ void deleteByIdPersonId(UUID)`, `+ long countByCaseFileId(UUID)`, `+ Page<PersonCase> findByIdPersonId(UUID, Pageable)`, `+ long countByIdPersonId(UUID)` (the last two back `PersonVm`'s first-page-plus-count children). Existing `findByCaseFileId(UUID, Pageable)` also backs the `CaseFile` detail response. `deleteByIdCaseId` is **not** needed — cases are never soft-deleted, so their cascade still works |
| `CaseRepository` | `+ JpaSpecificationExecutor<CaseFile>` for uniform paged listing |
| `RuleRepository` | unchanged |
| `PersonRepository` | unchanged |

---

## 9. Audit records

The two are no longer the same mechanism (R10). **Audit entries are a persisted table**; the
**request log stays a structured log event**.

### `AuditEntry` (new `@Entity`, `@Immutable`, insert-only)

Deliberately **not** an `AuditableEntity`: no `version`, no `updatedBy`, nothing to update — and
extending the audited base would make the audit table audit its own inserts.

| Field | Column | Notes |
|---|---|---|
| `id` | `id UUID` | application-assigned |
| `recordType` | `record_type TEXT` | the VM `type()` discriminator, so audit and API agree on the name |
| `recordId` | `record_id TEXT` | `TEXT`, so `PersonCase`'s `"<personUuid>:<caseUuid>"` fits the same column |
| `operation` | `operation TEXT` | `CREATE` / `UPDATE` / `DELETE`, `@Enumerated(STRING)` |
| `actor` | `actor TEXT` | from `AuditorAware`; `"system"` until authentication exists |
| `occurredAt` | `occurred_at TIMESTAMPTZ` | `@CreationTimestamp` |
| `entityVersion` | `entity_version INTEGER` | the `@Version` the change produced — makes replay order unambiguous when two changes share a timestamp |
| `changes` | `changes JSONB` | `@JdbcTypeCode(SqlTypes.JSON)`, same treatment as the condition tree |

`changes` shape, which is what makes SC-008 answerable:

```jsonc
// CREATE — initial values
{ "name": {"to": "Dana Levi"}, "age": {"to": 34}, "nationalId": {"to": "***"} }
// UPDATE — changed fields only, from Hibernate's getOldState()/getState()
{ "risk": {"from": "LOW", "to": "HIGH"} }
// DELETE — no field detail
null
```

**Redaction (FR-025 vs. FR-020).** A field marked sensitive is recorded as *changed* with both
values replaced by `"***"`. The reviewer learns the national identifier was edited, never its value.
Marking is an explicit opt-out at the field, and T057 asserts no known sensitive value ever appears
in `changes` — so an unmarked new column fails a test rather than leaking quietly.

### Write path (R10)

```text
Hibernate PostInsert/PostUpdate/PostDelete event
  → AuditTrailListener  (has getOldState()/getState(); a JPA @PostUpdate does not)
  → ApplicationEventPublisher
  → AuditEntryRecorder  @TransactionalEventListener(BEFORE_COMMIT)
                        same transaction — no REQUIRES_NEW, no catch (R10)
  → audit_entry INSERT
```

A `@SoftDelete` removal is a delete event that emits an `UPDATE` statement, so it arrives at
`onPostDelete` and is labelled `DELETE` with no transition sniffing.

The entry is written **in the business transaction**, so a change and its audit row are atomic:
there is no state in which a record changed and no entry exists (FR-027, as amended). The event
indirection is still needed — persisting from inside the Hibernate listener would re-enter the
`EntityManager` mid-flush — but the phase is `BEFORE_COMMIT`, not after.

### `audit_entry` DDL (part of the baseline `V1__init.sql`, §4)

```sql
CREATE TABLE audit_entry (
    id             UUID PRIMARY KEY,
    record_type    TEXT        NOT NULL,
    record_id      TEXT        NOT NULL,
    operation      TEXT        NOT NULL CHECK (operation IN ('CREATE','UPDATE','DELETE')),
    actor          TEXT        NOT NULL,
    occurred_at    TIMESTAMPTZ NOT NULL,
    entity_version INTEGER,
    changes        JSONB
);
CREATE INDEX idx_audit_entry_record ON audit_entry (record_type, record_id, occurred_at DESC, id DESC);
CREATE INDEX idx_audit_entry_recent ON audit_entry (occurred_at DESC, id DESC);
```

`occurred_at` carries no DDL default — `@CreationTimestamp` owns it (Principle V), consistent with
every other timestamp in the baseline. Both indexes end in `id` so the listing has a total ordering
(Principle I). `operation` carries a `CHECK` like every other `@Enumerated(STRING)` column in this
schema (`risk`, `status`, `role`).

### Reading it back (FR-029)

`GET /api/v1/audit-entries?recordType=&recordId=` — paged, clamped, sorted `occurred_at DESC, id
DESC`, sort fields allow-listed. A **read-only controller, not a `CrudController`**: audit entries
are derived history, not a managed record type, so FR-002's uniform save/delete contract does not
apply to them and forcing it would mean two operations that exist only to be refused.

### Request log entry (unchanged)

`RequestAuditFilter` (`AbstractRequestLoggingFilter`): method, path, status, elapsed millis, actor —
to the structured log stream, **not** to a table. One row per inbound HTTP call is a different volume
and retention problem from one row per business change. Configured `setIncludeHeaders(false)` and
`setIncludePayload(false)` so FR-025 holds structurally rather than by redaction rules — no
`Authorization` header and no body containing a `nationalId` can reach the log at all.
