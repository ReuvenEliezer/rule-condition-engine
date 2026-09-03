import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { ApiFailure, request } from './client';

// FR-040: an unreachable service is presented distinctly from a refusal and from an empty result,
// with a retry that preserves input.

describe('client transport vs refusal (FR-040)', () => {
  it('a network error is a transport failure kind', async () => {
    server.use(http.get('/api/v1/persons', () => HttpResponse.error()));
    await expect(request('/persons')).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiFailure && e.failure.kind === 'transport',
    );
  });

  it('a 404 with an ErrorResponse body is a refusal kind carrying the code', async () => {
    server.use(
      http.get('/api/v1/persons/:id', () =>
        HttpResponse.json({ code: 'RECORD_NOT_FOUND', message: 'gone', timestamp: 't' }, { status: 404 }),
      ),
    );
    await expect(request('/persons/x')).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiFailure && e.failure.kind === 'refusal' && e.failure.code === 'RECORD_NOT_FOUND',
    );
  });

  it('a non-2xx without a recognisable body is still a specific refusal, never generic', async () => {
    server.use(http.get('/api/v1/persons', () => new HttpResponse('<html>502</html>', { status: 502 })));
    await expect(request('/persons')).rejects.toSatisfy(
      (e: unknown) => e instanceof ApiFailure && e.failure.kind === 'refusal',
    );
  });

  it('retrying after a transport failure succeeds once the service is back', async () => {
    server.use(http.get('/api/v1/rules/fields', () => HttpResponse.error()));
    await expect(request('/rules/fields')).rejects.toBeInstanceOf(ApiFailure);

    server.use(http.get('/api/v1/rules/fields', () => HttpResponse.json(['name'])));
    const res = await request<string[]>('/rules/fields');
    expect(res.data).toEqual(['name']);
  });
});
