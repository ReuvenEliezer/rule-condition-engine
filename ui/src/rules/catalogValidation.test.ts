import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { CATALOG_FIELD_NAMES } from './catalog';
import { compareFieldSets, validateCatalog } from './catalogValidation';

// The four outcomes in contracts/field-catalog.md §4.

describe('start-up catalog validation (spec dependency #2)', () => {
  it('equal sets proceed', () => {
    expect(compareFieldSets([...CATALOG_FIELD_NAMES])).toEqual({ status: 'ok' });
  });

  it('a server-only name blocks, naming the field', () => {
    const result = compareFieldSets([...CATALOG_FIELD_NAMES, 'nickname']);
    expect(result.status).toBe('mismatch');
    if (result.status !== 'mismatch') return;
    expect(result.serverOnly).toEqual(['nickname']);
    expect(result.catalogOnly).toEqual([]);
    expect(result.message).toContain('nickname');
  });

  it('a catalog-only name blocks, naming the field', () => {
    const trimmed = [...CATALOG_FIELD_NAMES].filter((f) => f !== 'city');
    const result = compareFieldSets(trimmed);
    expect(result.status).toBe('mismatch');
    if (result.status !== 'mismatch') return;
    expect(result.catalogOnly).toEqual(['city']);
    expect(result.serverOnly).toEqual([]);
    expect(result.message).toContain('city');
  });

  it('a failed request is a retryable transport failure, not a mismatch (FR-040)', async () => {
    server.use(http.get('/api/v1/rules/fields', () => HttpResponse.error()));
    const result = await validateCatalog();
    expect(result.status).toBe('transport');
  });

  it('agreement over the wire proceeds', async () => {
    server.use(http.get('/api/v1/rules/fields', () => HttpResponse.json([...CATALOG_FIELD_NAMES].sort())));
    const result = await validateCatalog();
    expect(result.status).toBe('ok');
  });
});
