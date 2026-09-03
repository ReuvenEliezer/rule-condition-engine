// The one module every request goes through. Responsibilities:
//   - resolve the base URL once (FR-046, research R11)
//   - parse ErrorResponse bodies into a typed failure
//   - distinguish a transport failure from a refusal as two different result kinds (FR-040)
//
// Tree-carrying routes need lossless handling of the condition operands; that lives in
// ruleWire.ts and is applied by the caller through `rawBody` / `decode`, not here — see research
// R5, FR-013.

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

// Some test DOM shims (jsdom) install an AbortSignal that the runtime's fetch/Request rejects.
// Probe once: forward the caller's signal only where fetch will accept it. Aborting is an
// optimisation — request supersession (FR-042) comes from TanStack Query's key resolution, not
// from cancelling the transport — so skipping it in that environment loses nothing observable.
const FETCH_ACCEPTS_SIGNAL: boolean = (() => {
  try {
    const probe = new AbortController();
    new Request('http://localhost/', { signal: probe.signal });
    return true;
  } catch {
    return false;
  }
})();

export type RequestOptions = {
  method?: string;
  /** query params; undefined values are dropped */
  query?: Record<string, string | number | boolean | undefined>;
  /** request body serialised with plain JSON */
  body?: unknown;
  /** pre-serialised request body (tree routes build this via ruleWire.serializeRuleBody) */
  rawBody?: string;
  /** custom success-body parser; defaults to JSON.parse. Tree routes pass ruleWire.decodeRuleDetail */
  decode?: (text: string, contentType: string) => unknown;
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
  const url = buildUrl(path, opts.query);

  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (opts.rawBody !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = opts.rawBody;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    const init: RequestInit = { method, headers };
    if (payload !== undefined) init.body = payload;
    if (opts.signal && FETCH_ACCEPTS_SIGNAL) init.signal = opts.signal;
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
    if (opts.decode) return opts.decode(text, contentType);
    if (!contentType.includes('json')) return text;
    return JSON.parse(text) as unknown;
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
