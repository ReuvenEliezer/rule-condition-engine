# Contract: the client field catalog

**Feature**: `002-rule-engine-ui` | **Date**: 2026-09-03

`GET /api/v1/rules/fields` publishes field **names** only. FR-002, FR-003, FR-004 and SC-002 need
each field's type, its permitted operators and — for enumerated fields — its permitted values. This
file is the documented stopgap the specification prescribes (dependency #2): a client-side catalog,
derived from server source, validated against the published names at start-up.

**This is a copy of server-side truth and will drift the moment a field is added, retyped, or
removed.** The start-up check in §4 is what converts silent drift into a loud configuration error.

---

## 1. How the entries were derived

An operator is offered only if it survives **both** server-side gates. Getting this wrong in either
direction is a defect:

1. **`FieldDescriptor.requireCompatible(operator)`** — rejects textual operators on non-textual
   fields, and ordered operators on non-ordered types. Throws `INCOMPATIBLE_OPERATOR`.
2. **`FieldDescriptor.coerce(value)`** — narrows the operand onto the column's Java type. Throws
   `INVALID_RULE`.

Gate 2 is strictly narrower than gate 1, and that gap is where the traps live:

- `isOrdered()` is `isNumeric() || (Comparable && !isEnum())`, so it is **true for `String` and for
  `Instant`**. `age > 30` shaped against `name` passes `requireCompatible` and then dies in
  `coerceNumber` with *"Cannot coerce a NUMBER operand onto field 'name' of type String"*. The
  catalog therefore gates `GT`/`GTE`/`LT`/`LTE`/`BETWEEN` on **`isNumeric()`**, not `isOrdered()`.
- `Instant` hits the same wall, which is exactly the specification's "time-based conditions are not
  expressible" gap: `coerceScalar` can `Instant.parse` a `STRING`, but `coerceNumber` has no
  `Instant` branch, so every ordered and range comparison over `createdAt` fails.
- Enum fields reject `NUMBER` operands: `coerceScalar` calls `Enum.valueOf`, and a `NumberValue`
  routes to `coerceNumber`, which has no enum branch.

The resulting rule, in one line each:

| Operator group | Offered when | Operand shape |
|---|---|---|
| `CONTAINS`, `STARTS_WITH`, `ENDS_WITH` | `javaType == String` | `STRING` |
| `GT`, `GTE`, `LT`, `LTE` | `isNumeric()` | `NUMBER` |
| `BETWEEN` | `isNumeric()` | `RANGE` |
| `EQUALS`, `NOT_EQUALS` | always | `NUMBER` if numeric, else `STRING` |
| `IN`, `NOT_IN` | always | `LIST` of strings |
| `IS_NULL`, `IS_NOT_NULL` | always | none (`UNARY` node) |

---

## 2. The catalog

Eight entries, mirroring `PersonFieldRegistry.DESCRIPTORS`.

| `logicalName` | `javaType` | `valueKind` | Binary operators offered | `enumValues` |
|---|---|---|---|---|
| `name` | `String` | `TEXT` | `EQUALS`, `NOT_EQUALS`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `IN`, `NOT_IN` | — |
| `age` | `Integer` | `NUMBER` | `EQUALS`, `NOT_EQUALS`, `GT`, `GTE`, `LT`, `LTE`, `BETWEEN`, `IN`, `NOT_IN` | — |
| `city` | `String` | `TEXT` | `EQUALS`, `NOT_EQUALS`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `IN`, `NOT_IN` | — |
| `risk` | `RiskLevel` | `ENUM` | `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN` | `LOW`, `MEDIUM`, `HIGH`, `CRITICAL` |
| `createdAt` | `Instant` | `INSTANT` | `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN` | — |
| `case.role` | `PersonRole` | `ENUM` | `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN` | `SUBJECT`, `ASSOCIATE`, `WITNESS` |
| `case.status` | `CaseStatus` | `ENUM` | `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN` | `OPEN`, `UNDER_REVIEW`, `CLOSED` |
| `case.title` | `String` | `TEXT` | `EQUALS`, `NOT_EQUALS`, `CONTAINS`, `STARTS_WITH`, `ENDS_WITH`, `IN`, `NOT_IN` | — |

`IS_NULL` and `IS_NOT_NULL` are offered on **all eight** (FR-005).

**Enum values are a closed choice** (FR-004): the value control is a select over `enumValues`, never
free text. `coerceScalar` calls `Enum.valueOf` and an unknown name is 400 `INVALID_RULE` naming the
allowed set — a rejection the builder must make unreachable.

### 2.1 Notes on individual entries

- **`createdAt`** is the person's creation instant. Operand format is an ISO-8601 instant
  (`Instant.parse`), so the control is a datetime input emitting e.g. `2026-09-03T10:15:30Z`.
  Equality against an exact instant is the only useful comparison, which makes the field close to
  unusable in practice — the UI labels it as such rather than offering range operators the service
  will reject. A rule like "created in the last thirty days" cannot be built.
- **`case.role`, `case.status`, `case.title`** traverse a join through `caseLinks`. Two consequences
  the UI states plainly: a condition on them matches a person **linked to at least one case**
  satisfying it, and multiple `case.*` conditions in one tree share a single join, so they must all
  hold for the *same* case, not for different ones.
- **`city`** is the only genuinely nullable registered column (`@Column(name = "city")` with no
  `nullable = false`). See §3.

---

## 3. Accepted limitation: presence tests on non-nullable fields

The registry carries no nullability, so `IS_NULL` / `IS_NOT_NULL` are offered on every field
including `name`, `age` and `risk`, which are `nullable = false`. `IS_NULL` on one of those produces
a rule that **matches nothing** — never a rejection. SC-002 concerns rejections originating from the
builder, so this stays within budget. It is recorded here rather than hidden, and it disappears the
day the server publishes nullability.

A related asymmetry worth surfacing in the builder's help text: `NOT_EQUALS` and `NOT_IN` compile to
`(col <> x OR col IS NULL)` (`RuleCompiler.compileCondition`), so "risk is not HIGH" **includes**
persons with no risk recorded. That is deliberate server behaviour, not a client choice.

---

## 4. Start-up validation (spec dependency #2)

On boot, once, before the rule builder is reachable:

```
GET /api/v1/rules/fields  →  string[]
```

Compare that array's contents to the catalog's `logicalName` set:

| Outcome | Action |
|---|---|
| Equal sets | proceed |
| Server publishes a name the catalog lacks | **blocking configuration error**, naming the field |
| Catalog holds a name the server no longer publishes | **blocking configuration error**, naming the field |
| Request fails | transport failure, retryable — distinguished from a mismatch (FR-040) |

A mismatch blocks the rule builder specifically; browsing, running existing rules, and the audit
trail remain usable, because none of them depends on the catalog. The message names the offending
field and says the client catalog is out of date with the service — it never silently omits an
unknown field or guesses its type, because either would produce exactly the unexplainable rejection
SC-002 forbids.

This check cannot detect a field that was **retyped** (name unchanged, `javaType` different). That
residual risk is the price of the stopgap, and it is the reason
[../research.md §R4](../research.md#r4--the-field-metadata-gap-specification-dependency-2) records
publishing the metadata server-side as the real fix.
