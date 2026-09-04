# Specification Quality Checklist: Visual Rule Condition Builder

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-03
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Validation status: all items pass.** Two clarifications were raised rather than guessed, and both
were answered by the user; the spec was then updated and re-validated.

### Clarifications resolved

1. **Save route and concurrent-edit detection** — *answered: versioned upsert.* The single "Save
   changes" action commits name, enabled state and conditions as one atomic change carrying the
   version the rule was loaded at, so a rule changed elsewhere is reported as stale rather than
   overwritten. The unversioned condition-replacement route stays in the API for existing callers
   but is no longer what the rule page uses. Encoded as FR-033, FR-033a, FR-033b and US3 scenario 5.

2. **What "server-owned" means** — *answered: read-only metadata only.* Inspection found no
   ownership, permission or authorization model anywhere in the service, and the constitution records
   the absence as deferred debt. "Server-owned" therefore maps onto exactly the fields a client
   cannot set: identity, resource type, case, and creation/modification authorship and timing. No
   rule is read-only, including a disabled one — a client-only editing restriction was rejected
   because the backend would immediately contradict it. Encoded as FR-032, FR-032a and US3
   scenario 7.

### Other checks reviewed and passing

- Terminology deliberately avoids naming Java types, HTTP routes, component names and libraries. The
  backend model is described by behaviour ("a group carrying a logical operator over an ordered list
  of children"), not by class name.
- FR-029 and FR-038 are stated as prohibitions with observable consequences, so both are testable.
- SC-004 and SC-005 are round-trip properties verifiable without knowing the implementation.
- Every user story is independently testable and independently deliverable: US1 is a read-only
  improvement, US2 the editing core, US3 the single-save page, US4 reordering, US5 the one backend
  addition. None blocks another.
