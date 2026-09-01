# Implementation Plan: Uniform CRUD API, Audit Trail, and View Models

**Branch**: `001-crud-audit-viewmodel-api` | **Date**: 2026-08-30 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-crud-audit-viewmodel-api/spec.md`

## Summary

Adopt three conventions from the `com.liquibase` reference project, adapted to this codebase's
idioms (UUID keys, Flyway-managed Postgres, records for payloads, Lombok-built entities):

1. **A generic CRUD stack** — `CrudController<E, V, ID>` → `EntityCrudService` →
   `AbstractEntityCrudService` → `VmMapper` — inherited by Person, CaseFile, Rule and PersonCase.
   Three type parameters throughout: **DB entity, UI object, identifier**, so a concrete controller
   reads `CrudController<Person, PersonVm, UUID>`. Each type contributes one VM record, one mapper,
   a controller subclass, and whatever hooks it overrides. The full skeleton is in
   [contracts/crud-contract.md](./contracts/crud-contract.md#1-the-generic-skeleton).
2. **Auditing** — a `@MappedSuperclass AuditableEntity` carrying
   `createdAt / updatedAt / createdBy / updatedBy / version`; a Hibernate-event `AuditTrailListener`
   feeding a persisted, queryable `audit_entry` table written before commit, in the same
   transaction as the change it records (R10, FR-027 as amended); and a
   servlet-level `RequestAuditFilter` logging inbound traffic to the structured log stream.
3. **One UI record per entity** — `PersonVm`, `CaseFileVm`, `RuleVm`, `PersonCaseVm`, all records,
   all in the existing `api.dto` package. Summary vs. detail is a Jackson view
   (`Vms.Summary` / `Vms.Detail`) declared once on the shared controller; audit fields are
   `@JsonProperty(access = READ_ONLY)` so they are emitted but never accepted.

Both open decisions were settled by the user on 2026-08-30:

- **R1 — deletion**: soft delete `Person` only. `PersonCase` is hard-deleted. `CaseFile` and `Rule`
  are retired through state they already carry (`CaseStatus.CLOSED`, `Rule.enabled`). Their `DELETE`
  route exists but only to refuse: 405 naming the retirement mechanism (FR-001), never a missing
  route returning a generic error.
- **R2 — payloads**: one bidirectional `...Vm` record per entity. An earlier split into
  `Request` / `Response` / `SummaryResponse` was rejected: it forced a four-parameter controller
  declaration that did not read as *entity, UI object, id*.

R1 is what keeps the schema work small: soft delete on `Person` alone means exactly one constraint
declared as a partial index (`person.national_id`) and one cascade to emulate in application code. R2 keeps FR-017
enforced by a single `@JsonView` on the shared `findAll`, inherited by every resource — weaker than
separate types, and the two endpoints outside that inheritance (`/matches`, `/preview`) carry the
view explicitly and are asserted in tests.

## Technical Context

**Language/Version**: Java 25 (`maven.compiler.release=25`)

**Primary Dependencies**: Spring Boot 4.1.1 (`starter-web`, `starter-data-jpa`,
`starter-validation`, `starter-flyway`), Hibernate ORM 7.x (via the Boot parent), Jackson,
Lombok 1.18.42, `hibernate-jpamodelgen`

**Storage**: PostgreSQL 18, schema owned by Flyway (`src/main/resources/db/migration`),
`ddl-auto: validate`. `jsonb` for condition trees, `pg_trgm` GIN for `CONTAINS`.

**Testing**: JUnit 5 + `spring-boot-starter-test`, Testcontainers Postgres 18.4-alpine via
`PostgresIntegrationTest` (real Postgres — H2 reproduces neither `jsonb`, `pg_trgm`, partial unique
indexes, nor Postgres collation)

**Target Platform**: Linux server, JVM, virtual threads enabled

**Project Type**: Single-module Spring Boot web service

**Performance Goals**: Every listing is paged with a database-side LIMIT/OFFSET and a totally
ordered sort; no endpoint materialises an unbounded collection. Page size clamped to
`rule-engine.max-page-size` (500), default `rule-engine.default-page-size` (50).

**Constraints**:
- `spring.jpa.open-in-view: false` — entity → response mapping must run inside the service
  transaction; a mapper called from the controller throws on any lazy field.
- `fail_on_pagination_over_collection_fetch: true` — a paged query may not fetch-join a to-many.
- Audit timestamps use Hibernate `@CreationTimestamp` / `@UpdateTimestamp`, never database column
  defaults and never hand-set values (established codebase convention).
- No authentication layer exists, so the auditor resolves to a literal `system` principal.

**Scale/Scope**: 4 record types; ~38 new/changed source files; one rewritten baseline migration; unbounded
`person`, `person_case` and `audit_entry` populations.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Checked against `.specify/memory/constitution.md` **v1.0.0** (ratified 2026-08-30). An earlier
revision of this plan recorded "PASS by vacancy" against the unfilled template; that gate has been
re-run against the ratified principles.

| Principle | How this feature is bound | Evidence / mechanism | Gate |
|---|---|---|---|
| **I. Bounded Reads, Computed in the Database** | No unpaged list operation exists; every listing is clamped, totally ordered, and children are paged with a count | `CrudController` clamps to `rule-engine.max-page-size` and appends `service.identitySort()`; `CaseFileVm.linkedPersonCount` + `PersonVm.caseLinkCount` return first-page-plus-total; `fail_on_pagination_over_collection_fetch` stays enabled; `toVm` never loads children; `audit_entry` is unbounded so its endpoint is paged and both its indexes end in `id` for a total ordering | PASS — conditional on the FR-001 amendment below and on `PersonVm` carrying a child count |
| **II. Validate at the Earliest Decidable Point** | Bean Validation on the VM runs before any entity is touched; rule compilability is asserted at write time | `RuleCrudService.beforeSave` → existing `assertCompilable`; `@NotBlank`/`@Min`/`@Max` on the VM records mirror the DB check constraints | PASS |
| **III. Client-Supplied Names Are Allow-Listed** | Sort fields resolve through `VmMapper.allowedSortFields()`; unknown request fields are rejected, not ignored | `PersonVmMapper.allowedSortFields()` derives from `PersonFieldRegistry` so the two vocabularies cannot drift (R9); `SortFieldNotAllowedException` → 400, never a fallback order; `FAIL_ON_UNKNOWN_PROPERTIES` enabled | PASS |
| **IV. Responses Are Declared, Never Incidental** | One immutable record per entity; exposure declared once; system-owned fields read-only | All VMs are records (R2); `@JsonView(Vms.Summary)` on the shared `findAll` is the single place depth is declared; audit fields and `type` are `@JsonProperty(access = READ_ONLY)`; `nationalId` is `Vms.Detail` only | PASS |
| **V. Schema by Migration, Verified Against Real Postgres** | One rewritten baseline migration; timestamps from Hibernate annotations only; tests on Testcontainers | `V1__init.sql` restated as the whole schema — **no** DDL default on `created_at`, `updated_at`, `opened_at`, `linked_at` or `occurred_at`, closing the pre-existing `DEFAULT now()` on five columns that would otherwise have contradicted `@CreationTimestamp`/`@UpdateTimestamp`; every new test extends `PostgresIntegrationTest` and carries `@Tag("integration")` | PASS — with the baseline-rewrite exception recorded below |

**Amendments this gate forced** (applied to spec.md, recorded in "Spec amendments required"):

- **FR-001** listed "list all" as an operation separate from "list one page". Principle I permits no
  unpaged list, publicly or internally, so FR-001 now names a single paged list operation. US1's
  Independent Test and acceptance scenario 1 are reworded to match. R5 and `openapi.yaml` already
  implemented it this way; only the spec text was stale.
- **`PersonVm` detail** returned a first page of `caseLinks` with no total. Principle I requires
  "a first page plus a total count", so `PersonVm` gains `caseLinkCount`, matching `CaseFileVm`.

**One-time exception to "forward-only" (Principle V)**: `V1__init.sql` is rewritten rather than
amended by `V2`/`V3`/`V4`. Rewriting an applied migration is not forward-only, and it changes V1's
checksum, so any database that ran the old V1 must be dropped and recreated. It is taken here
because the schema has never shipped — one commit, no deployment — so there is no history to
preserve and no data to backfill, and because the pre-existing `DEFAULT now()` on five timestamp
columns is a live Principle V violation that a baseline states away instead of patching with
`ALTER ... DROP DEFAULT`. Every migration after this one is forward-only.

**Deferred principle**: the constitution's `TODO(AUTHZ_PRINCIPLE)` is live here — no authn/authz
layer exists, so the auditor resolves to a literal `system` value, which the constitution's
"Known absences" section explicitly sanctions ("never to an empty one").

**Post-Phase-1 re-check**: PASS. The one item warranting scrutiny is the generic inheritance layer,
which cuts against "start simple" — justified in [Complexity Tracking](#complexity-tracking) because
SC-002 *is* that a new record type costs no shared-logic change.

## Project Structure

### Documentation (this feature)

```text
specs/001-crud-audit-viewmodel-api/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions R1..R9 + required spec amendments
├── data-model.md        # Phase 1 — entities, migrations, payload records
├── quickstart.md        # Phase 1 — how to run and validate
├── contracts/
│   ├── crud-contract.md # The generic skeleton + the inherited contract
│   └── openapi.yaml     # Endpoints and schemas
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 — NOT created by /speckit-plan
```

### Source Code (repository root)

Note there is **no** new `api.viewmodel` package — R2 keeps everything in `api.dto`.

```text
src/main/java/com/eliezer/ruleengine/
├── api/
│   ├── crud/
│   │   └── CrudController.java               # NEW abstract: save, find, page, delete
│   ├── dto/
│   │   ├── ResourceVm.java                   # NEW interface: id() + version() + type()
│   │   ├── Vms.java                          # NEW view markers: Summary, Detail
│   │   ├── PersonVm.java                     # NEW
│   │   ├── CaseFileVm.java                   # NEW
│   │   ├── RuleVm.java                       # NEW (replaces RuleResponse + CreateRuleRequest)
│   │   ├── PersonCaseVm.java                 # NEW
│   │   ├── PageResponse.java                 # unchanged
│   │   ├── ErrorResponse.java                # unchanged
│   │   ├── MatchScope.java                   # unchanged
│   │   ├── PreviewRequest.java               # unchanged
│   │   ├── CreateRuleRequest.java            # REMOVED -> RuleVm
│   │   ├── RuleResponse.java                 # REMOVED -> RuleVm
│   │   └── PersonMatch.java                  # REMOVED -> PersonVm @JsonView(Summary)
│   ├── PersonController.java                 # NEW  extends CrudController<Person, PersonVm, UUID>
│   ├── CaseFileController.java               # NEW
│   ├── PersonCaseController.java             # NEW  (composite id via converter)
│   ├── RuleController.java                   # CHANGED: extends CrudController, keeps rule ops
│   └── GlobalExceptionHandler.java           # CHANGED: + 409/405/400 mappings
├── domain/
│   ├── AuditableEntity.java                  # NEW @MappedSuperclass
│   ├── Person.java                           # CHANGED: extends AuditableEntity, @SoftDelete
│   ├── CaseFile.java / Rule.java / PersonCase.java  # CHANGED: extend AuditableEntity only
│   └── (enums unchanged)
├── repository/
│   ├── PersonCaseRepository.java             # CHANGED: + deleteByIdPersonId, countByCaseFileId
│   ├── CaseRepository.java                   # CHANGED: + JpaSpecificationExecutor
│   └── (RuleRepository, PersonRepository unchanged)
├── service/
│   ├── crud/
│   │   ├── EntityCrudService.java            # NEW interface
│   │   └── AbstractEntityCrudService.java    # NEW template with override hooks
│   ├── convert/
│   │   ├── VmMapper.java                     # NEW interface
│   │   ├── AbstractVmMapper.java             # NEW template
│   │   └── Person / CaseFile / Rule / PersonCase VmMapper         # NEW
│   ├── PersonCrudService.java                # NEW  (overrides delete: links then soft-delete)
│   ├── PersonCaseCrudService.java            # NEW  (overrides delete: hard)
│   ├── CaseFileCrudService.java              # NEW  (delete not supported -> 405)
│   ├── RuleCrudService.java                  # NEW  (delete not supported; beforeSave compiles)
│   ├── RuleService.java                      # CHANGED: rule-specific ops only
│   └── RuleEvaluationService.java            # UNCHANGED — @SoftDelete filters Criteria for free
├── audit/
│   ├── AuditEntry.java                       # NEW @Entity @Immutable, insert-only (not AuditableEntity)
│   ├── AuditOperation.java                   # NEW enum CREATE/UPDATE/DELETE
│   ├── AuditEntryRepository.java             # NEW paged reads by (recordType, recordId)
│   ├── AuditTrailListener.java               # NEW Hibernate PostInsert/PostUpdate/PostDelete -> event
│   ├── AuditEntryRecorder.java               # NEW @TransactionalEventListener(BEFORE_COMMIT), same tx
│   ├── AuditEntryVm.java                     # NEW read-only VM
│   ├── AuditEntryController.java             # NEW read-only, paged (not a CrudController)
│   ├── RequestAuditFilter.java               # NEW AbstractRequestLoggingFilter
│   ├── SystemAuditorAware.java               # NEW AuditorAware<String> -> "system"
│   └── AuditingConfig.java                   # NEW @EnableJpaAuditing + event-listener registration
├── config/
│   ├── ApplicationConfig.java                # unchanged
│   └── WebConfig.java                        # NEW: PersonCaseIdConverter, RequestAuditFilter
└── exception/
    ├── RecordNotFoundException.java          # NEW
    ├── SortFieldNotAllowedException.java     # NEW
    ├── DeletionNotSupportedException.java    # NEW
    └── (existing rule exceptions unchanged)

src/main/resources/db/migration/
└── V1__init.sql                              # REWRITTEN: the whole schema as one baseline —
                                              #   4 managed tables with audit + version columns,
                                              #   person.deleted + partial unique index,
                                              #   audit_entry + two covering indexes,
                                              #   and no DDL default on any timestamp column

src/test/java/com/eliezer/ruleengine/
├── support/PostgresIntegrationTest.java      # unchanged
├── support/TestData.java                     # CHANGED: audit/version/deleted-aware fixtures
├── api/CrudContractIntegrationTest.java      # NEW: parameterised across all 4 resources
├── api/ResponseExposureTest.java             # NEW: field-level assertions, nationalId absence
├── audit/AuditTrailIntegrationTest.java      # NEW
├── audit/AuditEntryQueryIntegrationTest.java # NEW: SC-008 replay from audit_entry alone
└── domain/PersonSoftDeleteIntegrationTest.java  # NEW
```

**Structure Decision**: Single Maven module, keeping the existing
`api / domain / repository / service / rule / exception / config` layout. Only two packages are
added — `api.crud` and `service.crud` / `service.convert` for the generic bases, and a top-level
`audit` (the reference's `services.audit`, promoted because the request filter is web infrastructure,
not a service). The reference's `client_entities` package has no equivalent: R2 keeps every payload
record in the existing `api.dto`.

## Deliberate divergences from the reference project

Places where copying `com.liquibase` verbatim would be wrong here. Each is justified in
[research.md](./research.md).

| Reference does | This plan does | Why |
|---|---|---|
| `AbstractEntityViewModel` as a mutable class hierarchy, with depth chosen per call site by an `includeChildren` boolean | One `...Vm` **record** per entity; depth chosen once by `@JsonView` on the shared controller; audit fields `READ_ONLY` | Keeps every payload immutable, states the summary/detail rule once instead of at each conversion, and makes forged audit values impossible without a filtering step. (R2, R8) |
| `AbstractEntity` / `BaseEntity` as `@Entity` with JOINED inheritance and real tables | `AuditableEntity` as `@MappedSuperclass` | JOINED would force a table-per-hierarchy migration and add a join to every read, all to declare `@EntityListeners` once. (R3) |
| `TransactionalOperationsUtil` — programmatic transaction wrapper | Plain `@Transactional` on the abstract service | The util exists to dodge self-invocation proxy bypass. Entry points are called from the controller, a different bean, so the proxy applies. (R4) |
| `GET /findAll` returning every row unpaged | No unpaged endpoint; `GET /{resource}` is paged with defaults | `person` is unbounded; an unpaged `findAll` contradicts FR-005 and this codebase's own pagination discipline. (R5) |
| Soft delete via a hand-rolled `isDeleted` + `findNonDeleted` per DAO | Hibernate `@SoftDelete`, on `Person` only | The hand-rolled form is opt-in per query — miss one and deleted rows leak. `@SoftDelete` applies at SQL level to all queries including the rule compiler's Criteria. (R1) |
| Every record type is deletable | `delete` is optional; cases close, rules disable | `CaseStatus.CLOSED` and `Rule.enabled` already express retirement; a second flag gives those tables two notions of "not active" that can disagree. (R1) |
| `@CreatedDate` / `@LastModifiedDate` for timestamps | Hibernate timestamps + Spring Data `@CreatedBy` / `@LastModifiedBy` | Matches the convention already on `Rule` and `Person`. Spring Data populates actor fields with its date annotations absent. (R6) |
| Long `IDENTITY` primary keys | Existing application-assigned UUIDs | Not up for change; the generic layer is parameterised on `ID`. |
| Single `ID` path variable only | `ID` bound through a registered `Converter<String, ID>` | `PersonCase` is keyed by `(personId, caseId)`; FR-011 requires it on the same contract, not a special case. (R7) |

## Spec amendments required

R1 narrows two requirements written before the deletion decision. Applied to
[spec.md](./spec.md) — recorded here so the change is traceable:

| Requirement | Was | Now |
|---|---|---|
| **FR-001** | every type exposes create, read, list, page, update, **delete** | delete is *optional*; a type declining it returns 405 naming its retirement mechanism |
| **FR-001** (2nd) | operations included **"list all"** alongside "list one page" | one paged list operation only — constitution Principle I permits no unpaged list. US1's Independent Test and scenario 1 reworded to match |
| **FR-008** | deletion retains and hides the record, for all types | applies to `Person`; `PersonCase` is hard-deleted; `CaseFile` and `Rule` retire via `status` / `enabled` |
| **FR-019** | reconcile existing DTOs — open question | resolved: one bidirectional `...Vm` record per entity, views for depth |
| **FR-020** | audit entry names type, id, operation, actor, time | + persisted, queryable, and carries the field-level change detail (R10) |
| **FR-027** | an audit failure must **not** fail the business operation | reversed: the entry is written in the same transaction, so a change and its audit row are atomic. The original wording came from a log-stream destination and contradicted SC-005/SC-008 once audit became a compliance store |
| **new: FR-029, FR-030** | — | audit history is retrievable per record and paged; entries are immutable and the audit store is not itself audited |
| **US1 scenario 7** | delete then read ⇒ not retrievable | scoped to `Person` and `PersonCase` |

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Three-layer generic hierarchy (`CrudController` → `AbstractEntityCrudService` → `AbstractVmMapper`) for only 4 record types | SC-002 makes "a new record type requires zero shared-logic change" the acceptance criterion, and FR-009/FR-010 require per-type overrides without touching the shared contract | Four hand-written controller/service pairs is less code today but fails SC-002 outright, and is exactly the duplication the user asked to remove |
| Two Jackson view markers plus a second mapper method (`toVmWithChildren`) | A view controls serialisation but not loading; child collections must not be *fetched* for a list, so the depth split needs one code-level branch as well as the annotation | Serialising eagerly and letting the view hide the result still runs the query — the exact unbounded read `CaseFile`'s design exists to prevent |
| `@Version` optimistic locking on all four entities | The spec's concurrency edge case requires that a stale save not silently lose a change; without a version column there is no signal to detect it | Last-write-wins needs no column but silently discards data. Pessimistic locking serialises unrelated edits and fits poorly with virtual threads |
| A persisted `audit_entry` table with field-level deltas, written through the Hibernate event SPI | SC-008 requires reconstructing a record's full change history from audit data alone, and a JPA `@PostUpdate` callback cannot see before/after values — only `PostUpdateEventListener` supplies the delta (R10) | Log-only entries were the original plan and cannot answer SC-008: they record *that* a change happened, not what it was. Envers supplies deltas but models history per entity table and snapshots every column by default, putting `nationalId` in `person_aud` unless someone remembers `@NotAudited` |
| `person.national_id` declared as a partial unique index rather than a plain `UNIQUE` | A retained soft-deleted row otherwise permanently blocks re-registering that national id, failing with a constraint violation naming a row the user cannot see | Keeping the plain UNIQUE makes soft delete a silent ban on re-creating the person, with no error that explains itself |
