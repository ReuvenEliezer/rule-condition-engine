// The one module every request goes through. Responsibilities:
//   - resolve the base URL once (FR-046, research R11)
//   - parse ErrorResponse bodies into a typed failure
//   - distinguish a transport failure from a refusal as two different result kinds (FR-040)
//   - use lossless JSON on the four tree-carrying routes so a BigDecimal operand is not re-rounded
//     (research R5, FR-013); plain JSON everywhere else

import { parse as losslessParse, stringify as losslessStringify } from 'lossless-json';
import { isErrorCode, type FailureKind } from './errors';

// Resolved in exactly one place. Same-origin deployment makes the correct default a relative path,
// which is not a hardcoded location — it is "wherever this page came from" (research R11).
export const API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/** Thrown by every request function on any non-2xx response or transport error. */
export class ApiFailure extends Error {
  readonly failure: FailureKind;

  constructor(failure: FailureKind) {
    super(failure.kind === 'transport' ? `transport: ${failure.cause}` : `${failure.code} (${failure.status})`);
    this.name = 'ApiFailure';
    this.failure = failure;
  }
}

export const isApiFailure = (e: unknown): e is ApiFailure => e instanceof ApiFailure;

// The routes whose payload carries a RuleNode. Lossless parse/stringify keeps BigDecimal operands
// byte-identical (research R5). Matched by method + path suffix.
const isTreeCarryingRoute = (method: string, path: string): boolean => {
  const m = method.toUpperCase();
  if (path === '/rules/preview' && m === 'POST') return true;
  if (path === '/rules' && (m === 'POST' || m === 'GET')) return true;
  if (/^\/rules\/[^/]+$/.test(path) && m === 'GET') return true;
  if (/^\/rules\/[^/]+\/condition$/.test(path) && m === 'PUT') return true;
  return false;
};

export type RequestOptions = {
  method?: string;
  /** query params; undefined values are dropped */
  query?: Record<string, string | number | boolean | undefined>;
  /** request body — serialised with lossless JSON on tree routes, plain JSON otherwise */
  body?: unknown;
  signal?: AbortSignal;
};

export type ApiResponse<T> = {
  data: T;
  status: number;
  location: string | null;
};

const buildUrl = (path: string, query: RequestOptions['query']): string => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined) qs.append(k, String(v));
  }
  const suffix = qs.toString();
  return `${API_BASE}${path}${suffix ? `?${suffix}` : ''}`;
};

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
  const method = opts.method ?? 'GET';
  const lossless = isTreeCarryingRoute(method, path);
  const url = buildUrl(path, opts.query);

  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = lossless ? (losslessStringify(opts.body) ?? 'null') : JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    const init: RequestInit = { method, headers };
    if (payload !== undefined) init.body = payload;
    if (opts.signal) init.signal = opts.signal;
    res = await fetch(url, init);
  } catch (cause) {
    // fetch rejects only on a genuine network failure — DNS, connection refused, CORS, offline.
    throw new ApiFailure({ kind: 'transport', cause: cause instanceof Error ? cause.message : String(cause) });
  }

  const location = res.headers.get('Location');
  const text = await res.text();
  const contentType = res.headers.get('Content-Type') ?? '';

  const parseBody = (): unknown => {
    if (text.length === 0) return undefined;
    if (!contentType.includes('json')) return text;
    return lossless ? losslessParse(text) : (JSON.parse(text) as unknown);
  };

  if (!res.ok) {
    const body = safeParseError(text, contentType);
    if (body && isErrorCode(body.code)) {
      throw new ApiFailure({ kind: 'refusal', code: body.code, message: body.message, status: res.status });
    }
    // A non-2xx without a recognisable ErrorResponse body — treat as a malformed refusal so it is
    // still surfaced specifically rather than as a generic error.
    throw new ApiFailure({
      kind: 'refusal',
      code: 'MALFORMED_REQUEST',
      message: text || res.statusText,
      status: res.status,
    });
  }

  return { data: parseBody() as T, status: res.status, location };
}

const safeParseError = (text: string, contentType: string): { code: unknown; message: string } | null => {
  if (text.length === 0 || !contentType.includes('json')) return null;
  try {
    const obj = JSON.parse(text) as Record<string, unknown>;
    return { code: obj.code, message: typeof obj.message === 'string' ? obj.message : '' };
  } catch {
    return null;
  }
};
