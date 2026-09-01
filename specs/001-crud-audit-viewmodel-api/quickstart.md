# Quickstart: Validating the CRUD / Audit / View-Model Feature

**Feature**: `001-crud-audit-viewmodel-api` | **Date**: 2026-08-30

How to run the service and prove each user story works end to end. Contract details live in
[contracts/crud-contract.md](./contracts/crud-contract.md); schema details in
[data-model.md](./data-model.md).

---

## Prerequisites

- JDK 25 and Maven
- Docker (Postgres 18 for the app; Testcontainers for the integration tests)
- Postgres reachable on `localhost:5432` as `ruleengine/ruleengine` (see `docker-compose.yml`)

```bash
docker compose up -d
```

Flyway applies the single `V1` baseline on startup; `ddl-auto: validate` fails fast if the entity
mappings and the schema disagree.

`V1__init.sql` was rewritten for this feature, so its checksum no longer matches any database that
ran the previous version. If startup fails with a Flyway checksum mismatch, drop and recreate the
database — there is no production data, and this is the one migration that is not forward-only:

```bash
docker compose down -v && docker compose up -d
```

```bash
./mvnw spring-boot:run
```

---

## Automated validation

Full suite:

```bash
./mvnw verify
```

The suites that matter for this feature, and what each one proves:

| Suite | Proves |
|---|---|
| `CrudContractIntegrationTest` | US1 / FR-001, FR-002 — parameterised over all four resources, asserting the same paths, parameters, envelope and statuses |
| `ResponseExposureTest` | US2 / FR-013, FR-015, FR-017 — `@JsonView(Vms.Summary)` on the shared `findAll` keeps `nationalId` out of every list response, and the explicit view on `/matches` and `/preview` keeps it out of match results |
| `AuditTrailIntegrationTest` | US3 / FR-020–FR-028 — one `audit_entry` row per change with its field-level delta, the national id redacted, and a forced audit failure rolling the business change back with it (FR-027) |
| `AuditEntryQueryIntegrationTest` | SC-008 — a known sequence of changes replayed from `audit_entry` alone, without reading the record or the log |
| `PersonSoftDeleteIntegrationTest` | R1 — national-id reuse after delete, link cleanup, exclusion from rule evaluation, and 405 on case/rule delete |
| existing `RuleCompiler*` / `RuleSerialization*` / `RuleModelValidation*` | FR-012 — the rule engine still behaves identically |

Integration tests only (they carry `@Tag("integration")` via `PostgresIntegrationTest`):

```bash
./mvnw verify -Dgroups=integration
```

---

## Manual validation

### US1 — the uniform contract

Create (no `id` ⇒ 201) and read back:

```bash
curl -si -X POST localhost:8080/api/v1/persons -H 'Content-Type: application/json' -d '{"name":"Ada Lovelace","nationalId":"NID-001","age":36,"city":"London","risk":"LOW"}'
```

Expect `201` with a `Location` header and a body carrying `id`, `version: 0`, and `type`.

Update the same record by sending back its `id` **and** `version` (expect `200`, `version: 1`):

```bash
curl -s -X POST localhost:8080/api/v1/persons -H 'Content-Type: application/json' -d '{"id":"<ID>","version":0,"name":"Ada King","nationalId":"NID-001","age":36,"city":"London","risk":"LOW"}'
```

Send the **same** request a second time — `version: 0` is now stale. Expect `409
CONCURRENT_MODIFICATION`, which is the "concurrent updates" edge case:

```bash
curl -si -X POST localhost:8080/api/v1/persons -H 'Content-Type: application/json' -d '{"id":"<ID>","version":0,"name":"Ada Byron","nationalId":"NID-001","age":36,"city":"London","risk":"LOW"}'
```

Confirm the contract is genuinely identical by running the same four calls against
`/api/v1/cases` and `/api/v1/rules` — only the body fields differ.

Pagination guarantees:

```bash
curl -s 'localhost:8080/api/v1/persons?page=0&size=9999'   # size clamps to 500 in the response
curl -s 'localhost:8080/api/v1/persons?page=99999&size=50' # empty content, correct totals, not an error
curl -s 'localhost:8080/api/v1/persons?sort=nosuchfield'   # 400 INVALID_SORT_FIELD
curl -s 'localhost:8080/api/v1/persons?sort=risk,desc'     # ties broken by id — stable across pages
```

Composite identifier (R7 — the link resource uses the same contract, not a special case):

```bash
curl -s localhost:8080/api/v1/person-cases/<personUuid>:<caseUuid>
```

### US2 — view models

```bash
curl -s localhost:8080/api/v1/persons/<ID>      | jq 'has("nationalId")'   # true  — detail form
curl -s 'localhost:8080/api/v1/persons?size=5'  | jq '.content[0] | has("nationalId")'  # false — summary
curl -s localhost:8080/api/v1/rules/<ID>/matches | jq '.content[0] | has("nationalId")' # false — FR-017
curl -s 'localhost:8080/api/v1/persons?size=5'  | jq '.content[0].type'   # "person" — FR-014, matches audit recordType
```

Detail form of a case pages its children rather than returning all of them:

```bash
curl -s localhost:8080/api/v1/cases/<ID> | jq '{n: (.linkedPersons|length), total: .linkedPersonCount}'
```

Audit fields are `@JsonProperty(access = READ_ONLY)` — send forged values and confirm Jackson drops them (FR-023):

```bash
curl -s -X POST localhost:8080/api/v1/persons -H 'Content-Type: application/json' -d '{"name":"Forged","nationalId":"NID-002","age":30,"risk":"LOW","createdBy":"attacker","createdAt":"1999-01-01T00:00:00Z"}' | jq '{createdBy, createdAt}'
```

### US3 — audit trail

Audit entries are **persisted and queryable** (R10); the per-request log stays in the log stream.
Read back the history of the person you created and updated above — it should show `CREATE` then
`UPDATE`, newest first, with the update naming only the fields that actually moved:

```bash
curl -s 'localhost:8080/api/v1/audit-entries?recordType=person&recordId=<ID>' | jq '.content[] | {operation, actor, occurredAt, entityVersion, changes}'
```

Expect the `CREATE` entry to carry initial values and the `UPDATE` entry a `{from, to}` per changed
field. `nationalId` must appear as `"***"` on both sides wherever it is involved — the reviewer
learns it changed, never what it was (FR-025 against FR-020).

The audit row is written in the **same transaction** as the change (`BEFORE_COMMIT`), so there is no
state in which a record changed and no entry exists (FR-027). Until an auth layer exists the actor
is `system` (FR-026).

With `logging.level.com.eliezer.ruleengine.audit: INFO`, each call above also emits one
`RequestAuditFilter` line (method, path, status, elapsed, actor). Confirm creation metadata survives
an update (FR-022) and that no credential or national id reached the log or the audit store (FR-025):

```bash
curl -s localhost:8080/api/v1/persons/<ID> | jq '{createdAt, createdBy, updatedAt, updatedBy}'
grep -iE 'authorization|NID-' <app-log>                                   # expect no matches
psql -c "select changes::text from audit_entry" | grep -i 'NID-'          # expect no matches
```

### Soft delete (R1)

```bash
curl -si -X DELETE localhost:8080/api/v1/persons/<ID>   # 204
curl -si localhost:8080/api/v1/persons/<ID>             # 404 — hidden, not erased
curl -si -X DELETE localhost:8080/api/v1/persons/<ID>   # 404 — second delete, the edge case
```

The failure mode soft delete introduces — a retained row permanently consuming its UNIQUE slot —
must now pass:

```bash
# national id is reusable after delete (partial unique index, not a plain UNIQUE)
curl -si -X POST localhost:8080/api/v1/persons -H 'Content-Type: application/json' -d '{"name":"Re-registered","nationalId":"NID-001","age":40,"risk":"LOW"}'
```

Cases and rules are not deletable — expect `405 DELETION_NOT_SUPPORTED` with a message naming the
alternative, and confirm the alternative works:

```bash
curl -si -X DELETE localhost:8080/api/v1/cases/<CASE_ID>   # 405, "close it with status=CLOSED"
curl -si -X DELETE localhost:8080/api/v1/rules/<RULE_ID>   # 405, "disable it with enabled=false"

curl -s -X POST localhost:8080/api/v1/cases -H 'Content-Type: application/json' -d '{"id":"<CASE_ID>","version":<V>,"title":"...","status":"CLOSED"}' | jq .status
curl -s -X POST localhost:8080/api/v1/rules -H 'Content-Type: application/json' -d '{"id":"<RULE_ID>","version":<V>,"caseId":"<CASE_ID>","name":"...","enabled":false,"condition":{...}}' | jq .enabled
```

Deleted persons must disappear from rule evaluation with no change to the compiler — delete a person
you know matches, then re-run the rule and confirm `totalElements` dropped by one:

```bash
curl -s 'localhost:8080/api/v1/rules/<RULE_ID>/matches?scope=GLOBAL' | jq .totalElements
```

Link cleanup, verified directly (a link left pointing at a soft-deleted parent throws on load):

```bash
docker compose exec -T postgres psql -U ruleengine -d ruleengine -c \
  "SELECT count(*) FROM person_case pc JOIN person p ON p.id = pc.person_id WHERE p.deleted;"
# expect 0
```

### FR-012 — rule operations unchanged

```bash
curl -s localhost:8080/api/v1/rules/fields
curl -s -X POST localhost:8080/api/v1/rules/preview -H 'Content-Type: application/json' -d '{"condition":{...}}'
curl -s -X PUT localhost:8080/api/v1/rules/<ID>/condition -H 'Content-Type: application/json' -d '{"condition":{...}}'
```

---

## Rollback

The schema ships as a single `V1__init.sql` baseline, so there is no partial rollback to perform and
none is needed: nothing has been deployed, and the database is recreated from scratch rather than
migrated backwards.

```bash
docker compose down -v && docker compose up -d
```

The risky *element* of the schema is still `person.deleted` and its partial unique index — it is the
one place where a design mistake changes how an existing constraint behaves. Backing that out means
dropping `deleted`, `ux_person_national_id_active` and `idx_person_active`, restoring an inline
`UNIQUE` on `national_id`, and removing `@SoftDelete` from `Person`. Once this schema exists in any
shared environment, that becomes a new forward-only migration, not an edit to `V1`.
