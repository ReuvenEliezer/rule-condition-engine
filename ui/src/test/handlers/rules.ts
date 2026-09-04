import { http, HttpResponse } from 'msw';
import {
  FIELD_METADATA,
  QUERYABLE_FIELDS,
  canonicalTree,
  page,
  personSummary,
  ruleDetail,
  ruleSummary,
} from '../fixtures';

// Handlers for /rules/fields, /rules/preview, POST /rules and GET /rules/{id}
// (research R10 — bodies shaped from a running service).
export const rulesHandlers = [
  http.get('/api/v1/rules/fields', () => HttpResponse.json(QUERYABLE_FIELDS)),

  http.get('/api/v1/rules/fields/metadata', () => HttpResponse.json(FIELD_METADATA)),

  http.post('/api/v1/rules/preview', () =>
    HttpResponse.json(page([personSummary(), personSummary({ id: '11111111-1111-1111-1111-111111111112', name: 'AVI LEVI' })], { totalElements: 2 })),
  ),

  http.get('/api/v1/rules', () => HttpResponse.json(page([ruleSummary()], { totalElements: 1 }))),

  http.get('/api/v1/rules/:id', ({ params }) =>
    HttpResponse.json(ruleDetail({ id: String(params.id), condition: canonicalTree })),
  ),

  http.post('/api/v1/rules', async ({ request }) => {
    const body = (await request.json()) as { id?: string | null };
    const detail = ruleDetail({ id: body.id ?? '33333333-3333-3333-3333-333333333333' });
    return body.id
      ? HttpResponse.json(detail, { status: 200 })
      : HttpResponse.json(detail, { status: 201, headers: { Location: `/api/v1/rules/${detail.id}` } });
  }),

  http.put('/api/v1/rules/:id/condition', async ({ params, request }) => {
    const body = (await request.json()) as { condition: unknown };
    return HttpResponse.json(ruleDetail({ id: String(params.id), condition: body.condition as never }));
  }),
];
