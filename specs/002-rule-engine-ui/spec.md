# Feature Specification: Rule Condition Engine UI

**Feature Branch**: `002-rule-engine-ui`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: "create me a requirement-spec for a UI section for this project" — a front end covering the endpoints the rule-condition-engine already exposes: the uniform record contract for persons, cases, rules and person-case links; rule authoring with dry-run preview and evaluation; and the read-only audit trail.

## Overview

The service is API-only today. Every capability it has — a condition-tree rule builder, dry-run
preview, scoped evaluation, a uniform record contract across four record types, and an immutable
audit trail — is reachable exclusively by hand-written HTTP calls. The one endpoint that exists
purely to serve a user interface (`GET /api/v1/rules/fields`, "drives the field dropdown in a
rule-builder UI") has no dropdown to drive.

This feature specifies that missing surface: an application an investigator or analyst opens in a
browser to author rules, run them, work the people they match, and read the history of who changed
what. It adds no backend capability. Where the UI needs something the API cannot currently give it,
this specification says so explicitly rather than assuming a backend change (see
**Dependencies and backend prerequisites**).

Two properties of the existing API shape almost every requirement below and are worth stating once:

- **A rule is only valid if it compiles.** Field names, operators, and value shapes are not free
  text — they are constrained by a server-side registry, and an invalid combination is rejected on
  write, not on read. A builder that lets an author assemble a rejectable rule has failed at its
  job.
- **Depth is a server decision, not a client one.** List responses carry a deliberately narrower
  field set than single-record responses; the person's national identifier in particular is never
  present in a listing or in a rule-match result. The UI cannot widen that, and must not appear to.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Author a condition rule without writing JSON (Priority: P1)

An analyst opens a case, builds a condition — "name contains AVI, aged 30 to 40, risk is HIGH" —
by choosing fields, operators and values from constrained controls, watches the live match count
change as they refine it, and saves the rule to the case once they are satisfied.

**Why this priority**: This is the reason the service exists and the only capability with no usable
alternative — the condition tree is a nested, typed structure that no one can reasonably hand-write
in a text box. Every other story below is browsing that a competent user could survive without for
a while.

**Independent Test**: Build a three-condition AND group entirely through the interface, confirm the
previewed match count matches the same tree posted directly to the dry-run endpoint, save it to a
case that has no rule yet, and re-open the saved rule to confirm the tree round-trips unchanged.

**Acceptance Scenarios**:

1. **Given** an author starting a new condition, **When** they add a condition leaf, **Then** the
   field control offers only the fields the service declares as queryable, and no free-text field
   entry is possible.
2. **Given** an author who has chosen a field, **When** they open the operator control, **Then**
   only operators valid for that field's type are offered — text-matching operators are absent for
   a numeric or enumerated field, and ordered comparisons are absent for a field the service cannot
   order.
3. **Given** an author who has chosen a field and an operator, **When** they enter a value, **Then**
   the value control matches the shape that operator requires: a single value, a two-ended range, or
   a multi-value list; and for an enumerated field the value is chosen from that enumeration rather
   than typed.
4. **Given** an author composing a range, **When** they enter an upper bound below the lower bound,
   **Then** the interface refuses it before any request is sent and explains why.
5. **Given** an author building a group, **When** they choose a negation group, **Then** the
   interface permits exactly one child inside it and explains that multiple children must be wrapped
   in an explicit AND or OR.
6. **Given** an author with a group that has no children, **When** they attempt to save or preview,
   **Then** the interface blocks it with a message naming the empty group.
7. **Given** an author with a valid tree, **When** they request a preview, **Then** the interface
   shows the total number of matching persons and a first page of them, without the rule having been
   saved.
8. **Given** an author previewing, **When** they change any part of the tree, **Then** the previously
   shown count is visibly marked as stale until the new preview returns, so no decision is made
   against a number that no longer describes the tree on screen.
9. **Given** a valid tree and a target case that has no rule, **When** the author saves, **Then** the
   rule is created and the interface shows its identity and the case it now belongs to.
10. **Given** a target case that already has a rule, **When** the author attempts to create a second
    one for it, **Then** the interface explains that a case holds exactly one rule and offers to open
    the existing rule instead.
11. **Given** an author editing the condition of a saved rule, **When** they save the new tree,
    **Then** only the condition is replaced and the rule's other attributes are untouched.
12. **Given** a tree that exceeds the service's structural budget (too deeply nested, too many nodes,
    or a too-long list of values), **When** the author previews or saves, **Then** the interface
    reports which budget was exceeded and its limit, rather than a generic failure.

---

### User Story 2 - Run a rule and work its matches (Priority: P1)

An analyst opens a saved rule, runs it against the whole population to discover who looks like the
subject of the case, pages through the matches, opens one person to see their full record, and links
that person to the case with a role.

**Why this priority**: Authoring a rule that can never be run delivers nothing. Discovery-then-link
is the workflow that turns a rule into case work, and it is the point at which the field-exposure
rules become visible to the user.

**Independent Test**: Run a saved rule in each of the two scopes against seeded data, confirm the
whole-population run returns a superset of the case-scoped run, page past the first page of results,
open a match, and link them to the case — then re-run in case scope and confirm the newly linked
person is now included.

**Acceptance Scenarios**:

1. **Given** a saved rule, **When** the analyst runs it, **Then** they must first state whether the
   run searches the whole population or only the persons already linked to the rule's case, and the
   choice is shown alongside the results.
2. **Given** a run that returned results, **When** the analyst views them, **Then** they see the
   total number of matches and one page of matched persons, with page navigation that reflects the
   server's page and total counts.
3. **Given** a page of matches, **When** the analyst reads a row, **Then** the row shows only the
   summary-depth fields the service returns for a match, and the national identifier is not among
   them nor implied to be available in the list.
4. **Given** a matched person, **When** the analyst opens them, **Then** the full single-record view
   is fetched and shown, including the fields that are withheld from listings.
5. **Given** an open person and a case, **When** the analyst links them and chooses a role, **Then**
   the link is created and appears on both the person's and the case's views.
6. **Given** a person already linked to that case, **When** the analyst attempts to link them again,
   **Then** the interface explains that the link already exists rather than silently changing the
   existing link's role.
7. **Given** a rule that matches nothing, **When** it is run, **Then** the interface presents an
   explicit empty result — distinguishable from an error and from a run that has not happened yet.
8. **Given** a rule whose stored condition references something the service can no longer resolve,
   **When** it is run, **Then** the interface reports the specific reason (an unknown field, an
   operator incompatible with the field's type, or a value the field does not accept) and offers to
   open the rule for editing.

---

### User Story 3 - Browse and manage records through one consistent surface (Priority: P2)

A user lists persons, cases, rules, and the links between them; opens any one of them; edits it;
and retires it — and finds that all four record types behave identically apart from their own
fields.

**Why this priority**: The service's uniform record contract is worth little if the interface
re-invents a bespoke screen per record type. This story delivers the browsing and editing shell the
first two stories link into, but the rule builder is what users come for.

**Independent Test**: Perform the full operation set — list a page, sort it, open one record, edit
and save it, attempt to remove it — against two different record types and confirm the interaction,
paging behaviour, and error handling are identical apart from the fields displayed.

**Acceptance Scenarios**:

1. **Given** any record type, **When** the user opens its listing, **Then** they see one page of
   records with the total record count and total page count, and can move between pages.
2. **Given** a listing, **When** the user sorts by a column, **Then** only columns the service
   accepts as sort keys for that record type are sortable, and both directions are offered.
3. **Given** a listing whose page size the user can influence, **When** they request more than the
   service permits, **Then** the interface presents the page size the service actually applied
   rather than the one that was asked for.
4. **Given** a record open for editing, **When** the user saves, **Then** the interface submits the
   record's identity and the concurrency token it read, and shows the saved result.
5. **Given** a record the user has had open while someone else changed it, **When** they save,
   **Then** the interface explains that the record changed underneath them, does not discard their
   input, and offers to re-read the current version.
6. **Given** a record type the service does not permit deleting, **When** the user attempts removal,
   **Then** the interface presents the service's retirement route instead — closing a case by status,
   disabling a rule by its enabled flag — and offers to perform it.
7. **Given** a person, **When** the user deletes them, **Then** the interface states that the person
   is retired rather than erased and that their case links are removed, and the person disappears
   from subsequent listings and rule matches.
8. **Given** a person-case link, **When** the user removes it, **Then** the interface states that
   only the link is removed and neither the person nor the case is affected.
9. **Given** any create or update rejected for invalid input, **When** the rejection is shown,
   **Then** the offending fields are identified individually rather than as one opaque message.

---

### User Story 4 - Work a case as a workspace (Priority: P2)

An investigator opens a case and sees, in one place, its status, the rule attached to it, the
persons linked to it, and the actions available: edit the rule, run it in case scope, link or unlink
a person, and close the case.

**Why this priority**: The case is the organising object of the domain — a rule belongs to exactly
one case, and links hang off it. Assembling this view is composition of stories 1–3 rather than new
capability, which is why it sits below them.

**Independent Test**: Open a case with a rule and several linked persons and confirm every element
is reachable without leaving the view: the rule opens for editing, a case-scoped run executes, a
linked person opens, a new link is created, and the case can be closed.

**Acceptance Scenarios**:

1. **Given** a case, **When** it is opened, **Then** its title, status, opening time, its rule (if
   any), and its linked persons are shown together.
2. **Given** a case with more linked persons than the single-record view returns, **When** it is
   opened, **Then** the interface shows the total number of linked persons and does not present the
   returned subset as if it were all of them.
3. **Given** a case with no rule, **When** it is opened, **Then** the interface offers to author one
   for it.
4. **Given** an open case, **When** the investigator closes it, **Then** its status changes to closed
   and the change is visible immediately.
5. **Given** a closed case, **When** it is opened, **Then** it remains readable and its history
   remains reachable.

---

### User Story 5 - Read the audit trail (Priority: P3)

A reviewer opens the audit trail, filters it to one record type or to a single record, and reads
what changed, when, and to what version — including seeing that a sensitive field changed without
seeing its value.

**Why this priority**: The trail is already recorded and is a compliance capability rather than a
daily workflow; it delivers value on its own but nobody is blocked without it.

**Independent Test**: Create, update, and delete a record through the interface, then open the audit
trail filtered to that record and confirm three entries appear in the expected order with the
expected field-level changes, and that the sensitive field's values are masked.

**Acceptance Scenarios**:

1. **Given** the audit trail, **When** it is opened, **Then** entries are shown newest first, paged,
   with the record type, record identity, operation, actor, and time of each.
2. **Given** the trail, **When** the reviewer filters by record type, **Then** only entries for that
   type are shown.
3. **Given** the trail filtered to a record type, **When** the reviewer also supplies a record
   identity, **Then** only that record's history is shown; supplying an identity without a type is
   not offered as an option, because the service ignores it.
4. **Given** an entry for an update, **When** it is expanded, **Then** each changed field is shown
   with its previous and new values.
5. **Given** an entry for a creation, **When** it is expanded, **Then** each field is shown with its
   initial value only, with no previous value implied.
6. **Given** an entry for a deletion, **When** it is expanded, **Then** the interface states that
   deletions record no field-level detail, rather than showing an empty change list that reads as
   "nothing changed".
7. **Given** an entry touching a field the service marks sensitive, **When** it is expanded,
   **Then** the field is shown as changed with both values masked, and the interface does not offer
   any route to reveal them.
8. **Given** the trail, **When** the reviewer sorts it, **Then** only the sort keys the service
   accepts for audit entries are offered.

---

### Edge Cases

- **The service is unreachable, or a request fails at the transport level.** Every view must
  distinguish "could not reach the service" from "the service refused this" and from "there is
  nothing here", and must offer a retry that does not lose the user's input.
- **A save is rejected because the record changed underneath the user.** The user's edits must
  survive the rejection. Silently re-reading and overwriting is not acceptable — this is the one
  conflict the service is explicitly designed to surface.
- **A save is rejected because the concurrency token was not sent at all.** This is a client defect,
  not a user error; the interface must never produce it, and if it does it must not present it to
  the user as though they did something wrong.
- **A create is rejected because it violates a uniqueness or referential constraint** — a duplicate
  national identifier among live persons, a second rule on a case, a link that already exists. Each
  must be explained in the domain's terms, not as a generic conflict.
- **A rule's stored condition no longer compiles** because the queryable field set changed after the
  rule was written. The rule must remain openable and editable; only running it fails, and the
  failure must name the field or operator at fault.
- **A condition on a time-valued field.** The service registers a creation-time field as queryable
  but accepts only exact-equality comparisons against it — ordered comparisons and ranges over time
  are not expressible. The interface must not offer operators the service will reject (see
  **Known gaps in the API this UI sits on**).
- **A person is soft-deleted while a rule that matched them is being viewed.** Re-running the rule
  must simply not return them; opening the stale row must report the record as not found rather than
  showing a blank record.
- **A person's case links exceed what the person's single-record view returns.** The interface must
  show the true total and must not present the embedded subset as complete.
- **The user requests a sort key the service does not accept for that record type.** The interface
  must never be able to construct one; if the service rejects one anyway, the rejection must be
  reported as an interface defect rather than surfaced as a user-facing failure.
- **An empty result of any kind** — no persons, no cases, no matches, no audit entries — must be
  presented as an explicit empty state carrying the next useful action, never as a blank region.
- **Two different requests are in flight and one supersedes the other** (a preview refined twice in
  quick succession, a page changed while the previous page is loading). The interface must show the
  result of the most recent request, never a stale earlier one that happened to arrive later.
- **A very large match count.** The interface must remain responsive and must not attempt to fetch
  every match to compute anything; the total comes from the service.
- **A rule tree deep enough to be awkward to display.** Nesting must remain navigable — the
  interface may collapse depth, but must never silently hide a node that participates in the
  condition.

## Requirements *(mandatory)*

### Functional Requirements

#### Rule authoring

- **FR-001**: The interface MUST offer, as the only way to choose a condition's field, the queryable
  field list the service publishes; free-text field entry MUST NOT be possible.
- **FR-002**: The interface MUST restrict the operators offered for a field to those the service
  accepts for that field's type — text-matching operators only for textual fields, ordered
  comparisons only for fields the service can order — so that an author cannot assemble a condition
  the service is guaranteed to reject.
- **FR-003**: The interface MUST present a value control matching the shape the chosen operator
  requires — a single text value, a single numeric value, an inclusive two-ended range, or a
  non-empty list of values — and MUST NOT allow a value of a different shape to be submitted.
- **FR-004**: The interface MUST offer the permitted values of an enumerated field as a closed
  choice rather than as free text.
- **FR-005**: The interface MUST support conditions that test only for the presence or absence of a
  value, with no operand.
- **FR-006**: The interface MUST support nesting conditions in AND, OR, and NOT groups, MUST enforce
  that a NOT group holds exactly one child, and MUST enforce that no group is empty, before any
  request is sent.
- **FR-007**: The interface MUST reject an inclusive range whose lower bound exceeds its upper bound,
  and a list of values that is empty, before any request is sent.
- **FR-008**: The interface MUST let an author dry-run an unsaved condition and MUST show the
  resulting total match count together with a first page of matched persons.
- **FR-009**: The interface MUST visibly mark a previously shown preview result as stale as soon as
  the condition changes, and MUST NOT present a count that no longer corresponds to the tree on
  screen as current.
- **FR-010**: The interface MUST let an author save a new rule against a case, and MUST explain,
  when a case already has a rule, that the relationship is one-to-one — offering the existing rule
  rather than repeating the failed create.
- **FR-011**: The interface MUST let an author replace the condition of an existing rule without
  altering the rule's other attributes.
- **FR-012**: The interface MUST report a rejection caused by the service's structural budget —
  nesting depth, total node count, or list length — naming which budget was exceeded and its limit.
- **FR-013**: The interface MUST round-trip a saved condition tree without loss: a tree opened for
  editing and saved again unchanged MUST be byte-for-byte the tree that was stored.

#### Rule evaluation

- **FR-014**: The interface MUST require the user to state the scope of a run — the whole population,
  or only persons already linked to the rule's case — and MUST display which scope produced the
  results on screen.
- **FR-015**: The interface MUST page through match results using the service's paging, MUST show
  the total match count, and MUST NOT fetch all matches in order to display or count them.
- **FR-016**: The interface MUST display match rows using only the summary-depth fields the service
  returns for a match, and MUST NOT imply that withheld fields — the national identifier in
  particular — are available at that depth.
- **FR-017**: The interface MUST allow opening a matched person to their full single-record view.
- **FR-018**: The interface MUST present a rule that matches nothing as an explicit empty result,
  distinct from an error and from a run not yet performed.
- **FR-019**: The interface MUST report a run that fails because the stored condition no longer
  compiles by naming the field, operator, or value at fault, and MUST offer to open the rule for
  editing.

#### Record management

- **FR-020**: The interface MUST provide, for each of the four managed record types, the same
  operation set — list a page, open one record, create, update, and remove — with the same
  interaction, paging behaviour, and error presentation.
- **FR-021**: The interface MUST offer sorting only on the keys the service accepts for the record
  type in question, in both directions, and MUST NOT be able to construct a sort request the service
  will reject.
- **FR-022**: The interface MUST display the page size the service actually applied, which may be
  smaller than one that was requested, rather than the requested value.
- **FR-023**: The interface MUST send, on every update, the record's identity and the concurrency
  token it received when reading that record.
- **FR-024**: The interface MUST, when a save is rejected because the record was modified
  concurrently, preserve the user's unsaved input, explain what happened, and offer to re-read the
  current record — it MUST NOT silently re-read and re-submit.
- **FR-025**: The interface MUST present, for a record type the service does not permit deleting,
  the retirement route the service names — closing a case by status, disabling a rule by its flag —
  as an offered action rather than as an error the user must interpret.
- **FR-026**: The interface MUST state, when a person is removed, that the person is retired rather
  than erased and that their case links are removed with them.
- **FR-027**: The interface MUST state, when a person-case link is removed, that only the link is
  removed.
- **FR-028**: The interface MUST let a user link a person to a case with a role, and MUST explain a
  rejected duplicate link in those terms rather than as a generic constraint failure.
- **FR-029**: The interface MUST submit only the fields each record type declares; it MUST NOT add
  fields of its own to a request body, because the service rejects unrecognised fields outright.
- **FR-030**: The interface MUST NOT present server-owned fields — identity of authorship, timing,
  version — as editable, since the service ignores them on write.

#### Case workspace

- **FR-031**: The interface MUST present a case together with its status, its rule if it has one, and
  its linked persons, with every associated action reachable from that view.
- **FR-032**: The interface MUST show the true total number of persons linked to a case, and MUST NOT
  present the subset embedded in the case's single-record response as the complete set.
- **FR-033**: The interface MUST offer rule authoring for a case that has no rule.

#### Audit trail

- **FR-034**: The interface MUST present the audit trail as a paged, read-only listing ordered newest
  first, showing record type, record identity, operation, actor, time, and resulting version — with
  no create, edit, or delete affordance anywhere on it.
- **FR-035**: The interface MUST allow filtering the trail by record type, and by a specific record
  within a chosen record type; it MUST NOT offer filtering by record identity alone, which the
  service ignores.
- **FR-036**: The interface MUST render field-level changes according to the operation: previous and
  new values for an update, initial values only for a creation, and an explicit statement that
  deletions carry no field-level detail.
- **FR-037**: The interface MUST render a masked sensitive field as changed-but-hidden, and MUST NOT
  offer any route to reveal the underlying values.
- **FR-038**: The interface MUST offer sorting on the trail only by the keys the service accepts for
  audit entries.

#### Cross-cutting

- **FR-039**: The interface MUST present a distinct, human-readable message for each failure the
  service can return — record not found, rule not found, deletion not supported, invalid sort key,
  invalid argument, missing concurrency token, concurrent modification, constraint violation, unknown
  field, incompatible operator, condition tree too complex, invalid rule, request validation failure,
  malformed request, audit recording failure, and stored-rule read failure — driven by the
  machine-readable code the service supplies rather than by matching on message text.
- **FR-040**: The interface MUST distinguish an unreachable service from a service that refused the
  request, and MUST offer retry on the former without losing user input.
- **FR-041**: The interface MUST render every empty result as an explicit empty state carrying the
  next useful action.
- **FR-042**: The interface MUST show, for every request in flight, that work is in progress, and
  MUST display only the most recent request's result when several are outstanding for the same view.
- **FR-043**: The interface MUST NOT display, log, or store the national identifier anywhere outside
  a person's single-record view, and MUST NOT retain it after that view is closed.
- **FR-044**: The interface MUST be operable by keyboard alone and MUST convey state changes —
  validation failures, results arriving, saves succeeding — to assistive technology, since the
  rule builder is a deeply nested interactive structure that is unusable otherwise.
- **FR-045**: The interface MUST NOT present any sign-in, user-identity, or permission affordance,
  because the service has no authentication and attributes every change to a single fixed actor;
  presenting an identity the service does not honour would misrepresent the audit trail.
- **FR-046**: The interface MUST take the service's location as configuration and MUST NOT hardcode
  it.

### Key Entities

- **Person**: An individual in the population. Carries a name, age, city, and risk level in its
  summary form; adds a national identifier, case links, and change metadata in its full form.
  Retired by soft deletion — removed from every listing and match, never erased. The national
  identifier is unique among live persons only.
- **Case**: The organising record of an investigation. Carries a title, a status
  (open / under review / closed), an opening time, at most one rule, and a set of linked persons.
  Never deleted; retired by moving to the closed status.
- **Rule**: A named, enable-able condition attached to exactly one case. Its condition is a nested
  tree; the tree must compile to a database query before the rule can be stored. Never deleted;
  retired by disabling.
- **Person-case link**: The association between one person and one case, carrying the person's role
  in that case (subject / associate / witness) and the time it was made. Identified by the pair it
  joins. The only record type that is genuinely deleted, because unlinking is what removal means.
- **Condition tree**: The rule's condition. A node is either a logical group (AND / OR over one or
  more children, NOT over exactly one), a comparison of a queryable field against a typed value, or a
  presence test on a field with no value. Bounded by the service in depth, total node count, and
  list length.
- **Condition value**: The operand of a comparison, in one of four shapes — a single text value, a
  single number, an inclusive range, or a non-empty list. Which shapes an operator accepts is fixed
  by the service; which shapes a field accepts is fixed by that field's type.
- **Match result**: A page of persons satisfying a condition, at summary depth, plus the total count.
  Produced either by running a stored rule in a stated scope or by dry-running an unsaved tree.
- **Audit entry**: An immutable record of one lifecycle change to one record — its type, identity,
  operation, actor, time, resulting version, and field-level changes. Field-level detail is present
  for creations and updates, absent for deletions, masked for sensitive fields.
- **Page**: The envelope every listing arrives in — the content of one page plus the page index, the
  applied page size, the total record count, and the total page count. The applied page size is the
  server's decision and may be smaller than the one requested.
- **Failure**: A refused request, carrying a machine-readable code, a human-readable message, and the
  time it occurred. The code — not the message — is what the interface branches on.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An analyst who has never used the interface can build the canonical three-condition
  rule (a name substring, an age range, and a risk level, combined with AND), preview it, and save it
  to a case in under five minutes without reading documentation and without seeing the underlying
  request format.
- **SC-002**: Zero rejections caused by an unknown field, an operator incompatible with its field, a
  value shape an operator does not accept, an empty group, a mis-arity negation, or an inverted range
  originate from the rule builder — every such condition is prevented before a request is sent.
- **SC-003**: Every failure the service can return is presented with a message specific to that
  failure; no failure path renders a generic "something went wrong".
- **SC-004**: The national identifier appears in exactly one place in the interface — a person's
  single-record view — and in no listing, match result, export, log line, or persisted client state.
- **SC-005**: A concurrent-modification rejection never loses user input: after the rejection, 100%
  of the user's unsaved edits are still on screen.
- **SC-006**: No view requests more than one page of any collection in order to render itself, at any
  population size.
- **SC-007**: Every listing, every preview, and every rule run reaches a terminal state — results,
  explicit empty, or a specific failure — with no state in which the interface shows neither progress
  nor an outcome.
- **SC-008**: Every rule-builder action is reachable and completable by keyboard alone.
- **SC-009**: A reviewer can go from "this record looks wrong" to that record's full change history,
  filtered to that record, in at most three interactions.
- **SC-010**: A condition tree saved through the interface and one posted directly to the service
  produce identical stored trees for the same logical condition.

## Assumptions

- **The interface is a standalone application, not a component library.** The example this
  specification follows describes a reusable package; that shape is not appropriate here, because
  there is exactly one consumer and no second application to share it with. The deliverable is the
  application an analyst opens.
- **No authentication exists and none is invented.** The service has no authn/authz layer and
  attributes every change to a fixed `system` actor. The interface therefore ships with no sign-in,
  no user menu, and no permission-dependent affordances. It follows that the interface must be
  deployed only where the service itself is safe to expose, and that the audit trail's actor column
  carries no information until authentication lands — a limitation the audit view should state
  plainly rather than paper over.
- **The record types in scope are exactly the four the service manages** — person, case, rule,
  person-case link — plus the read-only audit trail. No new record type, endpoint, or backend
  capability is introduced by this feature.
- **A rule run is initiated by the user, never automatically.** Running a rule is a database query
  over the whole population; a UI that re-ran on every keystroke would turn one analyst into a load
  generator. Preview is explicitly requested, and the staleness marking in FR-009 exists precisely
  so that not-auto-running is safe.
- **Client-side validation mirrors the service's rules; it does not replace them.** Every constraint
  the interface enforces before sending is also enforced by the service, and a rejection that gets
  through is presented, not suppressed.
- **The interface treats the service's machine-readable failure code as the contract.** Message text
  is for display only and may change without notice.
- **Values are shown as the service returns them.** In particular the interface does not reformat or
  re-round numeric or decimal values on their way to the screen, since a rule's semantics depend on
  the exact operand.

### Dependencies and backend prerequisites

These are conditions outside this feature that the interface cannot satisfy for itself. Each is
listed with what happens if it is not met.

1. **Cross-origin access must be permitted by the service.** No cross-origin configuration exists
   today. Until one is added, a browser application served from any origin other than the service's
   own is blocked entirely — every request fails before it reaches a handler, with no diagnosable
   error in the response body. This is a hard prerequisite for User Story 1 and everything after it;
   it is not something the interface can work around.
2. **The queryable-field list must carry each field's type and permitted operators.** Today the
   service publishes field *names* only. FR-002, FR-003, FR-004 and SC-002 require knowing a field's
   type, its permitted operators, and — for enumerated fields — its permitted values.
   *If this is not added*, the interface must carry its own copy of that mapping, which will drift
   silently the moment a field is added, retyped, or removed on the server: the drift surfaces as a
   rejected save the user cannot understand, which is exactly the failure SC-002 forbids. The
   interface should therefore treat a locally held mapping as a documented stopgap and validate it
   against the published names at start-up, reporting a mismatch as a configuration error rather
   than degrading silently.
3. **The person-case listing must support filtering by person and by case.** Today it can only be
   paged in full. A case's single-record view embeds only its first twenty links plus a total, and
   there is no way to fetch the twenty-first. *If this is not added*, FR-032 can only be met by
   showing the true total next to a subset the user cannot page — honest, but a dead end for any case
   with more than twenty linked persons.
4. **Deleting a person must be intentional and confirmable.** The service treats it as a soft delete
   that also hard-deletes the person's links. The interface must confirm it explicitly; no backend
   change is needed, but the confirmation wording depends on that behaviour staying as it is.

### Known gaps in the API this UI sits on

Recorded so the interface's shape is understood as deliberate rather than incomplete:

- **Time-based conditions are not expressible.** The creation-time field is published as queryable,
  and equality against an exact instant works, but ordered comparisons and ranges over it accept only
  numeric operands and therefore fail. The interface must not offer ordered or range operators for
  time-valued fields until the service accepts a time-shaped operand. A rule such as "opened in the
  last thirty days" cannot be built.
- **Rules are not versioned.** Editing a condition overwrites it, so a past run cannot be reproduced
  and no "what did this rule look like when it was run" view is possible. The audit trail records
  that the condition changed, which is the closest available substitute.
- **A match result does not say why a person matched.** The service returns matching persons, not
  per-node evidence, so the interface cannot highlight which condition a given match satisfied.
- **The dry run has no scope.** Preview always searches the whole population; case-scoped evaluation
  requires a saved rule, because scope is derived from the rule's case. An author previewing an
  unsaved tree therefore cannot see what a case-scoped run would return.

### Out of Scope (deferred)

- **Authentication, authorization, and any per-user or per-tenant view of data.** The service has
  none; adding a login screen in front of an unauthenticated API would be security theatre.
- **Any interface for changing which fields are queryable.** The queryable field set is a
  server-side security boundary, not configuration; exposing it to editing from the browser would
  invert that.
- **Bulk operations** — bulk linking, bulk editing, bulk retirement. Every current write endpoint is
  single-record, so bulk affordances would be an interface fiction over a loop of requests, with no
  atomicity behind them.
- **Exporting match results or audit history to a file.** Both are unbounded, and export would move
  data — including sensitive identifying values — outside the boundary this specification is careful
  to keep them inside. It needs its own decision, not a checkbox.
- **Saved searches, scheduled runs, alerting on new matches.** All require backend state that does
  not exist.
- **Real-time updates.** Nothing pushes change notifications; views refresh when the user acts.
- **Offline use.** Every capability here is a query against the service.
