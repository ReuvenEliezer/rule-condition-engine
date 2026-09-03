# Phase 0 Research: Rule Condition Engine UI

**Feature**: `002-rule-engine-ui` | **Date**: 2026-09-03

Every decision below is grounded in source already in this repository, cited by path. Where the
specification named a backend prerequisite, the entry says what this feature does *instead of*
waiting for it, because the specification's own guidance is that the interface must not assume a
backend change.

---

## R1 — Frontend stack and module placement

**Decision**: React 19 + TypeScript + Vite in a `ui/` directory at the repository root. Node 24,
npm, with `typecheck`, `lint`, `test` (Vitest) and `build` scripts.

**Rationale**: The stack was chosen by the user. The surrounding shape is not a free choice — the
project's CI standard already fixes it: `.github/` sits at the repository root as a sibling of
`pom.xml`, an optional frontend lives in `ui/`, and its CI job runs `npm ci` → `npm run typecheck`
→ `npm run lint` → `npx vitest run --reporter=junit` → `npm run build` under Node 24 with
`cache-dependency-path: ui/package-lock.json`. Naming the directory anything but `ui/` or the
scripts anything but those four would silently fall outside a standard the repository already
follows.

React specifically earns its place on the one screen that is not CRUD: the condition tree is
recursive and arbitrarily nested (bounded at depth 8, `application.yml`), which is a recursive
component rendering itself — the thing component models are best at.

**Alternatives considered**:
- *Vue 3 / Svelte 5*: identical toolchain and CI shape; rejected on ecosystem depth for the
  accessible nested widgets FR-044 requires, not on capability.
- *Maven reactor with `ui/` as a module*: rejected. Converting the existing single-module build into
  a reactor would move every backend source file to make room for a root aggregator pom, a large
  diff for zero functional gain. `ui/` is a Node module built by its own CI job; Maven only needs to
  *consume* its output (R3).

---

## R2 — Where the UI is served from, and the CORS prerequisite

**Decision**: Same origin. `ui/` builds to `ui/dist`, which is copied into the Spring Boot jar's
`static/` classpath directory at package time. In development, Vite's dev server proxies `/api` to
`http://localhost:8080`.

**Rationale**: Specification dependency #1 calls cross-origin access a hard prerequisite the
interface cannot work around, and no CORS configuration exists (`config/WebConfig.java` registers a
converter and a filter bean, nothing else). Serving the built assets from the service's own origin
*dissolves* the prerequisite rather than deferring it: there is no cross-origin request to permit.
Vite's proxy does the same for development, so no `@CrossOrigin`, no
`CorsConfigurationSource`, and no allowed-origin list has to exist anywhere.

This is the one place the feature touches backend code, and it is hosting, not API capability: no
endpoint, no field, no validation rule, and no response shape changes. The specification's "adds no
backend capability" holds in the sense that matters.

**Alternatives considered**:
- *Separate origin + record CORS as a blocker*: honest but leaves the feature undeployable on the
  day it is finished, and pushes a security decision (which origins may call an unauthenticated API)
  into a later, less-attentive change.
- *Separate origin + add CORS in this feature*: widens scope into the backend's security surface.
  A permissive `CorsConfigurationSource` in front of an API with no authentication (constitution,
  "Known absences") is a worse artifact than no CORS at all.

---

## R3 — How the built assets reach the jar

**Decision**: A non-default Maven profile `ui` in the existing `pom.xml`:
`frontend-maven-plugin` runs `npm ci` and `npm run build` in `ui/` during `generate-resources`;
`maven-resources-plugin` copies `ui/dist` into `${project.build.outputDirectory}/static` during
`prepare-package`. Plus one `WebMvcConfigurer` that forwards unmatched non-`/api/**` GETs to
`/index.html` so client-side routes survive a page reload.

**Rationale**: Profile-gated because the default build must not require Node. The CI Java job runs
`mvn clean install -DskipTests` on a runner that sets up JDK 25 only; making the frontend build
unconditional would break it, and adding Node to the Java job would serialise two independent
failure signals — the exact thing the CI standard's parallel `ui` job exists to avoid. The
deployable artifact is produced with `-Pui`.

Copying to `${project.build.outputDirectory}` (i.e. `target/classes/static`) rather than
`src/main/resources/static` keeps build output out of the source tree, so `ui/dist` is never
committed and `git status` stays clean after a packaging run.

**The forwarding rule is the sharp edge**: a naive catch-all `/**` → `forward:/index.html` swallows
`/api/**` 404s and turns `RECORD_NOT_FOUND` into an HTML page, which would defeat FR-039 for every
not-found path. The forward must be restricted to paths that do not start with `/api/` and do not
name a file extension.

**Alternatives considered**: `spring-boot-maven-plugin` repackaging a separate UI jar dependency —
more moving parts than a resource copy for a single-artifact deployment.

---

## R4 — The field-metadata gap (specification dependency #2)

**Decision**: Ship a **local field catalog** in `ui/`, derived by hand from the server's own
sources, and **validate it against `GET /api/v1/rules/fields` at application start-up**. A mismatch
between the catalog's key set and the server's published names is rendered as a blocking
configuration error, and the rule builder refuses to open. It never degrades silently.

**Rationale**: `RuleController.queryableFields()` returns `List<String>` — names only. FR-002,
FR-003, FR-004 and SC-002 need each field's type, its permitted operators, and its permitted values.
The specification anticipates this exactly and prescribes the stopgap, including the start-up
check. Adding the metadata server-side is a backend change this feature does not make.

**The catalog is not guesswork — it is derived from two methods.** `FieldDescriptor.requireCompatible`
rejects some operator/field pairs, and `FieldDescriptor.coerce` rejects more, *later*. A catalog
built from `requireCompatible` alone would offer operators the service accepts at compatibility
checking and then rejects at coercion — precisely the rejection SC-002 forbids. The two filters
together:

| Registry field (`PersonFieldRegistry`) | `javaType` | Offered operators | Operand shape |
|---|---|---|---|
| `name` | `String` | `EQUALS`, `NOT_EQUALS`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `IN`, `NOT_IN`, `IS_NULL`, `IS_NOT_NULL` | `STRING` / `LIST` |
| `city` | `String` | as `name` | `STRING` / `LIST` |
| `case.title` | `String` (joined) | as `name` | `STRING` / `LIST` |
| `age` | `Integer` | `EQUALS`, `NOT_EQUALS`, `GT`, `GTE`, `LT`, `LTE`, `BETWEEN`, `IN`, `NOT_IN`, `IS_NULL`, `IS_NOT_NULL` | `NUMBER` / `RANGE` / `LIST` |
| `risk` | `RiskLevel` | `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `IS_NULL`, `IS_NOT_NULL` | `STRING` / `LIST`, closed choice of `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `case.role` | `PersonRole` (joined) | as `risk` | closed choice of `SUBJECT`, `ASSOCIATE`, `WITNESS` |
| `case.status` | `CaseStatus` (joined) | as `risk` | closed choice of `OPEN`, `UNDER_REVIEW`, `CLOSED` |
| `createdAt` | `Instant` | `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, `IS_NULL`, `IS_NOT_NULL` | `STRING`, ISO-8601 instant |

Three non-obvious rows, each a trap avoided:

1. **Ordered operators are numeric-only, not `isOrdered()`-only.** `FieldDescriptor.isOrdered()`
   returns true for `String` (Comparable, not an enum), so `requireCompatible` *accepts*
   `age > 30`-shaped conditions on `name`. Coercion then throws
   `Cannot coerce a NUMBER operand onto field 'name' of type String`. The catalog therefore gates
   `GT`/`GTE`/`LT`/`LTE`/`BETWEEN` on `isNumeric()`, which today means `age` alone.
2. **`createdAt` is the same trap**, and it is the specification's documented "time-based conditions
   are not expressible" gap: `isOrdered()` is true for `Instant`, so `BETWEEN` passes compatibility
   and dies in `coerceNumber`. Only exact equality (and `IN`) work, via `Instant.parse` in
   `coerceScalar`.
3. **Enums reject `NUMBER` operands.** `coerceScalar` calls `Enum.valueOf`, so enum fields take
   `STRING` values from a closed set; a numeric operand reaches `coerceNumber` and throws.

**Known limitation, accepted**: the registry publishes no nullability, so `IS_NULL` / `IS_NOT_NULL`
are offered on every field including non-nullable ones (`name`, `age`, `risk`). That produces a rule
that matches nothing, never a rejection — SC-002 concerns rejections, so this is within budget and
is recorded rather than hidden.

**Alternatives considered**: inferring the catalog at runtime by probing the preview endpoint with
throwaway conditions — abusive, slow, and it would author load against the population on start-up.

---

## R5 — Lossless numeric operands

**Decision**: Parse and serialise any payload carrying a condition tree with `lossless-json`
(`GET`/`POST /api/v1/rules`, `PUT /api/v1/rules/{id}/condition`, `POST /api/v1/rules/preview`).
Numeric operands live in builder state as strings and are emitted verbatim. Every other endpoint
uses plain `JSON`.

**Rationale**: `NumberValue` is a `BigDecimal`, explicitly so that "the same node feeds integer
columns (age), bigint columns and monetary/decimal columns". `JSON.parse` turns every number into an
IEEE-754 double, so `10.50` re-serialises as `10.5` and a 19-digit operand loses its tail. FR-013
requires a tree opened and saved unchanged to be byte-for-byte what was stored, SC-010 requires the
UI's tree to equal one posted directly, and the specification's own assumption is that values are
not reformatted on their way to the screen. With today's registry the only numeric field is `age`
(`Integer`, 0–149) so nothing observably breaks — which is exactly why this must be decided now
rather than discovered when a decimal field is registered.

**Alternatives considered**:
- *Plain `JSON` and accept the loss*: correct today, silently wrong the day a `BigDecimal` column is
  registered, and the failure would present as a rule the analyst edited without meaning to.
- *ES2025 `JSON.parse` source-text access in the reviver*: no dependency, but the browser floor
  (Chrome 114, Safari 18, Firefox 138) is not one this feature should impose.

---

## R6 — Server state, request supersession, and preview staleness

**Decision**: TanStack Query v5 for every `GET`. Preview is modelled as a **mutation** whose result
is held next to a hash of the tree that produced it; the shown count is stale whenever that hash
differs from the current tree's.

**Rationale**: FR-042 requires that when several requests are outstanding for a view, only the most
recent one's result renders. TanStack Query gives that per query key for free, together with the
in-flight indicator FR-042 also requires and the `placeholderData` behaviour that keeps a page of
results on screen while the next page loads.

Preview cannot be a query, because FR-009's staleness marking is not cache staleness: a preview is a
`POST` with a body, it must never fire on its own (the specification's assumption — "a UI that
re-ran on every keystroke would turn one analyst into a load generator"), and the requirement is to
mark a *previously returned* count as no longer describing the tree on screen. Comparing a stored
tree hash against the current one states that condition directly, in one boolean.

**Alternatives considered**: a debounced auto-preview query — rejected by the specification's
assumption, and it would make every keystroke a full-population `COUNT`.

---

## R7 — Failure presentation (FR-039)

**Decision**: One exhaustive `Record<ErrorCode, …>` map over the sixteen codes
`GlobalExceptionHandler` can emit, with TypeScript's exhaustiveness checking making an unhandled
code a compile error. The map is keyed on `ErrorResponse.code` only; `message` is rendered as
supporting detail, never matched on.

The sixteen codes, with the status each arrives under:

| Code | Status | Source |
|---|---|---|
| `RULE_NOT_FOUND` | 404 | `RuleNotFoundException` |
| `RECORD_NOT_FOUND` | 404 | `RecordNotFoundException`, `EntityNotFoundException` |
| `DELETION_NOT_SUPPORTED` | 405 | `DeletionNotSupportedException` |
| `INVALID_SORT_FIELD` | 400 | `SortFieldNotAllowedException` |
| `INVALID_ARGUMENT` | 400 | `IllegalArgumentException` |
| `VERSION_REQUIRED` | 400 | `MissingVersionException` |
| `CONCURRENT_MODIFICATION` | 409 | `ObjectOptimisticLockingFailureException` |
| `CONSTRAINT_VIOLATION` | 409 | `DataIntegrityViolationException` |
| `UNKNOWN_FIELD` | 400 | `UnknownFieldException` |
| `INCOMPATIBLE_OPERATOR` | 400 | `IncompatibleOperatorException` |
| `RULE_TREE_TOO_COMPLEX` | 413 | `RuleTreeTooComplexException` |
| `INVALID_RULE` | 400 | `RuleValidationException` |
| `VALIDATION_FAILED` | 400 | bean validation, and unknown-property rejection |
| `MALFORMED_REQUEST` | 400 | unreadable body |
| `AUDIT_RECORDING_FAILED` | 500 | `AuditRecordingException` |
| `RULE_STORAGE_ERROR` | 500 | `RuleSerializationException` |

**Two codes are ambiguous on their own, and are disambiguated by the request in flight, never by
message text:**

- `CONSTRAINT_VIOLATION` carries a fixed generic message. `POST /persons` means a duplicate national
  identifier among live persons (the partial unique index `ux_person_national_id_active`);
  `POST /person-cases` means the link already exists. The UI knows which request it made (FR-028).
- `INVALID_RULE` on `POST /rules` with a null `id` is either "this case already has a rule"
  (`RuleCrudService.beforeSave`) or a tree that failed to compile. **Resolved without message
  matching**: the case's own `ruleId` field settles it. The builder reads `CaseFileVm.ruleId` before
  offering to author, so the one-to-one explanation is normally given *before* the failed create;
  and after an `INVALID_RULE` rejection the case is re-read, a now-present `ruleId` producing the
  FR-010 offer to open the existing rule.

**Rationale**: message text is display-only by the specification's own assumption and may change
without notice. `RULE_TREE_TOO_COMPLEX` (FR-012) is the one code whose message must be surfaced
prominently, since only the message names which of the three budgets was exceeded and its limit.

---

## R8 — Withholding the national identifier (FR-043, SC-004)

**Decision**: `nationalId` is typed only on the person **detail** response. Person detail queries
are configured `gcTime: 0`; the query cache is never persisted to `localStorage`, `sessionStorage`,
or IndexedDB; and no client-side logging path receives a response body.

**Rationale**: The server already withholds it — `PersonVm.nationalId` is `@JsonView(Vms.Detail)`,
and `CrudController.findAll` and both person-returning rule endpoints carry `@JsonView(Vms.Summary)`,
so it is absent from listings and match results (`ResponseExposureTest` asserts this). The client's
job is not to re-expose what it does receive on the one endpoint that returns it. `gcTime: 0` is
what makes "MUST NOT retain it after that view is closed" true rather than aspirational: the default
five-minute garbage-collection window would keep it in memory long after the view closed.

Typing the summary and detail shapes as **separate TypeScript types** rather than one type with
optional fields is what makes an accidental `person.nationalId` in a list row a compile error.

---

## R9 — Accessibility of the nested builder (FR-044, SC-008)

**Decision**: Nested `<fieldset>`/`<legend>` for groups with ordinary document tab order; native
`<select>` for field, operator and enum-value choices; one `aria-live="polite"` status region per
view for results arriving and saves succeeding, and `aria-live="assertive"` plus
`aria-describedby` wiring for validation failures.

**Rationale**: FR-044 exists because a deeply nested interactive structure is unusable by keyboard
otherwise, and SC-008 requires every builder action to be completable by keyboard alone. A
`role="tree"` widget with roving `tabindex` is the ARIA-canonical answer and is also the one most
often shipped subtly broken; nested fieldsets are natively keyboard-operable, natively announced
with their group nesting, and need no custom key handling. Depth is bounded at 8, so tab distance
stays tractable.

**Alternatives considered**: a `role="treegrid"` builder — richer keyboard model, far more
implementation surface, and nothing in the requirements needs arrow-key navigation.

---

## R10 — Testing approach

**Decision**: Vitest + React Testing Library + MSW (Mock Service Worker), with MSW handlers built
from **captured real response bodies**, not hand-written fixtures. Coverage targets the three things
that are genuinely hard: catalog-driven operator gating (SC-002), condition-tree round-tripping
(FR-013 / SC-010), and the sixteen-code failure map (FR-039 / SC-003). No end-to-end browser suite.

**Rationale**: The CI standard's `ui` job runs `npx vitest run --reporter=junit`, and the constitution's
definition of done requires contract-level behaviour asserted by a test rather than by manual `curl`.
MSW intercepts at the network layer, so the code under test is the real client with its real
serialisation — which is the only way a round-trip test proves anything. Fixtures captured from a
running service (see `quickstart.md`) are what stop the mock drifting from the API it stands in for.

An E2E suite is out of proportion here: it would need a live Postgres, a live service and a browser
runner for assertions that MSW-backed component tests already make, and the CI standard's `ui` job
has a 10-minute budget.

---

## R11 — Configuring the service's location (FR-046)

**Decision**: `const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'`, resolved in exactly
one module that every request goes through.

**Rationale**: FR-046 requires the location to be configuration and not hardcoded. With R2's
same-origin deployment the correct default is a relative path, which is not a hardcoded location at
all — it is "wherever this page came from". `VITE_API_BASE_URL` covers the dev-proxy case and any
future split deployment. A runtime-fetched `config.json` would add a request and a failure mode to
the boot path for a value that is, under R2, always the same.

---

## Resolved / unresolved

Every `NEEDS CLARIFICATION` from the Technical Context is resolved above. Two items remain open by
design, both recorded in the specification and neither blocking:

- **Specification dependency #3** — `/api/v1/person-cases` cannot be filtered by person or case, so
  a case with more than twenty linked persons has no route to the twenty-first. FR-032 is met by
  showing the true `linkedPersonCount` beside the subset and labelling the subset as partial. This
  is the honest dead end the specification predicted, not a defect in this plan.
- **`PUT /api/v1/rules/{id}/condition` carries no optimistic-lock token.** `RuleService.updateCondition`
  loads by id and mutates; there is no `version` on `PreviewRequest` and no staleness check. A
  concurrent condition edit is therefore last-write-wins, unlike every `saveOrUpdate` path. FR-024's
  conflict handling applies to the CRUD routes; the condition route cannot produce
  `CONCURRENT_MODIFICATION` and the UI must not claim it can.
