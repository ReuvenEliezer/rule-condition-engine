# Contract: Published Field Metadata

**Feature**: `003-visual-rule-builder` | **Status**: the one backend capability this feature adds

This is the contract for `GET /api/v1/rules/fields/metadata` — its shape, its derivation rule, and
what it is forbidden to publish. It supersedes
[002's `field-catalog.md`](../../002-rule-engine-ui/contracts/field-catalog.md), whose subject (a
client-held copy validated at start-up) ceases to exist.

---

## 1. The route

```http
GET /api/v1/rules/fields/metadata
200 OK
Content-Type: application/json
```

- **Additive.** `GET /api/v1/rules/fields` is unchanged and keeps returning sorted logical names
  only. Existing callers are unaffected (spec Assumptions: "The metadata endpoint is additive").
- **No parameters.** No paging, no filtering, no sorting knobs.
- **No database access.** The body is computed once at application start-up from
  `PersonFieldRegistry` and served from memory.
- **Deterministic.** Two calls to the same running instance return byte-identical bodies.

### 1.1 Ordering

- Entries: ascending by `logicalName` — the same ordering `/rules/fields` uses.
- `operators`: `ComparisonOperator` **declaration** order, not alphabetical. Declaration order
  groups equality, then text, then range, then ordered, then membership operators; alphabetical
  order interleaves them and reads as noise in a dropdown.
- `enumValues`: enum constant declaration order — for `risk` that is `LOW → CRITICAL`, an ordering
  that carries meaning alphabetical order would destroy.

---

## 2. Response body

```json
[
  {
    "logicalName": "age",
    "label": "Age",
    "valueKind": "NUMBER",
    "operators": ["EQUALS", "NOT_EQUALS", "BETWEEN", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN"],
    "presenceTestable": true,
    "enumValues": null
  },
  {
    "logicalName": "case.role",
    "label": "Linked case — role",
    "valueKind": "ENUM",
    "operators": ["EQUALS", "NOT_EQUALS", "IN", "NOT_IN"],
    "presenceTestable": true,
    "enumValues": ["SUBJECT", "ASSOCIATE", "WITNESS"]
  },
  {
    "logicalName": "createdAt",
    "label": "Created at",
    "valueKind": "INSTANT",
    "operators": ["EQUALS", "NOT_EQUALS", "IN", "NOT_IN"],
    "presenceTestable": true,
    "enumValues": null
  },
  {
    "logicalName": "name",
    "label": "Name",
    "valueKind": "TEXT",
    "operators": ["EQUALS", "NOT_EQUALS", "CONTAINS", "STARTS_WITH", "ENDS_WITH", "IN", "NOT_IN"],
    "presenceTestable": true,
    "enumValues": null
  }
]
```

Full expected body for today's registry: eight entries — `age`, `case.role`, `case.status`,
`case.title`, `city`, `createdAt`, `name`, `risk` — with the operator sets in
[data-model.md §1.4](../data-model.md#14-effective-operator-sets-this-must-produce).

### 2.1 Fields

| Field | Type | Nullable | Meaning |
|---|---|---|---|
| `logicalName` | string | no | the name that appears in rule JSON |
| `label` | string | no | human display label, from the registry |
| `valueKind` | `TEXT`\|`NUMBER`\|`ENUM`\|`INSTANT` | no | which value control to render |
| `operators` | array of `ComparisonOperator` | no | the **effective** set — §3 |
| `presenceTestable` | boolean | no | whether `IS_NULL` / `IS_NOT_NULL` may be offered |
| `enumValues` | array of string | yes | non-null **iff** `valueKind == ENUM` |

### 2.2 What this response must never contain

`joinPath`, `attributePath`, `javaType`, or any other description of the persistence mapping.
`caseLinks.caseFile` is a map of the entity graph handed to an unauthenticated caller; the builder
needs the logical name it already sends and nothing more (constitution principle IV; research
[R4](../research.md#r4--what-the-metadata-endpoint-does-not-publish)).

A test asserts the absence, not just the presence, of these keys.

---

## 3. The derivation rule (FR-036, FR-037) — normative

An operator appears in a field's `operators` **iff** there exists a `ConditionValue` shape `S` such
that all three hold:

1. `operator.accepts(probe(S))` — the operator declares the shape;
2. `descriptor.requireCompatible(operator)` does not throw — the declared-compatibility check;
3. `descriptor.coerce(probe(S))` does not throw — the operand coercion.

Both (2) and (3) are executed against the real `FieldDescriptor`. Neither is re-stated as a table.

`probe(S)` is built from the descriptor's own `javaType`
([research R1](../research.md#r1--where-the-published-field-metadata-comes-from)): a valid enum
constant for an enum field, `Instant.EPOCH` rendered ISO-8601 for an instant field, `"1"` for a
numeric field, `"sample"` for a text field; `NumberValue(1)` and `RangeValue(0, 1)` for the numeric
shapes.

### 3.1 Why stage (3) is not optional

`FieldDescriptor.isOrdered()` returns true for `String` and `Instant`, because both are
`Comparable`. So `name > 30` and `createdAt BETWEEN …` pass `requireCompatible` and die inside
`coerceNumber`, which has no branch for either type. A metadata surface that published stage (2)
alone would offer an author operators that are rejected at save time — the exact regression the
spec names, and a direct violation of SC-002.

The observable consequence, asserted by test: **`createdAt` publishes no ordered operator**
(`GT`, `GTE`, `LT`, `LTE`, `BETWEEN` are all absent), and neither do `name`, `city` or
`case.title`.

### 3.2 `presenceTestable`

`UnaryConditionNode` compiles straight to `isNull` / `isNotNull` on the resolved path. It has no
compatibility check and no coercion, so today the value is `true` for every field. It is published
rather than assumed so that the client holds no rule of its own about which fields accept a presence
test — if that ever stops being universally true, one server change updates every client.

### 3.3 An unclassifiable field type is a start-up failure

If a registered `javaType` maps to no `FieldValueKind`, the application fails to start with a
message naming the field and its type. It is never published with a guessed kind and never silently
omitted (research [R2](../research.md#r2--an-unclassifiable-field-type-fails-at-start-up)).

---

## 4. Failure behaviour

The endpoint has no per-request failure mode of its own — no parameters to reject, no database to be
unavailable. What the client must handle is **transport failure**: the service unreachable, or a
non-2xx from an infrastructure layer.

Per FR-040 this is presented as a **distinct, retryable failure**, separate from the rule itself
being unavailable: its own banner, its own retry, its own message naming the field choices rather
than the rule. The two are separate queries precisely so one retry cannot retry the wrong thing
(research [R8](../research.md#r8--failure-separation-metadata-versus-rule)).

There is **no drift-blocked state**. 002's start-up set-equality check compared two copies; with one
copy there is nothing to compare, so `catalogValidation.ts` and the blocked builder it produced are
deleted rather than reimplemented (SC-007).

---

## 5. Client obligations

1. **Single source.** Field names, labels, types, per-field operators and enum values come from this
   response and nowhere else. No hand-maintained duplicate of any of it may exist in `ui/`
   (FR-038, SC-008).
2. **Derivations are allowed; copies are not.** `operandShape(kind, operator)` derives a control
   choice from published data and stays. A table of which operators a `TEXT` field accepts is a
   copy and goes.
3. **Unknown fields are shown, not substituted.** A stored rule referencing a `logicalName` absent
   from this response renders with the name verbatim, marked unavailable, and blocks saving until it
   is changed or removed (FR-039, research
   [R9](../research.md#r9--a-rule-referencing-a-field-the-service-no-longer-publishes)).
4. **Presence tests are presented as operators.** The model calls them a distinct node shape; the
   author sees "has no value" alongside the comparison operators, and the client converts the node
   shape behind the scenes (FR-016, spec Assumptions).
5. **No structural budgets.** Depth, node count and list length are not mirrored client-side; the
   server's `RULE_TREE_TOO_COMPLEX` message is shown as given (FR-029).

---

## 6. Compatibility

| Consumer | Effect |
|---|---|
| `GET /api/v1/rules/fields` callers | none — route unchanged |
| `PUT /api/v1/rules/{id}/condition` callers | none — route unchanged, still unversioned |
| Stored rules | none — no tree, discriminator or value shape changes |
| `RuleVm` / `POST /api/v1/rules` | none — no field added or removed |
| Existing backend tests | none — `FieldDescriptor`'s existing factories keep their signatures |
