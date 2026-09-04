# Contract: The Rule Page

**Feature**: `003-visual-rule-builder`

The rule page is the feature's user-facing interface. This contract pins the API surface it
consumes, the save semantics it depends on, and the interaction guarantees it owes an author.
Everything here except §1.3's *choice* of route already exists in the API;
[field-metadata.md](./field-metadata.md) covers the one addition.

---

## 1. Consumed API surface

### 1.1 Read the rule — `GET /api/v1/rules/{id}`

Returns `RuleVm` under the Detail view: `id`, `version`, `type`, `caseId`, `name`, `enabled`,
`condition`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`.

The response is decoded with `decodeRuleDetail` — plain `JSON.parse` for the scalars, `lossless-json`
for the `condition` subtree only, so a `BigDecimal` operand survives verbatim (SC-004).

`version` is captured at load and held for the lifetime of the draft. It is never refreshed by a
background refetch: refreshing it would defeat the staleness detection it exists to trigger.

### 1.2 Read the field metadata — `GET /api/v1/rules/fields/metadata`

See [field-metadata.md](./field-metadata.md). A **separate** query from §1.1, with its own loading,
failure and retry states (FR-040).

The page renders as soon as **both** resolve. A metadata failure does not hide the rule; a rule
failure does not hide a metadata error. Each banner names its own subject and retries only itself.

### 1.3 Save — `POST /api/v1/rules`

**One request commits everything** (FR-033):

```json
{
  "id": "…", "version": 7, "caseId": "…",
  "name": "High-risk associates", "enabled": true,
  "condition": { "type": "GROUP", "…": "…" }
}
```

- `id` present ⇒ update ⇒ `200 OK`. The `Location`-returning create path is not used by this page.
- `version` is the value read in §1.1. This is what turns a concurrent edit into a refusal instead
  of an overwrite (FR-033a).
- `caseId` is required by `RuleVm` (`@NotNull`) and is round-tripped unchanged. It is **not**
  editable — the page offers no control for it (FR-032, spec Assumptions: the case a rule belongs
  to is not changed from this page).
- `type`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy` are **never sent**. They are
  `READ_ONLY` on `RuleVm`, and `serializeRuleBody` omits them.
- The body is serialised by `serializeRuleBody`, which emits the condition through `serializeTree`
  so numeric operands are written verbatim.

Server-side this runs `RuleCrudService.beforeSave` → `RuleService.assertCompilable`, so a tree that
cannot compile to SQL is refused before persistence. The page does not duplicate that check; it
shows the refusal.

**One save produces exactly one audit entry** (SC-009), because it is one flushed entity change and
`AuditTrailListener` records one `UPDATE` per change.

### 1.4 Not used by this page

- `PUT /api/v1/rules/{id}/condition` — remains in the API, unchanged, for existing callers
  (spec dependency #3). It carries no version and can never return `CONCURRENT_MODIFICATION`, so a
  page built on it cannot honour FR-033a. `updateCondition()` stays in `ui/src/api/rules.ts` as the
  typed description of the route; `EditCondition.tsx` is deleted.
- `GET /api/v1/rules/fields` — superseded as the builder's source by §1.2. The route stays.

### 1.5 Unchanged neighbours

`POST /rules/preview` (dry run), `GET /rules/{id}/matches` (scoped run) and the audit trail work
against the tree this builder produces, with no change to their requests or responses (FR-034,
spec Assumptions). The history deep link (`HistoryLink`) remains reachable from the page (FR-035).

---

## 2. Failure presentation

Branch on `code` only; `message` is display detail (002 contract §6.6). The codes this page can
provoke:

| Code | When | Presentation |
|---|---|---|
| `CONCURRENT_MODIFICATION` | §1.3 with a stale `version` | "Your copy is out of date — this rule changed elsewhere since you opened it." Draft **preserved on screen**; an explicit *Reload the current version* action replaces the whole draft, discarding unsaved work only when the author chooses it (FR-033b). |
| `RULE_TREE_TOO_COMPLEX` | tree exceeds depth / node count / list length | Server message shown **as given** — it names the budget and its limit. The client holds no copy of the limits (FR-029). |
| `UNKNOWN_FIELD` | a field withdrawn between load and save | Server message shown; the offending node is highlighted. The client's own published-field check normally prevents reaching this. |
| `INCOMPATIBLE_OPERATOR` | operator/field pair the registry rejects | Server message shown at the node. With correct metadata this is unreachable — reaching it is a defect signal, not author error (SC-002). |
| `INVALID_RULE` | tree fails `assertCompilable`, or the 1:1 case rule on create | Server message shown as given. |
| `VALIDATION_FAILED` | e.g. blank name reaching the server | Message names the offending field; shown against that control. |
| `VERSION_REQUIRED` | `version` omitted on an update | A client defect — presented as such, never as author error. |
| `RULE_NOT_FOUND` | rule deleted elsewhere | "This rule no longer exists." No retry. |
| transport | service unreachable | Retryable, with the draft preserved. |

**In every refusal, the author's unsaved work stays on screen** (FR-030). Nothing is cleared, reset
or refetched over the top of a draft without an explicit action.

---

## 3. Editing guarantees

These are the client-side invariants the tree editor must maintain. Each mirrors a server check and
never replaces one (FR-028, constitution principle II).

### 3.1 The field → operator → value cascade

| Trigger | Required outcome |
|---|---|
| Field changed, current operator still in the new field's published set | operator kept; value **reset** to an empty control of the shape the new field/operator pair requires (FR-015) |
| Field changed, current operator not in the new set | operator replaced with the new field's first published operator; value reset (FR-015) |
| Operator changed, value shape unchanged | value carried across (FR-014) |
| Operator changed, value shape differs | value **discarded** and replaced with an empty control of the new shape. Never retained in a shape the new operator does not accept (FR-014, SC-003) |
| Operator changed to a presence test | node becomes `UNARY`; the value is dropped (FR-016) |
| Operator changed from a presence test to a comparison | node becomes `CONDITION` with an empty value of the required shape (FR-016) |

An enum field's value is always chosen from `enumValues`; free text is not accepted (FR-013).

### 3.2 Structure

| Action | Guarantee |
|---|---|
| Add comparison | appended as the **last** child, pre-filled with a valid field/operator pair, value empty and marked incomplete (FR-017) |
| Add group | appended, defaults to `AND`, marked incomplete until it has a child (FR-018) |
| Delete a group | removes the entire subtree in one action (FR-009) |
| Add to a `NOT` holding one child | prevented; controls present but disabled, with the reason and the remedy stated (FR-019) |
| Set operator to `NOT` on a multi-child group | prevented; `NOT` disabled with a *Wrap children in AND* action offered. Children are never silently discarded (FR-020) |
| Move up / down | swaps with the adjacent sibling only. Parent, parent operator, subtree and depth unchanged (FR-022, FR-023) |
| Move controls at the ends | present but **disabled**, never absent (FR-024) |

### 3.3 Save blocking

Saving is blocked while any of the following holds, with the message rendered **beside the node it
concerns** and programmatically associated with its control (FR-026, FR-044):

field missing · operator missing · operator not in the field's published set · field not published ·
value shape mismatched to the operator · non-numeric numeric input · inverted range · empty or
blank-entried list · empty text value · enum value outside `enumValues` · empty group · `NOT` with
≠ 1 child · empty rule name.

Not blocked on, deliberately (FR-029): tree depth, node count, list length.

---

## 4. Presentation and accessibility

| Requirement | Contract |
|---|---|
| FR-001, FR-002, FR-003 | Every node visible or reachable. Each group is a bounded container with a header stating its logical meaning in words; children indented within its bounds; a nested group is visibly a child, not a peer. |
| FR-004, FR-005 | A single-line plain-language summary above the tree, derived from the **draft** and recomputed on every change including a reorder. |
| FR-006 | Human-readable operator labels everywhere. A raw operator name is never the only text an author sees. |
| FR-007 | A collapsed group states how many nodes it conceals. |
| FR-041 | A comparison is one compact row (field · operator · value · actions), not a multi-line form. |
| FR-042 | Destructive actions visually distinct from non-destructive ones (the existing `danger` button variant). |
| FR-043 | The application's existing light and dark themes; usable on a narrow window with **no horizontal page scroll** — rows wrap instead. |
| FR-044, SC-011 | Every pointer action is keyboard-reachable and operable; each validation message is associated with its control via `aria-describedby`; group containers keep native `fieldset`/`legend` semantics; contrast meets the application's existing standard in both themes. |

Nesting depth is conveyed by indentation **and** an accent rail — colour is a redundant cue, never
the sole one.

---

## 5. Page composition (US3)

One page, three regions, top to bottom:

1. **Header** — editable `name` and `enabled`; read-only `id`, `type`, `caseId`, `createdAt/By`,
   `updatedAt/By` shown as text with no editable affordance (FR-032, FR-032a: no rule is read-only,
   including a disabled one); the history deep link (FR-035).
2. **Conditions** — the summary line, then the tree. This is the page's main section (FR-031).
3. **Actions** — a single *Save changes* action committing all three (FR-033), plus the existing
   dry-run preview against the current draft.

The rules resource's detail route points here. `/rules/:id/condition` redirects to it, so existing
links keep working rather than 404-ing.
