# rule-condition-engine

JSON condition trees, stored as `jsonb`, compiled into JPA Criteria predicates.

Java 25 · Spring Boot 4.1.1 · Postgres 18.

---

## Not yet verified — read this first

**The project has not been compiled.** Maven Central is blocked from the environment this was
generated in (`403` from the egress proxy) and no `javac` is available, so nothing here has been
through a compiler or a test run. The logic and the API shapes are deliberate, but expect to fix
import-level and signature-level breakage on the first `mvn test`. Three spots to look at first:

1. **`Rule.conditionTree` mapping.** `@Convert` + `@JdbcTypeCode(SqlTypes.JSON)` is the combination
   that makes Hibernate bind the converter's `String` output as `jsonb` rather than `text` — Postgres
   will not implicitly cast between them. This works on Hibernate 6.2+, but confirm it on the exact
   Hibernate 7.x that Boot 4.1.1 pulls in before building anything on top of it.
2. **`RuleNodeConverter` as a Spring bean.** It relies on Boot wiring Hibernate's `SpringBeanContainer`
   so the converter gets the application `ObjectMapper`. If Hibernate instantiates it reflectively
   instead, `objectMapper` will be null at first use.
3. **`Specification` in Spring Data JPA 4.** The `toPredicate` contract changed across 3.x → 4.x
   (notably `query` being nullable); the compiler guards for null, but verify against the actual
   interface.

---

## The shape of the thing

```
RuleNode (sealed)
├── GroupNode           AND / OR / NOT + children
├── ConditionNode       field <op> value        (always has a value)
└── UnaryConditionNode  field IS_NULL           (never has a value)

ConditionValue (sealed)
├── StringValue   { "type": "STRING", "value": "AVI" }
├── NumberValue   { "type": "NUMBER", "value": 30 }
├── RangeValue    { "type": "RANGE", "from": 30, "to": 40 }
└── ListValue     { "type": "LIST", "values": ["HIGH", "CRITICAL"] }
```

The canonical rule — persons whose name contains "AVI", aged 30–40, risk HIGH:

```json
{
  "type": "GROUP",
  "operator": "AND",
  "children": [
    { "type": "CONDITION", "field": "name", "operator": "CONTAINS",
      "value": { "type": "STRING", "value": "AVI" } },
    { "type": "CONDITION", "field": "age", "operator": "BETWEEN",
      "value": { "type": "RANGE", "from": 30, "to": 40 } },
    { "type": "CONDITION", "field": "risk", "operator": "EQUALS",
      "value": { "type": "STRING", "value": "HIGH" } }
  ]
}
```

---

## Decisions worth arguing with

### Compile to SQL, don't interpret in memory

The compiler emits a `Specification`, so filtering, counting and pagination all happen in Postgres.
An in-memory interpreter over `findAll()` is far simpler and is the wrong choice at any realistic
population size — no index use, no database-side pagination, and memory proportional to the table
rather than to the result page.

### JPA Criteria, not jOOQ

Earlier discussion used jOOQ. This project uses Criteria instead, because the entity model already
exists and jOOQ's codegen requires a live schema at build time — a real amount of CI plumbing for a
predicate builder this small. The trade is real: Criteria is markedly uglier, its generics fight you
around `Comparable`, and complex SQL (window functions, CTEs) is where jOOQ pulls decisively ahead.
If this grows into scoring or aggregation rather than filtering, revisit it.

### The field registry is the security boundary

`field` arrives from outside the process. `PersonFieldRegistry` maps a logical name onto an attribute
path, and an unregistered name throws rather than resolving. The logical name is never concatenated
into a query — it is only ever a map key. `nationalId` is deliberately *not* registered: exposing a
direct-identifier lookup through a free-form rule builder turns the rule API into an enumeration
oracle.

### Two leaf types instead of a nullable value

`IS_NULL` takes no operand. Rather than `Optional<ConditionValue>` or a null threaded through every
compiler branch, unary operators get their own node type. `ConditionNode.value()` is then non-null
everywhere, unconditionally.

### Validation happens as early as it can

| Check | Where | Why there |
|---|---|---|
| Operator ↔ value shape (`BETWEEN` needs a `RANGE`) | `ConditionNode` compact constructor | Fails during deserialization, before the tree is ever stored |
| `NOT` arity, empty groups, inverted ranges | node constructors | Locally decidable |
| Depth / node count / IN-list size | `RuleTreeValidator` | Only visible with the whole tree in hand |
| Operator ↔ *field type* (`CONTAINS` on an int) | `FieldDescriptor` | Needs schema knowledge the AST doesn't have |
| Whole-tree compilability | `RuleService` on write | An unqueryable rule should fail for its author, not for the analyst running it |

### Two SQL-semantics choices you may disagree with

- **`NOT_EQUALS` includes NULLs.** SQL's `col <> 'HIGH'` drops rows where `col IS NULL`. Rule authors
  essentially never mean that, so the compiler emits `col <> ? OR col IS NULL`. If you want strict
  SQL semantics, remove the `cb.isNull` arm — but then document it loudly.
- **LIKE metacharacters are escaped.** A needle of `%` would otherwise match every row. Not a
  security hole (operands are bound parameters either way) but a correctness one, and a filter that
  silently over-matches is worse than an error in an investigative tool.

---

## `GLOBAL` vs `CASE_SCOPED`

The open question from the design discussion: a rule belongs to exactly one case, but that doesn't
say whether the case *bounds* the search or merely *owns* the rule. Both are legitimate:

- `GLOBAL` — search the whole population. "Who out there looks like this?" (discovery)
- `CASE_SCOPED` — search only persons already linked to the case. "Which of my subjects match?" (triage)

The caller states which. `GET /api/v1/rules/{id}/matches?scope=CASE_SCOPED`.

---

## API

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/rules` | Create; the tree must compile or the write is rejected |
| `GET` | `/api/v1/rules/{id}` | Fetch a rule with its tree |
| `PUT` | `/api/v1/rules/{id}/condition` | Replace the tree |
| `GET` | `/api/v1/rules/{id}/matches?scope=&page=&size=` | Evaluate |
| `POST` | `/api/v1/rules/preview` | Dry-run an unsaved tree — what makes a builder UI usable |
| `GET` | `/api/v1/rules/fields` | Queryable field list, drives the UI dropdown |

---

## Schema

`rule.case_id` is `UNIQUE` — that is what makes rule:case genuinely 1:1 rather than 1:N by
convention. `person_case` is an explicit join *entity*, not `@ManyToMany`, because the link row
carries its own attributes (`role`, `linked_at`).

`case` is a reserved SQL keyword, hence the table name `case_file`.

`CONTAINS` compiles to `LOWER(name) LIKE '%...%'`, which a btree index cannot serve — hence the
`pg_trgm` GIN index in `V1__init.sql`. Without it, every `CONTAINS` rule is a sequential scan.

---

## Running

```bash
docker compose up -d          # Postgres 18.4, waits on pg_isready
mvn spring-boot:run           # Flyway migrates on startup
mvn test                      # Testcontainers spins its own Postgres
```

Compose credentials are dev-only defaults and are not appropriate for any shared environment.

---

## Known gaps

- **No date/time comparisons.** `createdAt` is registered and `GT`/`BETWEEN` accept only
  `NumberValue`, so temporal rules currently fail coercion. Needs an `InstantValue` shape in the
  sealed hierarchy — a genuine hole if rules should express "opened in the last 30 days".
- **No multi-tenancy.** Your stated schema had no tenant column so none was invented, but for a
  compliance/intelligence platform this is the first thing to add — and it has to be enforced at the
  query level (a base repository or a Hibernate `@Filter`), not by application-layer filtering. Note
  that the field registry is a *global static map*; tenant-specific queryable fields would need it to
  become tenant-scoped.
- **No audit trail.** Who authored a rule, who ran it, and what it returned are all unrecorded. In
  this domain that is usually a hard requirement rather than a nice-to-have.
- **No authn/authz.** Every endpoint is open.
- **`CASE_SCOPED` forces `DISTINCT`.** An `EXISTS` subquery would avoid it, but the compiler may
  already have joined `caseLinks` for a `case.*` field and a second independent join would change the
  predicate's meaning. If `case.*` fields are dropped from the registry, switch to `EXISTS`.
- **No rule versioning.** Editing a tree overwrites it, so a past evaluation cannot be reproduced.
- **The browser client's field catalog duplicates server truth.** `GET /api/v1/rules/fields`
  publishes names only, so `ui/src/rules/catalog.ts` holds a hand-derived copy of each field's type,
  operators and enum values. A start-up set-equality check turns an added or removed field into a
  blocking configuration error, but **a field retyped under an unchanged name is undetectable** by
  that check. The fix is to publish the metadata (type, operators, enum values) from
  `RuleController.queryableFields()`. See [`ui/README.md`](ui/README.md) and
  [`specs/002-rule-engine-ui/contracts/field-catalog.md`](specs/002-rule-engine-ui/contracts/field-catalog.md).
