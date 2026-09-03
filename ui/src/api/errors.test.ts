import { describe, expect, it } from 'vitest';
import {
  ALL_ERROR_CODES,
  FAILURE_PRESENTATION,
  TRANSPORT_PRESENTATION,
  presentationFor,
  type ErrorCode,
} from './errors';

// FR-039 / SC-003: all sixteen codes render a distinct, specific message and no path produces a
// generic "something went wrong". An unhandled code is a COMPILE error via the `satisfies` in
// errors.ts; this suite asserts the runtime properties.

const GENERIC = /something went wrong|unknown error|an error occurred|oops/i;

describe('the sixteen-code failure map (FR-039, SC-003)', () => {
  it('covers exactly sixteen codes', () => {
    expect(ALL_ERROR_CODES).toHaveLength(16);
    expect(new Set(ALL_ERROR_CODES).size).toBe(16);
  });

  it('every code has a presentation entry', () => {
    for (const code of ALL_ERROR_CODES) {
      expect(FAILURE_PRESENTATION[code]).toBeDefined();
    }
  });

  it('no title is generic, and every title is distinct', () => {
    const titles = ALL_ERROR_CODES.map((c) => FAILURE_PRESENTATION[c].title);
    for (const t of titles) expect(t).not.toMatch(GENERIC);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('client-defect codes are flagged so they are not shown as user error', () => {
    const defects: ErrorCode[] = ['INVALID_SORT_FIELD', 'VERSION_REQUIRED', 'MALFORMED_REQUEST'];
    for (const c of defects) expect(FAILURE_PRESENTATION[c].clientDefect).toBe(true);
  });

  it('RULE_TREE_TOO_COMPLEX shows the server message (only it names the budget)', () => {
    expect(FAILURE_PRESENTATION.RULE_TREE_TOO_COMPLEX.showServerMessage).toBe(true);
  });

  it('a refusal is never retryable; only a transport failure is (FR-040)', () => {
    for (const c of ALL_ERROR_CODES) expect(FAILURE_PRESENTATION[c].retryable).toBe(false);
    expect(TRANSPORT_PRESENTATION.retryable).toBe(true);
  });

  it('presentationFor resolves both kinds', () => {
    expect(presentationFor({ kind: 'transport', cause: 'x' })).toBe(TRANSPORT_PRESENTATION);
    expect(presentationFor({ kind: 'refusal', code: 'RECORD_NOT_FOUND', message: '', status: 404 }).title).toMatch(
      /no longer exists/i,
    );
  });
});
