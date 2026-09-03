# rule-condition-engine

JSON condition trees, stored as `jsonb`, compiled into JPA Criteria predicates.

Java 25 · Spring Boot 4.1.1 · Postgres 18.

---

## Status

Backend `mvn verify` passes (89 tests, Testcontainers Postgres). The browser client in
[`ui/`](ui/README.md) builds and its Vitest suite passes (156 tests). `mvn -Pui clean package`
produces a jar that serves the API and the UI from one origin. See [Running](#running).

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

There are two ways to run this: **dev mode** (two processes — Spring Boot on `:8080`, Vite on
`:5173`, hot-reload on both) and the **single jar** (one process on `:8080` serving the API *and*
the built UI from one origin).

### Prerequisites

| Tool | Version | Used for |
|---|---|---|
| JDK | 25 | backend |
| Docker | any recent | Postgres (dev DB and Testcontainers) |
| Node | 24 | frontend — dev mode and the `-Pui` build only |

Maven is invoked through the cached wrapper distribution, **not** a CLI `mvn` and **not** `./mvnw`
(there is no wrapper script in this repo). Everything below writes it out; `$MVN` is shorthand for:

```bash
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn
```

### 1. Start Postgres

```bash
docker compose up -d
```

Postgres 18.4 on `localhost:5432`, database/user/password all `ruleengine`. These are dev-only
defaults and are not appropriate for any shared environment.

### 2. Dev mode — backend

```bash
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn spring-boot:run
```

Flyway migrates on startup and `ddl-auto` is `validate`, so a schema mismatch fails loudly here
rather than at first query. Check it is up and publishing the eight field names the UI catalog
expects:

```bash
curl -s localhost:8080/api/v1/rules/fields
```

Expected (sorted): `age`, `case.role`, `case.status`, `case.title`, `city`, `createdAt`, `name`,
`risk`.

### 3. Dev mode — frontend

```bash
cd ui
npm ci
npm run dev
```

Vite serves `http://localhost:5173` and **proxies `/api` to `http://localhost:8080`**, so the
browser sees one origin and no CORS configuration is needed. Open `http://localhost:5173`.

To point the UI at a backend somewhere other than the proxy target, set `VITE_API_BASE_URL`
(e.g. `VITE_API_BASE_URL=https://staging.example/api/v1 npm run dev`); it defaults to `/api/v1`.

### 4. Seed a little data

```bash
curl -s -X POST localhost:8080/api/v1/persons -H 'Content-Type: application/json' \
  -d '{"name":"AVI COHEN","age":35,"city":"Haifa","risk":"HIGH","nationalId":"111111111"}'

curl -s -X POST localhost:8080/api/v1/cases -H 'Content-Type: application/json' \
  -d '{"title":"Operation Northwind","status":"OPEN"}'
```

### 5. Single jar — API + UI from one origin

```bash
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn -Pui clean package
java -jar target/rule-condition-engine-0.1.0-SNAPSHOT.jar
```

The non-default `ui` profile runs `npm ci && npm run build` in `ui/` and folds `ui/dist` into the
jar's `static/`. The **default** build (`$MVN clean package`, no `-Pui`) needs no Node at all. The
app is then at `http://localhost:8080` and deep links survive a reload:

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/rules/new          # 200
curl -s -w '\n%{http_code}\n' localhost:8080/api/v1/persons/00000000-0000-0000-0000-000000000000
# 404 with a JSON RECORD_NOT_FOUND body — never HTML
```

Override the datasource with the standard Spring env vars if `:5432` is taken, e.g.
`SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5433/ruleengine java -jar ...`.

### Tests

```bash
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn verify   # backend — Testcontainers spins its own Postgres
cd ui && npm run typecheck && npm run lint && npx vitest run       # frontend
```

The frontend suite ([`ui/`](ui/README.md)) uses Vitest + MSW with no live backend; the MSW
handlers are shaped from captured real responses.

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
- **No authn/authz.** Every endpoint is open, and the audit trail attributes every change to
  `system` because there is no authenticated principal to record.
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
