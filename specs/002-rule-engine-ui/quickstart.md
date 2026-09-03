# Quickstart: validating the Rule Condition Engine UI

**Feature**: `002-rule-engine-ui` | **Date**: 2026-09-03

Runnable scenarios that prove the feature works end to end. Each maps to a user story's
**Independent Test** or to a success criterion. This is a validation guide — implementation detail
belongs in `tasks.md`.

---

## Prerequisites

- JDK 25, Docker (Testcontainers and the dev database), Node 24.
- **Maven is invoked through the cached wrapper distribution**, not a CLI `mvn` and not `./mvnw`
  (there is no wrapper script in this repository):

  ```bash
  ~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn -v
  ```

  `$MVN` below stands for that path.

---

## Setup

### 1. Backend

```bash
docker compose up -d
```

```bash
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn spring-boot:run
```

Flyway migrates on start; `ddl-auto` is `validate`, so a schema mismatch fails loudly here rather
than at first query. Confirm the service is up and the registry publishes the eight names the client
catalog expects:

```bash
curl -s localhost:8080/api/v1/rules/fields
```

Expected, sorted: `age`, `case.role`, `case.status`, `case.title`, `city`, `createdAt`, `name`,
`risk`. **Any difference means the client catalog is out of date** — that is the exact condition
scenario 1 below asserts the UI refuses to start the builder on.

### 2. Frontend (development)

```bash
cd ui && npm ci && npm run dev
```

Vite serves on `http://localhost:5173` and proxies `/api` to `http://localhost:8080`, so the browser
sees one origin and no CORS configuration is needed (research R2).

### 3. Seed data

Persons matching the canonical rule, plus a case to hang it on:

```bash
curl -s -X POST localhost:8080/api/v1/persons -H 'Content-Type: application/json' -d '{"name":"AVI COHEN","age":35,"city":"Haifa","risk":"HIGH","nationalId":"111111111"}'
```

```bash
curl -s -X POST localhost:8080/api/v1/cases -H 'Content-Type: application/json' -d '{"title":"Operation Northwind","status":"OPEN"}'
```

Add a few more persons that miss on exactly one condition each (right name, wrong age; right age,
wrong risk) — scenario 2's superset check and SC-002 both need near-misses, not just matches.

---

## Scenario 1 — the catalog agrees with the service (spec dependency #2)

**Proves**: FR-001, and that drift is loud rather than silent.

1. Open the app. The rule builder is reachable and the field control lists all eight names.
2. Stop the service, reload. The start-up check fails as a **transport** error with a retry — not as
   a catalog mismatch (FR-040).
3. Comment out one descriptor in `PersonFieldRegistry`, restart the backend, reload the app.

**Expected**: a blocking configuration error naming the removed field. Browsing, running existing
rules and the audit trail stay usable; only the builder is blocked. The field is **not** silently
dropped from the dropdown.

Restore the descriptor before continuing.

---

## Scenario 2 — author the canonical rule (US1, SC-001, SC-002, SC-010)

**Proves**: FR-001 – FR-013.

Build, entirely through the interface: `name CONTAINS "AVI"` AND `age BETWEEN 30 AND 40` AND
`risk EQUALS HIGH`.

Check as you go:

| Step | Expected |
|---|---|
| Add a leaf | field control is a closed list; no free-text field entry (FR-001) |
| Choose `name`, open operators | `GT`, `GTE`, `LT`, `LTE`, `BETWEEN` are **absent** (field-catalog §1) |
| Choose `age`, open operators | `CONTAINS`, `STARTS_WITH`, `ENDS_WITH` are **absent** |
| Choose `risk`, open values | closed choice of `LOW`/`MEDIUM`/`HIGH`/`CRITICAL`, not free text (FR-004) |
| Choose `createdAt`, open operators | only `EQUALS`, `NOT_EQUALS`, `IN`, `NOT_IN`, presence tests — no ranges (spec: known gaps) |
| Enter range 40 → 30 | refused **before any request**, with the reason (FR-007, US1-4) |
| Add a `NOT` group, add a second child | refused, explaining multiple children need an explicit AND/OR (FR-006, US1-5) |
| Leave a group empty, press preview | blocked, naming the empty group (FR-006, US1-6) |

Then:

4. **Preview.** A total match count plus a first page of persons appears; nothing is saved (FR-008).
5. **Edit any leaf.** The previous count is visibly marked stale immediately (FR-009).
6. **Cross-check the count** — post the same tree directly and compare `totalElements`:

   ```bash
   curl -s -X POST 'localhost:8080/api/v1/rules/preview' -H 'Content-Type: application/json' -d '{"condition":{"type":"GROUP","operator":"AND","children":[{"type":"CONDITION","field":"name","operator":"CONTAINS","value":{"type":"STRING","value":"AVI"}},{"type":"CONDITION","field":"age","operator":"BETWEEN","value":{"type":"RANGE","from":30,"to":40}},{"type":"CONDITION","field":"risk","operator":"EQUALS","value":{"type":"STRING","value":"HIGH"}}]}}'
   ```

7. **Save** to the seeded case. The rule's identity and its case are shown (FR-010).
8. **Re-open the saved rule.** The tree round-trips unchanged (FR-013).
9. **Compare stored trees** (SC-010) — the tree saved through the UI must be identical to one posted
   directly for the same logical condition:

   ```bash
   curl -s localhost:8080/api/v1/rules/$RULE_ID | jq -S .condition
   ```

10. **Try to author a second rule for the same case.** The interface explains the one-to-one relation
    and offers the existing rule instead — driven by the case's `ruleId`, not by message text
    (FR-010, US1-10).
11. **Exceed a budget**: nest groups past depth 8, or paste an `IN` list of 501 values. The failure
    names *which* budget and its limit (FR-012, `RULE_TREE_TOO_COMPLEX`).

**SC-001**: a first-time analyst completes steps 1–7 in under five minutes without documentation and
without seeing the request format.

---

## Scenario 3 — run a rule and work its matches (US2)

**Proves**: FR-014 – FR-019, FR-043, SC-004, SC-006.

1. Open the saved rule and run it. **The run is unavailable until a scope is chosen** (FR-014).
2. Run `GLOBAL`, then `CASE_SCOPED`. The case-scoped result is a subset; the scope that produced the
   results is shown beside them.
3. Page past the first page. Page navigation reflects `page` / `totalPages`, and the applied page
   size is what the server returned (FR-015, FR-022).
4. **Inspect a match row.** Only summary fields — `nationalId` is absent and is not implied to be
   available (FR-016). Confirm at the wire level:

   ```bash
   curl -s "localhost:8080/api/v1/rules/$RULE_ID/matches?scope=GLOBAL" | grep -c nationalId
   ```

   Expected: `0`.
5. **Open a match.** The full record loads, `nationalId` included (FR-017).
6. **Close the person view**, then inspect the app's memory/devtools: no `nationalId` remains in the
   query cache, and it is in no `localStorage`, `sessionStorage` or log line (FR-043, SC-004).
7. **Link the person to the case** with a role. The link appears on both the person's and the case's
   views (FR-028).
8. **Link the same pair again.** The interface explains the link already exists and does **not**
   change the existing role (US2-6, `CONSTRAINT_VIOLATION` on `POST /person-cases`).
9. **Re-run `CASE_SCOPED`.** The newly linked person is now included.
10. **A rule that matches nothing** presents an explicit empty state, distinguishable from an error
    and from a run not yet performed (FR-018, SC-007).
11. **Break a stored rule**: remove a descriptor from `PersonFieldRegistry`, restart, run the rule.
    The failure names the field at fault and offers to open the rule for editing; the rule remains
    openable (FR-019). Restore the descriptor.
12. **SC-006**: with devtools open, confirm no view issues more than one page request per collection
    to render itself.

---

## Scenario 4 — the uniform record surface (US3)

**Proves**: FR-020 – FR-030. Run the full set against **two** record types and confirm the
interaction is identical apart from the fields.

1. List, page, and sort. Only the allowed keys are offered — `/persons`: `id`, `name`, `age`, `city`,
   `risk`, `createdAt`; `/person-cases`: `role`, `createdAt` only (contract §1.2). Both directions
   are available (FR-021).
2. Request an oversized page. The interface shows the size the server **applied** (≤ 500), not the
   requested one (FR-022).
3. **Create a record.** Add a person and a case **through the interface**, not by `curl`. Each lands
   with a `201`, and the new record opens. Repeat for a second record type and confirm the create
   interaction is identical apart from the fields (FR-020).
4. Open, edit, save. The request carries `id` and the `version` that was read (FR-023).
5. **Concurrency (SC-005)**: open a record, change it out of band, then save your edits.

   ```bash
   curl -s -X POST localhost:8080/api/v1/persons -H 'Content-Type: application/json' -d '{"id":"'$PERSON_ID'","version":0,"name":"CHANGED","age":35,"city":"Haifa","risk":"HIGH","nationalId":"111111111"}'
   ```

   **Expected**: the save is refused, **every unsaved edit is still on screen**, the situation is
   explained, and re-reading is offered — never performed silently.
6. **Delete a case**, then a rule. Each presents its retirement route as an offered action — close by
   status, disable by flag — not as an error (FR-025).
7. **Delete a person.** The confirmation states both consequences: retired rather than erased, and
   case links removed. Afterwards the person is gone from listings and from rule matches, and
   opening a stale row reports not-found rather than a blank record (FR-026).
8. **Remove a link.** The interface states that only the link is removed (FR-027).
9. **Submit an invalid record** (blank name, `age` 200). Offending fields are identified individually,
   not as one opaque message (FR-020-9).


## Scenario 5 — the case workspace (US4)

**Proves**: FR-031 – FR-033.

1. Open a case with a rule and several linked persons. Title, status, opened time, the rule, and the
   linked persons appear together, and every action is reachable without leaving the view.
2. **A case with more than twenty linked persons** shows the true `linkedPersonCount` and marks the
   returned list as a partial subset (FR-032). *Known dead end*: the twenty-first link cannot be
   reached, because `/person-cases` cannot be filtered by case (spec dependency #3). The UI is
   honest about this rather than presenting the subset as complete.
3. **A case with no rule** offers to author one (FR-033).
4. **Close the case.** The status change is visible immediately.
5. **Re-open the closed case.** It stays readable and its history stays reachable (US4-5).

---

## Scenario 6 — the audit trail (US5)

**Proves**: FR-034 – FR-038, SC-009.

1. Create, update, then delete a record through the interface.
2. Open the trail. Entries are newest first and paged, showing record type, identity, operation,
   actor and time. **No create/edit/delete affordance appears anywhere** (FR-034).
3. Filter by record type, then add a record identity. **Filtering by identity alone is not offered** —
   the identity control is disabled until a type is chosen, because the service ignores that
   combination (FR-035).
4. Confirm three entries in order, with:
   - **update** → each changed field with previous and new values;
   - **create** → initial values only, no implied previous value;
   - **delete** → an explicit statement that deletions carry no field-level detail — not an empty
     change list (FR-036).
5. **Sensitive masking**: update a person's `nationalId`, then expand that entry. The field shows as
   changed with **both** values masked and **no route to reveal them** (FR-037).
6. Sorting offers only `occurredAt`, `recordType`, `operation` (FR-038).
7. The view states plainly that `actor` is always `system` until authentication exists (FR-045,
   spec assumptions).
8. **SC-009**: from a record, reach that record's filtered history in at most three interactions.

---

## Scenario 7 — cross-cutting behaviour

**Proves**: FR-039 – FR-046, SC-003, SC-007, SC-008.

1. **Every failure code** (contract §5, sixteen of them) renders a specific message; no path shows a
   generic "something went wrong" (SC-003). The unit suite asserts exhaustiveness; spot-check
   `RULE_TREE_TOO_COMPLEX` and `CONCURRENT_MODIFICATION` in the running app.
2. **Stop the backend mid-session.** Every view distinguishes unreachable from refused from empty,
   and offers a retry that does not lose input (FR-040). Restart and retry — the input is intact.
3. **Every empty result** — no persons, no cases, no matches, no audit entries — is an explicit empty
   state carrying the next useful action (FR-041).
4. **Supersession**: refine a preview twice quickly, or change page while the previous page loads.
   The most recent request's result is what renders, never a stale earlier one that arrived later
   (FR-042).
5. **Keyboard only (SC-008)**: unplug the mouse and complete scenario 2 end to end. Every builder
   action is reachable and completable; validation failures, results arriving and saves succeeding
   are announced (FR-044).
6. **No sign-in, user menu, or permission affordance appears anywhere** (FR-045).
7. **Configuration**: run with `VITE_API_BASE_URL` pointed elsewhere and confirm the app follows it;
   no base URL is hardcoded (FR-046).

---

## Automated checks

```bash
cd ui && npm run typecheck && npm run lint && npx vitest run
```

```bash
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn verify
```

The backend suite must pass **unchanged** — this feature alters no API behaviour. Focused frontend
suites carry the load for the three things that are hard to eyeball (research R10):

| Suite | Asserts |
|---|---|
| Catalog gating | for all eight fields × twelve operators, an offered pair is accepted by the service and a withheld pair would be rejected (SC-002) |
| Tree round-trip | parse → build → serialise is byte-identical for a corpus of trees, decimals included (FR-013, SC-010) |
| Failure map | all sixteen codes render a distinct, specific message; an unhandled code is a **compile** error (FR-039, SC-003) |

---

## Producing the deployable artifact

```bash
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn -Pui clean package
```

The `ui` profile builds `ui/` and copies `ui/dist` into `target/classes/static`, so the jar serves
the app and the API from one origin. Verify:

```bash
java -jar target/rule-condition-engine-0.1.0-SNAPSHOT.jar
```

Then confirm the two things the SPA forwarding rule must get right:

```bash
curl -s -o /dev/null -w '%{http_code}\n' localhost:8080/rules/new
```

Expected `200` (a deep link survives a reload).

```bash
curl -s -w '\n%{http_code}\n' localhost:8080/api/v1/persons/00000000-0000-0000-0000-000000000000
```

Expected `404` with a JSON `RECORD_NOT_FOUND` body — **not** an HTML page. A catch-all forward that
swallows `/api/**` would break every not-found path in the UI (research R3).
