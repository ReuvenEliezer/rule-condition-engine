# Feature Specification: Visual Rule Condition Builder

**Feature Branch**: `003-visual-rule-builder`

**Created**: 2026-09-03

**Status**: Draft

**Input**: User description: redesign and implement the Rules UI as a real visual Rule Condition Builder on top of the existing Rule Engine domain and APIs — the complete condition tree shown and edited visually (nested AND/OR/NOT groups, type-aware value editors, reordering, plain-language summary), with the backend remaining the source of truth for fields, operators and value shapes.

## Overview

A rule's condition is a nested, typed tree. Today an author can edit that tree in the interface, but
only as an undifferentiated stack of native form controls: nesting is conveyed by browser default
`fieldset` borders, there is no way to see at a glance what a rule actually checks, children cannot
be reordered, and the rule's name and enabled state are edited somewhere other than its conditions.

Worse, the choices the interface offers — which fields exist, what type each is, which operators
each accepts, and the permitted values of each enumerated field — are held as a hand-maintained copy
of server-side truth inside the client, because the service publishes field *names* and nothing
else. The copy is guarded by a start-up set-equality check that blocks the entire builder when it
drifts. That check converts silent wrongness into a loud outage, which was the right trade at the
time, but the underlying duplication is the defect.

This feature makes the condition tree the centre of the rule page: a readable, hierarchical, editable
visual structure with a plain-language summary above it, reorderable children, and rule metadata
edited in the same place and saved in the same action. It adds exactly one backend capability — the
service publishing the field, type, operator and enumeration metadata it already holds internally —
so the client stops maintaining a second copy of it.

### What is already true, and stays true

The backend is the source of truth and this feature does not change its model:

- A condition tree is one of three node shapes: a **group** carrying a logical operator and an
  ordered list of children, a **comparison** carrying a field, an operator and a typed value, and a
  **presence test** carrying a field and nothing else. Presence tests are a distinct node shape
  precisely so that a comparison's value is never absent.
- A group's children are an **ordered list**. Order survives storage and retrieval unchanged, so
  reordering needs no new concept — it is a reordering of children the model already has.
- **Negation takes exactly one child.** Multiple children under a negation must be wrapped in an
  explicit conjunction or disjunction. A group with no children at all is invalid.
- Four value shapes exist and no others: a single text value, a single numeric value, an inclusive
  two-ended range, and a non-empty list. Each operator declares which shapes it accepts, and an
  incompatible pair is rejected the moment it is read.
- A list operand is **de-duplicated on acceptance**, preserving first-seen order. A range with its
  lower bound above its upper bound is rejected. A text operand may not be empty.
- Whether an operator may be used against a *particular field* is a separate question from whether
  it accepts a value shape, and is decided by the service against the field's declared type.
- The service bounds tree depth, total node count and list length, and names which bound was
  exceeded when one is. The interface does not mirror those bounds; it shows the service's answer.

### The metadata gap, stated precisely

The service's field-listing endpoint returns sorted logical names only. Everything else the
interface needs to offer safe choices — each field's type, the operators that field genuinely
survives, and the permitted values of each enumerated field — exists in the service's registry but
is not published. That is why the client holds a copy.

The gap has a subtlety that any replacement must preserve. Field/operator compatibility is decided
in two stages: a declared-compatibility check, and then the coercion of the operand onto the
field's actual type. The first stage alone is **not** sufficient — it admits ordered comparisons
against text and timestamp fields, which then fail during coercion. The effective set of operators
for a field is the set that survives *both* stages. The current client copy already encodes this
distinction; a published metadata surface that encodes only the first stage would be a regression,
because the interface would start offering operators that are rejected on save.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Understand what a rule checks, without reading JSON (Priority: P1)

An analyst opens an existing rule and immediately understands what it checks. The complete condition
tree is laid out visually: each group is a distinct labelled container, its children are indented
inside it, and nested groups are visibly children of their parent rather than another entry in a
flat list. Above the tree, a compact plain-language sentence states the whole condition in one
readable line.

**Why this priority**: Comprehension precedes editing. An author who cannot tell what a rule checks
cannot safely change it, and today the only way to be certain is to reason about a stack of form
controls. This story delivers value on its own — a read-only improvement to every existing rule —
and every other story depends on the structure it establishes.

**Independent Test**: Load a rule whose stored condition is a conjunction of two comparisons and a
nested disjunction of two more. Confirm the page renders three distinct containers with the
disjunction visibly nested inside the conjunction, and that the summary line names every field,
operator and value in the tree, with the nested group parenthesised.

**Acceptance Scenarios**:

1. **Given** a rule whose condition is a single comparison, **When** the analyst opens it, **Then**
   the tree shows that one comparison and the summary states it in one line.
2. **Given** a rule with a group nested inside another group, **When** the analyst opens it,
   **Then** the nested group is rendered as a bounded container inside its parent's bounds, indented
   relative to its siblings, and is not rendered as a peer of them.
3. **Given** a rule five groups deep, **When** the analyst opens it, **Then** every level is
   distinguishable from its parent and no level's membership is ambiguous.
4. **Given** a rule containing a negation group, **When** the analyst reads the summary, **Then** the
   negation is expressed unambiguously and its single child is shown as belonging to it.
5. **Given** a rule containing a presence test, **When** the analyst reads the summary, **Then** it
   appears in plain language rather than as a raw operator name.
6. **Given** any rule, **When** the analyst reads the summary, **Then** the summary is derived from
   the tree currently on screen and changes whenever the tree changes.
7. **Given** any group container, **When** the analyst reads its header, **Then** the header states
   the group's logical meaning in words, not only as a bare operator name.

---

### User Story 2 - Edit the condition tree without ever producing an invalid rule (Priority: P1)

An author changes fields, operators and values, adds and removes comparisons, presence tests and
nested groups, and changes a group's logical operator — and at no point can the interface assemble a
condition the service would reject for a reason the interface could have known about.

**Why this priority**: This is the feature's purpose. Editing that can silently produce a rejectable
rule pushes the cost of a mistake to save time, or worse to a colleague running the rule weeks later.

**Independent Test**: Starting from a rule with one comparison, change its field to one of a
different type, confirm the operator and value reset to a valid pairing rather than carrying the old
one across; then set an operator requiring a range, confirm the value editor becomes two bounds; then
switch to an operator requiring a single value and confirm the surplus bound is discarded rather than
silently retained.

**Acceptance Scenarios**:

1. **Given** a comparison, **When** the author opens the field control, **Then** it offers only the
   fields the service declares queryable, and no field can be typed freely.
2. **Given** a chosen field, **When** the author opens the operator control, **Then** it offers only
   operators valid for that field — including presence tests, which are valid on every field — and
   each is labelled in plain language rather than as a raw name.
3. **Given** a chosen field and operator, **When** the author reaches the value control, **Then** the
   control matches the shape that operator requires: one text box, one numeric box, two range bounds,
   a multi-entry list, or no control at all for a presence test.
4. **Given** an enumerated field, **When** the author sets a value, **Then** the value is chosen from
   that field's permitted values and cannot be typed freely.
5. **Given** a comparison with a value, **When** the author changes the operator to one whose value
   shape differs, **Then** the value is either carried across only where it remains meaningful, or
   discarded — and never retained in a shape the new operator does not accept.
6. **Given** a comparison with a value, **When** the author changes the field to one whose type no
   longer admits the current operator, **Then** the operator is replaced with a valid one for the new
   field and the value is reset to an empty control of the matching shape.
7. **Given** a comparison, **When** the author selects a presence test as its operator, **Then** the
   node becomes a presence test with no value, and selecting a comparison operator afterwards
   restores a value control appropriate to it.
8. **Given** any group, **When** the author adds a comparison, **Then** a new editable row appears as
   the last child, pre-filled to a valid field-and-operator pairing, with its value left empty and
   visibly marked as incomplete.
9. **Given** any group, **When** the author adds a nested group, **Then** it appears as a child
   container defaulting to conjunction, and — because a group with no children is invalid — it is
   visibly marked as incomplete until it has one.
10. **Given** a group containing a nested group, **When** the author deletes the nested group,
    **Then** that group and everything inside it is removed in one action.
11. **Given** a negation group with one child, **When** the author attempts to add a second child,
    **Then** the interface prevents it and explains that a negation takes exactly one child which
    must be wrapped in an explicit conjunction or disjunction.
12. **Given** a group whose operator is changed to negation while it holds several children,
    **Then** the interface refuses the change or requires the children be wrapped first, and never
    silently discards children.
13. **Given** a tree with any incomplete or invalid node, **When** the author attempts to save,
    **Then** saving is blocked, each offending node carries its own message in place, and the
    messages name what is wrong rather than restating that the rule is invalid.
14. **Given** a range whose upper bound is below its lower bound, **When** the author leaves the
    control, **Then** the interface refuses it before any request is sent and says which bound is
    wrong.
15. **Given** a list operand, **When** the author adds entries, **Then** entries can be added and
    removed individually, an empty list blocks saving, and a blank entry is reported rather than
    silently sent.
16. **Given** a tree the interface considers valid, **When** the service nevertheless rejects it,
    **Then** the service's reason is shown as given and the author's work is preserved on screen.

---

### User Story 3 - Edit a rule's name, enabled state and conditions in one place (Priority: P2)

An author opens a rule and finds its name, its enabled state, its server-recorded metadata and its
conditions on one page, with conditions as the main section. They change any combination of them and
commit the change in one action.

**Why this priority**: Splitting a rule's identity from its behaviour across two screens makes the
common edit — rename and adjust — a two-step, two-request task with a window in which the rule is
half-changed. It depends on nothing in Stories 4 and 5, but is less critical than being able to read
and edit the tree at all.

**Independent Test**: Open a rule, change its name and one condition value, save once, reload, and
confirm both changes are present and that exactly one change was recorded in the rule's history.

**Acceptance Scenarios**:

1. **Given** an existing rule, **When** the author opens it, **Then** name and enabled state are
   editable at the top of the page and conditions occupy the main body below them.
2. **Given** an existing rule, **When** the author opens it, **Then** the values the service owns and
   the client cannot set — the rule's identity, its case, when and by whom it was created and last
   changed — are displayed as read-only and are not offered as editable inputs.
3. **Given** changes to both the name and the tree, **When** the author saves, **Then** both are
   committed in a single action.
4. **Given** a rule with an empty name, **When** the author attempts to save, **Then** saving is
   blocked with a message on the name control.
5. **Given** a rule the author is editing, **When** the same rule has been changed elsewhere since it
   was loaded, **Then** the save is refused, the author is told their copy is stale, their unsaved
   work is preserved on screen, and the other change is not overwritten.
6. **Given** a saved rule, **When** the author opens its history, **Then** the existing history view
   is reachable from this page and behaves as it does today.
7. **Given** any rule, **When** the author looks for a control to change its identity, its case, or
   its recorded authorship and timing, **Then** no such control exists — those values are shown as
   text only — while the name, the enabled state and the conditions remain editable.

---

### User Story 4 - Reorder conditions and groups within their group (Priority: P2)

An author moves a child up or down within its group so the rule reads in the order they think about
it, without the move changing what the rule means.

**Why this priority**: Order carries no logical meaning for conjunction or disjunction, but it
carries substantial *readability* meaning — an author who groups related checks together produces a
rule the next person can follow. It is genuinely optional relative to Stories 1 and 2, and is
deliberately the simplest possible mechanism rather than drag-and-drop.

**Independent Test**: In a group of three children whose middle child is a nested group, move the
nested group up and then down, and confirm after each move that the group's operator, the tree's
depth, and every child's membership are unchanged, and that the new order is what is saved.

**Acceptance Scenarios**:

1. **Given** a group with several children, **When** the author moves a child up, **Then** it swaps
   position with the child immediately above it and nothing else changes.
2. **Given** a group with several children, **When** the author moves a child down, **Then** it swaps
   position with the child immediately below it and nothing else changes.
3. **Given** the first child of a group, **When** the author looks at its controls, **Then** the move-up
   control is present but unavailable, rather than absent.
4. **Given** the last child of a group, **When** the author looks at its controls, **Then** the
   move-down control is present but unavailable.
5. **Given** a nested group among a group's children, **When** it is moved, **Then** it moves as a
   whole with its entire subtree, and its own children's order is untouched.
6. **Given** any move, **When** it completes, **Then** the child remains inside the same parent, the
   parent's operator is unchanged, and the tree's nesting is unchanged.
7. **Given** a reordered tree, **When** it is saved and reloaded, **Then** the children appear in the
   order the author left them.
8. **Given** a group with exactly one child, **When** the author looks at that child's controls,
   **Then** neither move control is available.
9. **Given** any move, **When** it completes, **Then** the summary line above the tree reflects the
   new order.

---

### User Story 5 - Field, operator and value metadata published by the service (Priority: P3)

The choices the builder offers come from the service rather than from a copy maintained inside the
client, so a field added, retyped, renamed or withdrawn on the server changes the builder's options
with no client change and no drift outage.

**Why this priority**: The builder works today with the client-held copy, guarded by a drift check —
so this is a correctness and maintenance improvement rather than a new capability. It is also the
one part of this feature that requires a backend change, and is therefore separable.

**Independent Test**: Add a field to the service's queryable registry, restart nothing on the
client, and confirm the field appears in the builder with the correct type, the correct operator
set, and — if enumerated — its permitted values, without the builder entering its drift-blocked
state.

**Acceptance Scenarios**:

1. **Given** the builder is opened, **When** it needs field choices, **Then** it obtains the fields,
   their display labels, their types, their compatible operators, and the permitted values of
   enumerated fields from the service.
2. **Given** the service's registry, **When** it publishes a field's operators, **Then** the published
   set is the set that survives both compatibility checking and operand coercion — ordered
   comparisons are absent from text and timestamp fields, which would otherwise be offered and then
   rejected on save.
3. **Given** a field is added to the registry, **When** the builder is next opened, **Then** the field
   is offered, with no client change.
4. **Given** a field is removed from the registry, **When** the builder is next opened, **Then** the
   field is no longer offered.
5. **Given** an existing rule referencing a field the service no longer publishes, **When** the
   author opens it, **Then** the rule is still displayed, the unknown field is marked as no longer
   available, and the author is not silently shown a different field.
6. **Given** the metadata cannot be retrieved, **When** the author opens the builder, **Then** the
   failure is reported as a retryable one, distinct from the rule itself being unavailable.
7. **Given** the metadata is published, **When** anyone inspects the client, **Then** no
   hand-maintained duplicate of the field, type, operator or enumeration data remains in it.

---

### Edge Cases

- **A group is emptied.** Deleting a group's last child leaves a structure the service rejects. The
  interface must show the group as incomplete and block saving, rather than deleting the group
  implicitly or accepting the empty group.
- **A negation's only child is deleted.** Same as above: the negation becomes childless and must be
  reported, not repaired by guesswork.
- **The root is a bare comparison, not a group.** A stored tree's root may legitimately be a single
  leaf. The page must render and edit it, and must not require the author to be inside a group.
- **The last remaining node in the whole tree is deleted.** A rule with no condition cannot be saved;
  the interface must say so rather than sending an empty condition.
- **A group operator is changed to negation while it holds several children.** Refused or gated
  behind wrapping the children; never silently truncating to the first child.
- **A depth, node-count or list-length bound is exceeded.** The service names which bound and its
  limit. The interface shows that message; it does not carry its own copy of the limits.
- **A list operand contains duplicates.** The service de-duplicates on acceptance, so what comes back
  may be shorter than what was sent. The interface must present this as normalisation, not as
  entries having been lost.
- **A numeric value with trailing decimal zeros.** Numeric operands are exact decimals. A value the
  author entered must come back byte-identical, not re-rounded by the interface's own number
  handling.
- **A value that is well-formed but not a permitted value of an enumerated field.** Rejected by the
  service with the permitted values named; the interface should not have allowed it to be entered.
- **A timestamp field with an ordered comparison.** Declared compatibility admits it; coercion
  rejects it. The operator must not be offered.
- **Two conditions on linked-case fields.** They are satisfied by the *same* linked case, not by
  different ones. The interface must not imply otherwise.
- **A rule that is disabled.** Its conditions remain readable and, unless a permission model says
  otherwise, editable.
- **A rule whose stored tree is deeper than the interface's comfortable nesting.** Every level must
  remain distinguishable and reachable; no participating node may be silently hidden. A level may be
  collapsed only if the collapsed container states how many nodes it conceals.
- **The window is narrow.** Compact condition rows must remain usable and must not force horizontal
  scrolling of the page.

## Requirements *(mandatory)*

### Functional Requirements

**Reading and comprehension**

- **FR-001**: The rule page MUST render the complete stored condition tree, with every node visible
  or reachable, and MUST NOT flatten nested groups into a single list.
- **FR-002**: Each group MUST be rendered as a bounded container carrying a header that states its
  logical meaning, with its children indented within its bounds.
- **FR-003**: A nested group MUST be visually identifiable as a child of its parent and
  distinguishable from a sibling of its parent's other children.
- **FR-004**: The page MUST display a compact plain-language summary of the whole condition, derived
  from the tree currently on screen, correctly expressing nesting, conjunction, disjunction,
  negation, presence tests, fields, operators and values.
- **FR-005**: The summary MUST update whenever the tree changes, including after a reorder.
- **FR-006**: Operators MUST be presented with human-readable labels in both the tree and the
  summary; raw operator names MUST NOT be the only text an author sees.
- **FR-007**: A collapsed group MUST state how many nodes it conceals. No node participating in the
  condition may be hidden without such a statement.

**Editing the tree**

- **FR-008**: Authors MUST be able to change a node's field, its operator and its value; add a
  comparison, a presence test or a nested group to any group; delete any node; and change any
  group's logical operator.
- **FR-009**: Deleting a group MUST remove its entire subtree in one action.
- **FR-010**: The field control MUST offer only fields the service declares queryable and MUST NOT
  accept free-text field entry.
- **FR-011**: The operator control MUST offer only operators valid for the currently selected field,
  determined by the service's compatibility rules, and MUST include presence tests, which are valid
  on every field.
- **FR-012**: The value control MUST match the shape the selected operator requires — single text,
  single number, two-ended range, multi-entry list, or none — and MUST NOT expose the underlying
  serialised form for editing.
- **FR-013**: An enumerated field's value MUST be chosen from that field's permitted values.
- **FR-014**: Changing the operator MUST reshape the value: a value MUST be carried across only where
  it remains meaningful under the new operator, and MUST otherwise be discarded. A value MUST NEVER
  be retained in a shape the new operator does not accept.
- **FR-015**: Changing the field MUST preserve the current operator only if it remains valid for the
  new field; otherwise the operator MUST be replaced with one valid for the new field, and the value
  reset to an empty control of the matching shape.
- **FR-016**: Selecting a presence test MUST convert the node to a valueless presence test; selecting
  a comparison operator afterwards MUST restore a value control of the appropriate shape.
- **FR-017**: A newly added comparison MUST be created with a valid field-and-operator pairing. Where
  no safe default value exists, it MUST be created empty and visibly marked incomplete rather than
  pre-filled with a guess.
- **FR-018**: A newly added group MUST default to conjunction and MUST be visibly marked incomplete
  until it has at least one child.
- **FR-019**: The interface MUST prevent a negation group from holding more than one child, and MUST
  explain that multiple children require an explicit conjunction or disjunction.
- **FR-020**: Changing a group's operator to negation while it holds several children MUST NOT
  silently discard children.

**Reordering**

- **FR-021**: Authors MUST be able to move any child up or down within its group.
- **FR-022**: A move MUST change only the order of that group's children — never the child's parent,
  never the parent's operator, never the tree's nesting or depth.
- **FR-023**: Moving a group MUST move its entire subtree, leaving that subtree's internal order
  unchanged.
- **FR-024**: The move-up control MUST be unavailable on a group's first child and the move-down
  control unavailable on its last; both MUST remain present rather than disappearing.
- **FR-025**: The order an author leaves MUST be the order that is saved and the order shown when the
  rule is reloaded. No separate ordering attribute may be introduced; the existing child order is the
  only representation of order.

**Validation**

- **FR-026**: The interface MUST block saving while the tree contains a node it can determine to be
  invalid, and MUST report each problem beside the node it concerns.
- **FR-027**: The interface MUST check, at minimum: a field is chosen; an operator is chosen; the
  value matches the operator's required shape; numeric input is a valid number; a range's lower bound
  does not exceed its upper; a list is non-empty and free of blank entries; a text value is non-empty;
  every group has at least one child; a negation has exactly one; and the field/operator pairing is
  one the service accepts.
- **FR-028**: The interface MUST NOT weaken, bypass or replace any service-side validation. Every
  client check mirrors a service check that remains in force.
- **FR-029**: The interface MUST NOT mirror the service's structural bounds on depth, node count or
  list length; when one is exceeded it MUST show the service's message, which names the bound.
- **FR-030**: When the service rejects a tree the interface considered valid, the rejection MUST be
  shown as given and the author's unsaved work MUST be preserved on screen.

**Rule metadata and saving**

- **FR-031**: The rule page MUST allow the rule's name and enabled state to be edited, with conditions
  as the page's main section.
- **FR-032**: Values the service owns — the rule's identity, its resource type, the case it belongs
  to, and the authorship and timing of its creation and last change — MUST be displayed as text only
  and MUST NOT be offered as editable inputs. These are the whole of "server-owned" for a rule: no
  other editing restriction exists or is introduced.
- **FR-032a**: Every rule's name, enabled state and conditions MUST be editable. Neither a rule's
  enabled state nor any other attribute makes it read-only.
- **FR-033**: A single save action MUST commit the author's changes to name, enabled state and
  conditions together, as one atomic change producing one entry in the rule's history.
- **FR-033a**: The save MUST carry the version the rule was loaded at, so a rule changed elsewhere
  since loading causes the save to be refused rather than to overwrite that change.
- **FR-033b**: On such a refusal the interface MUST say the author's copy is stale, preserve their
  unsaved work on screen, and offer to reload the current version.
- **FR-034**: Existing rule creation, listing, retrieval, enable/disable, retirement semantics, audit
  history and permission behaviour MUST continue to work unchanged.
- **FR-035**: The existing history view MUST remain reachable from the rule page and behave as it does
  today.

**Field metadata**

- **FR-036**: The service MUST publish, derived from its own field registry rather than from a
  hand-maintained list: each queryable field's logical name, a display label, its type, the operators
  it accepts, and — for enumerated fields — its permitted values.
- **FR-037**: The published operator set for a field MUST be the set that survives both the service's
  declared-compatibility check and its operand coercion, so no published operator can be offered and
  then rejected on save.
- **FR-038**: The interface MUST take its field, type, operator and enumeration choices from that
  published metadata, and MUST NOT retain a hand-maintained duplicate of it.
- **FR-039**: A rule referencing a field the service no longer publishes MUST still be displayed, with
  the unknown field marked as unavailable rather than silently substituted.
- **FR-040**: Failure to retrieve the metadata MUST be reported as a distinct, retryable failure,
  separate from the rule itself being unavailable.

**Presentation**

- **FR-041**: A comparison MUST be presented as one compact row carrying its field, operator, value
  and actions, rather than as a multi-line form.
- **FR-042**: Destructive actions MUST be visually distinguishable from non-destructive ones.
- **FR-043**: The page MUST follow the application's existing theme, including its dark theme, and
  MUST remain usable on a narrow window without the page scrolling horizontally.
- **FR-044**: Every action available by pointer MUST be reachable and operable by keyboard, and each
  node's validation message MUST be programmatically associated with the control it concerns.

### Key Entities

- **Condition tree**: the whole condition of one rule; exactly one root node.
- **Group node**: a logical operator — conjunction, disjunction or negation — over an *ordered* list
  of child nodes. Never empty. A negation has exactly one child.
- **Comparison node**: a field, an operator, and a typed value. Its value is never absent.
- **Presence node**: a field and a presence or absence test. Carries no value.
- **Value**: one of exactly four shapes — single text, single exact-decimal number, an inclusive
  two-ended numeric range, or a non-empty de-duplicated list of text entries.
- **Field metadata**: for one queryable field — its logical name, display label, type, effective
  operator set, and, when enumerated, its permitted values.
- **Rule**: a named, enabled-or-disabled condition tree belonging to exactly one case, carrying
  service-owned creation and modification metadata and a change history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Shown a rule containing at least two nesting levels, a reader who has not seen it
  before can state correctly what it checks within 30 seconds, without opening any raw
  representation of it.
- **SC-002**: 100% of trees the interface permits to be saved are accepted by the service, excluding
  rejections for causes the interface cannot know in advance — the service's structural bounds and
  concurrent modification.
- **SC-003**: No sequence of field, operator or value edits available in the interface produces a
  saved condition whose value shape does not match its operator.
- **SC-004**: A rule loaded, saved with no edit, and reloaded is byte-identical in its condition,
  including the exact form of every numeric operand.
- **SC-005**: A reorder followed by a save and a reload yields the child order the author left, at
  every nesting level, with the tree's structure otherwise unchanged.
- **SC-006**: The plain-language summary is correct for every tree in the test corpus, which includes
  a single comparison, a flat conjunction, a flat disjunction, a negation, a presence test, and
  groups nested to the service's maximum permitted depth.
- **SC-007**: Adding, retyping or removing a field in the service's registry changes the builder's
  offered choices with zero client-side edits, and never puts the builder into a blocked state.
- **SC-008**: The client contains no hand-maintained list of fields, field types, per-field operators
  or enumeration values.
- **SC-009**: A rename and a condition edit committed together produce exactly one entry in the rule's
  change history.
- **SC-010**: Every existing backend test and every existing interface test outside the rules area
  passes unchanged.
- **SC-011**: Every interactive control on the page is reachable and operable by keyboard alone, and
  all text meets the application's existing contrast standard in both light and dark themes.

## Assumptions

- **The backend model is fixed.** No node shape, operator, value shape, logical operator or
  validation rule is added, removed or redefined by this feature.
- **The wire discriminator is not changed.** Condition trees are already persisted with a type
  discriminator on both nodes and values. Renaming it would invalidate every stored rule, so the
  existing discriminator is retained exactly as it is.
- **Boolean-valued fields are out of scope**, because no boolean value shape exists in the model and
  no registered field is boolean. Should one be added later it is a backend change first.
- **Presence tests appear in the operator list.** They are a distinct node shape in the model, but
  from an author's point of view "has no value" is an operator, so the interface presents them
  alongside comparison operators and converts the node shape behind the scenes.
- **The metadata endpoint is additive.** The existing field-listing endpoint is left in place and
  unchanged so that nothing currently depending on it breaks; the new metadata surface supersedes it
  as the builder's source.
- **Ordering is only readability.** Conjunction and disjunction are order-independent in evaluation.
  Order is preserved because the author's arrangement is part of the rule's readability, not because
  it changes results.
- **Drag-and-drop is out of scope** for this feature. Up/down movement is the whole reordering
  mechanism, and no dependency is added to support anything richer.
- **One rule per case remains the rule**, and the case a rule belongs to is not changed from this
  page.
- **Rule retirement remains disable-not-delete**, unchanged.
- **The existing dry-run preview and match-running views are unchanged** by this feature beyond
  continuing to work against the tree the redesigned builder produces.
- **No authentication or authorization layer exists** in the service today, and this feature does not
  introduce one. "Server-owned" therefore means exactly the read-only metadata named in FR-032 —
  identity, resource type, case, and creation/modification authorship and timing. No rule is
  read-only, including a disabled one; inventing a client-only editing restriction the service does
  not enforce was rejected as a semantic the backend would immediately contradict. When an
  authorization layer lands (the constitution tracks this as a deferred principle), per-rule edit
  permissions become a separate feature.

## Dependencies and backend prerequisites

1. **A published field-metadata surface** (FR-036, FR-037) is the one backend addition this feature
   requires. It must be generated from the existing field registry, and it must publish the
   *effective* operator set — the operators that survive both compatibility checking and operand
   coercion — not the declared-compatibility set alone.
2. **Everything else is client-side.** Reading, editing, reordering, validating, summarising and the
   single-save page all use routes that exist today.
3. **The single save uses the version-carrying record route**, which already exists and already runs
   the write-time compilability check. The unversioned condition-replacement route is left in the API
   untouched for existing callers, but is no longer what the rule page uses — it carries no version
   and so cannot detect a concurrent edit.

## Out of Scope

- Any change to how conditions are evaluated, compiled or turned into database queries. All of that
  remains entirely server-side.
- Drag-and-drop reordering, and moving a node between groups.
- New operators, new value shapes, new logical operators, or new queryable fields.
- Changing which case a rule belongs to, or allowing more than one rule per case.
- Rule deletion.
- Authentication, authorization, or a rule ownership model. No rule is made read-only by this
  feature beyond the service-owned metadata fields named in FR-032.
