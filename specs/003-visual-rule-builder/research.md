# Phase 0 Research: Visual Rule Condition Builder

**Feature**: `003-visual-rule-builder` | **Date**: 2026-09-03 | **Plan**: [plan.md](./plan.md)

Every NEEDS CLARIFICATION raised in the plan's Technical Context is resolved below. Each entry
records the decision, why it was chosen, and what was rejected.

---

## R1 — Where the published field metadata comes from

**Decision**: derive it at start-up by **executing** the service's own two gates against the
existing `FieldRegistry`, in a new `FieldMetadataService`. For each registered field and each of
the twelve `ComparisonOperator` constants, build a type-appropriate probe operand of every
`ConditionValue` shape the operator accepts, then run `FieldDescriptor.requireCompatible` followed
by `FieldDescriptor.coerce`. An operator is published if at least one accepted shape survives both
calls without throwing.

**Rationale**: FR-037 requires the published set to be "the set that survives both the service's
declared-compatibility check and its operand coercion". Executing both methods makes that true *by
construction* rather than by a second author agreeing with them. It is also what makes SC-007 hold
with zero edits: if `coerce` ever grows an `Instant` branch for ordered comparisons, `createdAt`
starts publishing `GT`/`BETWEEN` the same day, with no metadata code touched.

`ComparisonOperator.acceptedShapes` is private and stays private — the loop filters candidate
probes with the existing public `operator.accepts(value)`, so no model class is modified.

Probe operands are derived from the descriptor's own `javaType`, never hardcoded per field:

| Kind | `StringValue` | `NumberValue` | `RangeValue` | `ListValue` |
|---|---|---|---|---|
| TEXT (`String`) | `"sample"` | `1` | `0..1` | `["sample"]` |
| NUMBER (`Integer`, `Long`, `Short`, `Double`, `BigDecimal`) | `"1"` | `1` | `0..1` | `["1"]` |
| ENUM | first enum constant's name | `1` | `0..1` | `[first constant]` |
| INSTANT | `Instant.EPOCH.toString()` | `1` | `0..1` | `[epoch]` |

**Alternatives rejected**:

- *A hand-written table of operators per value kind on the server.* This is the client's
  `catalog.ts` moved across the wire — a third encoding of what `coerce` decides, drifting the same
  way for the same reason. FR-036 explicitly requires derivation "from its own field registry
  rather than from a hand-maintained list".
- *Publishing the declared-compatibility set only* (i.e. `requireCompatible` alone). Named in the
  spec as a regression: `isOrdered()` is true for `String` and `Instant`, so `name > 30` and
  `createdAt BETWEEN …` pass that gate and die in `coerceNumber`. The builder would offer operators
  that are rejected on save, breaking SC-002.
- *Classifying by `javaType` and mapping kind → operators declaratively.* Simpler to read, but it
  re-states coercion's behaviour in a second place. The probe calls the real thing.

**Verification target** (the effective sets this derivation must produce for today's registry):

| Field | Java type | Kind | Published operators |
|---|---|---|---|
| `name`, `city`, `case.title` | `String` | TEXT | EQUALS, NOT_EQUALS, CONTAINS, STARTS_WITH, ENDS_WITH, IN, NOT_IN |
| `age` | `Integer` | NUMBER | EQUALS, NOT_EQUALS, BETWEEN, GT, GTE, LT, LTE, IN, NOT_IN |
| `risk`, `case.role`, `case.status` | enum | ENUM | EQUALS, NOT_EQUALS, IN, NOT_IN |
| `createdAt` | `Instant` | INSTANT | EQUALS, NOT_EQUALS, IN, NOT_IN |

These match `ui/src/rules/catalog.ts` exactly, which is the point: the client copy was correct, and
correctness is now produced by the server instead of maintained by hand.

---

## R2 — An unclassifiable field type fails at start-up

**Decision**: a registered `javaType` that maps to none of TEXT / NUMBER / ENUM / INSTANT is a
start-up failure naming the field and its type, not a field published with a guessed kind.

**Rationale**: the metadata is built eagerly in the service's constructor, so this is decidable at
the earliest possible point (constitution principle II) and cannot reach an author as a builder
offering a control that cannot produce a valid value. The spec already assumes this shape of
outcome: "Boolean-valued fields are out of scope … Should one be added later it is a backend change
first." A boot failure states that in the loudest available way.

**Alternatives rejected**: defaulting an unknown type to TEXT (silently wrong — the exact failure
mode this feature exists to remove); omitting the field from the metadata (it would then be
queryable by a hand-written tree but invisible in the builder, a discrepancy with no owner).

---

## R3 — Where the display label comes from

**Decision**: `label` becomes a component of `FieldDescriptor`, supplied explicitly in
`PersonFieldRegistry`. The compact constructor derives a humanised fallback from `logicalName` when
none is given, so the existing `of(name, attr, type)` / `joined(name, joinPath, attr, type)`
factories keep compiling unchanged and every existing call site is untouched.

**Rationale**: the label is a property of the field, and the registry is the field's single source
of truth — putting it there is not duplication, it is the definition. FR-036 requires the service to
publish a display label; deriving `"Linked case — role"` from `"case.role"` mechanically would need
a hand-maintained prefix table, which is the duplication this feature removes wearing a different
hat.

`FieldDescriptor` is constructed in exactly one place today (`PersonFieldRegistry`), so the blast
radius of the new component is eight lines.

**Alternatives rejected**: a parallel `Map<String, String>` of labels (a second hand-maintained
list, in the same repository, about the same fields); labels held client-side (FR-036 puts them on
the service, and a client-side label table is precisely what SC-008 forbids).

---

## R4 — What the metadata endpoint does *not* publish

**Decision**: `FieldMetadataVm` carries `logicalName`, `label`, `valueKind`, `operators`,
`presenceTestable` and (for enums) `enumValues`. It carries **no** `joinPath`, `attributePath` or
`javaType`.

**Rationale**: constitution principle IV — a purpose-built representation, not a serialised internal
object. `joinPath` values like `caseLinks.caseFile` describe the entity graph and the persistence
mapping; publishing them hands an unauthenticated caller a map of the schema for no gain to the
builder, which needs only the logical name it already sends on the wire. `valueKind` is the
*published abstraction* of `javaType`, deliberately coarser: `Integer` and `BigDecimal` are both
NUMBER, because the builder's only decision is which control to render.

**Alternatives rejected**: returning `FieldDescriptor` directly (fastest, and exactly the incidental
response principle IV prohibits).

---

## R5 — Route, shape and caching of the metadata endpoint

**Decision**: `GET /api/v1/rules/fields/metadata`, returning a JSON array sorted by `logicalName`,
with each entry's `operators` in `ComparisonOperator` declaration order. The list is computed once
in `FieldMetadataService`'s constructor and returned as an immutable `List`; the endpoint performs
no per-request work and touches no database.

The existing `GET /api/v1/rules/fields` is left exactly as it is (FR-036 assumption: "The metadata
endpoint is additive"). It keeps its callers; it simply stops being what the builder reads.

**Rationale**: `/rules/fields/metadata` is unambiguous against `/rules/{ruleId}` (two segments
versus one, and `/rules/fields` already coexists with it today). Deterministic ordering matters
because it is what an author sees in a dropdown — declaration order groups equality, text, range and
membership operators sensibly, where alphabetical order would interleave them.

**On pagination** (constitution principle I): the response is bounded by the registry, which is a
compile-time constant of eight entries, not by a query result. It is not a collection of records and
cannot grow with the population. The precedent is `GET /rules/fields`, which returns a bare
`List<String>` for the same reason. This is examined again in the plan's Constitution Check rather
than assumed here.

**Alternatives rejected**: extending `/rules/fields` to return objects (breaks every existing caller
of a documented route, for no benefit over an additive sibling); computing per request (identical
output every time, from a static map).

---

## R6 — Which class owns the derivation

**Decision**: `service/FieldMetadataService` — a `@Service` that takes `PersonFieldRegistry` by
constructor and produces `List<FieldMetadataVm>`. Unit-testable with `new
FieldMetadataService(new PersonFieldRegistry())`; no Spring context, no database.

**Rationale**: the derivation imports both `rule.compiler` and `api.dto`. That dependency direction
already exists (`service.convert.PersonVmMapper` imports `FieldDescriptor`). Putting the derivation
in `rule/compiler/` instead would make the compiler package depend on `api.dto`, inverting the
layering for no gain.

**Alternatives rejected**: a static utility (untestable with an alternative registry, and it would
recompute per call); a method on `RuleCompiler` (the compiler builds `Specification`s; publishing a
view model is not its job).

---

## R7 — The single atomic save, and concurrent-edit detection

**Decision**: the rule page saves through `POST /api/v1/rules` with `id`, `version`, `caseId`,
`name`, `enabled` and `condition` in one body — the versioned upsert that already exists and already
runs `RuleCrudService.beforeSave` → `assertCompilable`. A `CONCURRENT_MODIFICATION` refusal is
presented as "your copy is stale", with the draft preserved on screen and an explicit reload offer.

`PUT /rules/{id}/condition` remains in the API untouched for existing callers (spec dependency #3),
and `updateCondition()` remains in `ui/src/api/rules.ts` as the typed description of that route —
but the rule page stops calling it, and `EditCondition.tsx` is deleted. That route carries no
version and therefore cannot detect a concurrent edit; keeping the page on it would make FR-033a
unimplementable.

**Rationale**: FR-033 requires one action, one atomic change, one history entry — which is what one
`POST` produces, because `AuditTrailListener` records one `UPDATE` per flushed entity change.
Splitting name and condition into two requests produces two history entries and a window in which
the rule is half-changed (SC-009 fails).

**Alternatives rejected**: two requests sequenced client-side (two audit entries, non-atomic);
adding a version parameter to the condition route (a new backend capability the spec's dependency
list deliberately excludes — the versioned route already exists).

---

## R8 — Failure separation: metadata versus rule

**Decision**: two independent TanStack queries — `qk.fieldMetadata()` and `qk.rules.detail(id)` —
each rendering its own `FailureBanner` with its own retry. The metadata banner says the choices
could not be loaded; the rule banner says the rule could not be loaded.

**Rationale**: FR-040 requires the metadata failure to be "a distinct, retryable failure, separate
from the rule itself being unavailable". A combined query would make one retry button that retries
the wrong thing and one message that names the wrong subject.

The existing start-up drift check (`catalogValidation.ts`) is **deleted, not replaced**. Its whole
purpose was to detect divergence between two copies; with one copy there is nothing to diverge, and
the blocked-builder state it produced ceases to exist (SC-007: "never puts the builder into a
blocked state").

---

## R9 — A rule referencing a field the service no longer publishes

**Decision**: the node renders with its stored field name shown verbatim and marked
"no longer available"; its field control lists the published fields plus the unknown one as a
disabled, selected entry so nothing is silently substituted; the node carries a validation message
and **saving is blocked** until the author changes or deletes it.

**Rationale**: FR-039 requires display without substitution. FR-026 requires blocking a save the
interface can determine to be invalid — and an unpublished field is exactly determinable: the
service's `FieldRegistry.require` would throw `UNKNOWN_FIELD`. Rendering it while allowing the save
would push a knowable rejection to save time, against constitution principle II.

**Alternatives rejected**: substituting the first published field (silent corruption of a stored
rule); hiding the node (FR-001 — every node visible or reachable).

---

## R10 — Enforcing `NOT` arity without discarding children

**Decision**: two distinct mechanisms.

1. **Adding to a `NOT` that already has a child**: the three "Add" controls are rendered
   `disabled` with an explanation naming the constraint and the remedy ("a negation takes exactly
   one child — wrap these in an AND or OR group first"). Present-but-unavailable, never absent, so
   the constraint is discoverable rather than mysterious (FR-019).
2. **Switching a multi-child group's operator to `NOT`**: the `NOT` option is `disabled` in the
   operator control while the group holds more than one child, accompanied by a **"Wrap children in
   AND"** action that replaces the children with a single new AND group containing them, after which
   `NOT` becomes selectable. No path silently truncates to the first child (FR-020).

**Rationale**: `GroupNode`'s compact constructor rejects a multi-child `NOT` at deserialization, so
this mirrors an existing server check one layer earlier (principle II). Offering the wrap action
rather than only refusing means the author's intent — "negate all of this" — remains achievable in
two clicks.

**Alternatives rejected**: auto-wrapping on operator change (a structural edit the author did not
ask for, changing depth silently); allowing the change and reporting invalidity afterwards (leaves
the tree in a state the model forbids, and `validateTree` would have to describe a shape that cannot
be serialised).

---

## R11 — Reordering

**Decision**: one pure tree operation, `moveChild(root, parentPath, index, delta)`, swapping a child
with its neighbour in the same `children` array. Up/down buttons on every child, rendered
`disabled` at the ends. No wire change, no new field, no drag-and-drop dependency.

**Rationale**: `GroupNode.children` is already an ordered `List` persisted as a JSON array, so order
already round-trips (FR-025: "No separate ordering attribute may be introduced"). A swap cannot
change a node's parent, its subtree, or the tree's depth, which is FR-022 and FR-023 satisfied by
construction rather than by test. `disabled` rather than absent keeps the control set stable so the
row does not reflow as children move (FR-024).

**Alternatives rejected**: drag-and-drop (explicitly out of scope; needs a dependency and a keyboard
equivalent anyway to satisfy FR-044); a `position` field on nodes (a second representation of order,
forbidden by FR-025, and it would change the persisted JSON shape of every stored rule).

---

## R12 — The plain-language summary

**Decision**: a pure function `summarise(node, metadata): string` in `ui/src/rules/summary.ts`,
computed from the draft tree with `useMemo`, so it cannot fall out of step with what is on screen
(FR-005). Rules:

- Comparison → `<label> <operator label> <rendered value>`; e.g. `Age is at least 30`.
- Values render by shape: text quoted, number bare, range `30 and 45`, list comma-joined.
- Presence → `City has no value` / `City has a value` — the operator label, never `IS_NULL`.
- Group → children joined by ` AND ` / ` OR `; a **nested** group is wrapped in parentheses, the
  root group is not; `NOT` renders as `NOT (…)`, always parenthesised, even around a single leaf.
- An unknown field renders its logical name followed by ` (unavailable)`.
- An incomplete node renders a placeholder `…` rather than an empty string, so the summary of a
  half-built tree is still a sentence.

**Rationale**: FR-004 requires nesting, all three logical operators, presence tests, fields,
operators and values to be expressed correctly; parenthesising nested groups is the only part that
carries real ambiguity risk, so it is unconditional. Deriving from the draft rather than from the
last-saved tree is what makes FR-005 true without an update path to forget.

**Alternatives rejected**: rendering the summary as structured JSX (SC-001 wants one readable line,
and a string is trivially assertable in tests against the SC-006 corpus); a server-rendered summary
(a new backend capability, outside this feature's one permitted addition).

---

## R13 — Visual nesting without losing the native semantics

**Decision**: keep the existing `<fieldset>` / `<legend>` recursion and restyle it — a bounded card
per group with a left accent rail, an indented child list, and a header stating the operator in
words ("Match **all** of the following"). Comparison rows become a single CSS grid row that wraps
onto a second line below `sm`, never scrolling the page horizontally.

**Rationale**: `fieldset` gives group nesting to assistive technology and document tab order for
free, which is most of FR-044 already satisfied by the existing code; replacing it with `div`s would
mean re-implementing `role="group"` plus `aria-labelledby` by hand and re-testing it. FR-002 and
FR-003 are about *visible* bounds and indentation, which is paint, not structure.

Depth is conveyed by indentation plus an accent-colour cycle over nesting level, not by colour
alone — colour is a redundant cue, so SC-011's contrast requirement is unaffected.

**Alternatives rejected**: a bespoke tree widget with `role="tree"` and roving `tabindex` (a
composite widget where every node contains form controls is a known screen-reader trap, and the
existing suite would have to be rewritten); connector lines drawn with pseudo-elements only (they
disappear under forced-colours settings, and would be the sole nesting cue).

---

## R14 — Testing approach

**Decision**:

- **Backend**: a plain JUnit unit test on `FieldMetadataService` constructed directly with
  `PersonFieldRegistry` — no Spring, no Postgres — asserting the four effective operator sets in
  R1's table, that `createdAt` publishes no ordered operator, that `risk` publishes its four
  constants, and that no `joinPath`/`attributePath` appears in the VM. Plus one test extending
  `PostgresIntegrationTest` (`@Tag("integration")`) asserting the endpoint's status, ordering and
  JSON shape through MockMvc.
- **Frontend**: Vitest + RTL + MSW, with a `/rules/fields/metadata` handler whose body is the
  service's real response. Tests: US1 rendering and summary over the SC-006 corpus; US2 field →
  operator → value cascade including reset-on-field-change and shape-change discard; US3
  single-save (asserting exactly one `POST /rules` carrying `id` + `version`) and the
  `CONCURRENT_MODIFICATION` path; US4 reorder round-trip and end-disabled controls; US5 unknown
  field and metadata-failure banners.

**Rationale**: matches the constitution's definition of done — contract behaviour asserted by test,
not by `curl`; integration tests tagged and run against Testcontainers Postgres. The metadata
derivation is the one piece of genuinely new server logic and it needs no database, so it gets a
fast unit test that will run on every `mvn test`.

**Alternatives rejected**: asserting the operator sets only through the HTTP endpoint (a failure
would not say whether the derivation or the serialisation broke); an end-to-end browser suite (none
exists, and 002 recorded the decision not to introduce one).
