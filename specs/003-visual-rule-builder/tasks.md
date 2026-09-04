# Tasks: Visual Rule Condition Builder

**Input**: Design documents from `/specs/003-visual-rule-builder/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: Included. Not as TDD ceremony — the constitution's *Definition of done* requires
"contract-level behaviour asserted by a test, not only by manual `curl`", and SC-010 requires every
pre-existing suite to keep passing. Test tasks therefore sit at the end of each story phase,
alongside the behaviour they assert, rather than being written first.

**Organization**: Tasks are grouped by user story so each can be implemented, tested and delivered
independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1..US5, mapping to the user stories in [spec.md](./spec.md)

## Path Conventions

Two existing modules, unchanged in shape (plan § Project Structure):

- **Backend**: `src/main/java/com/eliezer/ruleengine/…`, tests in `src/test/java/com/eliezer/ruleengine/…`
- **Frontend**: `ui/src/…`, tests co-located as `*.test.ts` / `*.test.tsx`
- **Maven** is invoked through the cached wrapper distribution
  (`~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn`), never a CLI `mvn` and never `./mvnw`.

---

## Phase 1: Setup

**Purpose**: establish the SC-010 baseline before anything changes. No new dependency is added by
this feature, on either side.

- [X] T001 Record the backend baseline: run `~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn verify` and note the passing test count, so SC-010's "every existing backend test passes unchanged" is checkable at the end rather than asserted from memory
- [X] T002 [P] Record the frontend baseline: run `npm run typecheck && npm run lint && npx vitest run` in `ui/` and note which suites pass, distinguishing the rules-area suites (whose subject this feature changes) from all others (which must pass unchanged)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: one module that every story's UI reads its field choices through, shaped as the
*published* metadata from the first line — so US5 changes only where that data comes from, never
what consumes it.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

**Why the adapter**: US5 (the backend endpoint) is P3 and separable, so US1–US4 must be buildable
before it lands. `metadata.ts` therefore ships with a temporary adapter over the existing
`catalog.ts`, and US5 deletes the adapter and the catalog together. If the backend work is pulled
forward instead (see *Implementation Strategy*), T003's adapter is never written — the tasks are
independent either way.

- [X] T003 Create `ui/src/api/fieldMetadata.ts` declaring the `FieldValueKind` and `FieldMetadata` types **only**, exactly as [data-model.md §3.2](./data-model.md#32-fieldmetadata--the-client-mirror-of-11) specifies (every property `readonly`) — the wire shape lives beside the other wire types, and US5's T053 adds the fetcher to this same file. Then create `ui/src/rules/metadata.ts` re-exporting those types and adding the derivations `byLogicalName`, `labelFor`, `operatorsFor`, `enumValuesFor`, `isPublished` and `operandShape(kind, operator)` per [data-model.md §3.3](./data-model.md#33-operandshape--derived-not-stored); source the data through a single `fromCatalog()` adapter over `ui/src/rules/catalog.ts`, marked with a comment naming US5 as the task that deletes it
- [X] T004 Rework the leaf constructors in `ui/src/rules/tree/treeOps.ts` to take a `readonly FieldMetadata[]` parameter instead of importing `CATALOG_BY_NAME`, so no tree operation reaches a field catalog directly
- [X] T005 [P] Widen `validateTree` in `ui/src/rules/tree/validate.ts` to accept the metadata as a second parameter and thread it through the recursion, leaving the existing checks unchanged for now (the metadata-aware checks arrive in US2 and US5)

**Checkpoint**: every UI consumer of field choices goes through `metadata.ts`. User story work can begin.

---

## Phase 3: User Story 1 — Understand what a rule checks, without reading JSON (Priority: P1) 🎯 MVP

**Goal**: the complete condition tree laid out visually — bounded, labelled, indented containers
with a one-line plain-language summary above them.

**Independent Test**: load a rule whose condition is a conjunction of two comparisons and a nested
disjunction of two more. Three distinct containers render, the disjunction visibly nested inside the
conjunction, and the summary names every field, operator and value with the nested group
parenthesised ([quickstart.md](./quickstart.md) Scenario B).

### Implementation for User Story 1

- [X] T006 [P] [US1] Create `ui/src/rules/summary.ts` with a pure `summarise(node, metadata): string` implementing the rules in [research.md R12](./research.md#r12--the-plain-language-summary): nested groups parenthesised, root group not, `NOT (…)` always parenthesised, presence tests in plain language, unknown fields suffixed `(unavailable)`, incomplete nodes rendered as `…`, and numeric operands printed as the stored string with no numeric conversion (SC-004)
- [X] T007 [P] [US1] Add `GROUP_OPERATOR_LABELS` to `ui/src/api/tree.ts` mapping `AND`/`OR`/`NOT` to the header wording ("Match all of the following" / "Match any of the following" / "Match records that do NOT satisfy"), so no group header shows a bare operator name (FR-006, US1 scenario 7)
- [X] T008 [US1] Restyle the group container in `ui/src/rules/tree/GroupNodeEditor.tsx`: keep the native `fieldset`/`legend` recursion (research R13), add a bounded card, a left accent rail cycling by nesting level, indented children, and the plain-language header from T007 — nesting conveyed by indentation *and* rail, never by colour alone (FR-002, FR-003, FR-043)
- [X] T009 [US1] Confirm and adjust the collapse affordance in `ui/src/rules/tree/GroupNodeEditor.tsx` so a collapsed container states how many nodes it conceals, at every permitted depth (FR-007)
- [X] T010 [US1] Rework `ui/src/rules/tree/ConditionLeafEditor.tsx` into one compact CSS-grid row carrying field, operator, value and actions, wrapping onto a second line below `sm` rather than scrolling the page horizontally (FR-041, FR-043), with the field's `label` and the operator's human label from `OPERATOR_LABELS` (FR-006). The field control is a closed `<select>` over the published fields only — never a free-text input, since the client must be structurally unable to originate a field name (FR-010, constitution III)
- [X] T011 [US1] Rework `ui/src/rules/tree/UnaryLeafEditor.tsx` to the same compact row, rendering the presence test in plain language ("has no value") rather than as `IS_NULL` (FR-006, US1 scenario 5)
- [X] T012 [US1] Create `ui/src/rules/RuleConditionEditor.tsx` rendering the summary line above the tree and the root node below it, and **handling a bare-leaf root**: a stored root that is a `CONDITION` or `UNARY` renders and edits in place, never wrapped in a synthetic group (spec Edge Cases — the current `RuleBuilder.tsx` wraps it, which this task removes)
- [X] T013 [US1] Replace the direct `GroupNodeEditor` usage in `ui/src/rules/RuleBuilder.tsx` with `RuleConditionEditor`, so create and edit render the same tree

### Tests for User Story 1

- [X] T014 [P] [US1] Create `ui/src/rules/summary.test.ts` covering the SC-006 corpus: a single comparison, a flat conjunction, a flat disjunction, a negation, a presence test, and groups nested to depth 8 — asserting parenthesisation, plain-language operators and verbatim numeric operands
- [X] T015 [P] [US1] Create `ui/src/rules/RuleConditionEditor.test.tsx` asserting three distinct containers for the nested fixture, the nested group rendered inside its parent's bounds and not as a peer, every level distinguishable at depth 5, the collapsed hidden-node count, and a bare-leaf root rendering without a wrapper group

**Checkpoint**: every existing rule is more readable than before, with no editing behaviour changed.

---

## Phase 4: User Story 2 — Edit the condition tree without ever producing an invalid rule (Priority: P1)

**Goal**: fields, operators and values can be changed, nodes added and deleted, and group operators
changed, without the interface being able to assemble a condition the service would reject for a
reason it could have known.

**Independent Test**: change a comparison's field to one of a different type and confirm the operator
and value reset to a valid pairing; set an operator requiring a range and confirm two bounds appear;
switch to a single-value operator and confirm the surplus bound is discarded
([quickstart.md](./quickstart.md) Scenario C).

### Implementation for User Story 2

- [X] T016 [US2] Rewrite the value controls in `ui/src/rules/tree/values/index.tsx` to cover all six operand shapes from [data-model.md §3.3](./data-model.md#33-operandshape--derived-not-stored): single text, single numeric, two range bounds, multi-entry text list with per-entry add/remove, closed single choice over `enumValues`, and closed multi-choice — with `NONE` rendering no control at all
- [X] T017 [US2] Add `wrapChildren(root, path, operator)` to `ui/src/rules/tree/treeOps.ts`, replacing a group's children with one new group of the given operator holding them all in order, and make `defaultValueFor` / `newConditionLeaf` derive from the passed metadata rather than any catalog (FR-017)
- [X] T018 [US2] Implement the field → operator → value cascade in `ui/src/rules/tree/ConditionLeafEditor.tsx` per [contracts/rule-page.md §3.1](./contracts/rule-page.md#31-the-field--operator--value-cascade): populate the operator control from `operatorsFor(field)` with the two presence tests appended — valid on every field — each shown with its plain-language label (FR-011); field change keeps the operator only if still published for the new field and always resets the value (FR-015); operator change carries the value only where the shape is unchanged and otherwise discards it (FR-014, SC-003)
- [X] T019 [US2] Implement presence-test conversion in `ui/src/rules/tree/ConditionLeafEditor.tsx` and `ui/src/rules/tree/UnaryLeafEditor.tsx`: selecting a presence test turns the node into a `UNARY` with no value; selecting a comparison operator afterwards restores a `CONDITION` with an empty value of the required shape (FR-016)
- [X] T020 [US2] Wire add and delete actions in `ui/src/rules/tree/GroupNodeEditor.tsx`: add comparison / presence test / nested group appended as the last child, a new group defaulting to `AND`, deleting a group removing its entire subtree in one action (FR-008, FR-009), and both a valueless comparison and a childless group visibly marked incomplete (FR-017, FR-018). Delete uses the existing `danger` Button variant and add/move use `secondary`/`ghost`, so destructive actions are visually distinguishable from non-destructive ones (FR-042)
- [X] T021 [US2] Enforce `NOT` arity in `ui/src/rules/tree/GroupNodeEditor.tsx` per [research R10](./research.md#r10--enforcing-not-arity-without-discarding-children): the three Add controls rendered **present but disabled** with the reason and remedy when a `NOT` already holds a child (FR-019); the `NOT` option **disabled** in the operator control while a group holds more than one child, accompanied by a *Wrap children in AND* action calling `wrapChildren` — no path discards a child (FR-020)
- [X] T022 [US2] Add the metadata-aware checks to `ui/src/rules/tree/validate.ts` per [data-model.md §3.5](./data-model.md#35-validation-model): operator is in the field's published set, value shape matches the operator's required shape, and an enum value is one of `enumValues` — while deliberately **not** checking depth, node count or list length (FR-029)
- [X] T023 [US2] Render each violation beside the node it concerns in `ui/src/rules/tree/GroupNodeEditor.tsx`, `ConditionLeafEditor.tsx` and `UnaryLeafEditor.tsx`, associated with its control via `aria-describedby`, with messages naming what is wrong rather than restating that the rule is invalid (FR-026, FR-044)
- [X] T024 [US2] Block the save and preview actions in `ui/src/rules/RuleConditionEditor.tsx` while any violation stands, and present a service rejection **as given** with the author's draft preserved on screen (FR-030, [contracts/rule-page.md §2](./contracts/rule-page.md#2-failure-presentation))

### Tests for User Story 2

- [X] T025 [P] [US2] Create `ui/src/rules/tree/cascade.test.tsx` asserting: field change to a different type resets operator and value; operator change to a differing shape discards the value; `BETWEEN` renders two bounds and reverting discards the surplus; an ordered operator is not offered on a text or instant field; an enum value cannot be typed freely; presence-test conversion both ways
- [X] T026 [P] [US2] Create `ui/src/rules/tree/notArity.test.tsx` asserting the Add controls are present-but-disabled on a one-child `NOT`, that `NOT` is disabled on a multi-child group, and that *Wrap children in AND* preserves all children in order and then permits `NOT`
- [X] T027 [P] [US2] Extend `ui/src/rules/tree/validate.test.ts` (creating it if absent) for the new checks: unpublished operator, shape mismatch, enum value outside `enumValues`, empty group, `NOT` with ≠1 child, inverted range, blank list entry — and assert depth/node-count/list-length are **not** reported client-side

**Checkpoint**: US1 + US2 together are the working visual builder, on the existing edit route.

---

## Phase 5: User Story 3 — Name, enabled state and conditions in one place (Priority: P2)

**Goal**: one page carrying the rule's identity and its behaviour, committed in one action.

**Independent Test**: open a rule, change its name and one condition value, save once, reload, and
confirm both changes are present and exactly one entry was added to the rule's history
([quickstart.md](./quickstart.md) Scenarios F and G).

### Implementation for User Story 3

- [X] T028 [US3] Create `ui/src/rules/RulePage.tsx` with the three regions in [contracts/rule-page.md §5](./contracts/rule-page.md#5-page-composition-us3): a header with editable `name` and `enabled` plus read-only `id`, `type`, `caseId`, `createdAt/By`, `updatedAt/By` shown as **text with no editable affordance** (FR-032) and the `HistoryLink` (FR-035); the conditions as the main body; the actions below
- [X] T029 [US3] Hold the draft in `RulePage.tsx` per [data-model.md §3.1](./data-model.md#31-ruledraft--what-the-rule-page-holds): `version` captured once at load and never refreshed by a background refetch, since refreshing it would defeat the staleness check it exists to trigger
- [X] T030 [US3] Implement the single save in `ui/src/rules/RulePage.tsx` through `rules.save` (`POST /api/v1/rules`) carrying `id`, `version`, `caseId`, `name`, `enabled` and `condition` in one body — one atomic change, one history entry (FR-033, SC-009) — with `type` and the audit fields never sent
- [X] T031 [US3] Handle `CONCURRENT_MODIFICATION` in `ui/src/rules/RulePage.tsx`: say the author's copy is stale, keep the unsaved draft on screen, and offer an explicit *Reload the current version* action that replaces the whole draft including `version` (FR-033a, FR-033b)
- [X] T032 [US3] Block the save on an empty rule name in `ui/src/rules/RulePage.tsx`, with the message rendered on the name control itself (FR-032, US3 scenario 4)
- [X] T033 [US3] Route `/rules/:id` to `RulePage` in `ui/src/App.tsx` and redirect `/rules/:id/condition` to it with `<Navigate replace>`, so existing links keep working rather than 404-ing
- [X] T033a [US3] Make the rules list open the rule page instead of the generic in-place editor: in `ui/src/records/RecordList.tsx` (the row-action cell around lines 228–244), extend the existing `config.resource === 'cases'` special case to cover `'rules'`, rendering a `Link` to `/rules/${row.id}` labelled "Open rule →" in place of the `onOpen(row.id)` button. Without this the rules list still opens `RecordEditor` through component state and the split editing surface US3 exists to close survives the route change untouched
- [X] T033b [US3] Empty `RULES_CONFIG.writableFields` in `ui/src/records/configs/index.ts` and update its comment: name and enabled are now edited on the rule page, so the generic editor no longer owns any rule field. Keep the resource's list columns, sort keys, retirement copy and `creatable: false` exactly as they are (FR-034)
- [X] T033c [US3] Repoint the four inbound links from `/rules/:id/condition` to `/rules/:id` and correct their text, which currently promises condition-only editing: `ui/src/cases/CaseWorkspace.tsx:72` ("Open it to edit the condition"), `ui/src/rules/SaveRule.tsx:83` and `:100` ("Open the existing rule"), and `ui/src/rules/MatchesView.tsx:125` ("Open the rule to edit its condition"). `CaseWorkspace.tsx` is **outside** the rules area, so re-run `ui/src/cases/CaseWorkspace.test.tsx` and confirm it passes unchanged (SC-010)
- [X] T034 [US3] Delete `ui/src/rules/EditCondition.tsx` and remove its usage from `ui/src/rules/RuleBuilder.tsx`; leave `updateCondition()` in `ui/src/api/rules.ts` with a comment recording that the route remains in the API for existing callers but carries no version and is therefore not what the page uses ([contracts/rule-page.md §1.4](./contracts/rule-page.md#14-not-used-by-this-page))
- [X] T035 [US3] Simplify `ui/src/rules/RuleBuilderPage.tsx` so `create` and `matches` remain and `edit` delegates to `RulePage`, removing the duplicated rule fetch

### Tests for User Story 3

- [X] T036 [P] [US3] Create `ui/src/rules/RulePage.test.tsx` asserting that a name change plus a condition change produce **exactly one** `POST /api/v1/rules` carrying `id` and `version`, and that `type`, `createdAt`, `createdBy`, `updatedAt` and `updatedBy` are absent from the request body
- [X] T037 [US3] Add a conflict case to `ui/src/rules/RulePage.test.tsx`: a `CONCURRENT_MODIFICATION` response leaves the draft on screen, shows the stale-copy message, and offers a reload that replaces the draft
- [X] T038 [US3] Assert in `ui/src/rules/RulePage.test.tsx` that no editable control exists for `id`, `type`, `caseId` or the audit fields, and that a **disabled** rule's name, enabled state and conditions are all still editable (FR-032a, US3 scenario 7)
- [X] T038a [US3] Add a regression case to `ui/src/records/RecordList.test.tsx` covering the rules resource after T033a and T033b: the list still renders, sorts and pages; the row action is a link to `/rules/:id`; the retirement copy is unchanged; and rule creation is still refused at this surface (`creatable: false`) — FR-034

**Checkpoint**: the rule page is the rule's single editing surface.

---

## Phase 6: User Story 4 — Reorder conditions and groups within their group (Priority: P2)

**Goal**: a child moves up or down within its group without the move changing what the rule means.

**Independent Test**: in a group of three children whose middle child is a nested group, move that
group up and then down, confirming after each move that the parent's operator, the tree's depth and
every child's membership are unchanged, and that the new order is what is saved
([quickstart.md](./quickstart.md) Scenario E).

### Implementation for User Story 4

- [X] T039 [US4] Add `moveChild(root, parentPath, index, delta)` to `ui/src/rules/tree/treeOps.ts`, swapping a child with its adjacent sibling in the same `children` array and returning the root unchanged when the move would leave the array — no `position` attribute is introduced, the array order is the only representation of order (FR-025)
- [X] T040 [P] [US4] Create `ui/src/rules/tree/MoveControls.tsx` rendering up and down buttons that are **present but disabled** at the first and last positions, and both disabled in a one-child group, each with an accessible name naming the child it moves (FR-024, FR-044)
- [X] T041 [US4] Wire `MoveControls` into every child row in `ui/src/rules/tree/GroupNodeEditor.tsx` — comparisons, presence tests and nested groups alike — so a nested group moves as a whole with its subtree, its own children's order untouched (FR-021, FR-023)

### Tests for User Story 4

- [X] T042 [P] [US4] Create `ui/src/rules/tree/treeOps.test.ts` asserting `moveChild` swaps only within the parent, preserves the parent's operator, preserves tree depth and node count, leaves a moved group's subtree order untouched, and is a no-op at either end
- [X] T043 [P] [US4] Add a reorder case to `ui/src/rules/RuleConditionEditor.test.tsx`: moving a child updates the rendered order **and** the summary line (FR-005, US4 scenario 9), the end controls are disabled rather than absent, and a save-then-reload round trip yields the order the author left (SC-005)

**Checkpoint**: order is authorable, and it survives the round trip.

---

## Phase 7: User Story 5 — Field, operator and value metadata published by the service (Priority: P3)

**Goal**: the builder's choices come from the service, so a field added, retyped, renamed or
withdrawn on the server changes them with no client change and no drift outage.

**Independent Test**: add a field to the registry, restart nothing on the client, and confirm it
appears with the correct type, operator set and (if enumerated) permitted values, without the builder
entering a blocked state ([quickstart.md](./quickstart.md) Scenarios A and I).

### Backend implementation for User Story 5

- [X] T044 [P] [US5] Create `src/main/java/com/eliezer/ruleengine/api/dto/FieldValueKind.java` — `TEXT`, `NUMBER`, `ENUM`, `INSTANT`, the published abstraction over `javaType` ([data-model.md §1.2](./data-model.md#12-fieldvaluekind))
- [X] T045 [P] [US5] Create `src/main/java/com/eliezer/ruleengine/api/dto/FieldMetadataVm.java` as an immutable record carrying `logicalName`, `label`, `valueKind`, `operators`, `presenceTestable` and `enumValues`, with a compact constructor asserting non-blank names and labels and that `enumValues` is non-null and non-empty **iff** `valueKind == ENUM`; it must carry **no** `joinPath`, `attributePath` or `javaType` ([contracts/field-metadata.md §2.2](./contracts/field-metadata.md#22-what-this-response-must-never-contain))
- [X] T046 [US5] Add a `label` component to `src/main/java/com/eliezer/ruleengine/rule/compiler/FieldDescriptor.java`, with the compact constructor deriving a humanised fallback from `logicalName` when the label is null or blank, so the existing `of(name, attr, type)` and `joined(name, joinPath, attr, type)` factories keep their signatures and every existing call site compiles unchanged (research [R3](./research.md#r3--where-the-display-label-comes-from), SC-010)
- [X] T047 [US5] Supply the eight explicit labels in `src/main/java/com/eliezer/ruleengine/rule/compiler/PersonFieldRegistry.java` per [data-model.md §1.3](./data-model.md#13-fielddescriptorlabel--the-one-registry-change), with `createdAt` labelled plainly "Created at" — the published operator set now states the ordered-comparison caveat the old client label apologised for
- [X] T048 [US5] Create `src/main/java/com/eliezer/ruleengine/service/FieldMetadataService.java` deriving the metadata **once in its constructor** from `PersonFieldRegistry`: for each field and each `ComparisonOperator`, build type-appropriate probe operands from the descriptor's own `javaType`, filter with the existing public `operator.accepts(probe)`, then execute `requireCompatible` followed by `coerce`, publishing the operator when at least one shape survives both — per the normative rule in [contracts/field-metadata.md §3](./contracts/field-metadata.md#3-the-derivation-rule-fr-036-fr-037). `ComparisonOperator` and the value records are **not** modified
- [X] T049 [US5] Make an unclassifiable `javaType` a **start-up failure** in `FieldMetadataService`, naming the field and its type — never a guessed kind and never a silent omission (research [R2](./research.md#r2--an-unclassifiable-field-type-fails-at-start-up))
- [X] T050 [US5] Add `GET /fields/metadata` to `src/main/java/com/eliezer/ruleengine/api/RuleController.java` returning the pre-computed list sorted by `logicalName`, with `operators` in `ComparisonOperator` declaration order and `enumValues` in constant declaration order; leave `GET /fields` exactly as it is (FR-036 assumption: the endpoint is additive)

### Backend tests for User Story 5

- [X] T051 [P] [US5] Create `src/test/java/com/eliezer/ruleengine/rule/FieldMetadataDerivationTest.java` — a plain JUnit test constructing `new FieldMetadataService(new PersonFieldRegistry())` with no Spring and no Postgres — asserting the four effective operator sets in [data-model.md §1.4](./data-model.md#14-effective-operator-sets-this-must-produce), that `createdAt`, `name`, `city` and `case.title` publish **no** ordered operator (`GT`, `GTE`, `LT`, `LTE`, `BETWEEN`), that `risk` publishes its four constants in declaration order, and that an unclassifiable type throws at construction
- [X] T052 [P] [US5] Create `src/test/java/com/eliezer/ruleengine/api/FieldMetadataEndpointTest.java` extending `PostgresIntegrationTest` (`@Tag("integration")`), asserting the endpoint's `200`, its entry ordering, its JSON shape, that `GET /api/v1/rules/fields` still returns the eight sorted names unchanged, and — asserting **absence** — that no response contains `joinPath`, `attributePath`, `javaType` or the string `caseLinks`

### Frontend implementation for User Story 5

- [X] T053 [P] [US5] Add a `fieldMetadata(signal?)` fetcher over `GET /rules/fields/metadata` to the existing `ui/src/api/fieldMetadata.ts` (its types were declared in T003 — do not redeclare them), using plain `JSON.parse` — the response carries no decimals, so lossless parsing stays scoped to the condition subtree (memory: `ui-lossless-json-scoped-to-condition`) — and forwarding an `AbortSignal` only when the runtime accepts one (memory: `ui-jsdom-abortsignal-workaround`)
- [X] T054 [US5] Add `qk.fieldMetadata()` to `ui/src/api/queries.ts` as a key separate from `qk.rules.detail`, so the two queries fail and retry independently (FR-040)
- [X] T055 [US5] Replace the `fromCatalog()` adapter in `ui/src/rules/metadata.ts` with the published response, deleting the adapter — the derivations (`operandShape`, `defaultValueFor`, label and operator lookups) are unchanged, because they derive over published data rather than duplicating it
- [X] T056 [US5] Consume the metadata query in `ui/src/rules/RulePage.tsx` and `ui/src/rules/RuleBuilder.tsx`, rendering a **distinct, retryable** `FailureBanner` naming the field choices, separate from the rule's own failure banner, with each retry retrying only its own subject (FR-040)
- [X] T057 [US5] Handle an unpublished field in `ui/src/rules/tree/ConditionLeafEditor.tsx` and `ui/src/rules/tree/validate.ts` per research [R9](./research.md#r9--a-rule-referencing-a-field-the-service-no-longer-publishes): render the stored name verbatim marked *no longer available*, offer it as a disabled selected entry so nothing is silently substituted, and block saving until the node is changed or removed (FR-039, FR-026)
- [X] T058 [US5] Delete `ui/src/rules/catalog.ts`, `ui/src/rules/catalog.test.ts`, `ui/src/rules/catalogValidation.ts` and `ui/src/rules/catalogValidation.test.ts`, and remove the drift gate and its blocked-builder branch from `ui/src/rules/RuleBuilder.tsx` — with one source there is nothing to diverge, so the blocked state ceases to exist (FR-038, SC-007, SC-008)
- [X] T059 [US5] Add a `GET /api/v1/rules/fields/metadata` handler to `ui/src/test/handlers/rules.ts` with the service's real response body, add the fixture to `ui/src/test/fixtures.ts`, and remove `QUERYABLE_FIELDS` once its last consumer is gone

### Frontend tests for User Story 5

- [X] T060 [P] [US5] Create `ui/src/rules/metadata.test.ts` asserting `operandShape` over every kind × operator pair in [data-model.md §3.3](./data-model.md#33-operandshape--derived-not-stored), and that an unknown `logicalName` resolves to the unpublished marker rather than to a substitute field
- [X] T061 [P] [US5] Add cases to `ui/src/rules/RulePage.test.tsx` for a rule referencing an unpublished field (rendered, marked unavailable, save blocked, nothing substituted) and for a metadata transport failure (its own retryable banner, distinct from the rule's, with the rule still rendered)

**Checkpoint**: the client holds no copy of field, type, operator or enum data, and the drift outage is gone.

---

## Phase 8: Polish & Cross-Cutting Concerns

> **Ran against the live app** (Docker had to be restarted mid-phase; it recovered). T062 and T063
> each found a real defect, both fixed and re-verified — see the notes on those tasks. T065 is the
> one item that cannot be completed against today's registry; quickstart Scenario J says why.

- [X] T062 [P] Verify FR-043 at ~380 px width across the rule page: comparison rows wrap onto a second line and the page never scrolls horizontally at any nesting depth
- [X] T063 [P] Verify the page in the application's dark theme, confirming group nesting stays distinguishable by indentation and accent rail rather than colour alone, and that all text meets the existing contrast standard in both themes (FR-043, SC-011)
- [X] T064 Verify keyboard-only operation of every action — field, operator and value changes; add and delete; move up and down; collapse; save — and that each validation message is announced with its control via `aria-describedby` (FR-044, SC-011)
- [ ] T065 **BLOCKED — no decimal-typed field exists in the registry** (verified at the codec level by `ui/src/api/tree.test.ts` instead; quickstart Scenario J explains). Verify SC-004 end to end: store a rule with the operand `10.50`, save it from the page with no edit, read it back and confirm `10.50` rather than `10.5` — including that the summary renderer prints the stored string without numeric conversion
- [X] T066 Run every scenario in [quickstart.md](./quickstart.md) A–L, including the grep guards in Scenario K (no `catalog.ts`, no per-field table in `ui/src`) and Scenario E (`position` absent from the wire); and **assert SC-002 explicitly** by building one tree per published field/operator/value-shape combination the builder permits, saving each, and confirming zero service rejections outside the two excluded causes (structural bounds, concurrent modification)
- [X] T067 Run `~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn verify` and, in `ui/`, `npm run typecheck && npm run lint && npx vitest run`; compare against the T001/T002 baseline and confirm every pre-existing backend test and every interface test outside the rules area passes unchanged (SC-010)
- [X] T068 Confirm every file created by this feature is `git add`-ed — an untracked new file is invisible in the IDE commit panel and breaks the build for everyone else (constitution, *Development Workflow*)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all user stories.**
- **US1 (Phase 3)**: depends on Foundational. No dependency on another story.
- **US2 (Phase 4)**: depends on Foundational **and on US1's T012** — T024 edits
  `RuleConditionEditor.tsx`, which T012 creates. It also shares `GroupNodeEditor.tsx`,
  `ConditionLeafEditor.tsx` and `UnaryLeafEditor.tsx` with US1, so those three sequence rather than
  parallelise.
- **US3 (Phase 5)**: depends on Foundational, and on US1's `RuleConditionEditor.tsx` (T012) for the
  page's main body. Independent of US2, US4 and US5.
- **US4 (Phase 6)**: depends on Foundational **and on US1's T015** — T043 extends
  `RuleConditionEditor.test.tsx`, which T015 creates. Touches `GroupNodeEditor.tsx` (T041) and
  `treeOps.ts` (T039), so it sequences behind US2's edits to those files if both are in flight.
- **US5 (Phase 7)**: the backend half (T044–T052) depends on nothing but Setup and can be built in
  parallel with every frontend story. The frontend half (T053–T061) depends on Foundational, on the
  backend half, and — for T061 only — on **US3's T036**, which creates `RulePage.test.tsx`.
- **Polish (Phase 8)**: depends on whichever stories are being shipped.

### Within Each User Story

- Shared helpers (`summary.ts`, `metadata.ts`, `treeOps.ts`) before the components that use them.
- Components before the tests that assert them.
- The story is complete — and independently demonstrable — at its checkpoint.

### Parallel Opportunities

- T001 ‖ T002 (Setup).
- T006 ‖ T007 (US1: a new file and an additive export in another).
- T014 ‖ T015 (US1 tests).
- T025 ‖ T026 ‖ T027 (US2 tests).
- T036, T037 and T038 all write `ui/src/rules/RulePage.test.tsx` — sequence them. T038a is a
  different file and can run alongside.
- T042 ‖ T043 (US4 tests).
- T044 ‖ T045 (US5: two new DTO files); T051 ‖ T052 (US5 backend tests); T060 ‖ T061.
- **Across stories**: US5's backend half (T044–T052) is a different language and different files
  from every frontend story, so one developer can build it while another builds US1–US4.
- T062 ‖ T063 (Polish).

---

## Parallel Example: User Story 5

```bash
# Two new DTO files, no shared code:
Task: "Create FieldValueKind.java in src/main/java/com/eliezer/ruleengine/api/dto/"
Task: "Create FieldMetadataVm.java in src/main/java/com/eliezer/ruleengine/api/dto/"

# Then the two backend suites, once the service and endpoint exist:
Task: "FieldMetadataDerivationTest — unit, no Spring, no Postgres"
Task: "FieldMetadataEndpointTest — @Tag(\"integration\"), Testcontainers"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1: Setup — record the baseline.
2. Phase 2: Foundational — `metadata.ts` and the two signature changes.
3. Phase 3: US1 — the visual tree and the summary.
4. **STOP and VALIDATE**: quickstart Scenario B. Every existing rule is now readable at a glance,
   with no editing behaviour changed and nothing on the backend touched.

### Incremental delivery

1. Setup + Foundational → foundation ready.
2. **US1** → validate → ship (MVP: comprehension).
3. **US2** → validate → ship (safe editing — with US1 this is the working builder).
4. **US3** → validate → ship (one page, one save, conflict detection).
5. **US4** → validate → ship (authorable order).
6. **US5** → validate → ship (published metadata; the client copy is deleted).

### Pulling US5 forward

US5 is ranked P3 because the builder works today against the client catalog, not because it is
optional. If the backend work is done first, **T003's `fromCatalog()` adapter is never written** —
`metadata.ts` reads the endpoint from the start, and T055 and T058 collapse into T003. This is the
lower-churn order when one developer is doing all of it; the priority order is the right one when
the frontend must ship before the backend change can be deployed. Either way no other task changes.

### Parallel team strategy

1. Everyone completes Setup + Foundational.
2. Then: developer A on US5's backend half (Java, entirely disjoint files); developer B on US1 then
   US2 (the three tree components); developer C on US3's page shell, joining US1 at T012.
3. US4 lands after US2 to avoid contending on `GroupNodeEditor.tsx`.

---

## Notes

- **No new dependency** is added on either side, and specifically none for drag-and-drop, which is
  out of scope.
- **No Flyway migration, no entity change, no schema change**, and no change to the condition model,
  its `type` discriminators or any stored rule.
- Structural budgets (depth 8, 128 nodes, 500 list entries) are never mirrored client-side; the
  server's `RULE_TREE_TOO_COMPLEX` message names the budget and is shown as given.
- New files are `git add`-ed the moment they are created, not at the end.
- Commit after each task or logical group; stop at any checkpoint to validate a story on its own.
