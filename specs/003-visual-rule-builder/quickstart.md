# Quickstart: validating the Visual Rule Condition Builder

**Feature**: `003-visual-rule-builder` | **Date**: 2026-09-03

Runnable scenarios that prove the feature works end to end. Each maps to a user story's
**Independent Test** or to a success criterion. This is a validation guide — implementation detail
belongs in `tasks.md`.

Types and shapes referenced below are defined in [data-model.md](./data-model.md); the endpoints and
guarantees are pinned in [contracts/field-metadata.md](./contracts/field-metadata.md) and
[contracts/rule-page.md](./contracts/rule-page.md).

---

## Prerequisites

- JDK 25, Docker (Testcontainers and the dev database), Node 24.
- **Maven is invoked through the cached wrapper distribution**, not a CLI `mvn` and not `./mvnw`
  (there is no wrapper script in this repository). `$MVN` below stands for:

  ```bash
  ~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn -v
  ```

---

## Setup

### 1. Backend

```bash
docker compose up -d
```

```bash
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn spring-boot:run
```

Flyway migrates on start and `ddl-auto` is `validate`. **This feature adds no migration**, so a
schema failure here is unrelated to it.

### 2. Frontend

```bash
cd ui && npm ci && npm run dev
```

Vite serves `http://localhost:5173` and proxies `/api` to `http://localhost:8080` — one origin, no
CORS configuration.

### 3. Seed a rule with two nesting levels

Create a case, then a rule whose condition is `name CONTAINS "cohen" AND (age >= 30 OR risk IN
[HIGH, CRITICAL])` — the fixture US1 and SC-006 both need.

```bash
curl -s -X POST localhost:8080/api/v1/cases -H 'Content-Type: application/json' -d '{"title":"Operation Northwind","status":"OPEN"}'
```

Use the returned `id` as `CASE_ID`:

```bash
curl -s -X POST localhost:8080/api/v1/rules -H 'Content-Type: application/json' -d '{"caseId":"CASE_ID","name":"High-risk Cohens","enabled":true,"condition":{"type":"GROUP","operator":"AND","children":[{"type":"CONDITION","field":"name","operator":"CONTAINS","value":{"type":"STRING","value":"cohen"}},{"type":"GROUP","operator":"OR","children":[{"type":"CONDITION","field":"age","operator":"GTE","value":{"type":"NUMBER","value":30}},{"type":"CONDITION","field":"risk","operator":"IN","value":{"type":"LIST","values":["HIGH","CRITICAL"]}}]}]}}'
```

Keep the returned `id` as `RULE_ID` and its `version`.

---

## Scenario A — The metadata endpoint publishes the effective operator sets (US5, FR-036, FR-037)

```bash
curl -s localhost:8080/api/v1/rules/fields/metadata
```

**Expect** eight entries sorted by `logicalName`, matching
[data-model.md §1.4](./data-model.md#14-effective-operator-sets-this-must-produce). The two
assertions that matter most:

```bash
curl -s localhost:8080/api/v1/rules/fields/metadata | grep -o '"logicalName":"createdAt".\{0,200\}'
```

- **`createdAt` publishes no ordered operator.** `GT`, `GTE`, `LT`, `LTE` and `BETWEEN` are all
  absent — they pass `requireCompatible` and die in `coerce`, so publishing them would offer an
  author an operator that is rejected on save (SC-002).
- **`name`, `city` and `case.title` likewise publish no ordered operator**, for the same reason.
- **`risk` publishes `["LOW","MEDIUM","HIGH","CRITICAL"]`** in declaration order, not alphabetical.

**Expect absent everywhere**: `joinPath`, `attributePath`, `javaType`. Confirm:

```bash
curl -s localhost:8080/api/v1/rules/fields/metadata | grep -c 'caseLinks'
```

Must print `0`. A non-zero count means the persistence mapping is being published
(contract §2.2).

**And** the pre-existing route is untouched:

```bash
curl -s localhost:8080/api/v1/rules/fields
```

Still the eight sorted names, unchanged.

---

## Scenario B — Understand a rule without reading JSON (US1, SC-001, SC-006)

Open `http://localhost:5173/rules/RULE_ID`.

**Expect**:

1. Three bounded containers: the root `AND`, with the nested `OR` **inside its bounds and
   indented**, not as a peer of the two comparisons (FR-002, FR-003).
2. Each group's header states its meaning in words — "Match **all** of the following" /
   "Match **any** of the following" — not a bare `AND` / `OR` (FR-006, US1 scenario 7).
3. Above the tree, one line:

   `Name contains "cohen" AND (Age is at least 30 OR Risk level is one of HIGH, CRITICAL)`

   The nested group is parenthesised; every field carries its label, every operator its plain
   language (FR-004).
4. Collapse the nested group: the collapsed container states how many nodes it hides (FR-007).

**Then check the summary corpus** (SC-006) by editing the tree in place: a single comparison, a flat
`AND`, a flat `OR`, a `NOT` around one child, a presence test, and groups nested to depth 8. Each
must produce a correct sentence, with `NOT` rendered as `NOT (…)` and a presence test as
"City has no value" — never `IS_NULL`.

---

## Scenario C — The field → operator → value cascade (US2, SC-003)

On the same page, on the `name CONTAINS "cohen"` row:

1. **Change the field to `Age`.** Expect the operator to change away from `CONTAINS` (not published
   for a NUMBER field) to a valid one, and the value to reset to an **empty numeric** control —
   never `"cohen"` carried across (FR-015).
2. **Set the operator to `is between`.** Expect two bounds (FR-012).
3. **Enter `45` then `30`, in that order, and leave the control.** Expect a refusal naming the
   inverted bound, **before any request is sent** (FR-027, US2 scenario 14).
4. **Fix to `30`–`45`, then switch the operator to `is at least`.** Expect the surplus bound
   **discarded**, not silently retained (FR-014, SC-003).
5. **Open the operator control on a `Created at` row.** Expect no ordered comparison offered at all —
   the metadata does not publish them (FR-011).
6. **On the `Risk level` row, open the value control.** Expect a closed choice over the four
   constants; free text is not accepted (FR-013).
7. **Select "has no value" as the operator.** Expect the value control to vanish; select `equals`
   again and expect an empty value control of the right shape to return (FR-016).

Every state above must leave *Save changes* blocked while any node is incomplete, with the message
rendered **beside the offending node** (FR-026).

---

## Scenario D — `NOT` arity is enforced without losing children (FR-019, FR-020)

1. Add a nested group; set its operator to `NOT`; add one comparison.
2. **Try to add a second child.** Expect the three Add controls **present but disabled**, with the
   reason stated — a negation takes exactly one child, wrap them in an AND or OR first (US2
   scenario 11).
3. On a group holding three children, **open the operator control.** Expect `NOT` **disabled**, with
   a *Wrap children in AND* action offered. Use it: expect the three children to become one `AND`
   group holding all three, after which `NOT` is selectable. **No child is lost at any point**
   (US2 scenario 12).

---

## Scenario E — Reorder, save, reload (US4, SC-005)

In a group of three children whose **middle** child is the nested `OR` group:

1. Move the nested group **up**, then **down**. After each move confirm: the parent's operator is
   unchanged, the tree's depth is unchanged, every child is still in the same parent, and the
   nested group's own children are in their original order (FR-022, FR-023).
2. Confirm the summary line above the tree reflects the new order immediately (FR-005, US4
   scenario 9).
3. On the **first** child, confirm the move-up control is present and **disabled**, not absent; on
   the last, the move-down control likewise (FR-024). In a one-child group, both are disabled.
4. Save, reload the page, and confirm the order is the one you left (FR-025).

Confirm nothing new is on the wire:

```bash
curl -s localhost:8080/api/v1/rules/RULE_ID | grep -c 'position'
```

Must print `0` — order is carried by the `children` array alone.

---

## Scenario F — One save, one history entry (US3, SC-009)

1. Change the rule's **name** and one **condition value**, then press *Save changes* once.
2. Confirm exactly **one** `POST /api/v1/rules` in the network panel, carrying `id`, `version`,
   `caseId`, `name`, `enabled` and `condition` in one body (FR-033).
3. Reload: both changes are present.
4. Check the history:

```bash
curl -s "localhost:8080/api/v1/audit?recordType=rule&recordId=RULE_ID"
```

Expect **exactly one** new `UPDATE` entry for the pair of changes (SC-009).

Also confirm on the page: `id`, `type`, `caseId`, `createdAt`, `createdBy`, `updatedAt`,
`updatedBy` are displayed as **text with no editable control**, while name, enabled and conditions
are all editable — including on a **disabled** rule (FR-032, FR-032a, US3 scenario 7).

---

## Scenario G — Concurrent modification is refused, not overwritten (FR-033a, FR-033b)

1. Open the rule page and edit the name — **do not save**.
2. In another terminal, change the rule out from under it:

```bash
curl -s -X POST localhost:8080/api/v1/rules -H 'Content-Type: application/json' -d '{"id":"RULE_ID","version":VERSION,"caseId":"CASE_ID","name":"Renamed elsewhere","enabled":true,"condition":{"type":"CONDITION","field":"age","operator":"GTE","value":{"type":"NUMBER","value":30}}}'
```

3. Press *Save changes* in the browser.

**Expect**: a refusal saying the copy is stale; the author's unsaved edits **still on screen**; an
explicit *Reload the current version* action; and the other change **not overwritten** — confirm
with a `GET` that `Renamed elsewhere` survives (US3 scenario 5).

---

## Scenario H — Metadata failure is distinct and retryable (FR-040)

Stop the service (`Ctrl-C` on `spring-boot:run`) and reload the page.

**Expect** the field-choices failure to be reported as its own retryable failure, with a message
about the choices — not conflated with the rule being unavailable. Restart the service and use the
banner's retry: the page recovers without a full reload.

**And confirm the drift-blocked state is gone** (SC-007): there is no start-up set-equality check
and no "the rule builder is unavailable, its catalog is out of date" path anywhere.

---

## Scenario I — A field withdrawn from the registry (US5, FR-039, SC-007)

1. Comment out `FieldDescriptor.of("city", …)` in `PersonFieldRegistry`, restart the service, and
   reload a rule that uses `city`.

   **Expect**: the rule still renders; the `city` node is marked **no longer available** with its
   stored name shown verbatim; no other field is silently substituted; saving is blocked until that
   node is changed or removed (US5 scenario 5).

2. Restore `city` and **add** a new field, e.g.
   `FieldDescriptor.of("nickname", "nickname", String.class).labelled("Nickname")` (only if the
   column exists — otherwise re-type an existing field instead). Restart the service and reload the
   page **with no client change and no rebuild**.

   **Expect**: the new or re-typed field appears with the correct label, the correct operator set,
   and its enum values if enumerated — and the builder never enters a blocked state (SC-007).

3. Revert the registry.

---

## Scenario J — Byte-identical round trip (SC-004)

> **Read this before running it.** No field in today's registry has a decimal Java type: `age` is an
> `Integer`, so `10.50` is genuinely invalid for it and `coerceNumber`'s `intValueExact()` rejects
> it. SC-004 therefore cannot be exercised end to end against the current registry — it is verified
> at the codec level by `ui/src/api/tree.test.ts`, which asserts `10.50` survives parse and
> serialise unrounded. Run the steps below only after registering a `BigDecimal` field.
>
> Running it as written also surfaces a **pre-existing** defect worth fixing separately: a
> fractional operand on an integer field returns **HTTP 500**, because `GlobalExceptionHandler` maps
> no `ArithmeticException`. It reproduces through `POST /rules/preview`, which this feature does not
> touch.

```bash
curl -s -X POST localhost:8080/api/v1/rules -H 'Content-Type: application/json' -d '{"id":"RULE_ID","version":VERSION,"caseId":"CASE_ID","name":"Decimal probe","enabled":true,"condition":{"type":"CONDITION","field":"age","operator":"GTE","value":{"type":"NUMBER","value":10.50}}}'
```

Open the page, **save with no edit**, then read it back:

```bash
curl -s localhost:8080/api/v1/rules/RULE_ID | grep -o '"value":[0-9.]*'
```

Expect `10.50`, not `10.5`. A re-rounded operand means a code path converted it to a JavaScript
`number` — the summary renderer and the value controls must both print the stored string as-is.

---

## Scenario K — No hand-maintained duplicate remains (SC-008, FR-038)

```bash
ls ui/src/rules/catalog.ts ui/src/rules/catalogValidation.ts 2>&1
```

Both must be **absent**. Then:

```bash
grep -rn "MEDIUM\|UNDER_REVIEW\|STARTS_WITH" ui/src --include='*.ts' --include='*.tsx' | grep -v '/test/' | grep -v 'api/tree.ts'
```

Expect no hit that constitutes a per-field table of fields, types, operators or enum values.
`ui/src/api/tree.ts` legitimately keeps the `ComparisonOperator` union and its labels — those mirror
the fixed model, which this feature does not change; what SC-008 forbids is the *per-field* data.
Test fixtures and MSW handlers legitimately contain a captured response body.

---

## Scenario L — Narrow window, dark theme, keyboard only (FR-043, FR-044, SC-011)

1. Narrow the window to ~380 px. **Expect** comparison rows to wrap onto a second line and the page
   **never** to scroll horizontally.
2. Switch the OS to dark mode. **Expect** the page to follow the application's existing dark theme,
   with group nesting still distinguishable — indentation and the accent rail, not colour alone.
3. Unplug the mouse. Reach and operate **every** action by keyboard: change a field, an operator and
   a value; add and delete a node; move a child up and down; collapse a group; save. Confirm each
   validation message is announced with its control (`aria-describedby`).

---

## Automated suites

```bash
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn verify
```

Must pass, including the new `FieldMetadataService` unit test (no Spring, no Postgres) and the
metadata endpoint integration test (`@Tag("integration")`, Testcontainers Postgres). **Every
pre-existing backend test must pass unchanged** (SC-010).

```bash
cd ui && npm run typecheck && npm run lint && npx vitest run
```

Must pass. **Every pre-existing interface test outside the rules area must pass unchanged**
(SC-010); the rules-area tests change because their subject changed, and `catalog.test.ts` /
`catalogValidation.test.ts` are deleted with their subjects.
