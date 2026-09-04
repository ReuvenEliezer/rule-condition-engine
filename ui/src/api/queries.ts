// TanStack Query configuration and key factory (research R6, R8).
//
//   - Per query key, the latest request wins: an earlier response that resolves late is discarded,
//     which is FR-042's supersession for free.
//   - `placeholderData: keepPreviousData` holds a page of results on screen while the next loads.
//   - The person-detail key uses `gcTime: 0` so `nationalId` is dropped the moment its view
//     unmounts, rather than lingering the default five minutes (FR-043, SC-004).
//   - Nothing is persisted: no localStorage, no sessionStorage, no IndexedDB, no persisted cache
//     (FR-043).

import { QueryClient, keepPreviousData } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      placeholderData: keepPreviousData,
      staleTime: 30_000,
    },
  },
});

// Key factory — one place so keys cannot drift between reader and invalidator.
export const qk = {
  /** Published field metadata — a key of its own, so it fails and retries independently
   * of the rule being viewed (FR-040). */
  fieldMetadata: () => ['rules', 'fields', 'metadata'] as const,

  persons: {
    list: (params: unknown) => ['persons', 'list', params] as const,
    detail: (id: string) => ['persons', 'detail', id] as const,
  },
  cases: {
    list: (params: unknown) => ['cases', 'list', params] as const,
    detail: (id: string) => ['cases', 'detail', id] as const,
  },
  rules: {
    list: (params: unknown) => ['rules', 'list', params] as const,
    detail: (id: string) => ['rules', 'detail', id] as const,
    matches: (id: string, scope: string, params: unknown) => ['rules', 'matches', id, scope, params] as const,
  },
  personCases: {
    list: (params: unknown) => ['person-cases', 'list', params] as const,
    detail: (id: string) => ['person-cases', 'detail', id] as const,
  },
  audit: {
    list: (params: unknown) => ['audit-entries', 'list', params] as const,
  },
} as const;

/** Options merged into the person-detail useQuery so nationalId is never cached past unmount. */
export const PERSON_DETAIL_QUERY_OPTIONS = { gcTime: 0, staleTime: 0 } as const;
