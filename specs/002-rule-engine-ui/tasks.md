---

description: "Task list for 002-rule-engine-ui"
---

# Tasks: Rule Condition Engine UI

**Input**: Design documents from `/specs/002-rule-engine-ui/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Test tasks ARE included. The constitution's definition of done requires contract-level
behaviour asserted by a test rather than by manual `curl`, and research
[R10](./research.md#r10--testing-approach) scopes them to the three things that are genuinely hard —
catalog-driven operator gating (SC-002), condition-tree round-tripping (FR-013 / SC-010), and the
sixteen-code failure map (FR-039 / SC-003). Everything else is covered by the quickstart scenarios.
This is not blanket TDD: components with no logic worth asserting get no test task.

**Organization**: Tasks are grouped by user story so each can be implemented, tested and demoed on
its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task serves (US1–US5)
- Every description carries its exact file path

## Path Conventions

Web application with a new frontend module beside the existing service (plan.md § Project
Structure): `ui/` at the repository root, backend untouched apart from packaging.

- Frontend: `ui/src/…`
- Backend: `src/main/java/com/eliezer/ruleengine/…`
- Build/CI: `pom.xml`, `.github/`

**Maven is invoked through the cached wrapper distribution**, never a CLI `mvn` and never `./mvnw`
(no wrapper script exists here): `~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn`.

**Every new file is `git add`-ed the moment it is created** (constitution, Development Workflow).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Stand up the `ui/` module in the shape this project's CI standard already fixes — Node
24, npm, and the `typecheck` / `lint` / `test` / `build` script names its `ui` job invokes.

- [X] T001 Create the `ui/` module skeleton at the repository root with `ui/package.json` declaring React 19, Vite 7, TypeScript 5.9, and the four scripts `dev`, `build`, `typecheck`, `lint` plus `test`
- [X] T002 [P] Configure TypeScript in `ui/tsconfig.json` with `strict`, `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled — the summary/detail type split in `data-model.md` §1 only catches an accidental `nationalId` read under strict settings
- [X] T003 [P] Configure Vite in `ui/vite.config.ts` with the `/api` → `http://localhost:8080` dev proxy, so development is same-origin and needs no CORS configuration (research R2)
- [X] T004 [P] Configure ESLint in `ui/eslint.config.js` with `typescript-eslint` and `eslint-plugin-jsx-a11y` — the a11y rules are load-bearing for FR-044, not decoration
- [X] T005 [P] Configure Vitest in `ui/vitest.config.ts` with the jsdom environment and a JUnit reporter path matching the CI job's `test-results/junit.xml`
- [X] T006 [P] Create the application entry point `ui/index.html` and `ui/src/main.tsx` mounting the React root
- [X] T007 [P] Add MSW to `ui/src/test/server.ts` and `ui/src/test/setup.ts`, wiring `beforeAll`/`afterEach`/`afterAll` lifecycle
- [X] T008 [P] Add the parallel `ui` job to `.github/workflows/ci.yml` — Node 24, `working-directory: ui`, `cache-dependency-path: ui/package-lock.json`, `timeout-minutes: 10`, running `npm ci` → `typecheck` → `lint` → `vitest --reporter=junit` → `build`, with **no `needs:`** so a UI failure and a backend failure are independent signals
- [X] T009 [P] Add the `npm` ecosystem for `/ui` to `.github/dependabot.yml` on a `weekly` schedule, so frontend dependencies are not the one part of the reactor nothing updates

**Checkpoint**: `cd ui && npm run typecheck && npm run lint && npx vitest run` all pass on an empty project.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The typed API layer, the failure vocabulary, and the shared primitives every story
builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Wire types and the API client

- [X] T010 [P] Define the envelope and record types in `ui/src/api/types.ts` per `data-model.md` §1 — `PageResponse<T>`, `ErrorResponse`, and **separate** `PersonSummary`/`PersonDetail`, `CaseSummary`/`CaseDetail`, `RuleSummary`/`RuleDetail`, `PersonCaseSummary`/`PersonCaseDetail`, plus the `RiskLevel`/`CaseStatus`/`PersonRole` unions. `nationalId` appears on `PersonDetail` only — never as an optional field on a shared type (FR-016, FR-043, SC-004)
- [X] T011 [P] Define the condition-tree types in `ui/src/api/tree.ts` per `data-model.md` §2 — `RuleNode` with its `GROUP`/`CONDITION`/`UNARY` discriminator, `ConditionValue` with its `STRING`/`NUMBER`/`RANGE`/`LIST` discriminator, and the twelve-member `ComparisonOperator` union
- [X] T012 [P] Define the closed `ErrorCode` union and the exhaustive presentation map in `ui/src/api/errors.ts` covering all sixteen codes in `contracts/api-contract.md` §5, typed so an unhandled code is a **compile** error. Branch on `code` only; carry `message` as display detail (FR-039)
- [X] T013 Implement the base client in `ui/src/api/client.ts`: base URL from `import.meta.env.VITE_API_BASE_URL ?? '/api/v1'` resolved in this one module (FR-046, research R11); parse `ErrorResponse` bodies into a typed failure; and distinguish a transport failure from a refusal as two different result kinds, never one (FR-040)
- [X] T014 Add lossless JSON handling to `ui/src/api/client.ts` using `lossless-json` for the four tree-carrying routes (`GET`/`POST /rules`, `PUT /rules/{id}/condition`, `POST /rules/preview`) and plain `JSON` elsewhere, so a `BigDecimal` operand is not re-rounded (research R5, FR-013)
- [X] T015 Implement typed resource functions in `ui/src/api/resources.ts` — list/get/save/delete for `/persons`, `/cases`, `/rules`, `/person-cases` — with the per-resource allowed sort keys from `contracts/api-contract.md` §1.2 encoded as literal unions, so an out-of-list sort key cannot be constructed (FR-021)
- [X] T016 Implement the rule-specific functions in `ui/src/api/rules.ts` — `preview`, `matches`, `updateCondition`, `queryableFields` — per `contracts/api-contract.md` §2
- [X] T017 [P] Implement the audit function in `ui/src/api/audit.ts` with the type/id filter combinations from `contracts/api-contract.md` §3, structurally preventing `recordId` without `recordType` (FR-035)

### Query layer and shared primitives

- [X] T018 Configure the TanStack Query client and key factory in `ui/src/api/queries.ts` — last-request-wins per key for supersession, `placeholderData` for paging, and `gcTime: 0` on the person-detail key so `nationalId` is dropped when its view unmounts (FR-042, FR-043, research R6, R8)
- [X] T019 [P] Build the failure banner in `ui/src/ui/FailureBanner.tsx`, rendering the T012 map, showing the server `message` for `RULE_TREE_TOO_COMPLEX`, and offering retry only on transport failures (FR-039, FR-040, FR-012)
- [X] T020 [P] Build the empty state in `ui/src/ui/EmptyState.tsx`, requiring a next-action prop so no empty region can ship without one (FR-041)
- [X] T021 [P] Build the pager in `ui/src/ui/Pager.tsx`, rendering `PageResponse.page`/`totalPages`/`totalElements` and displaying the **applied** `size`, never a requested one (FR-015, FR-022)
- [X] T022 [P] Build the announcement primitives in `ui/src/ui/LiveRegion.tsx` — `aria-live="polite"` for results and saves, `aria-live="assertive"` for validation failures (FR-044, research R9)
- [X] T023 Build the application shell and routing in `ui/src/App.tsx` with an in-flight indicator on every pending request and **no sign-in, user menu, or permission affordance anywhere** (FR-042, FR-045)

### Packaging (the same-origin decision)

- [X] T024 Add the non-default `ui` Maven profile to `pom.xml`: `frontend-maven-plugin` running `npm ci` and `npm run build` in `ui/` at `generate-resources`, and `maven-resources-plugin` copying `ui/dist` into `${project.build.outputDirectory}/static` at `prepare-package`. Non-default so the CI Java job needs no Node (research R3)
- [X] T025 Create `src/main/java/com/eliezer/ruleengine/config/SpaForwardingConfig.java` forwarding unmatched GETs to `/index.html`, **excluding any path beginning `/api/` and any path naming a file extension** — a catch-all would render API 404s as HTML and defeat FR-039 for every not-found path (research R3)

**Checkpoint**: The typed client, the failure vocabulary and the shell exist; `mvn -Pui clean package` produces a jar that serves the app and the API from one origin.

---

## Phase 3: User Story 1 - Author a condition rule without writing JSON (Priority: P1) 🎯 MVP

**Goal**: An analyst builds a condition from constrained controls, watches the match count as they
refine it, and saves the rule to a case — never seeing or hand-writing the request format.

**Independent Test**: Build a three-condition AND group entirely through the interface, confirm the
previewed count matches the same tree posted directly to `POST /api/v1/rules/preview`, save it to a
case with no rule, and re-open it to confirm the tree round-trips unchanged.

### Tests for User Story 1 ⚠️

> Write these first. The catalog test in particular must fail against an empty catalog.

- [X] T026 [P] [US1] Write the catalog gating test in `ui/src/rules/catalog.test.ts`: for all eight fields × twelve comparison operators, assert every offered pair is one the service accepts and every withheld pair is one it would reject, per the derivation table in `contracts/field-catalog.md` §1–2. **Pin the three traps explicitly** — no ordered operators on `name`/`city`/`case.title`, none on `createdAt`, no `NUMBER` operand on an enum field (SC-002)
- [X] T027 [P] [US1] Write the tree round-trip test in `ui/src/api/tree.test.ts`: for a corpus of trees including nested groups, every operand shape, and decimals such as `10.50`, assert parse → builder model → serialise is byte-identical to the input (FR-013, SC-010)
- [X] T028 [P] [US1] Write the start-up validation test in `ui/src/rules/catalogValidation.test.ts` covering the four outcomes in `contracts/field-catalog.md` §4 — equal sets proceed; a server-only name blocks; a catalog-only name blocks; a failed request is a retryable transport failure, not a mismatch

### Implementation for User Story 1

- [X] T029 [P] [US1] Write the eight catalog entries in `ui/src/rules/catalog.ts` exactly as tabulated in `contracts/field-catalog.md` §2, gating ordered operators on `isNumeric()` — **not** `isOrdered()`, which is true for `String` and `Instant` and would offer operators that die in coercion (research R4)
- [X] T030 [US1] Implement start-up catalog validation in `ui/src/rules/catalogValidation.ts` comparing the catalog's key set to `GET /api/v1/rules/fields` for set equality, blocking the rule builder on a mismatch while leaving browsing, runs and the audit trail usable (spec dependency #2)
- [X] T031 [P] [US1] Implement the pre-send tree validators in `ui/src/rules/tree/validate.ts` — non-empty group, `NOT` arity exactly one, `RANGE.from <= RANGE.to`, non-empty `LIST`, non-empty `STRING` — each mirroring a compact constructor in `rule/model/`, each with a message naming the offending node (FR-006, FR-007)
- [X] T032 [US1] Build the recursive group node in `ui/src/rules/tree/GroupNodeEditor.tsx` as a nested `<fieldset>`/`<legend>` rendering itself for children, with AND/OR/NOT selection and add/remove-child actions. Collapsing a group is permitted, but a collapsed group MUST state how many nodes it hides — **no node that participates in the condition may be silently hidden**, at any of the eight permitted depths (FR-006, spec Edge Cases, research R9)
- [X] T033 [US1] Build the condition leaf in `ui/src/rules/tree/ConditionLeafEditor.tsx`: field select driven **only** by the catalog with no free-text entry, operator select filtered to that field's offered operators, and the value control chosen by operand shape (FR-001, FR-002, FR-003)
- [X] T034 [P] [US1] Build the value controls in `ui/src/rules/tree/values/` — `StringValueInput`, `NumberValueInput` (string-backed, never a JS `number`), `RangeValueInput` (two bounds, inverted range refused inline), `ListValueInput` (non-empty, deduplicated on entry), and `EnumValueSelect` as a closed choice over `enumValues` (FR-003, FR-004, FR-007)
- [X] T035 [P] [US1] Build the unary leaf in `ui/src/rules/tree/UnaryLeafEditor.tsx` for `IS_NULL`/`IS_NOT_NULL` with no operand control (FR-005)
- [X] T036 [US1] Assemble the builder in `ui/src/rules/RuleBuilder.tsx`, holding the draft tree, blocking preview and save while any T031 validator fails, and announcing failures through the assertive live region (FR-006, FR-007, FR-044)
- [X] T037 [US1] Build the preview panel in `ui/src/rules/PreviewPanel.tsx`: an explicitly requested `POST /rules/preview` — **never on keystroke, never on a timer** — showing the total match count and a first page of matched persons at summary depth, with nothing saved (FR-008, spec assumptions)
- [X] T038 [US1] Implement preview staleness in `ui/src/rules/previewState.ts` as `hash(currentTree) !== previewTreeHash`, holding the four states `NEVER_RUN` / `FRESH` / `STALE` / `FAILED` distinctly per `data-model.md` §5 (FR-009, FR-018, SC-007)
- [X] T039 [US1] Implement rule creation in `ui/src/rules/SaveRule.tsx` via `POST /api/v1/rules` with a null `id`, showing the created rule's identity and its case (FR-010)
- [X] T040 [US1] Implement the one-to-one case rule in `ui/src/rules/SaveRule.tsx`: read `CaseDetail.ruleId` before offering to author, and on an `INVALID_RULE` rejection re-read the case — a now-present `ruleId` produces the explanation and the offer to open the existing rule. **Driven by `ruleId`, never by matching the message** (FR-010, research R7)
- [X] T041 [US1] Implement condition replacement in `ui/src/rules/EditCondition.tsx` via `PUT /api/v1/rules/{ruleId}/condition`, leaving every other rule attribute untouched, and **not** claiming conflict protection — that route carries no optimistic-lock token (FR-011, contract §2.3)
- [X] T042 [US1] Surface `RULE_TREE_TOO_COMPLEX` in `ui/src/rules/RuleBuilder.tsx` by showing the server's message, which is the only thing that names which budget was exceeded and its limit. **Do not mirror the budgets client-side** (FR-012)
- [X] T043 [US1] Wire builder accessibility in `ui/src/rules/tree/` — document tab order through the nested fieldsets, `aria-describedby` from each control to its validation message, and no custom key handling (FR-044, SC-008, research R9)
- [X] T044 [US1] Build the rule-target case picker in `ui/src/rules/CasePicker.tsx` over `GET /api/v1/cases`, paged, showing which cases already hold a rule (FR-010)
- [X] T045 [P] [US1] Capture MSW handlers for `/rules/fields`, `/rules/preview`, `POST /rules` and `GET /rules/{id}` into `ui/src/test/handlers/rules.ts` from bodies produced by a running service, so the mock cannot drift from the API it stands in for (research R10)

**Checkpoint**: A rule can be authored, previewed, saved and re-opened. This is the MVP.

---

## Phase 4: User Story 2 - Run a rule and work its matches (Priority: P1)

**Goal**: An analyst runs a saved rule in a stated scope, pages the matches, opens one person in
full, and links them to the case with a role.

**Independent Test**: Run a saved rule in both scopes against seeded data, confirm the global run
returns a superset of the case-scoped run, page past the first page, open a match, link them to the
case, then re-run case-scoped and confirm the newly linked person is included.

### Tests for User Story 2 ⚠️

- [X] T046 [P] [US2] Write the exposure test in `ui/src/rules/MatchesView.test.tsx` asserting a match row renders no `nationalId` and offers no affordance implying it is available at that depth (FR-016, SC-004)
- [X] T047 [P] [US2] Write the scope test in `ui/src/rules/MatchesView.test.tsx` asserting the run action is unavailable until a scope is chosen, and that the scope shown beside results is the one sent (FR-014)

### Implementation for User Story 2

- [X] T048 [US2] Build the scope selector in `ui/src/rules/ScopeSelector.tsx` opening **unselected** with the run action disabled, offering `GLOBAL` and `CASE_SCOPED` with each one's meaning stated (FR-014)
- [X] T049 [US2] Build the matches view in `ui/src/rules/MatchesView.tsx` over `GET /api/v1/rules/{ruleId}/matches`, always sending `scope` explicitly, displaying it beside the results, and showing the total from `PageResponse.totalElements` (FR-014, FR-015)
- [X] T050 [US2] Wire paging in `ui/src/rules/MatchesView.tsx` through the T021 pager, **never fetching a second page to render or count** anything (FR-015, SC-006)
- [X] T051 [US2] Render match rows in `ui/src/rules/MatchRow.tsx` from `PersonSummary` only, typed so `nationalId` is not reachable (FR-016)
- [X] T052 [US2] Build the person detail drill-down in `ui/src/records/PersonDetailPanel.tsx` over `GET /api/v1/persons/{id}`, showing `nationalId` here and only here, on a query with `gcTime: 0` so it is dropped on unmount. Show the true `caseLinkCount` and mark the embedded `caseLinks` as a **partial subset** of twenty — the same treatment the case side gets, and subject to the same dead end, since `/person-cases` cannot be filtered by person either (FR-017, FR-043, SC-004, spec Edge Cases, spec dependency #3)
- [X] T053 [US2] Build the link form in `ui/src/records/LinkPersonToCase.tsx` posting `{ personId, caseId, role }` to `/api/v1/person-cases` **without an `id`** — the composite id is derived server-side and a client-constructed one that disagrees is a 400 (FR-028, `data-model.md` §1.5)
- [X] T054 [US2] Handle the duplicate link in `ui/src/records/LinkPersonToCase.tsx`: a `CONSTRAINT_VIOLATION` on this request means the link already exists, explained in those terms, stating that the existing role was **not** changed (FR-028, contract §5.1)
- [X] T055 [US2] Render an empty match result in `ui/src/rules/MatchesView.tsx` as an explicit empty state, visibly distinct from a failure and from a run not yet performed (FR-018, SC-007)
- [X] T056 [US2] Handle a non-compiling stored rule in `ui/src/rules/MatchesView.tsx`: `UNKNOWN_FIELD`, `INCOMPATIBLE_OPERATOR` and `INVALID_RULE` from the matches route name the field, operator or value at fault and offer to open the rule for editing — the rule stays openable (FR-019)
- [X] T057 [US2] Handle a stale match row in `ui/src/records/PersonDetailPanel.tsx`: a `RECORD_NOT_FOUND` on a soft-deleted person reports not-found rather than rendering a blank record (spec edge case)
- [X] T058 [P] [US2] Capture MSW handlers for `/rules/{id}/matches`, `GET /persons/{id}` and `POST /person-cases` into `ui/src/test/handlers/matches.ts`

**Checkpoint**: Rules can be authored *and* run, and matches turned into case work. US1 + US2 are a coherent deliverable.

---

## Phase 5: User Story 3 - Browse and manage records through one consistent surface (Priority: P2)

**Goal**: All four record types list, open, edit and retire identically apart from their own fields.

**Independent Test**: Perform the full operation set against two different record types and confirm
the interaction, paging and error handling are identical apart from the fields displayed.

### Tests for User Story 3 ⚠️

- [X] T059 [P] [US3] Write the concurrency test in `ui/src/records/RecordEditor.test.tsx` asserting that after a `CONCURRENT_MODIFICATION` rejection **100% of the user's unsaved edits are still on screen**, and that no silent re-read or re-submit occurs (FR-024, SC-005)
- [X] T060 [P] [US3] Write the sort test in `ui/src/records/RecordList.test.tsx` asserting each resource offers only its allowed keys from `contracts/api-contract.md` §1.2, in both directions, and that no out-of-list key can be constructed (FR-021)

### Implementation for User Story 3

- [X] T061 [US3] Define the per-resource configuration type in `ui/src/records/resourceConfig.ts` — columns, sort keys, editable fields, retirement route — so the four record types differ only by data (FR-020)
- [X] T062 [US3] Build the generic listing in `ui/src/records/RecordList.tsx` with paging, total record and page counts, and column sorting restricted to the configured keys (FR-020, FR-021)
- [X] T063 [US3] Display the **applied** page size in `ui/src/records/RecordList.tsx`, taken from `PageResponse.size`, which may be smaller than one requested — clamping is silent server-side (FR-022)
- [X] T064 [US3] Build the generic detail/edit form in `ui/src/records/RecordEditor.tsx` submitting only the resource's declared writable fields, adding no field of its own, since an unrecognised field is a 400 rather than an ignore (FR-029)
- [X] T065 [US3] Implement create mode in `ui/src/records/RecordEditor.tsx` — an empty form per resource config, `POST` with a **null `id` and no `version`**, handling `201` plus the `Location` header and routing to the created record. Create and update are the same route; the null `id` is what distinguishes them (FR-020, contract §1)
- [X] T066 [US3] Send `id` and the `version` read with the record on every update from `ui/src/records/RecordEditor.tsx`, and render server-owned fields — authorship, timing, version — as non-editable (FR-023, FR-030)
- [X] T067 [US3] Implement conflict handling in `ui/src/records/RecordEditor.tsx`: on `CONCURRENT_MODIFICATION`, preserve every unsaved edit, explain what happened, and **offer** re-reading the current record rather than performing it (FR-024, SC-005)
- [X] T068 [US3] Attach per-field validation detail in `ui/src/records/RecordEditor.tsx` by splitting a `VALIDATION_FAILED` message on `"; "` and binding each part to its input, so offending fields are identified individually (FR-020-9, contract §5.2)
- [X] T069 [US3] Present the retirement route in `ui/src/records/RetireAction.tsx` for cases and rules: a `DELETION_NOT_SUPPORTED` becomes an **offered action** — close by status, disable by flag — never an error the user must interpret (FR-025)
- [X] T070 [US3] Build the person deletion confirmation in `ui/src/records/DeletePersonDialog.tsx` stating both consequences: the person is retired rather than erased, and their case links are removed with them (FR-026, spec dependency #4)
- [X] T071 [US3] Build the link removal confirmation in `ui/src/records/UnlinkDialog.tsx` stating that only the link is removed and neither the person nor the case is affected (FR-027)
- [X] T072 [P] [US3] Configure the four resources in `ui/src/records/configs/` — persons, cases, rules, person-cases — each supplying only its columns, sort keys and writable fields (FR-020)
- [X] T073 [US3] Render an explicit empty state on every listing in `ui/src/records/RecordList.tsx` carrying the next useful action (FR-041)
- [X] T074 [P] [US3] Capture MSW handlers for the four resources' list/get/save/delete routes into `ui/src/test/handlers/records.ts`, including a 409 and a 405 response

**Checkpoint**: All four record types are browsable, editable and retirable through one surface.

---

## Phase 6: User Story 4 - Work a case as a workspace (Priority: P2)

**Goal**: A case shows its status, its rule and its linked persons in one place, with every action
reachable from there.

**Independent Test**: Open a case with a rule and several linked persons and confirm every element is
reachable without leaving the view — the rule opens for editing, a case-scoped run executes, a linked
person opens, a new link is created, and the case can be closed.

- [ ] T075 [US4] Build the case workspace in `ui/src/cases/CaseWorkspace.tsx` over `GET /api/v1/cases/{id}`, showing title, status, `openedAt`, the rule if any, and the linked persons together (FR-031)
- [ ] T076 [US4] Show the true `linkedPersonCount` in `ui/src/cases/LinkedPersons.tsx` and mark the embedded twenty as a **partial subset**, never presenting it as complete. Record inline that the twenty-first is unreachable because `/person-cases` cannot be filtered by case (FR-032, spec dependency #3)
- [ ] T077 [US4] Offer rule authoring in `ui/src/cases/CaseWorkspace.tsx` when `ruleId` is null, and opening the existing rule when it is not (FR-033, FR-010)
- [ ] T078 [US4] Wire the case-scoped run into `ui/src/cases/CaseWorkspace.tsx`, reusing the US2 matches view with scope pre-set to `CASE_SCOPED` (FR-014, FR-031)
- [ ] T079 [US4] Implement case closing in `ui/src/cases/CaseWorkspace.tsx` as `POST /api/v1/cases` with `status: 'CLOSED'`, `id` and `version`, reflecting the change immediately (FR-031, US4-4)
- [ ] T080 [US4] Keep a closed case fully readable in `ui/src/cases/CaseWorkspace.tsx`, with its history reachable (US4-5)
- [ ] T081 [P] [US4] Capture MSW handlers for `GET /cases/{id}` — with a rule, without a rule, and with more than twenty links — into `ui/src/test/handlers/cases.ts`

**Checkpoint**: The case is a workspace, composed from US1–US3 rather than duplicating them.

---

## Phase 7: User Story 5 - Read the audit trail (Priority: P3)

**Goal**: A reviewer filters the trail to a record type or a single record and reads what changed,
when, and to what version — seeing that a sensitive field changed without seeing its value.

**Independent Test**: Create, update and delete a record through the interface, then open the trail
filtered to that record and confirm three entries in the expected order with the expected field-level
changes, and the sensitive field masked.

### Tests for User Story 5 ⚠️

- [ ] T082 [P] [US5] Write the change-rendering test in `ui/src/audit/AuditChanges.test.tsx` covering all three operations per `data-model.md` §1.6 — update shows from/to, create shows initial values with no implied previous, and **delete shows an explicit statement rather than an empty change list** (FR-036)
- [ ] T083 [P] [US5] Write the masking test in `ui/src/audit/AuditChanges.test.tsx` asserting a `@Sensitive` field renders as changed with both values masked and **no reveal affordance exists anywhere in the tree** (FR-037)

### Implementation for User Story 5

- [ ] T084 [US5] Build the trail listing in `ui/src/audit/AuditTrailView.tsx` over `GET /api/v1/audit-entries` — paged, newest first, showing record type, identity, operation, actor, time and resulting version, with **no create, edit or delete affordance anywhere** (FR-034)
- [ ] T085 [US5] Build the filters in `ui/src/audit/AuditFilters.tsx` with the record-identity control **disabled until a record type is chosen**, so the combination the server silently ignores cannot be sent (FR-035, contract §3)
- [ ] T086 [US5] Render field-level changes in `ui/src/audit/AuditChanges.tsx` per operation, treating `changes === null` on a delete as the explicit "deletions record no field-level detail" case (FR-036)
- [ ] T087 [US5] Render a masked field in `ui/src/audit/AuditChanges.tsx` as changed-but-hidden, offering no route to reveal the values (FR-037)
- [ ] T088 [US5] Restrict trail sorting in `ui/src/audit/AuditTrailView.tsx` to `occurredAt`, `recordType`, `operation` (FR-038, contract §1.2)
- [ ] T089 [US5] State plainly in `ui/src/audit/AuditTrailView.tsx` that `actor` is always `system` until authentication exists, so the column is not read as information it does not carry (FR-045, spec assumptions)
- [ ] T090 [US5] Add a "history for this record" action to `ui/src/records/RecordEditor.tsx` and `ui/src/cases/CaseWorkspace.tsx` deep-linking to the trail filtered by that type and id, reachable in at most three interactions (SC-009)
- [ ] T091 [P] [US5] Capture MSW handlers for `/audit-entries` — create, update with a masked field, and delete entries — into `ui/src/test/handlers/audit.ts`

**Checkpoint**: All five user stories are independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T092 [P] Write the exhaustive failure-map test in `ui/src/api/errors.test.ts` asserting all sixteen codes render a distinct, specific message and that no path produces a generic "something went wrong" (FR-039, SC-003)
- [ ] T093 [P] Write the transport-failure test in `ui/src/api/client.test.ts` asserting an unreachable service is presented distinctly from a refusal and from an empty result, with a retry that preserves input (FR-040)
- [ ] T094 [P] Write the no-persistence test in `ui/src/api/queries.test.ts` asserting no `localStorage`, `sessionStorage` or IndexedDB write occurs anywhere, and that `nationalId` is absent from the query cache after the person detail view unmounts (FR-043, SC-004)
- [ ] T095 [P] Write the request-supersession test in `ui/src/api/queries.test.ts`: with two requests outstanding for the same view and the **earlier one resolving last**, assert the later result renders and the earlier is discarded. Cover both shapes — a preview refined twice, and a page changed while the previous page loads (FR-042, spec Edge Cases)
- [ ] T096 Audit every view in `ui/src/` for the empty-state requirement — no persons, no cases, no matches, no audit entries — each carrying its next useful action (FR-041, SC-007)
- [ ] T097 Complete a keyboard-only pass over `ui/src/rules/` confirming every builder action is reachable and completable without a pointer, and that results, saves and validation failures are announced (FR-044, SC-008)
- [ ] T098 [P] Document the `ui/` module in `ui/README.md` — dev proxy, the `-Pui` packaging profile, and **why the field catalog is a stopgap** with a pointer to `contracts/field-catalog.md` §4, so the next reader does not rediscover the drift risk
- [ ] T099 [P] Add the frontend to `README.md` "Known gaps" — the client field catalog duplicates server truth, and a field retyped under an unchanged name is undetectable by the start-up check
- [ ] T100 Run the full quickstart in `specs/002-rule-engine-ui/quickstart.md`, scenarios 1–7, against a running service and seeded data
- [ ] T101 Verify the packaged jar per `quickstart.md` § Producing the deployable artifact: a deep link returns `200` **and** an unknown API path returns a JSON `404 RECORD_NOT_FOUND` rather than HTML (research R3)
- [ ] T102 Confirm the definition of done — `~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn verify` passes with the **backend suite unchanged** (this feature alters no API behaviour), and `npm run typecheck && npm run lint && npx vitest run` pass in `ui/`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately
- **Foundational (Phase 2)**: depends on Setup — **blocks every user story**
- **US1 (Phase 3)**: depends on Foundational
- **US2 (Phase 4)**: depends on Foundational. Independently testable against any saved rule, including one created by `curl`; it does not require US1's builder
- **US3 (Phase 5)**: depends on Foundational only
- **US4 (Phase 6)**: depends on Foundational, and on **US2 for T078** (the case-scoped run reuses the matches view) and **US1 for T077**'s one-to-one handling. T075, T076, T079 and T080 stand alone, so the workspace degrades to a read-only case view if US1/US2 are absent
- **US5 (Phase 7)**: depends on Foundational only
- **Polish (Phase 8)**: depends on the stories you intend to ship

### Within Phase 2

T010–T012 are parallel (three independent files). T013 needs T012; T014 needs T013; T015–T017 need
T013–T014. T018 needs T015–T017. T019–T022 are parallel and need only T012. T023 needs T018–T022.
T024–T025 are independent of the whole TypeScript chain and can be done by a second person at any
point after Setup.

### Within Each User Story

Tests before implementation. Types → validators → leaf components → composed views → failure
handling. MSW handler capture ([P], last task in each story) can happen any time after that story's
routes are known.

### Parallel Opportunities

- Setup: T002–T009 all parallel after T001
- Foundational: T010–T012 together; then T019–T022 together; T024–T025 alongside everything
- US1: T026–T028 together, then T029/T031/T034/T035 together
- US2, US3, US4, US5 can each be staffed by a different person once Phase 2 is complete
- Polish: T092–T094 together, T098–T099 together

---

## Parallel Example: User Story 1

```bash
# Tests first, all three in parallel:
Task: "Catalog gating test in ui/src/rules/catalog.test.ts"
Task: "Tree round-trip test in ui/src/api/tree.test.ts"
Task: "Start-up validation test in ui/src/rules/catalogValidation.test.ts"

# Then the independent implementation files:
Task: "Eight catalog entries in ui/src/rules/catalog.ts"
Task: "Pre-send tree validators in ui/src/rules/tree/validate.ts"
Task: "Value controls in ui/src/rules/tree/values/"
Task: "Unary leaf in ui/src/rules/tree/UnaryLeafEditor.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (blocks everything) → 3. Phase 3 US1
4. **Stop and validate**: quickstart scenarios 1 and 2 — the canonical three-condition rule built,
   previewed, saved and round-tripped, with the previewed count matching a direct
   `POST /rules/preview`.
5. Deploy with `mvn -Pui clean package`.

This is a genuine MVP: the condition tree is the one capability with no usable alternative, since
nobody can reasonably hand-write a nested typed structure in a text box. Everything after it is
browsing that a competent user could survive without.

### Incremental Delivery

| Increment | Adds |
|---|---|
| Setup + Foundational | typed client, failure vocabulary, deployable shell |
| **+ US1 (P1)** | **rule authoring — MVP** |
| + US2 (P1) | running rules and working matches — completes the core workflow |
| + US3 (P2) | the uniform record surface |
| + US4 (P2) | the case workspace (composition, little new code) |
| + US5 (P3) | the audit trail |
| + Polish | cross-cutting assertions and the quickstart run |

US1 + US2 together are the natural first release: authoring a rule that can never be run delivers
nothing, and discovery-then-link is what turns a rule into case work.

### Parallel Team Strategy

After Phase 2, four people can take US2, US3, US4 and US5 concurrently while a fifth finishes US1.
The cross-story tasks are T077, T078 (US4 → US1/US2) and T090 (US5 → US3/US4); schedule US4 after
US2. T024–T025 (Maven profile and SPA forwarding) are backend work and
can be done by whoever owns the build, independently of all TypeScript.

---

## Notes

- **[P] = different files, no incomplete dependencies.** Two tasks naming the same file are never
  both marked [P] — T037/T038/T042 all touch the builder and are deliberately sequential.
- **`git add` every new file the moment it is created.** An untracked file is invisible in the IDE
  commit panel and gets left out of the commit.
- **The backend test suite must pass unchanged.** This feature alters no API behaviour; a changed
  backend assertion means something went wrong.
- **Do not mirror the server's structural budgets** (depth 8, 128 nodes, 500 list entries). The
  server owns them and names which one was exceeded; a client copy is one more thing to drift.
- **Never branch on `ErrorResponse.message`.** The nine prohibitions in `contracts/api-contract.md`
  §6 are the review checklist for every task in this file.
