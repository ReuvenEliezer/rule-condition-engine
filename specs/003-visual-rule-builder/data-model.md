# Phase 1 Data Model: Visual Rule Condition Builder

**Feature**: `003-visual-rule-builder` | **Date**: 2026-09-03 | **Plan**: [plan.md](./plan.md)

**No persisted entity, column, index or migration changes in this feature.** The condition tree,
the `rule` table and every stored JSON document keep the exact shape
[002's data model](../002-rule-engine-ui/data-model.md) describes, including both `type`
discriminators. What is new is one *published* type (§1) and a set of *client-only* draft types
(§3) that never reach the database.

---

## 1. Field metadata — the one new published type

### 1.1 `FieldMetadataVm` (`src/main/java/com/eliezer/ruleengine/api/dto/FieldMetadataVm.java`)

An immutable record, one per queryable field. Derived at start-up from `FieldRegistry`
(research [R1](./research.md#r1--where-the-published-field-metadata-comes-from)); never hand-written.

| Field | Type | Notes |
|---|---|---|
| `logicalName` | `String` | the name that appears in rule JSON — the map key, never a query fragment |
| `label` | `String` | human display label, from `FieldDescriptor.label()` |
| `valueKind` | `FieldValueKind` | `TEXT` \| `NUMBER` \| `ENUM` \| `INSTANT` |
| `operators` | `List<ComparisonOperator>` | the **effective** set (FR-037), declaration order |
| `presenceTestable` | `boolean` | always `true` today; published so the client holds no rule of its own |
| `enumValues` | `List<String>` \| `null` | non-null only when `valueKind == ENUM`; declaration order |

Deliberately absent: `joinPath`, `attributePath`, `javaType` — see research
[R4](./research.md#r4--what-the-metadata-endpoint-does-not-publish). Publishing the mapping would
expose the entity graph to an unauthenticated caller and give the builder nothing it needs.

**Invariants** (asserted in the compact constructor, so a malformed entry cannot be constructed):

- `logicalName` and `label` are non-blank.
- `enumValues` is non-null and non-empty **iff** `valueKind == ENUM`.
- `operators` is non-null (it may legitimately be empty; presence tests remain available).

### 1.2 `FieldValueKind`

A published abstraction over `javaType`, deliberately coarser than the Java type: the builder's only
decision is which value control to render.

| Kind | Java types today | Value control |
|---|---|---|
| `TEXT` | `String` | one text box (list operator → multi-entry text list) |
| `NUMBER` | `Integer`, `Long`, `Short`, `Double`, `BigDecimal` | one numeric box; `BETWEEN` → two bounds |
| `ENUM` | any `Enum` subtype | a closed choice over `enumValues`; list operator → multi-select |
| `INSTANT` | `Instant` | one text box holding an ISO-8601 instant |

A registered `javaType` matching none of these is a **start-up failure** naming the field and the
type (research [R2](./research.md#r2--an-unclassifiable-field-type-fails-at-start-up)).

### 1.3 `FieldDescriptor.label` — the one registry change

`FieldDescriptor` gains a `label` component. The compact constructor derives a humanised fallback
from `logicalName` when the label is null or blank, so the existing `of(name, attr, type)` and
`joined(name, joinPath, attr, type)` factories are unchanged and every existing call site keeps
compiling. `PersonFieldRegistry` supplies eight explicit labels:

| `logicalName` | `label` |
|---|---|
| `name` | Name |
| `age` | Age |
| `city` | City |
| `risk` | Risk level |
| `createdAt` | Created at |
| `case.role` | Linked case — role |
| `case.status` | Linked case — status |
| `case.title` | Linked case — title |

The label for `createdAt` drops 002's parenthetical "(exact instant only — no ranges)": that caveat
was a client-side apology for a client-side guess. The published `operators` now state it — the
ordered operators are simply absent — so the label goes back to naming the field.

### 1.4 Effective operator sets this must produce

Reproduced from research [R1](./research.md#r1--where-the-published-field-metadata-comes-from) as
the acceptance target for the derivation:

| Fields | Kind | `operators` |
|---|---|---|
| `name`, `city`, `case.title` | TEXT | EQUALS, NOT_EQUALS, CONTAINS, STARTS_WITH, ENDS_WITH, IN, NOT_IN |
| `age` | NUMBER | EQUALS, NOT_EQUALS, BETWEEN, GT, GTE, LT, LTE, IN, NOT_IN |
| `risk`, `case.role`, `case.status` | ENUM | EQUALS, NOT_EQUALS, IN, NOT_IN |
| `createdAt` | INSTANT | EQUALS, NOT_EQUALS, IN, NOT_IN |

`enumValues`: `risk` → `LOW, MEDIUM, HIGH, CRITICAL`; `case.role` → `SUBJECT, ASSOCIATE, WITNESS`;
`case.status` → `OPEN, UNDER_REVIEW, CLOSED`.

---

## 2. The condition tree — unchanged, restated for reference

`ui/src/api/tree.ts` and `src/main/java/com/eliezer/ruleengine/rule/model/` are **not modified**.
The three node shapes and four value shapes are exactly as stored today, including the `type`
discriminator on both nodes and values (spec Assumptions: renaming it would invalidate every stored
rule).

```text
RuleNode = GroupNode | ConditionNode | UnaryConditionNode

GroupNode          { type: 'GROUP',     operator: AND|OR|NOT, children: RuleNode[] }   // ordered, non-empty; NOT ⇒ exactly 1
ConditionNode      { type: 'CONDITION', field, operator: ComparisonOperator, value }   // value never absent
UnaryConditionNode { type: 'UNARY',     field, operator: IS_NULL|IS_NOT_NULL }         // no value

ConditionValue = { type:'STRING', value }
               | { type:'NUMBER', value }            // BigDecimal on the wire — held as a STRING client-side
               | { type:'RANGE',  from, to }         // inclusive; from ≤ to
               | { type:'LIST',   values }           // non-empty; de-duplicated server-side, first-seen order
```

Two properties carried forward unchanged, both load-bearing for this feature's success criteria:

- **Order is the only representation of order.** `children` is a `List` persisted as a JSON array.
  Reordering (US4, FR-025) mutates that array and nothing else; no `position` attribute is
  introduced (SC-005).
- **Numeric operands stay strings client-side.** `lossless-json` keeps `10.50` verbatim through
  parse and serialise, so a rule opened and saved with no edit is byte-identical (SC-004). This
  feature adds no code path that converts an operand to a JavaScript `number` — including the
  summary renderer, which prints the stored string as-is.

**Scope reminder** (memory: `ui-lossless-json-scoped-to-condition`): lossless parsing applies to the
condition subtree only. `version`, `page` and `size` go through plain `JSON.parse`, and the new
metadata response is ordinary JSON — it contains no decimals.

---

## 3. Client-only draft state

None of this is persisted anywhere — no `localStorage`, no `sessionStorage` (002's Technical Context
constraint holds unchanged).

### 3.1 `RuleDraft` — what the rule page holds

| Field | Type | Source | Sent on save |
|---|---|---|---|
| `id` | `string` | loaded rule | yes |
| `version` | `number` | loaded rule, at load time | yes — FR-033a |
| `caseId` | `string` | loaded rule | yes (server requires it; not editable — FR-032) |
| `name` | `string` | editable | yes |
| `enabled` | `boolean` | editable | yes |
| `condition` | `RuleNode` | editable | yes |
| `createdAt/By`, `updatedAt/By`, `type` | `string` | loaded rule | **no** — displayed as text (FR-032) |

`version` is captured once at load and never refreshed from a background query: refreshing it would
silently defeat the staleness check it exists to trigger. After a `CONCURRENT_MODIFICATION`
refusal the draft is preserved and the author is offered an explicit reload, which replaces the
whole draft including `version` (FR-033b).

### 3.2 `FieldMetadata` — the client mirror of §1.1

```ts
type FieldValueKind = 'TEXT' | 'NUMBER' | 'ENUM' | 'INSTANT';

type FieldMetadata = {
  readonly logicalName: string;
  readonly label: string;
  readonly valueKind: FieldValueKind;
  readonly operators: readonly ComparisonOperator[];
  readonly presenceTestable: boolean;
  readonly enumValues?: readonly string[];
};
```

Every property is `readonly`: this is *received* data, never constructed by the client. The
`ComparisonOperator` union stays in `ui/src/api/tree.ts` — it mirrors the fixed model (spec
Assumptions: no operator is added or removed by this feature), not the per-field data SC-008
forbids duplicating.

**Deleted with this feature** (SC-008, FR-038): `ui/src/rules/catalog.ts`,
`ui/src/rules/catalog.test.ts`, `ui/src/rules/catalogValidation.ts`,
`ui/src/rules/catalogValidation.test.ts`, and `QUERYABLE_FIELDS` in `ui/src/test/fixtures.ts` once
its last consumer goes.

### 3.3 `OperandShape` — derived, not stored

The one piece of catalog-adjacent logic that survives, because it is a *derivation* over published
data rather than a copy of it. It moves to `ui/src/rules/metadata.ts` and is keyed off the published
`valueKind`:

| Operator | `valueKind` | Shape | Control |
|---|---|---|---|
| `BETWEEN` | any | `RANGE` | two numeric bounds |
| `IN`, `NOT_IN` | `ENUM` | `ENUM_LIST` | multi-entry closed choice |
| `IN`, `NOT_IN` | other | `LIST` | multi-entry text list |
| other | `ENUM` | `ENUM` | single closed choice |
| other | `NUMBER` | `NUMBER` | single numeric box |
| other | `TEXT`, `INSTANT` | `STRING` | single text box |
| presence test | any | `NONE` | no control |

### 3.4 Node identity and addressing

Nodes carry no id — they are addressed by `NodePath` (`number[]`, the child indices from the root;
`[]` is the root), exactly as `treeOps.ts` does today. Reordering changes paths by design, so
transient per-node UI state (a collapsed group) is held in the component keyed by path and is
allowed to reset on a move; nothing about the tree's meaning depends on it.

### 3.5 Validation model

`TreeViolation { path: number[]; message: string }` is unchanged in shape. What changes is the
checks, which become metadata-aware (FR-027):

| Check | Decidable from | New in this feature |
|---|---|---|
| group non-empty | tree | no |
| `NOT` has exactly one child | tree | no |
| field chosen | tree | no |
| text/number/range/list operand well-formed | tree | no |
| range not inverted | tree | no |
| list non-empty and blank-free | tree | no |
| **field is published** | metadata | **yes** — FR-039 / research R9 |
| **operator is in the field's published set** | metadata | **yes** — FR-027 last clause |
| **value shape matches the operator's required shape** | metadata + tree | **yes** — FR-027 |
| **enum value is one of `enumValues`** | metadata | **yes** — FR-013 |
| **name non-empty** | draft | **yes** — FR-032 US3 scenario 4 |

Still **not** checked client-side, deliberately (FR-029): tree depth, node count, list length. The
server owns those and its `RULE_TREE_TOO_COMPLEX` message names which budget was exceeded and its
limit. Mirroring them would create a fourth place to drift.

---

## 4. Entity relationships (unchanged)

```text
CaseFile 1 ──── 0..1 Rule          # one rule per case; enforced in RuleCrudService.beforeSave
Rule     1 ──── 1    RuleNode      # the condition tree, jsonb, via RuleNodeConverter
Rule     1 ──── 0..n AuditEntry    # one entry per save (SC-009)
FieldRegistry 1 ─── n FieldDescriptor 1 ─── 1 FieldMetadataVm   # derived at start-up, never stored
```

The rule page reads `Rule` (detail, with condition) and `FieldMetadataVm[]`, and writes `Rule`
(name, enabled, condition) — nothing else.
