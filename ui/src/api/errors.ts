// The sixteen failure codes GlobalExceptionHandler can emit, plus a seventeenth, DISTINCT
// presentation for a transport failure (the service unreachable) — never conflated with a refusal
// or an empty result (FR-039, FR-040, SC-003, contract §5).
//
// The client branches on `code` ONLY. `message` is display detail and may change without notice
// (contract §6.6). The presentation map below is exhaustive by construction: `satisfies` makes an
// unhandled code a COMPILE error.

export type ErrorCode =
  | 'RECORD_NOT_FOUND'
  | 'RULE_NOT_FOUND'
  | 'DELETION_NOT_SUPPORTED'
  | 'INVALID_SORT_FIELD'
  | 'INVALID_ARGUMENT'
  | 'VERSION_REQUIRED'
  | 'CONCURRENT_MODIFICATION'
  | 'CONSTRAINT_VIOLATION'
  | 'UNKNOWN_FIELD'
  | 'INCOMPATIBLE_OPERATOR'
  | 'RULE_TREE_TOO_COMPLEX'
  | 'INVALID_RULE'
  | 'VALIDATION_FAILED'
  | 'MALFORMED_REQUEST'
  | 'AUDIT_RECORDING_FAILED'
  | 'RULE_STORAGE_ERROR';

export const ALL_ERROR_CODES: readonly ErrorCode[] = [
  'RECORD_NOT_FOUND',
  'RULE_NOT_FOUND',
  'DELETION_NOT_SUPPORTED',
  'INVALID_SORT_FIELD',
  'INVALID_ARGUMENT',
  'VERSION_REQUIRED',
  'CONCURRENT_MODIFICATION',
  'CONSTRAINT_VIOLATION',
  'UNKNOWN_FIELD',
  'INCOMPATIBLE_OPERATOR',
  'RULE_TREE_TOO_COMPLEX',
  'INVALID_RULE',
  'VALIDATION_FAILED',
  'MALFORMED_REQUEST',
  'AUDIT_RECORDING_FAILED',
  'RULE_STORAGE_ERROR',
];

export type FailureKind =
  /** the request reached the service and was refused with an ErrorResponse */
  | { kind: 'refusal'; code: ErrorCode; message: string; status: number }
  /** the service could not be reached at all — a retry that preserves input is offered (FR-040) */
  | { kind: 'transport'; cause: string };

export type FailurePresentation = {
  /** headline shown to the user — specific to the code, never "something went wrong" (SC-003) */
  title: string;
  /** whether the server `message` should be shown as supporting detail */
  showServerMessage: boolean;
  /** true only for a transport failure — a refusal is not retried blindly (FR-040) */
  retryable: boolean;
  /** codes that are the client's fault and must never reach a user as though they erred */
  clientDefect: boolean;
};

// Exhaustive: `satisfies Record<ErrorCode, …>` fails to compile if a code is missing or unknown.
export const FAILURE_PRESENTATION = {
  RECORD_NOT_FOUND: {
    title: 'This record no longer exists.',
    showServerMessage: false,
    retryable: false,
    clientDefect: false,
  },
  RULE_NOT_FOUND: {
    title: 'This rule no longer exists.',
    showServerMessage: false,
    retryable: false,
    clientDefect: false,
  },
  DELETION_NOT_SUPPORTED: {
    title: 'This record is retired, not deleted.',
    showServerMessage: true,
    retryable: false,
    clientDefect: false,
  },
  INVALID_SORT_FIELD: {
    title: 'The interface requested an unsupported sort. This is a defect, not something you did.',
    showServerMessage: true,
    retryable: false,
    clientDefect: true,
  },
  INVALID_ARGUMENT: {
    title: 'A supplied value was not acceptable.',
    showServerMessage: true,
    retryable: false,
    clientDefect: false,
  },
  VERSION_REQUIRED: {
    title: 'The interface omitted a required version. This is a defect, not something you did.',
    showServerMessage: false,
    retryable: false,
    clientDefect: true,
  },
  CONCURRENT_MODIFICATION: {
    title: 'This record changed underneath you. Your edits are kept; re-reading is offered below.',
    showServerMessage: false,
    retryable: false,
    clientDefect: false,
  },
  CONSTRAINT_VIOLATION: {
    title: 'That would break a uniqueness rule.',
    showServerMessage: false,
    retryable: false,
    clientDefect: false,
  },
  UNKNOWN_FIELD: {
    title: 'The stored condition names a field the service no longer knows. Open the rule to edit it.',
    showServerMessage: true,
    retryable: false,
    clientDefect: false,
  },
  INCOMPATIBLE_OPERATOR: {
    title: 'An operator in the stored condition no longer suits its field. Open the rule to edit it.',
    showServerMessage: true,
    retryable: false,
    clientDefect: false,
  },
  RULE_TREE_TOO_COMPLEX: {
    title: 'The condition exceeds a structural budget.',
    showServerMessage: true, // only the message names WHICH budget and its limit (FR-012)
    retryable: false,
    clientDefect: false,
  },
  INVALID_RULE: {
    title: 'The condition was rejected.',
    showServerMessage: true,
    retryable: false,
    clientDefect: false,
  },
  VALIDATION_FAILED: {
    title: 'Some fields need attention.',
    showServerMessage: true,
    retryable: false,
    clientDefect: false,
  },
  MALFORMED_REQUEST: {
    title: 'The interface sent a request the service could not read. This is a defect, not something you did.',
    showServerMessage: false,
    retryable: false,
    clientDefect: true,
  },
  AUDIT_RECORDING_FAILED: {
    title: 'The change was rolled back and nothing was saved. Try again.',
    showServerMessage: false,
    retryable: false,
    clientDefect: false,
  },
  RULE_STORAGE_ERROR: {
    title: 'A stored rule could not be read.',
    showServerMessage: false,
    retryable: false,
    clientDefect: false,
  },
} satisfies Record<ErrorCode, FailurePresentation>;

export const TRANSPORT_PRESENTATION: FailurePresentation = {
  title: 'The service could not be reached.',
  showServerMessage: false,
  retryable: true,
  clientDefect: false,
};

export const isErrorCode = (v: unknown): v is ErrorCode =>
  typeof v === 'string' && (ALL_ERROR_CODES as readonly string[]).includes(v);

export const presentationFor = (failure: FailureKind): FailurePresentation =>
  failure.kind === 'transport' ? TRANSPORT_PRESENTATION : FAILURE_PRESENTATION[failure.code];
