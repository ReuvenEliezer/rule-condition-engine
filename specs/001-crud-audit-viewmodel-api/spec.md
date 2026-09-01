# Feature Specification: Uniform CRUD API, Audit Trail, and UI-Facing View Models

**Feature Branch**: `001-crud-audit-viewmodel-api`

**Created**: 2026-08-30

**Status**: Draft

**Input**: User description: "look at /Users/reuven/IdeaProjects/spring-data-jpa-mysql-liquibase-jwt/src/main/java/com/liquibase/ and apply: 1. same concept of CRUD for API, 2. AuditTrailListener etc.., 3. add ViewModel -> or something other match names for UI object returns for the API"

## Overview

Today the rule-condition-engine exposes one hand-written endpoint family for rules only. Every other
business record — persons, case files, the links between them — has no managed API at all, and the
few responses that do exist are shaped ad hoc. There is also no record of who changed what.

This feature adopts three proven conventions from the reference project (`com.liquibase`) so that
this codebase gets the same shape:

1. **One uniform record-management contract** that every managed record type inherits, instead of
   per-type endpoints written from scratch.
2. **An audit trail** covering both record lifecycle changes (created / updated / deleted, by whom,
   when) and inbound API traffic.
3. **A dedicated UI-facing representation layer** ("view models") so the API never serializes stored
   records directly and every response has a declared, stable shape.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Manage any business record through one consistent contract (Priority: P1)

A front-end developer building the rule-builder screens needs to list persons, open a case file,
create a rule, rename it, and remove a record. Today they can only do a narrow slice of that, and
each operation they *can* do has its own shape. They want one contract: once they have learned how
to read, page, save, and delete one record type, every other record type works identically —
same paths, same parameters, same response envelope, same status codes.

**Why this priority**: Nothing else in this feature is usable without it. It is also the piece that
removes the most duplicated effort: every future record type gets its full operation set for free
instead of another hand-written controller.

**Independent Test**: Exercise the full operation set (create, read one, list a page, update,
delete) against two different record types and confirm the request/response shapes are identical
apart from the record's own fields. Delivers a working management API even before view models or
auditing are refined.

**Acceptance Scenarios**:

1. **Given** a supported record type with no stored records, **When** the client requests the first
   page, **Then** an empty page is returned with a success outcome and totals of zero (not an error).
2. **Given** a client submits a record with no identifier, **When** the save operation is called,
   **Then** a new record is created and the response carries the newly assigned identifier.
3. **Given** a client submits a record that carries an existing identifier, **When** the save
   operation is called, **Then** the existing record is updated rather than duplicated.
4. **Given** 250 stored records, **When** the client requests page 2 with a page size of 50 sorted
   by a named field, **Then** exactly records 101–150 in that sort order are returned, together
   with the total record count and total page count.
5. **Given** a client requests a page size far above the configured maximum, **When** the list is
   returned, **Then** the page size is silently clamped to the maximum rather than honoured.
6. **Given** an identifier that matches no stored record, **When** the client requests that record,
   **Then** a "not found" outcome is returned, distinguishable from a server failure.
7. **Given** a stored record of a deletable type, **When** the client deletes it and then requests
   it again, **Then** the record is no longer retrievable through the read or list operations.
8. **Given** a record type that is not deletable, **When** the client attempts to delete it,
   **Then** the request is rejected with an outcome naming the retirement mechanism to use instead.

---

### User Story 2 - Receive purpose-built UI objects instead of raw stored records (Priority: P2)

The same front-end developer needs response objects designed for the screen, not for the database:
predictable field names, an explicit type marker so a mixed collection can be rendered, a compact
form for list screens, and a fuller form (with related records) for a detail screen. They must never
receive fields that only exist because of how the data is stored, and must never receive sensitive
identifiers they did not ask for.

**Why this priority**: It makes the P1 contract safe and stable. Without it, response shapes drift
with every storage change and sensitive data leaks by default. It is separable from P1 because P1's
contract can be demonstrated before the representation layer is complete.

**Independent Test**: Call every read operation and assert each response contains exactly the fields
published for that record type's representation — no more, no fewer — and that the summary and
detail forms differ as specified.

**Acceptance Scenarios**:

1. **Given** any read or save operation, **When** the response is inspected, **Then** it contains
   only fields declared by that record type's published representation.
2. **Given** a list request, **When** the response is inspected, **Then** each element carries its
   identifier and a type marker naming which record type it represents.
3. **Given** a single-record request for a case file that has linked persons, **When** the detail
   form is returned, **Then** the linked persons are included; **When** the same case file appears
   in a list response, **Then** the linked persons are omitted.
4. **Given** a person record holding a national identifier, **When** that person appears in any list
   or match result, **Then** the national identifier is absent from the response.
5. **Given** a client submits a representation with fields the record type does not accept, **When**
   the save operation runs, **Then** the request is rejected with a validation outcome naming the
   offending fields rather than silently ignoring them.

---

### User Story 3 - Trace who changed what, and when (Priority: P3)

A compliance reviewer investigating a disputed screening decision needs to answer: which records
were created, changed, or removed; by whom; at what time; and which API calls drove those changes.
Today none of that is recoverable.

**Why this priority**: Valuable and required for operational confidence, but the API is usable
without it, and it can be added on top of the P1/P2 slices without reshaping them.

**Independent Test**: Perform one create, one update, and one delete on a record type, then confirm
each produced a distinct audit entry carrying record type, identifier, operation, actor, and
timestamp — and that the corresponding API calls were logged.

**Acceptance Scenarios**:

1. **Given** a record is created, **When** the operation completes, **Then** an audit entry is
   produced naming the record type, its identifier, the operation "create", the acting user, and
   the time.
2. **Given** a record is updated, **When** the operation completes, **Then** the record's
   last-modified time and last-modified actor reflect that change, and an "update" audit entry is
   produced.
3. **Given** a record is deleted, **When** the operation completes, **Then** a "delete" audit entry
   is produced.
4. **Given** a record is created, **When** it is later read, **Then** its created-at and created-by
   values are unchanged by any subsequent update.
5. **Given** any inbound API call, **When** it completes, **Then** a request log entry exists with
   the method, path, outcome, elapsed time, and acting user.
6. **Given** an API call carrying credentials or other sensitive values, **When** it is logged,
   **Then** those values do not appear in the log entry.
7. **Given** the audit recording itself fails, **When** the business operation would otherwise
   succeed, **Then** neither is retained — the change is rolled back with it — and the caller is
   told the failure was in recording the audit, not in the change itself.
8. **Given** an operation performed with no authenticated user, **When** the audit entry is written,
   **Then** the actor is recorded as an explicit system/anonymous value rather than left blank.

---

### Edge Cases

- **Save referencing a vanished record**: a client submits a representation whose identifier existed
  when the screen loaded but has since been deleted — the save must fail with "not found", not
  silently create a second record under a new identifier.
- **Deleting an already-deleted record**: the second delete must report "not found" rather than
  failing as a server error.
- **Paging past the end**: requesting page 99 of a 3-page result must return an empty page with
  correct totals, not an error.
- **Unknown or ambiguous sort field**: sorting by a field the record type does not expose must be
  rejected with a clear validation message rather than falling back to an arbitrary order.
- **Unstable paging order**: two consecutive pages must never repeat or skip a record; every listing
  must have a total ordering even when the caller sorts by a non-unique field.
- **Concurrent updates**: two clients saving the same record from stale copies must not silently
  lose one client's change without any signal.
- **Records identified by more than one value**: the person-to-case link is identified by the person
  and the case together — the uniform contract must address such records without a special-case API.
- **Detail form with very many children**: a case file linked to tens of thousands of persons must
  not attempt to return them all inside a single detail response.
- **Record type with existing bespoke endpoints**: rules already have rule-specific operations
  (condition update, match evaluation, preview, field list) that are not CRUD — these must survive
  unchanged alongside the uniform contract.

## Requirements *(mandatory)*

### Functional Requirements

#### Uniform record management

- **FR-001**: System MUST expose the same set of record-management operations — create, read one,
  list a page, update — for every managed record type. There is no unpaged list operation: every
  listing is paged, and a client wanting the whole population walks the pages. Deletion is an
  OPTIONAL operation: a record type that does not support it MUST reject the request with a distinct
  outcome that names the retirement mechanism to use instead, rather than omitting the operation
  silently.
- **FR-002**: The shape of those operations (path structure, parameter names, request envelope,
  response envelope, and status outcomes) MUST be identical across all managed record types.
- **FR-003**: Creation and update MUST be expressed as a single "save" operation, distinguished by
  whether the submitted representation carries an identifier: absent identifier creates, present
  identifier updates.
- **FR-004**: Paged listing MUST accept a page number, a page size, and a sort field with direction,
  and MUST return the requested page together with the page number, effective page size, total
  record count, and total page count.
- **FR-005**: System MUST clamp the effective page size to a configured maximum and apply a
  configured default when the client supplies none, so no single request can retrieve the entire
  population.
- **FR-006**: Every paged listing MUST apply a total ordering, so that consecutive pages neither
  repeat nor omit records.
- **FR-007**: Requesting, updating, or deleting a record that does not exist MUST return a
  "not found" outcome that is distinguishable from a validation failure and from a server error.
- **FR-008**: Retirement semantics are defined per record type, and each type MUST document which
  applies:
  - **Person** — deletion MUST retain the record for audit purposes while excluding it from every
    read and list operation, including rule-match results.
  - **Person-Case Link** — deletion MUST physically remove the link; a link carries no history worth
    retaining and is recreatable.
  - **Case File** and **Rule** — these MUST NOT be deletable. They are retired through state they
    already carry (a case's status, a rule's enabled flag), so that a record has exactly one notion
    of "no longer active" rather than two that can disagree.
- **FR-009**: Exposing a new record type through the uniform contract MUST require only the pieces
  specific to that type (its representation, its conversion, and any type-specific overrides), with
  no change to the shared operation logic.
- **FR-010**: Each managed record type MUST be able to override the behaviour of individual
  operations (for example, how it finds a record, how it lists records, or what it does on delete)
  without altering the shared contract that clients see.
- **FR-011**: The record-management contract MUST cover persons, case files, rules, and the
  person-to-case link, including records identified by a composite of more than one value.
- **FR-012**: Existing rule-specific operations (condition update, match evaluation, dry-run
  preview, queryable-field listing) MUST continue to work unchanged after the uniform contract is
  introduced.

#### UI-facing representations

- **FR-013**: Every API response MUST return a purpose-built UI representation; stored record
  structures MUST NOT be serialized to clients directly.
- **FR-014**: All UI representations MUST share a common base that carries the record identifier and
  an explicit type marker naming which record type the object represents.
- **FR-015**: Each record type MUST provide a summary form used in list responses and a detail form
  used in single-record responses; the detail form MAY include related records, the summary form
  MUST NOT. Which form applies MUST be determined by the operation being invoked, declared in one
  shared place, rather than chosen by each caller at each conversion.
- **FR-016**: Translation between a UI representation and its stored record MUST be a single, named
  responsibility per record type, used by every operation for that type, so that one field mapping
  cannot diverge between endpoints.
- **FR-017**: Sensitive identifying values (for example, a person's national identifier) MUST be
  excluded from summary forms and from screening/match results, and MUST be obtainable only through
  an explicit single-record request.
- **FR-018**: A representation submitted for save MUST be validated before any storage is attempted,
  and validation failures MUST name the offending fields.
- **FR-019**: Existing response objects MUST be reconciled into exactly one convention: a single
  representation per record type, used for both writes and reads, whose depth varies by operation.
  Fields that the system owns (identifiers of authorship and timing) MUST be emitted on reads and
  MUST be ignored on writes, so the same representation can serve both directions without letting a
  client set them.

#### Audit trail

- **FR-020**: Every create, update, and delete of a managed record MUST produce a **persisted,
  queryable** audit entry identifying the record type, the record identifier, the operation
  performed, the acting user, the time of the change, and **which fields changed, from what to
  what**. A create entry carries the record's initial field values; an update entry carries only the
  fields that changed; a delete entry carries the operation alone.
- **FR-029**: The audit history of a single record MUST be retrievable by record type and identifier
  without consulting application code or log files, ordered so that the sequence of changes is
  unambiguous. That retrieval is a listing and MUST be paged like every other listing.
- **FR-030**: Audit entries MUST be immutable once written: there is no operation to amend or delete
  one, and the audit store MUST NOT itself be audited.
- **FR-021**: Every managed record MUST carry created-at, created-by, last-modified-at, and
  last-modified-by values, populated automatically by the system rather than supplied by clients.
- **FR-022**: Created-at and created-by values MUST be immutable once set; subsequent updates MUST
  change only the last-modified values.
- **FR-023**: Client-supplied values for any audit field MUST be ignored, so that a caller cannot
  forge authorship or timing.
- **FR-024**: Every inbound API request MUST be logged with its method, path, outcome, elapsed time,
  and acting user.
- **FR-025**: Credentials, authorization tokens, and sensitive identifying values MUST NOT appear in
  any audit entry or request log.
- **FR-026**: When no authenticated user is present, the actor MUST be recorded as an explicit
  system/anonymous value rather than being left empty.
- **FR-027**: An audit entry MUST be written atomically with the change it records: either both are
  durable or neither is. A failure to record the audit entry MUST therefore fail the business
  operation, and the failure MUST be reported as an audit failure rather than as a generic error.
  There MUST be no state in which a managed record changed and no audit entry exists for it.
- **FR-028**: Audit recording MUST apply to every managed record type automatically, without each
  record type having to opt in individually.

### Key Entities

- **Person**: An individual who may be screened by a rule. Holds a name, age, city, risk level, and
  a national identifier that is treated as sensitive. Linked to zero or more case files.
- **Case File**: An investigation record with a title and a status. Owns at most one rule and
  accumulates an unbounded number of person links.
- **Rule**: A named, enable-able condition tree belonging to exactly one case file, used to select
  matching persons.
- **Person-Case Link**: The association between a person and a case file, carrying the person's role
  in that case and when the link was made. Identified by the person and case together.
- **UI Representation (View Model)**: The client-facing shape of a record. Carries an identifier and
  a type marker, exists in a summary and a detail form, and is the only thing an API response ever
  contains.
- **Audit Entry**: A persisted, immutable record of one lifecycle change — record type, record
  identifier, operation, actor, timestamp, the entity version the change produced, and the field
  changes it made (values of sensitive fields redacted). Queryable per record, which is what makes a
  record's full change history reconstructable.
- **Request Log Entry**: A record of one inbound API call — method, path, outcome, elapsed time, and
  actor.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client that has integrated one record type can integrate a second using only that
  record's field list — 100% of the record-management operations behave identically across all
  managed record types.
- **SC-002**: A new record type can be exposed with its complete operation set without modifying any
  shared component, verified by adding one type and confirming zero changes to shared logic.
- **SC-003**: 100% of API responses contain only fields published in that record type's
  representation; zero responses expose stored-record internals.
- **SC-004**: Sensitive identifying values appear in zero list responses and zero match results.
- **SC-005**: 100% of create, update, and delete operations are traceable afterwards to a specific
  actor and time.
- **SC-006**: No single request can retrieve more than the configured maximum number of records,
  verified by requesting an oversized page.
- **SC-007**: Listing a 10,000-record population one page at a time returns the last page within
  twice the elapsed time of the first page, both under 500 ms, with no record repeated or skipped
  across the sequence.
- **SC-008**: Reviewers can reconstruct the full change history of any single record from audit data
  alone, without consulting application code.
- **SC-009**: Zero credentials or sensitive identifying values appear in audit or request-log output,
  verified by auditing a sample of logged authenticated calls.

## Assumptions

- **Reference architecture is the model, not the source**: the conventions come from the
  `com.liquibase` reference project, but naming, identifier types, and idioms follow this
  codebase's own conventions (UUID identifiers, immutable request/response objects, existing
  `/api/v1/...` path structure) rather than being copied verbatim.
- **Naming of the representation layer**: settled during planning — one bidirectional record per
  record type, suffixed `Vm`, serving both writes and reads, with depth (summary vs. detail) varying
  by operation rather than by type. A split into separate write and read representations was
  considered and rejected. See research decision R2 in `research.md`.
- **Audit destination**: audit entries are persisted to a dedicated, queryable store — decided
  2026-08-30, reversing an earlier assumption that the structured log stream would suffice. It did
  not: SC-008 requires reconstructing a record's full change history from audit data alone, and a
  log line carrying only *type, id, operation, actor, time* records that a change happened without
  recording what it was. **Request logs are not moving** — FR-024's per-request entry stays in the
  structured log stream, because one row per inbound HTTP call is a different volume problem with a
  different retention answer.
- **Redaction over omission**: FR-025 forbids sensitive values in audit output while FR-020 requires
  the field-level change detail. These are reconciled by recording that a sensitive field changed
  while replacing both its values with a redaction marker — the reviewer learns the national
  identifier was edited, never what it was or became.
- **Timestamp population**: creation and modification timestamps continue to be generated by the
  persistence layer's own timestamp mechanism (the convention already established in this codebase),
  not by database column defaults and not hand-set in application code. Actor fields
  (created-by / modified-by) require an identity source, which the audit slice introduces.
- **Actor identity**: the reference project derives the actor from an authenticated security
  context. This codebase currently has no authentication layer, so until one exists the actor
  resolves to the explicit system/anonymous value required by FR-026.
- **Existing endpoints are in scope for reconciliation, not removal**: the rule-specific operations
  stay; only their response conventions are subject to the FR-019 decision.
- **Schema changes are expected**: audit actor columns, version columns, and a deletion marker on
  the person record require migrations to the existing schema.
- **Pagination defaults**: the existing configured default and maximum page sizes are reused rather
  than re-derived.
- **Case reopening is permitted**: with cases retired by `status` rather than deletion, `status`
  becomes the retirement control — and the uniform save deliberately allows any transition,
  including `CLOSED` → `OPEN`. Reopening an investigation is a real need, and blocking it would make
  a mis-clicked close unrecoverable. Retirement here is reversible by design; deletion is not, which
  is exactly why cases are retired rather than deleted.
