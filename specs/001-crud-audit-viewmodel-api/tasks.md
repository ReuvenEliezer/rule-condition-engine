---

description: "Task list for 001-crud-audit-viewmodel-api"
---

# Tasks: Uniform CRUD API, Audit Trail, and UI-Facing View Models

**Input**: Design documents from `/specs/001-crud-audit-viewmodel-api/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/crud-contract.md](./contracts/crud-contract.md),
[contracts/openapi.yaml](./contracts/openapi.yaml), [quickstart.md](./quickstart.md)

**Tests**: Included. `plan.md` names the new test classes in its source layout and `quickstart.md`
declares what each one proves, so tests are part of the specified deliverable — not an addition.

**Organization**: Grouped by user story. US1 delivers the contract, US2 the representation layer,
US3 the audit trail; each is independently demonstrable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)
- Paths are repo-relative; Java root is `src/main/java/com/eliezer/ruleengine/`

## Path Conventions

Single Maven module. `src/main/java/com/eliezer/ruleengine/`, `src/main/resources/db/migration/`,
`src/test/java/com/eliezer/ruleengine/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a known-good baseline and the package skeleton the feature adds

- [X] T001 Run `./mvnw verify` and record the baseline: which tests exist and pass today, so any later failure is attributable to this feature rather than pre-existing
- [X] T002 [P] Create the new package directories `src/main/java/com/eliezer/ruleengine/api/crud/`, `service/crud/`, `service/convert/`, and `audit/`, each with a `package-info.java` stating its role per plan.md's Project Structure
- [X] T003 [P] Confirm `pom.xml` already provides everything the feature needs (`spring-boot-starter-validation` for Bean Validation on VMs, `spring-boot-starter-data-jpa` for Spring Data auditing, Testcontainers for the new integration tests) — all three are expected to be present already, so the expected outcome of this task is **no `pom.xml` change**. If one is genuinely absent, add exactly that one and say so

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared entity base, and the generic CRUD skeleton. Every user story compiles
against these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

**Note on scope**: `AuditableEntity`'s *columns* and the baseline schema are foundational because
`AbstractEntityCrudService` is typed `E extends AuditableEntity` and every VM carries `version`.
The schema is written once as a rewritten `V1__init.sql` rather than as V2/V3/V4 increments on top
of it — nothing has shipped, so there is no history to preserve (see T004).
*Populating* the actor fields is foundational too, because T004 makes `created_by`/`updated_by`
NOT NULL — an unpopulated actor is a constraint violation on every insert, not a missing feature.
*Emitting* audit events is US3. `Person`'s `@SoftDelete` annotation lands here with the migration so
`ddl-auto: validate` stays consistent; the delete *behaviour* it enables is US1. `audit_entry` is in
the baseline too, so US3 adds no migration of its own.

### Schema

- [X] T004 Replace `src/main/resources/db/migration/V1__init.sql` with the complete baseline schema per data-model.md §4: all four managed tables carrying `created_at`/`updated_at`/`created_by`/`updated_by`/`version` (`case_file.opened_at` and `person_case.linked_at` keep their names and serve as the inherited `createdAt`); `person.deleted` plus `ux_person_national_id_active` and `idx_person_active`; the `audit_entry` table with both `..., occurred_at DESC, id DESC` indexes; and V1's existing `pg_trgm`, trigram, `(risk, age)` and `person_case(case_id)` indexes carried over. **No timestamp column carries a DDL default** — `@CreationTimestamp`/`@UpdateTimestamp` own `created_at`, `updated_at`, `opened_at`, `linked_at` and `occurred_at` (Principle V); the only defaults left are `version`, `enabled` and `deleted`, so a hand-written `INSERT` from psql still lands in a valid state; `created_by`/`updated_by` get **no** default, so an insert that resolves no actor fails loudly. Because nothing has shipped there is no backfill, no `SET NOT NULL` dance and no generated constraint name to look up — the schema is stated once, in the shape it should have had
- [X] T005 Reset the local database so Flyway applies the rewritten baseline: V1's checksum has changed, so an existing `ruleengine` database fails migration validation at startup. Drop and recreate the database (or remove the Postgres volume), start the app, and confirm Flyway reports exactly one applied migration and `ddl-auto: validate` passes. Testcontainers builds a fresh database per run and needs nothing. Do **not** run the full suite here — `created_by`/`updated_by` are NOT NULL with no default, so inserts fail until T006–T010 populate them

### Shared entity base

- [X] T006a [P] Create `audit/SystemAuditorAware.java` implementing `AuditorAware<String>` returning a literal `"system"` — an explicit value, never empty, until an authentication layer exists (FR-026). Foundational rather than US3: it is what fills the NOT NULL actor columns
- [X] T006b [P] Create `audit/AuditingConfig.java` with `@EnableJpaAuditing(auditorAwareRef = ...)`, wiring only the actor half; timestamps stay on Hibernate's `@CreationTimestamp`/`@UpdateTimestamp` (R6)
- [X] T006 Create `domain/AuditableEntity.java` as an `@MappedSuperclass` with `createdAt` (`@CreationTimestamp`, `updatable = false`), `updatedAt` (`@UpdateTimestamp`), `createdBy` (`@CreatedBy`, `updatable = false`), `updatedBy` (`@LastModifiedBy`), `version` (`@Version`, primitive `int`), `@EntityListeners(AuditingEntityListener.class)`, and `abstract Object auditId()`. The actor annotations land here, not in US3: T004 makes `created_by`/`updated_by` NOT NULL, so without them every INSERT from Phase 3 onward fails. `AuditTrailListener` is **not** added here or to `@EntityListeners` at all — it is a Hibernate event-SPI listener registered separately in US3 (T060/T061), because a JPA callback cannot see before/after values
- [X] T007 Change `domain/Person.java` to extend `AuditableEntity`, drop its own `createdAt`, add `@SoftDelete(columnName = "deleted", strategy = SoftDeleteType.DELETED)`, keep `caseLinks`, and implement `auditId()` returning the UUID
- [X] T008 Change `domain/CaseFile.java` to extend `AuditableEntity` with `@AttributeOverride(name = "createdAt", column = @Column(name = "opened_at", updatable = false))`, no `@SoftDelete`, and implement `auditId()`
- [X] T009 Change `domain/Rule.java` to extend `AuditableEntity`, drop its own `createdAt`/`updatedAt`, no `@SoftDelete`, and implement `auditId()`
- [X] T010 Change `domain/PersonCase.java` to extend `AuditableEntity` with `@AttributeOverride(name = "createdAt", column = @Column(name = "linked_at", updatable = false))` and implement `auditId()` returning the `PersonCaseId`

### Shared payload and exception types

- [X] T011 [P] Create `api/dto/ResourceVm.java` with `Object id()`, `Integer version()`, `String type()` (`Object id()` so `PersonCaseVm`'s composite key fits while UUID-keyed VMs narrow it covariantly). `version` is the boxed `Integer` on the **VM only** — a primitive would make an omitted `version` deserialise to `0`, which silently matches a never-updated entity and loses the stale-client signal the concurrency edge case requires. `AuditableEntity.version` stays a primitive `int` (R9)
- [X] T012 [P] Create `api/dto/Vms.java` holding the marker interfaces `Summary` and `Detail extends Summary`
- [X] T013 [P] Create `exception/RecordNotFoundException.java` carrying entity name and identifier
- [X] T014 [P] Create `exception/SortFieldNotAllowedException.java` carrying the offending field and the allowed set
- [X] T015 [P] Create `exception/DeletionNotSupportedException.java` carrying the retirement hint that the 405 message will show

### Generic CRUD skeleton

- [X] T016 [P] Create `service/convert/VmMapper.java` with `toEntity(V)`, `toVm(E)`, `allowedSortFields()` per contracts/crud-contract.md §1
- [X] T017 Create `service/convert/AbstractVmMapper.java` implementing the create-vs-load dispatch on `vm.id() == null` (this is what makes FR-003's single save work) and leaving the hooks `createInstance()`, `findById(ID)`, `applyToEntity(E, V)`
- [X] T018 [P] Create `service/crud/EntityCrudService.java` with `saveOrUpdate`, `findById`, `findAll`, `delete`, `allowedSortFields`, `identitySort`
- [X] T019 Create `service/crud/AbstractEntityCrudService.java` implementing all four operations with `@Transactional` (mapping runs inside the transaction — `open-in-view` is false), an `assertNotStale` check comparing the client's `version` against the loaded entity — a null `version` on the update path is a 400, never an implicit match — and the override hooks `beforeSave`, `innerSave`, `innerFindAll`, `innerDelete` (base `innerDelete` throws `DeletionNotSupportedException`), `findEntityById`. **Javadoc the hooks: they are invoked by `this`, so a `@Transactional` on an override is silently ignored** — self-invocation never passes through the Spring proxy. They inherit the entry point's transaction and must not declare their own propagation; if a hook genuinely needs `REQUIRES_NEW`, it has to move to a separate bean or go through a `TransactionTemplate`, and that is a design change worth arguing for rather than an annotation
- [X] T020 Create `api/crud/CrudController.java` with `POST` (201 + `Location` when `id` absent, 200 when present), `GET /{id}`, paged `GET`, and `DELETE /{id}`; page size clamped to `RuleEngineProperties.maxPageSize()` with `defaultPageSize()` as the default, negative page clamped to 0, and `service.identitySort()` appended to every sort so paging is totally ordered. Jackson views are added in US2 (T050)
- [X] T021 Extend `api/GlobalExceptionHandler.java` with the mappings in contracts/crud-contract.md §5: `RecordNotFoundException` → 404 `RECORD_NOT_FOUND`, `DeletionNotSupportedException` → 405 `DELETION_NOT_SUPPORTED`, `SortFieldNotAllowedException` → 400 `INVALID_SORT_FIELD`, `ObjectOptimisticLockingFailureException` → 409 `CONCURRENT_MODIFICATION`, `DataIntegrityViolationException` → 409 `CONSTRAINT_VIOLATION`, `HttpMessageNotReadableException` → 400 `MALFORMED_REQUEST`, leaving the existing rule-specific mappings untouched
- [X] T022 Create `config/WebConfig.java` registering a `Converter<String, PersonCaseId>` that parses `"<personUuid>:<caseUuid>"`, so the composite key binds through the same `@PathVariable ID` as every other resource (R7)
- [X] T023 Add `JpaSpecificationExecutor<CaseFile>` to `repository/CaseRepository.java`, and `void deleteByIdPersonId(UUID)`, `long countByCaseFileId(UUID)`, `Page<PersonCase> findByIdPersonId(UUID, Pageable)` plus `long countByIdPersonId(UUID)` to `repository/PersonCaseRepository.java`
- [X] T024 Check `src/test/java/com/eliezer/ruleengine/support/TestData.java` against the baseline schema. It builds entities through Lombok builders and persists them through JPA, so `created_by`/`updated_by`/`created_at`/`updated_at` are populated by the auditing plumbing (T006/T006a/T006b) and `version`/`deleted` by their defaults — the expected outcome is **no change**. Add fixture support only for what a new test genuinely needs (e.g. constructing an already-soft-deleted person), and say so if nothing was needed

**Checkpoint**: `./mvnw verify` compiles and Flyway + `ddl-auto: validate` agree — user stories can begin

---

## Phase 3: User Story 1 - Manage any business record through one consistent contract (Priority: P1) 🎯 MVP

**Goal**: All four record types — person, case file, rule, person-case link — are managed through
identical paths, parameters, envelopes and status codes, with deletion honoured where it applies and
refused with a naming message where it does not.

**Independent Test**: Run the full operation set (create, read one, list a page, update, delete)
against two different resources and confirm request/response shapes are identical apart from each
record's own fields; confirm `DELETE /api/v1/cases/{id}` returns 405 naming `status=CLOSED`.

### Tests for User Story 1

> Write these first; they must fail before the implementation below exists.

- [X] T025 [P] [US1] Create `src/test/java/com/eliezer/ruleengine/api/CrudContractIntegrationTest.java`, parameterised across `/api/v1/persons`, `/api/v1/cases`, `/api/v1/rules`, `/api/v1/person-cases`, asserting: empty list returns 200 with empty content not an error; save without `id` returns 201 + `Location` + assigned id; save with `id` updates rather than duplicates; page 2 of 250 records at size 50 returns records 101–150 with correct `totalElements`/`totalPages`; `size=9999` clamps to 500 and echoes the effective size; unknown id returns 404; `page=99999` returns an empty page with correct totals, not an error; `sort=nosuchfield` returns 400 `INVALID_SORT_FIELD`; a stale `version` returns 409 `CONCURRENT_MODIFICATION`; and a save carrying an `id` that no longer exists returns 404 rather than creating a second record under a new id (the "save referencing a vanished record" edge case). Extends `PostgresIntegrationTest` and carries `@Tag("integration")`

### Payload records for User Story 1

> Field sets and validation only. The `@JsonView` / `READ_ONLY` annotations that shape them are US2.

- [X] T026 [P] [US1] Create `api/dto/PersonVm.java` as a record implementing `ResourceVm` with `id`, `version`, `type`, `name`, `age`, `city`, `risk`, `nationalId`, `caseLinks`, `caseLinkCount`, and the four audit fields, with `@NotBlank @Size(max = 200)` on `name`, `@NotNull @Min(0) @Max(149)` on `age` mirroring `person_age_check`, `@NotNull` on `risk`, `@NotBlank` on `nationalId`. `caseLinks` is a first page and `caseLinkCount` its total — constitution Principle I forbids a detail response returning a whole relation, and `person_case` is unbounded per person
- [X] T027 [P] [US1] Create `api/dto/CaseFileVm.java` with `id`, `version`, `type`, `title`, `status`, `openedAt`, `ruleId`, `linkedPersons`, `linkedPersonCount`, and the audit fields `createdBy`, `updatedAt`, `updatedBy` — **not** `createdAt`, which is the same column as `openedAt` (data-model.md §1) and would emit the value twice under two names; `@NotBlank @Size(max = 200)` on `title`, `@NotNull` on `status`
- [X] T028 [P] [US1] Create `api/dto/RuleVm.java` with `id`, `version`, `type`, `caseId`, `name`, `enabled`, `condition`, and audit fields — carrying every writable field `CreateRuleRequest` held plus everything `RuleResponse` returned, so one record serves both directions
- [X] T029 [P] [US1] Create `api/dto/PersonCaseVm.java` with `id` (the `"<personUuid>:<caseUuid>"` string), `version`, `type`, `personId`, `caseId`, `role`, `linkedAt`, `person`, `caseFile`, and the audit fields `createdBy`, `updatedAt`, `updatedBy` — **not** `createdAt`, which is the same column as `linkedAt`; `@NotNull` on `personId`, `caseId`, `role`. `id` is derived from `personId`+`caseId`, so validate rather than trust it: an `id` present and disagreeing with the pair is a 400, and an absent `id` whose pair already exists is a 409 `CONSTRAINT_VIOLATION`, not a silent update (see T037)

### Mappers for User Story 1

- [X] T030 [P] [US1] Create `service/convert/PersonVmMapper.java` extending `AbstractVmMapper`, with `allowedSortFields()` derived from `PersonFieldRegistry` so sort and rule-condition vocabularies cannot drift (R9)
- [X] T031 [P] [US1] Create `service/convert/CaseFileVmMapper.java`, mapping `openedAt` from the inherited `createdAt` and resolving `ruleId` without loading the rule
- [X] T032 [P] [US1] Create `service/convert/RuleVmMapper.java`, replacing the mapping currently inlined in `RuleService`
- [X] T033 [P] [US1] Create `service/convert/PersonCaseVmMapper.java`, rendering the composite id as `"<personUuid>:<caseUuid>"` and mapping `linkedAt` from the inherited `createdAt`

### Services for User Story 1

- [X] T034 [P] [US1] Create `service/PersonCrudService.java` extending `AbstractEntityCrudService<Person, PersonVm, UUID>`, overriding `innerDelete` to hard-delete the person's links via `personCaseRepository.deleteByIdPersonId(id)` *then* soft-delete the person in the same transaction (the FK cascade never fires for a soft delete, so links would otherwise dangle)
- [X] T035a [P] [US1] Add to `CrudContractIntegrationTest` a case-reopening assertion: saving a `CLOSED` case with `status=OPEN` succeeds and the reopened case reappears in listings filtered to open cases. Documents the decision that retirement by status is reversible, so nobody later "fixes" it with a transition guard
- [X] T035 [P] [US1] Create `service/CaseFileCrudService.java` extending `AbstractEntityCrudService<CaseFile, CaseFileVm, UUID>`, inheriting the `innerDelete` throw and overriding `retirementHint()` with *"Cases are closed, not deleted: POST /api/v1/cases with status=CLOSED"*
- [X] T036 [P] [US1] Create `service/RuleCrudService.java` extending `AbstractEntityCrudService<Rule, RuleVm, UUID>`, overriding `beforeSave` to run the existing `assertCompilable` check so write-time rule validation survives (FR-012), and `retirementHint()` with *"Rules are disabled, not deleted: POST /api/v1/rules with enabled=false"*
- [X] T037 [P] [US1] Create `service/PersonCaseCrudService.java` extending `AbstractEntityCrudService<PersonCase, PersonCaseVm, PersonCaseId>`, overriding `innerDelete` to hard-delete the link and `beforeSave` to reconcile the derived id against the natural key: reject an `id` disagreeing with `personId`+`caseId` (400), and let the unique constraint surface a duplicate link as 409 rather than dispatching it into the update path

### Controllers for User Story 1

- [X] T038 [P] [US1] Create `api/PersonController.java` as `@RestController @RequestMapping("/api/v1/persons") extends CrudController<Person, PersonVm, UUID>` with a constructor only
- [X] T039 [P] [US1] Create `api/CaseFileController.java` at `/api/v1/cases` extending `CrudController<CaseFile, CaseFileVm, UUID>`
- [X] T040 [P] [US1] Create `api/PersonCaseController.java` at `/api/v1/person-cases` extending `CrudController<PersonCase, PersonCaseVm, PersonCaseId>`, relying on the converter from T022 rather than a bespoke path
- [X] T041 [US1] Change `api/RuleController.java` to extend `CrudController<Rule, RuleVm, UUID>`, deleting its hand-written CRUD handlers and its local `pageable(...)` clamping (now inherited) while keeping `PUT /{ruleId}/condition`, `GET /{ruleId}/matches`, `POST /preview`, and `GET /fields` working unchanged
- [X] T042 [US1] Trim `service/RuleService.java` to the rule-specific operations only — condition update, compile validation exposed for `RuleCrudService.beforeSave`, field listing — removing the save/find/page logic now provided by `RuleCrudService`
- [X] T043 [US1] Delete `api/dto/CreateRuleRequest.java` and `api/dto/RuleResponse.java`, updating every reference to `RuleVm`
- [X] T044 [US1] Create `src/test/java/com/eliezer/ruleengine/domain/PersonSoftDeleteIntegrationTest.java` asserting: delete then read returns 404; a second delete returns 404 not a 500; the person's links are gone (`SELECT count(*) FROM person_case pc JOIN person p ON p.id = pc.person_id WHERE p.deleted` is 0); the deleted person's `national_id` can be registered again; a soft-deleted person disappears from `/rules/{id}/matches` with no change to `RuleCompiler`; and `DELETE` on a case and on a rule each return 405 naming the alternative. Extends `PostgresIntegrationTest` and carries `@Tag("integration")`

**Checkpoint**: US1 is fully functional — every resource is manageable through one contract, independently of view shaping and auditing

---

## Phase 4: User Story 2 - Receive purpose-built UI objects instead of raw stored records (Priority: P2)

**Goal**: Every response is a declared representation with a type marker, a compact summary form for
lists and a fuller detail form for single records, and sensitive identifiers never leave by default.

**Independent Test**: Call every read operation and assert each response carries exactly the fields
published for that type; `nationalId` present on `GET /persons/{id}`, absent from `GET /persons` and
from `/rules/{id}/matches`; a case's detail form includes linked persons while its list form does not.

### Tests for User Story 2

- [X] T045 [P] [US2] Create `src/test/java/com/eliezer/ruleengine/api/ResponseExposureTest.java` asserting per resource: the exact field set of summary vs. detail responses; `nationalId` absent from every list response and from `/rules/{id}/matches` and `/rules/preview`; `type` present on every list element; forged `createdBy`/`createdAt` in a request body are dropped rather than stored; a body with fields the record does not accept is rejected naming the offending fields. Extends `PostgresIntegrationTest` and carries `@Tag("integration")`

### Representation shaping

- [X] T046 [P] [US2] Annotate `api/dto/PersonVm.java`: `@JsonView(Vms.Summary.class)` on `id`, `version`, `type`, `name`, `age`, `city`, `risk`; `@JsonView(Vms.Detail.class)` on `nationalId`, `caseLinks`, `caseLinkCount` and the audit fields; `@JsonProperty(access = READ_ONLY)` on `type`, `caseLinks`, `caseLinkCount` and all four audit fields
- [X] T047 [P] [US2] Annotate `api/dto/CaseFileVm.java` — summary: `id`, `version`, `type`, `title`, `status`, `openedAt`; detail: `ruleId`, `linkedPersons`, `linkedPersonCount`, audit fields; `READ_ONLY` on `type`, `openedAt`, `linkedPersons`, `linkedPersonCount` and audit fields
- [X] T048 [P] [US2] Annotate `api/dto/RuleVm.java` — summary: `id`, `version`, `type`, `caseId`, `name`, `enabled`; detail: `condition` and all four audit fields; `READ_ONLY` on `type` and audit fields. `updatedAt` is detail-only like every other resource's audit metadata — an earlier draft had it in the summary, which would have made `RuleVm` the only VM leaking audit fields into list responses, against FR-002/SC-001
- [X] T049 [P] [US2] Annotate `api/dto/PersonCaseVm.java` — summary: `id`, `version`, `type`, `personId`, `caseId`, `role`, `linkedAt`; detail: `person`, `caseFile`, audit fields; `READ_ONLY` on `type`, `linkedAt`, `person`, `caseFile` and audit fields
- [X] T050 [US2] Add `@JsonView(Vms.Summary.class)` to `CrudController.findAll` and `@JsonView(Vms.Detail.class)` to `saveOrUpdate` and `findById` in `api/crud/CrudController.java` — the one place list-vs-detail depth is declared, inherited by all four resources (FR-015)

### Detail depth in code, not only annotation

- [X] T051 [US2] Add `toVmWithChildren(E)` to `service/convert/VmMapper.java` with a default delegating to `toVm`, implement the dispatch in `AbstractVmMapper`, and change `AbstractEntityCrudService` so `findAll` calls `toVm` while `findById` calls `toVmWithChildren` — a `@JsonView` hides a collection from output but does not stop it being fetched, so the list path must not load children at all
- [X] T052 [P] [US2] Implement `PersonVmMapper.toVmWithChildren` populating `caseLinks` from `PersonCaseRepository.findByIdPersonId(id, firstPage)` and `caseLinkCount` from `countByIdPersonId` — first page plus total, never the whole relation
- [X] T053 [P] [US2] Implement `CaseFileVmMapper.toVmWithChildren` populating `linkedPersons` from `PersonCaseRepository.findByCaseFileId(id, firstPage)` and `linkedPersonCount` from `countByCaseFileId` — a case with tens of thousands of links must return a first page plus a total, never the collection
- [X] T054 [P] [US2] Implement `PersonCaseVmMapper.toVmWithChildren` populating `person` and `caseFile` as summary-shaped VMs
- [X] T055 [US2] Change `/rules/{ruleId}/matches` and `/rules/preview` in `api/RuleController.java` to return `PageResponse<PersonVm>` annotated `@JsonView(Vms.Summary.class)` — the two person-returning endpoints outside the inherited contract — and delete `api/dto/PersonMatch.java`, updating `RuleEvaluationService` accordingly
- [X] T056 [US2] Make unknown request fields an error rather than a silent ignore (`FAIL_ON_UNKNOWN_PROPERTIES`), and ensure `GlobalExceptionHandler` returns 400 `VALIDATION_FAILED` naming the offending fields for both bean-validation failures and unknown properties (FR-018, US2 scenario 5)

**Checkpoint**: US1 and US2 both work independently — the contract is stable and no stored-record internals or sensitive identifiers reach clients

---

## Phase 5: User Story 3 - Trace who changed what, and when (Priority: P3)

**Goal**: Every create, update and delete produces a persisted audit entry naming record type,
identifier, operation, actor, time and **which fields changed**; a record's full history is
queryable; every inbound request is logged; neither leaks credentials or national ids.

**Independent Test**: Perform one create, one update and one delete, then read
`GET /api/v1/audit-entries?recordType=person&recordId=...` and confirm three entries in order with
the right operation labels, actor `system`, and a `changes` payload naming exactly the fields that
moved — with the national identifier redacted.

### Tests for User Story 3

- [X] T057 [P] [US3] Create `src/test/java/com/eliezer/ruleengine/audit/AuditTrailIntegrationTest.java` asserting: create/update/delete each write exactly one `audit_entry` row carrying record type, id, operation, actor, `occurred_at` and `entity_version`; the update row's `changes` names only the fields that actually moved, with `from`/`to`; `createdAt`/`createdBy` are unchanged by an update while `updatedAt`/`updatedBy` move; a soft-deleted person is labelled `DELETE` (it arrives at `onPostDelete`, not `onPostUpdate` — a `@SoftDelete` removal is a delete event that emits an UPDATE statement); each API call emits a request-log line with method, path, status, elapsed and actor; the actor is the literal `system`; and no `Authorization` header value and no `nationalId` **value** appears in `audit_entry.changes` or in captured log output — assert against the known sensitive value, so an unmarked new column fails here rather than leaking quietly (FR-025). Extends `PostgresIntegrationTest` and carries `@Tag("integration")`
- [X] T057a [P] [US3] Create `src/test/java/com/eliezer/ruleengine/audit/AuditEntryQueryIntegrationTest.java` proving SC-008 end to end: apply a known sequence of changes to one person, then reconstruct that sequence from `audit_entry` alone — create values, then each delta in order — without reading the person row or the application log. Also assert the listing is paged, clamped, and totally ordered (two consecutive pages neither repeat nor skip an entry). Extends `PostgresIntegrationTest` and carries `@Tag("integration")`

### Audit store

- [ ] ~~T058a~~ **Folded into T004** — `audit_entry` and its two indexes are part of the baseline schema, not a fourth migration. Nothing to do here
- [X] T058b [P] [US3] Create `audit/AuditOperation.java` (`CREATE`, `UPDATE`, `DELETE`) and `audit/AuditEntry.java` as an `@Entity @Immutable` insert-only record of one change, with `@Enumerated(STRING)` on `operation`, `@CreationTimestamp` on `occurredAt`, and `changes` as `@JdbcTypeCode(SqlTypes.JSON)` `JSONB`. **Deliberately not an `AuditableEntity`**: no `version`, no `updatedBy`, nothing to update — and extending the audited base would make the audit table audit its own inserts (FR-030)
- [X] T058c [P] [US3] Create `audit/AuditEntryRepository.java` with `Page<AuditEntry> findByRecordTypeAndRecordId(String, String, Pageable)` and `Page<AuditEntry> findAll(Pageable)`

### Audit write path (R10)

- [X] T060 [US3] Create `audit/AuditTrailListener.java` implementing Hibernate's `PostInsertEventListener`, `PostUpdateEventListener` and `PostDeleteEventListener` — **not** JPA `@PostPersist`/`@PostUpdate`, which cannot see before/after values. Build the change map from `getOldState()`, `getState()`, `getDirtyProperties()` and the persister's property names; replace both values of a field marked sensitive with `"***"` (FR-025); publish an `ApplicationEvent` rather than writing anything. Applies to every `AuditableEntity` subtype with no per-type opt-in (FR-028)
- [X] T061 [US3] Register `AuditTrailListener` on the `EventListenerRegistry` in `audit/AuditingConfig.java` via a `HibernatePropertiesCustomizer` / `Integrator`, and confirm the listener's injected `ApplicationEventPublisher` is non-null — this works only because Spring Boot sets `hibernate.resource.beans.container` to `SpringBeanContainer`; without it Hibernate no-arg-constructs the listener and every injected field is null
- [X] T061a [US3] Create `audit/AuditEntryRecorder.java` consuming that event at `@TransactionalEventListener(phase = BEFORE_COMMIT)` — **same transaction**, no `REQUIRES_NEW`, and no catch-and-swallow — persisting one `AuditEntry`. `BEFORE_COMMIT` runs after the business flush and before the commit, so `entity_version` is already correct and the change and its audit row are atomic (FR-027 as amended). The event indirection is still required: persisting from inside the Hibernate listener would re-enter the `EntityManager` mid-flush and collide with the in-progress action queue
- [X] T061b [US3] Create `audit/AuditEntryVm.java` (read-only; `recordType`, `recordId`, `operation`, `actor`, `occurredAt`, `entityVersion`, `changes`) and `audit/AuditEntryController.java` at `/api/v1/audit-entries` — **read-only, not a `CrudController`** (FR-029). Audit entries are derived history, not a managed record type, so the uniform save/delete contract does not apply; forcing it would mean two operations existing only to be refused. Paged with the same clamping as `CrudController`, default sort `occurred_at DESC, id DESC`, sort fields allow-listed, optional `recordType`/`recordId` filters
- [X] T062 [US3] Create `audit/RequestAuditFilter.java` extending `AbstractRequestLoggingFilter`, logging method, path, status, elapsed millis and actor, configured `setIncludeHeaders(false)` and `setIncludePayload(false)` so no `Authorization` header and no body containing a `nationalId` can reach the log at all — FR-025 held structurally rather than by redaction rules
- [X] T063 [US3] Register `RequestAuditFilter` as a bean in `config/WebConfig.java`
- [X] T064 [US3] Set `logging.level.com.eliezer.ruleengine.audit: INFO` in `src/main/resources/application.yml` so audit and request-log events are visible without raising `org.springframework.web` or `org.hibernate`, which would drown them
- [X] T065 [US3] Add a test to `AuditTrailIntegrationTest` proving FR-027 as amended: make `AuditEntryRecorder`'s insert fail (stub the repository to throw) and confirm the **business change is rolled back too** — re-read the record and see the pre-change value — and that the error identifies an audit-recording failure rather than a generic 500. The invariant under test is that no state exists in which a record changed and no audit entry exists

**Checkpoint**: all three user stories independently functional

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T066 [P] Reconcile `specs/001-crud-audit-viewmodel-api/contracts/openapi.yaml` against the implemented endpoints and schemas, correcting any drift introduced during implementation
- [X] T067 Walk `specs/001-crud-audit-viewmodel-api/quickstart.md` end to end against a running service and fix anything that does not behave as documented
- [ ] T068 (deferred — manual perf check) Verify SC-007: page a 10,000-person population one page at a time and confirm the last page returns within 2× the first page's elapsed time, both under 500 ms, with no id repeated or skipped across the full sequence
- [X] T068a Verify SC-002 — the claim that justifies the whole generic hierarchy in plan.md's Complexity Tracking: expose a fifth throwaway record type end to end (VM + mapper + service + controller, no new behaviour), then confirm `git diff --stat` touches nothing under `api/crud/`, `service/crud/`, or `service/convert/Abstract*`. Record the file count the type cost. Revert the throwaway type afterwards; the evidence is the diff, not the code
- [X] T069 [P] Remove dead code left by the DTO consolidation — unused imports, orphaned mapping helpers in `RuleService`, and any `@Repository` annotations or javadoc now describing removed behaviour
- [X] T070 Run the full `./mvnw verify` and confirm the pre-existing rule suites (`RuleCompilerIntegrationTest`, `RuleSerializationTest`, `RuleModelValidationTest`) still pass unchanged, which is FR-012

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**
- **US1 (Phase 3)**: depends on Phase 2 only
- **US2 (Phase 4)**: depends on Phase 2; edits files US1 creates (the four VM records, `CrudController`, the mappers), so in a single-developer sequence it follows US1
- **US3 (Phase 5)**: depends on Phase 2 only — genuinely independent of US1 and US2, since it adds to the `audit/` package plus a new migration, without touching the VMs, mappers or `CrudController`. Its `AuditEntryQueryIntegrationTest` exercises US1's endpoints to produce changes to audit, but nothing in US1 depends on US3
- **Polish (Phase 6)**: depends on the stories being delivered

### Within Phase 2

- T004 (baseline schema) then T005 (database reset) before T006–T010 (entities) — `ddl-auto: validate` fails otherwise
- T004–T010 land as one unit before the suite is run again: T004 makes `created_by`/`updated_by` NOT NULL with no default, so every insert fails until T006/T006a/T006b populate them
- T006a, T006b before T006 — the auditor bean must exist before `@EnableJpaAuditing` takes effect
- T006 before T007–T010
- T011–T015 are independent of everything else in the phase
- T016 before T017; T018 before T019; T013–T015 before T019 and T021; T020 after T019

### Within User Story 1

- T025 (test) first — it must fail
- VM records (T026–T029) before mappers (T030–T033) before services (T034–T037) before controllers (T038–T041)
- T041 before T042 (the controller stops calling what T042 removes); T043 after T041
- T044 last — it exercises the finished delete paths

### Within User Story 2

- T045 (test) first
- T046–T049 (annotations) and T050 (controller views) can proceed together
- T051 before T052–T054
- T055 depends on T046 (`PersonVm`'s summary view is what replaces `PersonMatch`)

### Within User Story 3

- T057 (test) first
- T004 (Phase 2) already provides `audit_entry`; T058b before T058c and T061a; T060 before T061; T061 before T061a; T061b after T058c; T062 before T063
- T065 after T061a

### Parallel Opportunities

- Setup: T002, T003
- Foundational: T011–T016 and T018 all together; T007–T010 are four separate entity files but all depend on T006
- US1: the four VMs (T026–T029) together, then the four mappers (T030–T033) together, then the four services (T034–T037) together, then the three new controllers (T038–T040) together
- US2: T046–T049 together; T052–T054 together
- US3: T057, T057a, T058b together; then T058c and T060 together
- Across stories, with multiple developers: US1 and US3 can run fully in parallel once Phase 2 is done

---

## Parallel Example: User Story 1

```bash
# Payload records — four different files, no interdependency:
Task: "Create api/dto/PersonVm.java"
Task: "Create api/dto/CaseFileVm.java"
Task: "Create api/dto/RuleVm.java"
Task: "Create api/dto/PersonCaseVm.java"

# Then the four mappers together:
Task: "Create service/convert/PersonVmMapper.java"
Task: "Create service/convert/CaseFileVmMapper.java"
Task: "Create service/convert/RuleVmMapper.java"
Task: "Create service/convert/PersonCaseVmMapper.java"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational — blocks everything
3. Phase 3: User Story 1
4. **STOP and VALIDATE**: run `CrudContractIntegrationTest` and the US1 section of quickstart.md
5. At this point every record type is manageable through one contract — demonstrable on its own

### Incremental Delivery

1. Setup + Foundational → schema and generic skeleton in place
2. + US1 → uniform CRUD across four resources (**MVP**)
3. + US2 → responses shaped, `nationalId` contained, children paged
4. + US3 → audit trail and request log
5. Polish

### Parallel Team Strategy

Once Phase 2 is complete: developer A takes US1, developer B takes US3 (they share no files),
and US2 follows US1 since it refines the same VM records and controller.

---

## Notes

- **`git add` every new file the moment it is created** — untracked files are invisible in the IDE commit panel and get left out of commits, which has caused compile failures in CI
- `[P]` = different files, no dependency on an incomplete task
- Commit after each task or coherent group; `./mvnw verify` after each checkpoint
- The constitution at `.specify/memory/constitution.md` is ratified at **v1.0.0**. Principle I (no unpaged list; children returned as first-page-plus-count) and Principle V (`@Tag("integration")` on Testcontainers-backed tests) are the two that most directly shape these tasks
- Two conventions carry disproportionate weight and should be re-checked in review: audit timestamps come from Hibernate annotations, never DDL defaults or hand-set values; and no endpoint may materialise an unbounded collection
