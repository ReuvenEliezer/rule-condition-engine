# Phase 0 Research: Uniform CRUD API, Audit Trail, and Response Models

**Feature**: `001-crud-audit-viewmodel-api` | **Date**: 2026-08-30

Resolves the two `[NEEDS CLARIFICATION]` markers from [spec.md](./spec.md) plus the technical
unknowns raised by mapping the `com.liquibase` reference architecture onto this codebase.

**R1 and R2 were decided by the user on 2026-08-30** (deletion: option 1, narrowest scope;
naming: keep `Response`, split request from response). They are no longer provisional.

---

## R1 — Deletion semantics (resolves FR-008)

**Decision**: Soft delete **`Person` only**, via Hibernate `@SoftDelete`. Hard delete `PersonCase`
links. `CaseFile` and `Rule` are **not deletable** — they are retired through state they already
carry (`CaseStatus.CLOSED`, `Rule.enabled = false`), and their `DELETE` endpoints are not exposed.

| Record | `DELETE /{id}` | Mechanism |
|---|---|---|
| `Person` | `204` | Soft delete; hidden from all subsequent reads. Its `person_case` links are hard-deleted in the same transaction. |
| `PersonCase` | `204` | Hard delete — an unlink. |
| `CaseFile` | `405 DELETION_NOT_SUPPORTED` | Close it: `POST /api/v1/cases` with `status: CLOSED`. |
| `Rule` | `405 DELETION_NOT_SUPPORTED` | Disable it: `POST /api/v1/rules` with `enabled: false`. |

**Rationale**: `CaseStatus.CLOSED` and `Rule.enabled` already exist and already express "retire this
without erasing it" — which is most of what soft delete is for. Adding a second, parallel retirement
mechanism to those two tables would give each of them two overlapping notions of "not active" that
can disagree (a `CLOSED` case that is not `deleted`, a `deleted` case that is `OPEN`), with no rule
saying which wins.

Restricting soft delete to `Person` also removes the sharpest edge found during design: `rule.case_id
UNIQUE` would have been permanently consumed by a soft-deleted rule, so a case whose rule was deleted
could never be given a replacement. With rules never soft-deleted, that constraint stays exactly as
`V1__init.sql` wrote it.

Person keeps soft delete because it is the one record whose erasure destroys evidence: a person
matched by a rule is the subject of a screening decision, and SC-008 requires that decision to remain
reconstructible.

**Why `@SoftDelete` rather than a hand-rolled flag**: Hibernate's `@SoftDelete` (6.4+; this project
is on Hibernate 7 via Spring Boot 4.1.1) injects the restriction into generated SQL for *every* query
form — `findById`, derived queries, HQL, and **Criteria**. That last one matters most here:
`RuleCompiler` builds `Specification<Person>` predicates, and soft-deleted persons drop out of rule
evaluation with **zero changes** to the compiler or `RuleEvaluationService`. It also rewrites
`DELETE` into `UPDATE`, so the generic `innerDelete` needs no per-type branching.

`@MappedSuperclass` is what keeps this option open: `@SoftDelete` applies at the root of an
inheritance hierarchy, so under JOINED it would have had to sit on the root — making every entity
soft-deletable and putting `deleted` on `abstract_entity`, where a partial unique index on
`person(national_id)` could not reach it, because Postgres partial indexes cannot span tables. With
no hierarchy, `deleted` sits on `person` and both problems disappear.

The reference's approach (`isDeleted` field plus `findNonDeleted` queries on `CaseDao`) is opt-in per
query — the next query someone writes will not have the filter, and nothing catches the omission.

**Consequences that must be handled** (detail in [data-model.md](./data-model.md)):

1. `person.national_id UNIQUE` must become a **partial unique index** filtered on
   `WHERE deleted = false`. Otherwise a soft-deleted person's national id can never be
   re-registered, and the failure surfaces as a constraint violation naming a row the user cannot
   retrieve. This is the only constraint rewrite in the feature, and it is why `deleted` must sit on
   the `person` table rather than on the hierarchy root.
2. `person_case.person_id REFERENCES person(id) ON DELETE CASCADE` never fires, because soft delete
   issues no `DELETE`. Link rows would survive pointing at an invisible parent, and since
   `PersonCase.person` is `optional = false`, loading one throws `EntityNotFoundException`. Link
   cleanup becomes an explicit step in `PersonCrudService`'s delete hook — not optional hygiene.
3. `case_file` and `rule` are never soft-deleted, so their `ON DELETE CASCADE` FKs keep working
   normally. No application-level cascade emulation is needed for them.

**Contract consequence — `delete` is an optional operation.** `AbstractEntityCrudService.delete`
throws `DeletionNotSupportedException` by default; `PersonCrudService` and `PersonCaseCrudService`
override it. The handler maps that to `405` with a message naming the alternative, so the API teaches
the right move rather than silently lacking an endpoint.

This narrows FR-001 and FR-008, which assume every record type is deletable and that deletion always
hides the record. **Both need amending in [spec.md](./spec.md)** — see "Spec amendments required".

**Alternatives considered**:
- *Soft delete all three primary records* — uniform `DELETE` across resources, but pays the
  `rule.case_id` constraint rewrite and gives cases and rules two competing retirement flags.
- *`DELETE /cases/{id}` sets `status = CLOSED`, returning 204* — keeps the verb uniform, but a
  `DELETE` that leaves the record fully retrievable is a lie the contract has to keep explaining.
  A `405` naming the correct call is more honest and self-documenting.
- *Hard delete everywhere* — an audit line about a row nobody can retrieve is a weaker guarantee than
  SC-008 asks for, and `ON DELETE CASCADE` would silently remove link rows without audit entries.

---

## R2 — One VM per entity, views for depth (resolves FR-019)

**Decision (user, 2026-08-30, revised)**: one record per entity — `PersonVm`, `CaseFileVm`,
`RuleVm`, `PersonCaseVm` — used in both directions. Summary vs. detail is a Jackson **view**, not a
second type. Read-only enforcement is `@JsonProperty(access = READ_ONLY)`, not a separate request
type.

Everything stays in `api.dto`. There is no `api.viewmodel` package and no mutable class hierarchy —
every VM is a record.

### Why not the split-record design

An earlier revision split each entity into `<Type>Request` / `<Type>Response` /
`<Type>SummaryResponse`, which made `CrudController` take four type parameters:

```java
class PersonController extends CrudController<PersonRequest, PersonResponse, PersonSummaryResponse, UUID>
```

That was rejected as unreadable, and the objection is correct: a controller declaration should say
*DB entity, UI object, identifier* — three things — not enumerate serialisation variants. The
signature is now:

```java
class PersonController extends CrudController<Person, PersonVm, UUID>
```

### What replaces the two guarantees the split provided

**FR-017 (sensitive fields never on a list path)** — `nationalId` is annotated
`@JsonView(Vms.Detail.class)`. `Vms.Detail extends Vms.Summary`, so summary fields appear in both
and detail fields in neither list nor match responses. The decision is declared **once**, on
`CrudController.findAll`, and inherited by every resource.

**FR-023 (clients cannot forge audit values)** — audit fields carry
`@JsonProperty(access = READ_ONLY)`. Jackson serialises them and **ignores them on
deserialisation**, so a posted `"createdBy": "attacker"` is dropped before validation runs. This is
a stronger and more local guarantee than the split design gave, which relied on the field simply not
being declared on the request record.

### Honest cost

The split made a leak *unrepresentable*; the view makes it *one missing annotation*. The mitigation
is that the annotation lives on the shared base class rather than on each endpoint, so the exposed
surface is exactly the endpoints that return persons outside the CRUD contract —
`/rules/{id}/matches` and `/rules/preview`. Both carry `@JsonView(Vms.Summary.class)` explicitly and
both are asserted in `ResponseExposureTest`.

A second cost: one bidirectional record means a few fields are meaningless in one direction
(`type`, the audit block on input). `READ_ONLY` handles the semantics; the record is a little wider
than either single-direction type would be.

### Naming

`Vm` suffix, because the type travels in both directions and can therefore be named neither
`Request` nor `Response`. This is the same reasoning that makes `RuleResponse` the right name for a
response-only record and the wrong name for this one.

**Effect on existing files**:

| Existing | Outcome |
|---|---|
| `RuleResponse` | → `RuleVm` (gains `version`, `type`, audit fields, and the writable fields `CreateRuleRequest` held) |
| `CreateRuleRequest` | folded into `RuleVm` (nullable `id` ⇒ one endpoint does save-or-update) |
| `PersonMatch` | → `PersonVm` under `@JsonView(Vms.Summary.class)`; its hand-written `nationalId` exclusion becomes the view |
| `PageResponse`, `ErrorResponse`, `MatchScope`, `PreviewRequest` | unchanged, same package |

`PreviewRequest` stays a standalone record: it is an operation payload, not a record representation,
and forcing it into the VM scheme would be cargo-culting.

**Alternatives considered**:
- *Split `Request` / `Response` / `SummaryResponse`* — stronger FR-017 guarantee, rejected for the
  four-parameter controller signature.
- *One VM with an `includeChildren` boolean (the reference's mechanism)* — same type count as the
  view approach but the caller decides depth imperatively at each call site, which is exactly the
  per-call-site decision `@JsonView` removes.
- *`...Resource` naming* — accurate for a bidirectional type, but `Vm` is the term already in play.

---

## R3 — Shared entity base: `@MappedSuperclass`, not JOINED inheritance

**Decision**: `AuditableEntity` as `@MappedSuperclass`, carrying `createdAt`, `updatedAt`,
`createdBy`, `updatedBy`, `version`, and an abstract `Object auditId()`. Each entity table keeps its
own copy of those columns and its own primary key. There is no `abstract_entity` table and no
inheritance hierarchy.

*Briefly reversed to JOINED on 2026-08-30 at the user's instruction, then reverted the same day once
the analysis below was confirmed. `@MappedSuperclass` is the design of record.*

### What the reference actually builds

`com.liquibase.entities.AbstractEntity` is a real `@Entity` with
`@Inheritance(strategy = InheritanceType.JOINED)` and `@Table(name = "abstract_entity")`, holding
`id` with `@GeneratedValue(IDENTITY)`. `BaseEntity` extends it as a second `@Entity`
(`base_entity`) holding the audit columns. `Case` extends `BaseEntity` as a third (`cases`).

So one `Case` row is physically spread across three tables, and the reference's own javadoc shows
the consequence:

> `SELECT * FROM netapp.cases INNER JOIN netapp.base_entity ON base_entity.id = cases.id;`

### The costs this imposes

| Operation | JOINED (3 levels) | `@MappedSuperclass` |
|---|---|---|
| Read one record | 3-table join | single-table read |
| Read a page of 50 | 3-table join per page | single-table read |
| Insert one record | 3 INSERTs | 1 INSERT |
| Delete one record | 3 DELETEs | 1 DELETE |
| Polymorphic `SELECT e FROM AbstractEntity e` | LEFT JOIN across **every** subclass table | not expressible |

Four of these matter concretely for this codebase:

1. **`@GeneratedValue(IDENTITY)` disables JDBC insert batching.** Hibernate must round-trip per row
   to read the generated key back. This project explicitly configures
   `hibernate.jdbc.batch_size: 50` in `application.yml` — adopting the reference's IDENTITY-rooted
   hierarchy would silently disable a setting that was deliberately turned on.
2. **The polymorphic query is one method call away.** The reference declares
   `AbstractEntityDao extends JpaRepository<AbstractEntity, Long>`. Calling `findAll()` on it emits
   an outer join across every table in the hierarchy. Nothing in the type system warns you.
3. **`abstract_entity` becomes a global insert hotspot.** Every insert of every type contends on one
   table and one identity sequence.
4. **The `person` read path here is performance-sensitive.** `RuleCompiler` builds Criteria
   predicates against `Person`, backed by `idx_person_name_trgm` and `idx_person_risk_age`. Rooting
   `Person` in a 3-level hierarchy puts two PK joins under every rule evaluation, for no gain.

### Two things the reference's own code shows

**Its composite-key join entities are already outside the hierarchy.** `CaseProfile` and
`CourseRating` are declared `implements Serializable`, not `extends AbstractEntity` — because an
`@EmbeddedId` cannot join a hierarchy rooted on a single-column `id`. The reference does not apply
its own base classes universally, so the hierarchy never actually spans all entities.

**Its schema does not wire the hierarchy up.** `abstract_entity`, `base_entity`, `note` and `cases`
each declare an independent `AUTO_INCREMENT id` with **no foreign keys between them**. The structure
is held together by Hibernate alone; the database would accept an orphaned leaf row without
complaint. What looks like a modelled hierarchy is three unrelated tables that happen to share a
column name.

### The deeper objection

`AbstractEntity` / `BaseEntity` is **not a domain type hierarchy**. Nothing in the application ever
asks "give me all `AbstractEntity` rows" as a meaningful business question — a `Case` and an
`Employee` are not two kinds of one thing. What the base classes actually carry is a *cross-cutting
concern*: every table wants an id, audit columns, and one `@EntityListeners` registration.

JOINED inheritance is the right tool for genuine subtype polymorphism that is queried across the
hierarchy — `Payment` with `CardPayment` and `BankPayment`, listed together on one screen. Using it
for a cross-cutting concern pays the full structural cost of polymorphism to buy code reuse that
`@MappedSuperclass` provides for free.

### On "flattening and duplicating the ID"

Duplicating the *column definition* across tables is not duplicating *data*. Each table owning its
own `id` primary key is ordinary normalised design — no two tables hold the same row, so there is no
redundancy and nothing can drift out of sync. What JOINED does is the opposite: it splits one
logical row across three physical rows that the ORM must keep consistent on every write.

With `@MappedSuperclass` no table is created for the abstract base; its columns are mapped directly
into each concrete entity table, so every read is a single-table `SELECT` with no join overhead.

### What is given up, and whether it matters here

`@MappedSuperclass` cannot be the target of a query, an association, or a foreign key. So:

- No `SELECT e FROM AuditableEntity e` — nothing in this project needs it.
- No `@ManyToOne AuditableEntity` pointing at "any entity" — nothing needs it.
- No repository over the base type — the reference's `AbstractEntityDao` has no equivalent here,
  and shouldn't.

**This project also removes the one structural reason JOINED is ever forced**: identifiers here are
application-assigned UUIDs, not database-generated. There is no need to insert into a root table to
learn the key.

### PersonCase

Because `AuditableEntity` is a `@MappedSuperclass` rather than a hierarchy root, `PersonCase`'s
`@EmbeddedId` is no obstacle — it extends `AuditableEntity` like everything else and inherits the
audit columns into its own table. This is strictly better than the reference, whose composite-key
join entities get no audit trail at all, and it is what lets FR-028 hold without exception.

### Interaction with Lombok

`@Builder` on each concrete entity uses that class's own `@AllArgsConstructor`, which does not
include `@MappedSuperclass` fields. That is exactly right — audit fields and `version` are
system-populated and must not be settable through the builder (FR-023).

**Alternatives considered**:
- *JOINED inheritance as the reference has it* — costs above, benefits unused.
- *`SINGLE_TABLE` inheritance* — one table, no joins, but forces every entity in the application
  into one physical table with every column nullable. Worse than either option.
- *Repeating the five fields and the `@EntityListeners` annotation on each entity* — no join cost,
  but auditing becomes opt-in per type, failing FR-028; a new entity silently gets no audit trail.

---

## R4 — Transaction handling: plain `@Transactional`, no `TransactionalOperationsUtil`

**Decision**: `@Transactional` directly on `AbstractEntityCrudService`'s public methods
(`saveOrUpdate`, `delete` read-write; `findById`, `findAll` with `readOnly = true`).

**Rationale**: The reference routes every write through a `TransactionalOperationsUtil` callback.
That indirection exists to escape Spring's self-invocation limitation — an `@Transactional` method
called from within the same bean bypasses the proxy. That does not arise here: the public CRUD
methods are invoked by the controller, a different bean, so the proxy applies normally. The protected
hooks (`beforeSave`, `innerSave`, `innerDelete`, `innerFindAll`, `findEntityById`) *are*
self-invoked, but they must run inside the caller's transaction, not start their own.

**Constraint to respect**: `spring.jpa.open-in-view: false`. Entity → response conversion must happen
**inside** the service transaction. `AbstractEntityCrudService` therefore returns response records,
never entities, and the controller does no conversion. This also removes a latent trap in today's
code: `RuleController.get` calls `RuleResponse.from(...)` outside the transaction, which works only
because `findWithCaseById` uses an `@EntityGraph` — any future lazy field added to `RuleResponse`
would throw.

**The trap this leaves, stated so it is not rediscovered**: because the hooks are invoked by `this`,
`@Transactional` on an override is **silently ignored** — no warning, no error, and a hook annotated
`REQUIRES_NEW` runs in the caller's transaction regardless. `PersonCrudService.innerDelete` is where
someone will eventually want it ("the link cleanup should be its own transaction"). It cannot be, in
that position. A hook that genuinely needs its own transaction has to move to a separate bean.

**On the reference's `TransactionHandler` / `TransactionalOperationsUtil` specifically** (reviewed
2026-08-30): the mechanism is sound — the call reaches a different bean, so the proxy applies — but
the two classes are the same pattern twice (`TransactionalInvokeAction<T>` is `Supplier<T>` renamed),
and both are a weaker `TransactionTemplate`: no `TransactionStatus` (so no `setRollbackOnly()`, only
throwing), no `readOnly`, no isolation or timeout, and no void form. `readOnly` is the loss that
costs something real — it is what lets Hibernate skip dirty-checking on a read path. And
`runInNewTransaction` invites a pool deadlock if it is ever called in a loop, since `REQUIRES_NEW`
holds the outer connection while taking a second.

**Alternatives considered**: `TransactionTemplate` — the right tool if a programmatic boundary is
ever needed here, and the reason not to hand-roll one; `@Transactional` on the controller (mixes web
and persistence concerns, and widens the transaction to cover JSON serialisation).

---

## R5 — No unpaged list endpoint

**Decision**: `GET /api/v1/{resource}` is the paged listing. There is no unpaged `findAll`.

**Rationale**: The reference exposes both `GET /findAll` and `GET /findAll/listPageable`. Applied
here, `GET /api/v1/persons/findAll` would serialise the entire person population in one response —
contradicting FR-005 and the pagination discipline this codebase already enforces (see the
`CaseFile` javadoc explaining why the `personLinks` collection was removed, and
`RuleController.pageable`'s clamping comment).

FR-001 lists "list all" as an operation; it is satisfied by the paged listing called with default
parameters. The operation exists, it is simply always bounded.

**Total ordering**: every `Pageable` gets the record's identifier appended as a final sort key before
reaching the repository. LIMIT/OFFSET over a non-unique sort lets rows repeat or vanish between pages
— the spec's "unstable paging order" edge case, and already a documented concern in
`PersonCaseRepository`.

---

## R6 — Timestamps from Hibernate, actors from Spring Data

**Decision**: `@CreationTimestamp` / `@UpdateTimestamp` (Hibernate) for `createdAt` / `updatedAt`;
`@CreatedBy` / `@LastModifiedBy` (Spring Data) for `createdBy` / `updatedBy`, enabled by
`@EnableJpaAuditing` and an `AuditorAware<String>` bean.

**Rationale**: The reference uses Spring Data's `@CreatedDate` / `@LastModifiedDate`, but this
codebase has standardised on the Hibernate annotations (`Rule.createdAt`/`updatedAt`,
`Person.createdAt`, `CaseFile.openedAt`, `PersonCase.linkedAt`), and changing that would churn
working code for no gain. Spring Data's `AuditingEntityListener` populates whichever auditing
annotations it finds — the actor fields work with its own date annotations absent.

**Only the Spring Data listener registers this way**: `AuditableEntity` carries
`@EntityListeners(AuditingEntityListener.class)`, which is what populates the actor fields. An
earlier draft of this decision also listed `AuditTrailListener` there; that was wrong and is
superseded by R10 — it is a Hibernate event-SPI listener registered on the `EventListenerRegistry`,
because a JPA callback cannot see the before/after values that FR-020's field-level delta needs.

**DDL defaults — superseded 2026-08-30**: this decision originally added `updated_at`,
`created_by`, `updated_by` in a `V2` as nullable-with-a-temporary-default, backfilled them, set
`NOT NULL`, then dropped the default; and it explicitly left the `DEFAULT now()` that `V1__init.sql`
put on `created_at` as "a separate cleanup, out of scope". That exemption was the wrong call — it
left five timestamp columns (`person.created_at`, `case_file.opened_at`, `person_case.linked_at`,
`rule.created_at`, `rule.updated_at`) with a database default contradicting the Hibernate
annotations this very decision chose, which Principle V forbids outright.

The schema is now written from scratch as a single rewritten `V1__init.sql` baseline
(data-model.md §4), so **no** timestamp column carries a DDL default and there is no backfill to
make one temporarily necessary. `version`, `enabled` and `deleted` keep their defaults: they are
state columns, not timestamps, and a hand-written `INSERT` from psql should land in a valid state.

**Actor when unauthenticated**: this service has no security layer. `SystemAuditorAware` returns the
literal `"system"`, satisfying FR-026's requirement for an explicit value rather than a blank. When
authentication arrives, only that one bean changes.

---

## R7 — Composite identifiers in a generic contract

**Decision**: `CrudController` maps `GET|DELETE /{id}` with `ID` bound by a registered Spring
`Converter<String, ID>`. `PersonCaseIdConverter` parses `"<personUuid>:<caseUuid>"` into a
`PersonCaseId`.

**Rationale**: FR-011 requires the person-to-case link to use the same contract as everything else,
and FR-002 requires identical path structure. Overriding the id-bearing endpoints in
`PersonCaseController` with a two-path-variable signature would leave the inherited mapping active
and produce an ambiguous-mapping failure at startup. Converter-based binding keeps exactly one
mapping per operation and puts composite handling in a single testable class.

**Alternatives considered**: a `/{personId}/{caseId}` special case (breaks FR-002 and the inherited
mapping); a synthetic surrogate key on `person_case` (a schema change discarding a correct natural
key to work around a framework detail).

---

## R8 — Summary vs. detail as Jackson views

**Decision**: two view markers, `Vms.Summary` and `Vms.Detail extends Vms.Summary`, declared once.
`CrudController.findAll` is annotated `@JsonView(Vms.Summary.class)`; `findById` and `saveOrUpdate`
are annotated `@JsonView(Vms.Detail.class)`. Every resource inherits both.

**Rationale**: the reference distinguishes the two forms with a boolean parameter
(`convertToVM(entity, includeChildren)`) evaluated at each call site — so the depth decision is
repeated, imperatively, everywhere a conversion happens. A view moves that decision to the endpoint
declaration and, because the endpoints are on the shared base class, states it exactly once for the
whole API.

**Field allocation**:

| Type | `Vms.Summary` | `Vms.Detail` adds |
|---|---|---|
| `PersonVm` | `id`, `version`, `type`, `name`, `age`, `city`, `risk` | `nationalId`, audit metadata, first page of `caseLinks` |
| `CaseFileVm` | `id`, `version`, `type`, `title`, `status`, `openedAt` | `ruleId`, first page of `linkedPersons` + `linkedPersonCount`, audit metadata |
| `RuleVm` | `id`, `version`, `type`, `caseId`, `name`, `enabled`, `updatedAt` | `condition`, audit metadata |
| `PersonCaseVm` | `id`, `version`, `type`, `personId`, `caseId`, `role`, `linkedAt` | `person`, `caseFile` (summary views), audit metadata |

**Where a view is not enough.** A view controls *serialisation*, not *loading*. Child collections
must not be fetched at all for a list, so the mapper exposes two methods — `toVm(E)` and
`toVmWithChildren(E)` — and `AbstractEntityCrudService` calls the first from `findAll`, the second
from `findById`. This is the one place the two depths differ in code rather than in annotation, and
it is what keeps `CaseFile`'s unbounded link relation off the list path.

**Children are paged, never fully materialised**: the detail view embeds the *first page* of linked
persons via `PersonCaseRepository.findByCaseFileId(caseId, firstPage)`, plus a total count. This is
what the spec's "detail form with very many children" edge case requires, and why `CaseFile` has no
mapped `personLinks` collection to begin with.

---

## R9 — Concurrency and error mapping

**Decision**: `@Version private int version` on `AuditableEntity` (column `INTEGER`), echoed on
every VM. A save carrying a stale version fails with `ObjectOptimisticLockingFailureException`,
mapped to **409 Conflict**.

**Primitive, not `Integer`.** A nullable wrapper makes Hibernate read `null` as "transient", which
in a save-or-update flow risks an INSERT where an UPDATE was meant. With a primitive, a VM that
omits `version` deserialises to `0` — correct for a create, and safely stale for an update.

**`@Version` alone does not catch a stale client — this is the part that needs code.** The mapper
loads the managed entity by id and mutates it, so Hibernate compares the *freshly loaded* version
against the database at flush. Those always agree inside one transaction, and no conflict is ever
raised. Hibernate's `@Version` protects against a concurrent write landing between load and flush;
it does not protect against a client that read the record ten minutes ago.

`AbstractEntityCrudService.saveOrUpdate` therefore compares explicitly, before applying any change:

```java
if (vm.id() != null && vm.version() != entity.getVersion()) {
    throw new ObjectOptimisticLockingFailureException(entityName(), vm.id());
}
```

The `@Version` column still earns its place — it is what makes the client's token meaningful, and it
covers the narrow load-to-flush window that the explicit check cannot see. The two guards are
complementary, and the spec's "concurrent updates" edge case needs both.

**New `GlobalExceptionHandler` mappings**:

| Exception | Status | Error code |
|---|---|---|
| `RecordNotFoundException` (and existing `RuleNotFoundException`) | 404 | `RECORD_NOT_FOUND` / `RULE_NOT_FOUND` |
| `ObjectOptimisticLockingFailureException` | 409 | `CONCURRENT_MODIFICATION` |
| `DataIntegrityViolationException` | 409 | `CONSTRAINT_VIOLATION` |
| `SortFieldNotAllowedException` | 400 | `INVALID_SORT_FIELD` |
| `DeletionNotSupportedException` | 405 | `DELETION_NOT_SUPPORTED` |
| `jakarta.persistence.EntityNotFoundException` | 404 | `RECORD_NOT_FOUND` |

`EntityNotFoundException` needs an explicit mapping: with `@SoftDelete` on `Person`, resolving a lazy
`PersonCase.person` proxy for a soft-deleted person throws it, and without a handler that surfaces as
an opaque 500. (R1's link cleanup is what should prevent it arising; the mapping is the backstop.)

`DeletionNotSupportedException`'s message names the alternative — "close the case by setting
status=CLOSED" — so the 405 is self-documenting.

**Sort field validation**: each mapper declares its allowed sort fields; a request naming anything
else is rejected with 400 rather than silently reordered. For `Person` the allowed set derives from
`PersonFieldRegistry`, so the sort vocabulary and the rule-condition vocabulary cannot drift apart.

---

## R10 — Audit entries are a persisted table, written before commit in the same transaction

**Decision** (2026-08-30, reversing the log-only assumption): one `audit_entry` table holding every
lifecycle change across all four record types, written by a Hibernate event listener whose payload is
persisted in a **separate transaction after the business transaction commits**, and read back through
a paged, read-only endpoint.

### Why a single table and not Envers

Hibernate Envers is the obvious candidate and was rejected on two counts.

- **The compliance question is cross-record.** US3's reviewer asks "which records were created,
  changed, or removed, by whom, in this window" — one `ORDER BY occurred_at` over one table. Envers
  models it as `person_aud`, `case_file_aud`, `rule_aud`, `person_case_aud` and `revinfo`, so the
  same question is a five-way union through the revision table. Envers is built for "what did *this
  row* look like on date D", which is the narrower half of what is needed here.
- **Envers snapshots every audited column by default**, so `person.national_id` lands in
  `person_aud` unless someone remembers `@NotAudited`. That is precisely the default-inclusion
  posture constitution Principle IV exists to reject: "a new column leaks the day it is added". A
  purpose-built entry with an explicit redaction step fails closed instead.

Cost accepted: no free "reconstruct the entity as of revision N" API. Replay is
create-entry-plus-subsequent-deltas, which SC-008's wording ("reconstruct the full change history")
asks for and which the ordering column makes deterministic.

### Why the Hibernate event SPI and not `@PostUpdate`

The original design used JPA `@PostPersist` / `@PostUpdate` / `@PostRemove` callbacks. **A JPA
callback cannot produce before/after values** — it receives the entity in its new state and nothing
else. Hibernate's `PostUpdateEventListener` receives `getOldState()`, `getState()`,
`getDirtyProperties()` and the persister's property names, which is the only supported way to get
the delta without hand-diffing a snapshot taken on load. `AuditTrailListener` therefore implements
`PostInsertEventListener` / `PostUpdateEventListener` / `PostDeleteEventListener` and is registered
through the `EventListenerRegistry`.

This also settles the soft-delete labelling question the earlier draft got backwards: a
`@SoftDelete` removal is a *delete* event that emits an `UPDATE` statement, so it arrives at
`onPostDelete`, not `onPostUpdate`. No `deleted`-transition sniffing is needed.

### Why before commit, in the same transaction

**Amended 2026-08-30, and FR-027 was reversed with it.** The first draft used
`@TransactionalEventListener(phase = AFTER_COMMIT)` with `REQUIRES_NEW`, honouring FR-027 as
originally written ("an audit failure must not fail the business operation"). That is unshippable
here, because it contradicts SC-008 and SC-005: after-commit recording leaves a window in which a
managed record changed and no audit entry exists, and a compliance trail with silent holes is worth
less than no claim of completeness at all. US3's reviewer is investigating a **disputed** decision —
"the change went through but we have no record of it" is the single worst answer to give them.

FR-027's original form came from an era when the audit destination was a log stream, where "don't
let logging break the application" is correct. It does not survive the move to a persisted
compliance store, so the requirement changed rather than the design.

**Mechanism**: the listener still only *publishes* a Spring application event — persisting from
inside `PostInsertEventListener` would re-enter the `EntityManager` mid-flush and collide with the
in-progress action queue. `AuditEntryRecorder` consumes it at
`@TransactionalEventListener(phase = BEFORE_COMMIT)`, which runs after the business flush and before
the commit, **in the same transaction**. No `REQUIRES_NEW`, and no catch-and-swallow: if the audit
insert fails, everything rolls back, which is now the specified behaviour.

`entityVersion` is correct at that point because the business flush has already incremented it, and
`AuditEntry` is deliberately not an `AuditableEntity`, so persisting it fires no further events.

**What this costs**: the business transaction is marginally longer and holds its row locks a little
longer. At this scale that is not measurable. **What it buys**: SC-005's "100%" becomes literally
true, and SC-008's replay can never encounter a missing link in the chain.

**Alternatives rejected.** A *transactional outbox* is the standard answer to "atomic with the
business transaction, delivered to an external system" — but the destination here is a table in the
same database, so an outbox degenerates into this same transaction with extra machinery. It becomes
the right pattern the day audit is shipped to Kafka or an external SIEM. *Postgres triggers* would
give atomicity that even raw SQL cannot bypass, but have no access to the application's actor
without threading it through a session variable, and put audit logic somewhere nothing else in this
codebase lives.

### Entity-listener beans

`AuditTrailListener` needs an `ApplicationEventPublisher` injected. This works because Spring Boot
sets `hibernate.resource.beans.container` to `SpringBeanContainer`, which is the same mechanism that
lets Spring Data's `AuditingEntityListener` reach its `AuditingHandler`. Without it the listener is
instantiated by Hibernate with a no-arg constructor and every injected field is null.

### `AuditEntry` is not an `AuditableEntity`

It carries no `version`, no `updatedBy`, and is `@Immutable` and insert-only (FR-030). Extending the
audited base class would also make the audit table audit itself on every insert.

---

## Spec amendments required

R1 narrows two requirements written before the deletion decision. Neither is a contradiction to
resolve in code — the spec text should be updated to match:

| Requirement | Written as | Should become |
|---|---|---|
| **FR-001** | every record type exposes create, read, list, page, update, **delete** | delete is an *optional* operation; a type that declines it returns 405 naming its retirement mechanism |
| **FR-008** | deletion retains the record and hides it from all reads | applies to `Person`; `PersonCase` is hard-deleted; `CaseFile` and `Rule` are retired via `status` / `enabled` and expose no delete |

US1's acceptance scenario 7 ("delete it and then request it again → no longer retrievable") holds for
`Person` and `PersonCase`, and should be scoped to those two.

---

## Open items carried into Phase 2

1. ~~**`CaseStatus` transitions are unconstrained.**~~ **Closed** — decided 2026-08-30: reopening is
   **permitted**, through a plain save like any other field change. No `beforeSave` gate, no
   dedicated `/reopen` endpoint (which would have broken FR-002's uniformity). Blocking `CLOSED →
   OPEN` would make a mis-clicked close unrecoverable, and unlike deletion, retirement by status is
   meant to be reversible. Recorded in spec.md Assumptions and asserted by T035a.
2. ~~**`.specify/memory/constitution.md` is an unfilled template.**~~ **Closed** — the constitution
   was ratified at v1.0.0 on 2026-08-30 and plan.md's Constitution Check has been re-run against it.
   Two amendments fell out of that gate: FR-001 no longer names an unpaged "list all", and `PersonVm`
   gains `caseLinkCount` so its detail children are a first page plus a total.
