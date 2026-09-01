<!--
SYNC IMPACT REPORT
==================
Version change: (unversioned template) → 1.0.0
Bump rationale: MAJOR/initial. The file was the unfilled scaffold — every principle was a
  [PRINCIPLE_N_NAME] placeholder — so this is the first ratified version, not an amendment.
  plan.md for 001-crud-audit-viewmodel-api recorded its Constitution Check as "PASS by vacancy,
  not by compliance"; this closes that gap.

Modified principles:
  - [PRINCIPLE_1_NAME] → I. Bounded Reads, Computed in the Database
  - [PRINCIPLE_2_NAME] → II. Validate at the Earliest Decidable Point
  - [PRINCIPLE_3_NAME] → III. Client-Supplied Names Are Allow-Listed
  - [PRINCIPLE_4_NAME] → IV. Responses Are Declared, Never Incidental
  - [PRINCIPLE_5_NAME] → V. Schema by Migration, Verified Against Real Postgres

Added sections:
  - Technology and Data Constraints (was [SECTION_2_NAME])
  - Development Workflow and Quality Gates (was [SECTION_3_NAME])
  - Governance (rules filled in)

Removed sections: none.

Provenance: principles were derived from conventions already enforced in the codebase, not
  invented. Each carries its evidence inline so compliance is checkable against source.

Deferred items:
  - TODO(AUTHZ_PRINCIPLE): no authentication or authorization layer exists, so Principle III
    governs only field-name and payload-shape exposure. When an authn/authz layer lands, this
    constitution needs a principle covering identity, tenancy, and per-record access — a MINOR
    bump at minimum. Tracked in README "Known gaps".
-->

# Rule Condition Engine Constitution

## Core Principles

### I. Bounded Reads, Computed in the Database

Filtering, counting, ordering, and pagination MUST happen in Postgres. No code path may load a
collection and reduce it in memory, and no endpoint may return an unbounded collection.

- Every listing MUST be paged. There is no unpaged list operation, publicly or internally.
- The server MUST clamp a client-supplied page size to `rule-engine.max-page-size` and apply
  `rule-engine.default-page-size` when none is given. Clamping is silent, never an error.
- Every paged query MUST carry a total ordering, so consecutive pages neither repeat nor skip
  rows. A sort on a non-unique column MUST have a unique tiebreaker appended.
- A to-many association MUST NOT be fetch-joined into a paged query
  (`fail_on_pagination_over_collection_fetch` is enabled and MUST stay enabled).
- A detail response containing children MUST return a first page plus a total count, never the
  whole relation.

**Rationale**: an in-memory interpreter over `findAll()` is simpler and wrong at any realistic
population size — no index use, no database-side pagination, and memory proportional to the table
rather than to the result page. `person` and `person_case` are unbounded by design. This is why
`RuleCompiler` emits a `Specification` and why `CaseFile` deliberately holds no `personLinks`
collection.

### II. Validate at the Earliest Decidable Point

Each check MUST live at the earliest layer where it is decidable, and a write MUST be rejected at
write time rather than failing later at read time.

- Shape checks that are locally decidable (operator/value pairing, `NOT` arity, empty groups,
  inverted ranges) belong in the constructor, so they fail during deserialization.
- Whole-tree checks (depth, node count, IN-list size) belong in `RuleTreeValidator`.
- Checks needing schema knowledge (operator versus field type) belong in `FieldDescriptor`.
- Compilability MUST be asserted before a rule is persisted.
- Payload validation MUST run before any entity is touched, and a validation failure MUST name the
  offending fields.

**Rationale**: an unqueryable rule should fail for its author, who can fix it, not for the analyst
running it three weeks later. Deferring a decidable check trades one clear error for an obscure one.

### III. Client-Supplied Names Are Allow-Listed

Any identifier that arrives from outside the process MUST be resolved through an explicit allow-list
that rejects unknown values. It MUST NOT be concatenated into a query, and it MUST NOT fall back to
a default.

- Rule field names resolve through `PersonFieldRegistry`; an unregistered name throws.
- Sort fields resolve through the resource's declared allowed set; an unknown field is a `400`,
  never a silent fallback to arbitrary order.
- Request bodies MUST reject fields the type does not accept rather than ignoring them.
- A field's absence from a registry is a deliberate access decision. `nationalId` is not
  registered, because a direct-identifier lookup behind a free-form rule builder is an enumeration
  oracle.

**Rationale**: the registry is the security boundary of this service. The logical name is only ever
a map key, so an attacker controls which of a fixed set of columns is queried — never the SQL.

### IV. Responses Are Declared, Never Incidental

An API response MUST be a purpose-built representation whose field set is declared. Stored entities
MUST NOT be serialized to clients.

- Payload types MUST be immutable records, not mutable classes.
- Sensitive identifying values MUST be excluded by default, obtainable only through an explicit
  single-record request — never present in a list response or a match result.
- Fields the system owns (identity of authorship, timing, version) MUST be emitted on reads and
  ignored on writes, so a client cannot forge them.
- Where a rule governs response depth or exposure, it MUST be declared in one shared place rather
  than repeated at each call site.

**Rationale**: response shapes that follow the entity drift with every storage change, and default
inclusion means a new column leaks the day it is added. Declaring the shape once makes exposure a
decision rather than an accident.

### V. Schema by Migration, Verified Against Real Postgres

The schema is owned by Flyway. Hibernate validates it and MUST NOT modify it.

- `ddl-auto` MUST remain `validate`. Every schema change ships as a numbered, forward-only Flyway
  migration.
- Audit timestamps MUST come from Hibernate annotations (`@CreationTimestamp` / `@UpdateTimestamp`),
  never from database column defaults and never hand-set in application code. A migration that
  backfills such a column MUST drop its default afterward.
- Behaviourally inert migrations MUST be separated from rollback-sensitive ones, so a problem in
  one does not force reverting the other.
- Tests that touch persistence MUST run against real Postgres via Testcontainers. H2 and other
  substitutes are prohibited: they reproduce neither `jsonb`, `pg_trgm`, partial unique indexes,
  nor Postgres collation, so a green test on a substitute proves nothing about production.

**Rationale**: three of this service's load-bearing mechanisms — the `jsonb` condition tree, the
trigram index behind `CONTAINS`, and partial unique indexes — do not exist on a substitute database.
A single source of truth for timestamps prevents two mechanisms disagreeing about when a row changed.

## Technology and Data Constraints

**Stack**: Java 25 (`maven.compiler.release=25`), Spring Boot 4.1.1, Hibernate ORM 7.x,
PostgreSQL 18, Flyway, Lombok, `hibernate-jpamodelgen`. JUnit 5 with Testcontainers.

**Binding runtime settings** — changing any of these requires the amendment procedure below:

- `spring.jpa.open-in-view: false`. Entity-to-response mapping MUST run inside the service
  transaction; a mapper invoked from a controller throws on any lazy field.
- `hibernate.query.fail_on_pagination_over_collection_fetch: true`.
- `spring.threads.virtual.enabled: true`. Blocking work is acceptable; pinning a virtual thread on
  a synchronized block is not.
- `rule-engine` guardrails (`max-tree-depth`, `max-node-count`, `max-in-list-size`,
  `default-page-size`, `max-page-size`) exist to keep pathological or hostile input away from the
  query planner. They MUST NOT be raised to accommodate a single caller.

**Identifiers**: application-assigned UUID primary keys. Composite keys are supported by the shared
contract through a registered converter, not through a special-case endpoint.

**Known absences that are acknowledged debt, not licence**: there is no authentication or
authorization layer and no multi-tenancy. Until authentication exists, an actor resolves to an
explicit `system` value, never to an empty one. When multi-tenancy arrives it MUST be enforced at
the query level — a base repository or a Hibernate `@Filter` — never by application-layer filtering
after the rows are loaded.

**Credentials**: the values in `docker-compose.yml` and `application.yml` are dev-only defaults and
MUST NOT be used in any shared environment. Credentials, tokens, and sensitive identifying values
MUST NOT appear in logs.

## Development Workflow and Quality Gates

**Feature flow**: `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` →
`/speckit-analyze` → `/speckit-implement`. A feature's artifacts live under `specs/<NNN>-<slug>/`.

**Constitution Check**: every `plan.md` MUST evaluate against this document twice — before Phase 0
research and again after Phase 1 design. A plan that cannot pass MUST record the violation in its
Complexity Tracking table with (a) why the complexity is needed and (b) which simpler alternative
was rejected and why. An unjustified violation blocks the plan.

**Definition of done for a task**:

- `./mvnw verify` passes. Integration tests carry `@Tag("integration")` and run against
  Testcontainers Postgres.
- Contract-level behaviour asserted by a test, not only by manual `curl`.
- Pre-existing suites still pass unchanged unless the change deliberately alters their subject, in
  which case the change is stated explicitly.

**New files MUST be `git add`-ed the moment they are created.** An untracked file is invisible in
the IDE commit panel, gets left out of the commit, and breaks the build for everyone else.

**Reporting**: a failing test is reported with its output. A skipped step is reported as skipped.
Work is called done only when it is done and verified.

## Governance

This constitution supersedes other practices, conventions, and habits in this repository. Where a
code comment, README passage, or prior plan conflicts with it, this document wins and the other
document is corrected.

**Amendment procedure**:

1. Amendments are proposed as a change to `.specify/memory/constitution.md` in its own commit,
   carrying the rationale for the change.
2. The change MUST include an updated Sync Impact Report at the top of this file: version
   transition, principles modified, sections added or removed, and any deferred TODOs.
3. Dependent artifacts (`plan.md` Constitution Checks, `tasks.md` notes) are reconciled in the same
   change or explicitly listed as follow-up.
4. Amendments that remove or redefine a principle require a migration note stating what existing
   code becomes non-compliant and how it will be brought into line.

**Versioning policy** — semantic versioning of governance, not of the artifact:

- **MAJOR**: a principle is removed, or redefined so that previously compliant code is no longer
  compliant.
- **MINOR**: a principle or section is added, or existing guidance is materially expanded.
- **PATCH**: clarification, wording, or typo fixes that change no obligation.

**Compliance review**: compliance is verified at every `plan.md` Constitution Check gate and at code
review. Reviewers check the five principles by name; "it works" is not a compliance argument.
Complexity that survives review MUST be recorded in the plan's Complexity Tracking table so the
next reader inherits the reasoning rather than re-deriving it.

**Runtime development guidance** lives in `README.md` (design decisions and their trade-offs) and
in `CLAUDE.md` where present. Those describe how the system is built; this document constrains what
may be built.

**Version**: 1.0.0 | **Ratified**: 2026-08-30 | **Last Amended**: 2026-08-30
