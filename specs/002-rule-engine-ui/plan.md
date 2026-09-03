# Implementation Plan: Rule Condition Engine UI

**Branch**: `002-rule-engine-ui` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-rule-engine-ui/spec.md`

## Summary

Build the browser application the service has never had: a React + TypeScript client in `ui/`,
served from the Spring Boot jar's own origin, covering rule authoring with dry-run preview, scoped
evaluation, the uniform four-record management surface, the case workspace, and the read-only audit
trail.

It adds no API capability. Three decisions carry the design:

1. **Same origin, so the CORS prerequisite dissolves.** `ui/dist` is copied into
   `target/classes/static` by a non-default `ui` Maven profile; Vite proxies `/api` in development.
   The specification calls cross-origin access a hard prerequisite the interface cannot work around
   — serving from the service's own origin means there is no cross-origin request to permit, rather
   than a blocker deferred to a later change (research [R2](./research.md#r2--where-the-ui-is-served-from-and-the-cors-prerequisite),
   [R3](./research.md#r3--how-the-built-assets-reach-the-jar)).

2. **A client field catalog, validated against the server at start-up.** `GET /api/v1/rules/fields`
   publishes names only, but FR-002/003/004 need types, operators and enum values. The specification
   prescribes exactly this stopgap. The catalog is *derived*, not guessed: an operator is offered
   only if it survives both `FieldDescriptor.requireCompatible` **and** `FieldDescriptor.coerce`.
   That distinction is load-bearing — `isOrdered()` is true for `String` and `Instant`, so
   `name > 30` and `createdAt BETWEEN …` pass the compatibility gate and die in coercion. Gating
   ordered operators on `isNumeric()` instead is what makes SC-002's "zero rejections from the
   builder" achievable (research [R4](./research.md#r4--the-field-metadata-gap-specification-dependency-2),
   [contracts/field-catalog.md](./contracts/field-catalog.md)).

3. **The error code is the contract.** One exhaustive map over the sixteen codes
   `GlobalExceptionHandler` emits, with TypeScript making an unhandled code a compile error.
   `message` is display detail, never matched on. The two ambiguous codes are disambiguated by the
   request in flight and by `CaseFileVm.ruleId` — never by message text (research
   [R7](./research.md#r7--failure-presentation-fr-039)).

Two limitations are inherited from the API and stated plainly rather than papered over: a case with
more than twenty linked persons has no route to the twenty-first (spec dependency #3), and
`PUT /rules/{id}/condition` carries no optimistic-lock token, so condition edits are last-write-wins.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 24 (frontend); Java 25 unchanged (backend, packaging
only)

**Primary Dependencies**: React 19, Vite 7, TanStack Query v5, `lossless-json`. Dev/test: Vitest,
React Testing Library, MSW, ESLint, `typescript-eslint`. Backend build: `frontend-maven-plugin` and
`maven-resources-plugin`, both inside a non-default `ui` profile.

**Storage**: None client-side. No `localStorage`, no `sessionStorage`, no IndexedDB, no persisted
query cache — FR-043 forbids retaining the national identifier, and nothing else needs persisting.
Server-side storage is untouched: **no Flyway migration, no entity change, no schema change.**

**Testing**: Vitest + React Testing Library + MSW, handlers built from response bodies captured from
a running service. Backend `mvn verify` must pass unchanged. No end-to-end browser suite (research
[R10](./research.md#r10--testing-approach)).

**Target Platform**: Evergreen desktop browsers, served from the Spring Boot jar at the service's
own origin; Vite dev server with an `/api` proxy in development.

**Project Type**: Web application — an existing single-module Spring Boot service plus a new
sibling Node frontend module.

**Performance Goals**: No view issues more than one page request per collection to render itself, at
any population size (SC-006). Totals always come from `PageResponse.totalElements`, never from
counting fetched rows. Preview and rule runs are user-initiated only — never on keystroke, never on
an interval.

**Constraints**:
- Page size is clamped server-side to `[1, 500]`, silently; the UI renders the applied `size`, never
  the requested one.
- Sort is one field, from a per-resource allow-list; the UI must be structurally unable to construct
  another (contract §1.2).
- Every update carries `id` + the `version` that was read; a 409 preserves the user's input.
- `fail-on-unknown-properties: true` — a field outside a VM's declared set is a 400, not an ignore.
- `nationalId` exists in exactly one response and therefore in exactly one client type.
- Condition-tree payloads are parsed and serialised losslessly (`NumberValue` is a `BigDecimal`).
- Structural budgets (depth 8, 128 nodes, 500 list entries) are **not** mirrored client-side; the
  server owns them and its rejection names which one was exceeded.

**Scale/Scope**: ~14 screens across 5 user stories; 46 functional requirements; 4 record types plus
the audit trail; 8 catalog fields × 14 operators; 16 failure codes. Backend delta: one `pom.xml`
profile and one `WebMvcConfigurer` — no Java source under `api/`, `service/`, `domain/`, `rule/` or
`audit/` is modified.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution governs a Java service; four of its five principles constrain server behaviour this
feature does not touch. That is not a free pass — the useful question for a client is whether it
*undermines* each principle from the outside, and that is how each gate below is evaluated.

### Pre-Phase 0

| Principle | Verdict | Basis |
|---|---|---|
| **I. Bounded Reads, Computed in the Database** | **PASS** | Every listing is consumed a page at a time. Totals come from `PageResponse.totalElements`. No view fetches a second page to render or count (SC-006). Preview and runs are user-initiated, so the client never turns one analyst into a load generator. |
| **II. Validate at the Earliest Decidable Point** | **PASS**, and extends it | The builder is the earliest decidable point for operator/value pairing, `NOT` arity, empty groups and inverted ranges — the same checks `ConditionNode`, `GroupNode` and `RangeValue` make, moved one layer earlier. Client validation **mirrors, never replaces**: every rejection that gets through is presented, not suppressed. |
| **III. Client-Supplied Names Are Allow-Listed** | **PASS** | The UI cannot originate a name. Fields come from the catalog, validated against `GET /rules/fields` at start-up; sort keys come from a per-resource allow-list; `nationalId` is absent from the catalog and stays absent. The client is a second gate in front of the registry, never a bypass. |
| **IV. Responses Are Declared, Never Incidental** | **PASS** | Summary and detail are separate TypeScript types, so reading `nationalId` from a list row is a compile error. Server-owned fields are `readonly` and never sent. The UI adds no field of its own to any request body. |
| **V. Schema by Migration, Verified Against Real Postgres** | **N/A** | No schema, no migration, no entity, no persistence code. Backend tests run unchanged against Testcontainers Postgres. |

**Additional gates from the constitution's binding settings and workflow**:

- `open-in-view: false`, `fail_on_pagination_over_collection_fetch`, virtual threads, `rule-engine`
  guardrails: untouched. No guardrail is raised to accommodate this client — the UI adapts to the
  budgets and reports them (FR-012).
- **No authentication is invented** (FR-045). The constitution records the absence as acknowledged
  debt; a sign-in screen in front of an unauthenticated API would misrepresent an audit trail whose
  actor is always `system`. The audit view says so.
- **New files are `git add`-ed the moment they are created.**
- **Definition of done**: `mvn verify` passes unchanged, plus `npm run typecheck && npm run lint &&
  npx vitest run` in `ui/`. Contract-level behaviour is asserted by tests, not by manual `curl`.

**Gate result: PASS.** No violation to justify; Complexity Tracking stays empty.

### Post-Phase 1 re-check

Re-evaluated against the artifacts actually produced. **Still PASS.** Three design decisions were
reviewed specifically because they touch a principle:

1. **Serving the UI from the Spring Boot jar** adds a `WebMvcConfigurer` and a Maven profile. This
   is hosting, not API capability: no endpoint, field, validation rule or response shape changes,
   and no principle is engaged. It does depart from the specification's "adds no backend capability"
   framing, which is a deliberate, user-approved trade recorded in research
   [R2](./research.md#r2--where-the-ui-is-served-from-and-the-cors-prerequisite) — and it *removes*
   a security decision (which origins may call an unauthenticated API) rather than adding one.
   The forwarding rule must exclude `/api/**`, or a 404 from the API would render as HTML and defeat
   FR-039; `quickstart.md` asserts both halves.
2. **The client field catalog duplicates server-side truth**, which is drift risk against Principle
   III. It is mitigated, not ignored: start-up set-equality against `GET /rules/fields` turns an
   added or removed field into a blocking configuration error naming the field. The residual gap —
   a field *retyped* under the same name — is recorded in
   [contracts/field-catalog.md §4](./contracts/field-catalog.md#4-start-up-validation-spec-dependency-2)
   with publishing the metadata server-side named as the real fix. The specification itself
   prescribes this stopgap.
3. **Lossless number handling** was added on Principle II grounds: `JSON.parse` would silently
   re-round a `BigDecimal` operand, so a tree opened and saved unchanged would not be the tree that
   was stored (FR-013, SC-010). With today's registry (`age`, an `Integer`) nothing observably
   breaks, which is precisely why it is decided now rather than discovered later.

**Complexity Tracking: empty.** No principle is violated and no complexity requires justification.

## Project Structure

### Documentation (this feature)

```text
specs/002-rule-engine-ui/
├── plan.md                      # This file
├── research.md                  # Phase 0 — R1..R11, all NEEDS CLARIFICATION resolved
├── data-model.md                # Phase 1 — wire types, condition tree, client-only state
├── contracts/
│   ├── api-contract.md          # Phase 1 — the consumed API surface, pinned
│   └── field-catalog.md         # Phase 1 — the derived catalog and its start-up check
├── quickstart.md                # Phase 1 — runnable validation scenarios
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md                     # /speckit-tasks output — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
rule-condition-engine/
├── pom.xml                          # + non-default `ui` profile (frontend-maven-plugin,
│                                    #   maven-resources-plugin → target/classes/static)
├── .github/workflows/ci.yml         # + parallel `ui` job (Node 24, working-directory: ui)
├── .github/dependabot.yml           # + npm ecosystem for /ui
├── src/main/java/com/eliezer/ruleengine/
│   ├── config/
│   │   └── SpaForwardingConfig.java # NEW — forwards non-/api/** GETs to /index.html
│   └── …                            # UNCHANGED: api/, service/, domain/, rule/, audit/, repository/
├── src/main/resources/              # UNCHANGED — no migration, no application.yml change
└── ui/                              # NEW Node module
    ├── package.json                 # scripts: dev, build, typecheck, lint, test
    ├── vite.config.ts               # /api → http://localhost:8080 dev proxy
    ├── index.html
    └── src/
        ├── api/
        │   ├── client.ts            # base URL (R11), lossless JSON on tree-carrying routes (R5)
        │   ├── types.ts             # summary/detail types per data-model.md §1
        │   ├── errors.ts            # the sixteen-code exhaustive map (R7)
        │   └── queries.ts           # TanStack Query keys, paging, supersession (R6)
        ├── rules/
        │   ├── catalog.ts           # the eight entries + start-up validation (R4)
        │   ├── tree/                # recursive builder: group, condition leaf, unary leaf,
        │   │                        #   value controls per operand shape
        │   ├── PreviewPanel.tsx     # count + first page + staleness (FR-008, FR-009)
        │   └── MatchesView.tsx      # scope selection + paged matches (FR-014..FR-018)
        ├── records/                 # one generic list/detail/edit shell, four configurations
        ├── cases/CaseWorkspace.tsx  # US4
        ├── audit/AuditTrailView.tsx # US5
        ├── ui/                      # empty states, failure banners, paging, live regions
        └── test/                    # MSW handlers from captured bodies, shared fixtures
```

**Structure Decision**: `ui/` is a Node module at the repository root, a sibling of `pom.xml` and
`.github/` — the layout this project's CI standard already fixes for a frontend, together with Node
24, npm, and the `typecheck` / `lint` / `test` / `build` script names its `ui` job invokes. It is
deliberately **not** a Maven module: converting the single-module build into a reactor would move
every backend source file to make room for an aggregator pom, a large diff for no functional gain.
Maven only consumes `ui/dist`, and only under `-Pui`, so the default build and the CI Java job need
no Node at all (research [R1](./research.md#r1--frontend-stack-and-module-placement),
[R3](./research.md#r3--how-the-built-assets-reach-the-jar)).

Backend source is otherwise untouched: exactly one new Java file, whose only job is to stop a
client-side route 404-ing on reload.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The Constitution Check passes at both gates, and the three decisions that warranted
scrutiny (§ Post-Phase 1 re-check) are recorded there with their mitigations rather than deferred to
this table.
