// Rule-specific endpoints (contract §2). Separate from the uniform CRUD in resources.ts.

import { request } from './client';
import type { PageResponse, PersonSummary, RuleDetail } from './types';
import type { RuleNode } from './tree';

export type MatchScope = 'GLOBAL' | 'CASE_SCOPED';

export type PageParams = { page?: number; size?: number };

/**
 * Dry-run preview — POST /rules/preview. Saves nothing. Always searches the whole population;
 * the dry run has NO scope parameter (contract §2.1). User-initiated only — never on keystroke,
 * never on a timer (contract §6.8).
 */
export async function preview(
  condition: RuleNode,
  params: PageParams = {},
  signal?: AbortSignal,
): Promise<PageResponse<PersonSummary>> {
  const res = await request<PageResponse<PersonSummary>>('/rules/preview', {
    method: 'POST',
    body: { condition },
    query: { page: params.page, size: params.size },
    ...(signal ? { signal } : {}),
  });
  return res.data;
}

/**
 * Run a saved rule — GET /rules/{ruleId}/matches. `scope` is ALWAYS sent explicitly so the
 * server default (GLOBAL) never applies and the scope shown beside results is the one chosen
 * (contract §2.2). Compiles the stored tree lazily, so a broken rule fails here with
 * UNKNOWN_FIELD / INCOMPATIBLE_OPERATOR / INVALID_RULE (FR-019).
 */
export async function matches(
  ruleId: string,
  scope: MatchScope,
  params: PageParams = {},
  signal?: AbortSignal,
): Promise<PageResponse<PersonSummary>> {
  const res = await request<PageResponse<PersonSummary>>(`/rules/${encodeURIComponent(ruleId)}/matches`, {
    query: { scope, page: params.page, size: params.size },
    ...(signal ? { signal } : {}),
  });
  return res.data;
}

/**
 * Replace a condition — PUT /rules/{ruleId}/condition. Replaces the tree and nothing else.
 * Carries NO optimistic-lock token: last-write-wins, and it can never return
 * CONCURRENT_MODIFICATION. The UI must not claim conflict protection here (contract §2.3).
 */
export async function updateCondition(ruleId: string, condition: RuleNode): Promise<RuleDetail> {
  const res = await request<RuleDetail>(`/rules/${encodeURIComponent(ruleId)}/condition`, {
    method: 'PUT',
    body: { condition },
  });
  return res.data;
}

/** GET /rules/fields — sorted logical names, NAMES ONLY (contract §2.4). */
export async function queryableFields(signal?: AbortSignal): Promise<string[]> {
  const res = await request<string[]>('/rules/fields', signal ? { signal } : {});
  return res.data;
}
