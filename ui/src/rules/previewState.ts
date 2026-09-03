// Preview freshness (FR-009, FR-018, SC-007) — the one state machine this feature introduces.
//
//   NEVER_RUN ──preview──▶ FRESH ──tree edited──▶ STALE ──preview──▶ FRESH
//                            │                      │
//                            └────── failed ────────┴──▶ FAILED
//
// Staleness is `hash(currentTree) !== previewTreeHash` — derived, never stored. NEVER_RUN, an
// empty FRESH (zero matches) and FAILED are three visibly different states (data-model.md §5).

import { serializeTree } from '../api/treeCodec';
import type { RuleNode } from '../api/tree';
import type { FailureKind } from '../api/errors';
import type { PageResponse, PersonSummary } from '../api/types';

export type PreviewStatus = 'NEVER_RUN' | 'FRESH' | 'STALE' | 'FAILED';

export type PreviewState = {
  status: PreviewStatus;
  result: PageResponse<PersonSummary> | null;
  failure: FailureKind | null;
  /** the serialised tree that produced `result` or `failure` */
  previewTreeHash: string | null;
};

export const initialPreviewState: PreviewState = {
  status: 'NEVER_RUN',
  result: null,
  failure: null,
  previewTreeHash: null,
};

export const hashTree = (tree: RuleNode): string => serializeTree(tree);

export function afterPreviewSuccess(tree: RuleNode, result: PageResponse<PersonSummary>): PreviewState {
  return { status: 'FRESH', result, failure: null, previewTreeHash: hashTree(tree) };
}

export function afterPreviewFailure(tree: RuleNode, failure: FailureKind): PreviewState {
  return { status: 'FAILED', result: null, failure, previewTreeHash: hashTree(tree) };
}

/** Recompute status against the tree currently on screen. */
export function reconcile(state: PreviewState, currentTree: RuleNode): PreviewState {
  if (state.status === 'NEVER_RUN') return state;
  const current = hashTree(currentTree);
  if (state.status === 'FAILED') {
    return current === state.previewTreeHash ? state : { ...state, status: 'STALE' };
  }
  const nextStatus: PreviewStatus = current === state.previewTreeHash ? 'FRESH' : 'STALE';
  return nextStatus === state.status ? state : { ...state, status: nextStatus };
}
