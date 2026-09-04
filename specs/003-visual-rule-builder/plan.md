# Implementation Plan: Visual Rule Condition Builder

**Branch**: `003-visual-rule-builder` | **Date**: 2026-09-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-visual-rule-builder/spec.md`

## Summary

Turn the rule page into a real visual condition builder: the whole tree rendered as nested,
labelled, bounded containers with a plain-language summary above it, reorderable children,
type-aware value editors, and the rule's name and enabled state edited and saved in the same action
as its conditions.

Three decisions carry the design:

1. **The service publishes the field metadata, derived by executing its own gates.** The one
   backend addition is `GET /api/v1/rules/fields/metadata`, built at start-up from
   `FieldRegistry` by *calling* `FieldDescriptor.requireCompatible` and then
   `FieldDescriptor.coerce` with a type-appropriate probe operand. FR-037's "survives both stages"
   then holds by construction rather than by a second author agreeing with the first. This is what
   lets `ui/src/rules/catalog.ts` and its start-up drift check be **deleted** rather than moved
   (research [R1](./research.md#r1--where-the-published-field-metadata-comes-from),
   [contracts/field-metadata.md](./contracts/field-metadata.md)).

2. **One save, through the route that already carries a version.** The page commits name, enabled
   state and condition in a single `POST /api/v1/rules` with `id` + the `version` read at load —
   one atomic change, one audit entry (SC-009), and a concurrent edit refused rather than
   overwritten. `PUT /rules/{id}/condition` stays in the API for existing callers but stops being
   what the page uses: it carries no version, so a page built on it cannot honour FR-033a
   (research [R7](./research.md#r7--the-single-atomic-save-and-concurrent-edit-detection)).

3. **Reordering is a swap inside an array that is already ordered.** `GroupNode.children` is a
   `List` persisted as a JSON array, so order already round-trips. Up/down moves change that array
   and nothing else — no `position` attribute, no wire change, no drag-and-drop dependency
   (research [R11](./research.md#r11--reordering)).

The backend delta is four files: one new DTO, one new enum, one new service, one method on
`RuleController`, plus a `label` component on `FieldDescriptor` whose existing factories keep their
signatures. **No entity, no column, no index, no migration, and no change to the condition model,
its discriminators or any stored rule.**

## Technical Context

**Language/Version**: Java 25 (`maven.compiler.release=25`) on Spring Boot 4.1.1; TypeScript 5.9 on
Node 24 in `ui/`.

**Primary Dependencies**: unchanged on both sides. Backend: Spring Web, Hibernate 7, Lombok — no new
dependency. Frontend: React 19, Vite 7, TanStack Query v5, `lossless-json`, Tailwind 4,
`lucide-react` — **no new dependency**, and specifically none for drag-and-drop, which is out of
scope.

**Storage**: **No change.** No Flyway migration, no entity change, no schema change. The condition
tree keeps its exact persisted shape including both `type` discriminators; renaming either would
invalidate every stored rule (spec Assumptions). No client-side storage — no `localStorage`, no
`sessionStorage`, no persisted query cache.

**Testing**: JUnit 5 for the metadata derivation (plain unit test — the derivation needs no
database) plus one Testcontainers Postgres integration test (`@Tag("integration")`) for the
endpoint. Vitest + React Testing Library + MSW in `ui/`, with a metadata handler whose body is the
service's real response (research [R14](./research.md#r14--testing-approach)).

**Target Platform**: evergreen desktop browsers served from the Spring Boot jar's own origin; Vite
dev server with an `/api` proxy in development. Unchanged from 002.

**Performance Goals**: the metadata endpoint does no per-request work and no database access — the
list is computed once at start-up from a compile-time-constant registry. The builder issues exactly
two requests to render a rule page (the rule, the metadata), and one to save it. The summary is
recomputed with `useMemo` on the draft, not fetched.

**Constraints**:

- Numeric operands stay strings client-side end to end; `lossless-json` is scoped to the condition
  subtree only, never to whole responses (SC-004).
- Structural budgets (depth 8, 128 nodes, 500 list entries) are **not** mirrored client-side; the
  server's `RULE_TREE_TOO_COMPLEX` message names the budget and is shown as given (FR-029).
- `fail-on-unknown-properties: true` — the save body carries only `RuleVm`'s writable fields.
- Every update carries `id` + the `version` that was read; a refusal preserves the draft (FR-030).
- Field, type, per-field operator and enum data may exist in exactly one place: the server registry
  (SC-008).
- No authentication or authorization is introduced. "Server-owned" means exactly the read-only
  metadata in FR-032; no rule is read-only, including a disabled one (FR-032a).

**Scale/Scope**: 44 functional requirements, 5 user stories, 11 success criteria. Backend delta: 5
files (4 new, 1 modified) plus 1 controller method — no change under `domain/`, `repository/`,
`audit/`, `service/crud/` or `rule/model/`. Frontend delta: ~10 new or rewritten modules in
`ui/src/rules/`, 4 files deleted, 1 new API module. 8 registry fields × 12 comparison operators × 4
value kinds is the whole metadata surface.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Pre-Phase 0

| Principle | Verdict | Basis |
|---|---|---|
| **I. Bounded Reads, Computed in the Database** | **PASS**, with one question carried into Phase 1 | No new query, no listing, no in-memory reduction of a collection. The rule page reads one rule by id and one metadata document. The open question is whether an unpaged metadata array offends "no endpoint may return an unbounded collection" — examined below and again post-design. |
| **II. Validate at the Earliest Decidable Point** | **PASS**, and extends it | The metadata moves the field/operator decision from save time to *choice* time: an operator that would die in coercion is never offered (FR-037). Unclassifiable field types fail at **start-up** (research R2). Client checks mirror server checks and never replace them (FR-028). |
| **III. Client-Supplied Names Are Allow-Listed** | **PASS**, and strengthens it | The client can no longer originate or retain a field name at all — the allow-list *is* the response. The registry stays the security boundary; `nationalId` remains unregistered and therefore unpublished. The metadata is derived from the registry, so a field's absence stays a deliberate access decision. |
| **IV. Responses Are Declared, Never Incidental** | **PASS**, and is the reason for a purpose-built VM | `FieldMetadataVm` is an immutable record with a declared field set. `FieldDescriptor` is **not** serialised: `joinPath`, `attributePath` and `javaType` are withheld, because publishing `caseLinks.caseFile` hands an unauthenticated caller the entity graph for no gain (research R4). Read-only rule fields stay read-only and are never sent. |
| **V. Schema by Migration, Verified Against Real Postgres** | **N/A** | No schema, no migration, no entity, no persistence code. Existing persistence tests run unchanged against Testcontainers Postgres. |

**On Principle I and the metadata array.** Constitution **1.1.0** settles this explicitly. Principle
I's paging bullet is scoped to database-backed collections, with a narrow carve-out for a response
whose size is fixed by a compile-time registry and which touches no database — and the carve-out
names `GET /api/v1/rules/fields/metadata` alongside the existing `GET /api/v1/rules/fields` as the
only two endpoints it covers. This endpoint qualifies on both counts: it is served from a
`static final Map` of eight entries and performs no database access at all.

The amendment was raised by this feature's `/speckit-analyze` pass, which flagged that the original
bullet ("There is no unpaged list operation, publicly or internally") admitted no exception, so the
first draft of this plan was arguing intent against the constitution's literal text. That was the
wrong way round: the text now says what it means, and the carve-out can only widen by a further
amendment naming the endpoint. **Not a violation** — by the constitution's words, not by this plan's
reading of them.

**Additional gates from the constitution's binding settings and workflow**:

- `open-in-view: false`: the metadata service touches no entity and no lazy association.
- `fail_on_pagination_over_collection_fetch`, virtual threads, `rule-engine` guardrails: untouched.
  **No guardrail is raised**; the builder adapts to the budgets and shows the server's message.
- **No authentication is invented** (spec Assumptions, and the constitution's
  `TODO(AUTHZ_PRINCIPLE)`). The page introduces no client-only editing restriction the service does
  not enforce.
- **New files are `git add`-ed the moment they are created.**
- **Definition of done**: `mvn verify` passes via the cached wrapper distribution, plus
  `npm run typecheck && npm run lint && npx vitest run` in `ui/`. Contract behaviour asserted by
  test, not by manual `curl`.

**Gate result: PASS.** No violation to justify; Complexity Tracking stays empty.

### Post-Phase 1 re-check

Re-evaluated against the artifacts actually produced. **Still PASS.** Four design decisions were
reviewed specifically because they touch a principle:

1. **Adding `label` to `FieldDescriptor`** (research R3) puts display text into what is otherwise a
   query-mapping type. It is justified under Principle III's logic rather than in spite of it: the
   registry is the single source of truth for a field, and a parallel label map would be exactly the
   hand-maintained duplicate this feature exists to delete. The compact constructor derives a
   fallback, so the existing factories keep their signatures and no existing call site or test
   changes — which is what makes SC-010 safe by construction rather than by luck.

2. **Deriving the operator set by executing `coerce` with a probe operand** is unusual enough to
   name. The alternative — a declarative kind → operators table — is easier to read and *wrong in
   the same way the client catalog was wrong*: it re-states coercion's behaviour somewhere coercion
   cannot correct it. Executing the real method is what makes Principle II's "earliest decidable
   point" a derivation instead of a promise, and what makes SC-007 true with zero edits. Its cost
   is a set of probe operands, which are themselves derived from `javaType`.

3. **The metadata endpoint publishes less than it knows.** Withholding `joinPath` / `attributePath`
   is a Principle IV decision made deliberately, not an oversight of convenience. A test asserts the
   *absence* of those keys, so a future refactor that starts serialising the descriptor fails
   loudly (contract §2.2).

4. **Deleting the start-up drift check** removes a safety net, which deserves scrutiny rather than
   celebration. It is sound because the net guarded a duplication that no longer exists: with one
   copy of the metadata there is nothing to diverge. The residual risk 002 recorded — a field
   *retyped* under the same name, invisible to a set-equality check — is closed outright, since the
   type now comes from the same place the name does (research R8, contract §4).

**Complexity Tracking: empty.** No principle is violated and no complexity requires justification.

## Project Structure

### Documentation (this feature)

```text
specs/003-visual-rule-builder/
├── plan.md                      # This file
├── research.md                  # Phase 0 — R1..R14, all NEEDS CLARIFICATION resolved
├── data-model.md                # Phase 1 — the published metadata type, the unchanged tree,
│                                #   client-only draft and validation state
├── contracts/
│   ├── field-metadata.md        # Phase 1 — the one new endpoint: shape, derivation rule,
│   │                            #   what it must never publish
│   └── rule-page.md             # Phase 1 — the consumed API surface, save semantics,
│                                #   editing/ordering/validation and a11y guarantees
├── quickstart.md                # Phase 1 — runnable validation scenarios A..L
├── checklists/
│   └── requirements.md
├── spec.md
└── tasks.md                     # /speckit-tasks output — NOT created by /speckit-plan
```

### Source Code (repository root)

```text
rule-condition-engine/
├── src/main/java/com/eliezer/ruleengine/
│   ├── api/
│   │   ├── RuleController.java              # + GET /fields/metadata (one method)
│   │   └── dto/
│   │       ├── FieldMetadataVm.java         # NEW — the published per-field record
│   │       └── FieldValueKind.java          # NEW — TEXT | NUMBER | ENUM | INSTANT
│   ├── service/
│   │   └── FieldMetadataService.java        # NEW — derives the metadata at start-up by
│   │                                        #   executing requireCompatible + coerce
│   └── rule/compiler/
│       ├── FieldDescriptor.java             # + `label` component, derived fallback,
│       │                                    #   existing factories unchanged
│       └── PersonFieldRegistry.java         # + eight explicit labels
│   #   UNCHANGED: domain/, repository/, audit/, service/crud/, rule/model/,
│   #              rule/persistence/, rule/validation/, config/
├── src/main/resources/                      # UNCHANGED — no migration, no application.yml change
├── src/test/java/com/eliezer/ruleengine/
│   ├── rule/FieldMetadataDerivationTest.java    # NEW — unit, no Spring, no Postgres
│   └── api/FieldMetadataEndpointTest.java       # NEW — @Tag("integration"), Testcontainers
└── ui/src/
    ├── api/
    │   ├── fieldMetadata.ts                 # NEW — GET /rules/fields/metadata + types
    │   ├── queries.ts                       # + qk.fieldMetadata()
    │   └── rules.ts                         # unchanged; updateCondition kept, now uncalled
    │                                        #   by the page (contract §1.4)
    ├── rules/
    │   ├── catalog.ts                       # DELETED — SC-008
    │   ├── catalog.test.ts                  # DELETED
    │   ├── catalogValidation.ts             # DELETED — SC-007, no drift-blocked state
    │   ├── catalogValidation.test.ts        # DELETED
    │   ├── EditCondition.tsx                # DELETED — superseded by the single save
    │   ├── metadata.ts                      # NEW — index by name, operandShape, defaults,
    │   │                                    #   unknown-field marking (derivations only)
    │   ├── summary.ts                       # NEW — pure plain-language summariser (FR-004)
    │   ├── RulePage.tsx                     # NEW — name + enabled + read-only metadata +
    │   │                                    #   conditions + ONE save (US3)
    │   ├── RuleConditionEditor.tsx          # NEW — summary + root node + validation,
    │   │                                    #   shared by create and edit
    │   ├── RuleBuilder.tsx                  # create flow only; catalog gate removed
    │   └── tree/
    │       ├── GroupNodeEditor.tsx          # restyled container, NOT arity, wrap action
    │       ├── ConditionLeafEditor.tsx      # compact row, metadata-driven cascade
    │       ├── UnaryLeafEditor.tsx          # presence test as an operator choice
    │       ├── MoveControls.tsx             # NEW — up/down, disabled at the ends (FR-024)
    │       ├── treeOps.ts                   # + moveChild, wrapChildren; leaf constructors
    │       │                                #   take metadata instead of importing a catalog
    │       ├── validate.ts                  # + metadata-aware checks (data-model §3.5)
    │       └── values/                      # controls per operand shape, ENUM closed choice
    └── test/handlers/rules.ts               # + /rules/fields/metadata handler
```

**Structure Decision**: both existing modules keep their shape — the single-module Spring Boot
service and the sibling `ui/` Node module established in 002. Nothing moves. The backend change is
confined to `api/dto/`, `api/RuleController`, `service/` and `rule/compiler/`; the frontend change
is confined to `ui/src/rules/` plus one new `ui/src/api/` module. `records/`, `cases/`, `audit/`
and `ui/` (the component kit) are untouched, which is what keeps SC-010's "every interface test
outside the rules area passes unchanged" achievable.

The new page replaces the generic record editor as the rules resource's detail view — that generic
editor being precisely the "somewhere other than its conditions" the spec objects to.
`/rules/:id/condition` redirects to `/rules/:id` so existing links keep working.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The Constitution Check passes at both gates, and the four decisions that warranted
scrutiny (§ Post-Phase 1 re-check) are recorded there with their reasoning rather than deferred to
this table.
