import { http, HttpResponse } from 'msw';
import { caseDetail, caseSummary, page, personDetail, personSummary } from '../fixtures';

const errorBody = (code: string, message: string) => ({
  code,
  message,
  timestamp: '2026-09-03T12:00:00Z',
});

// Handlers for the four resources' list/get/save/delete routes, including a 409 and a 405 (US3).
export const recordsHandlers = [
  http.get('/api/v1/persons', () =>
    HttpResponse.json(page([personSummary(), personSummary({ id: '11111111-1111-1111-1111-11111111111a', name: 'DANA GOLDBERG', risk: 'LOW' })], { totalElements: 2 })),
  ),
  http.post('/api/v1/persons', async ({ request }) => {
    const body = (await request.json()) as { id?: string | null };
    const detail = personDetail({ id: body.id ?? '11111111-1111-1111-1111-11111111abcd' });
    return body.id
      ? HttpResponse.json(detail, { status: 200 })
      : HttpResponse.json(detail, { status: 201, headers: { Location: `/api/v1/persons/${detail.id}` } });
  }),
  http.delete('/api/v1/persons/:id', () => new HttpResponse(null, { status: 204 })),

  http.get('/api/v1/cases', () => HttpResponse.json(page([caseSummary()], { totalElements: 1 }))),
  http.get('/api/v1/cases/:id', ({ params }) => HttpResponse.json(caseDetail({ id: String(params.id) }))),
  http.post('/api/v1/cases', async ({ request }) => {
    const body = (await request.json()) as { id?: string | null; status?: string };
    return HttpResponse.json(caseDetail({ id: body.id ?? caseSummary().id, status: (body.status as never) ?? 'OPEN' }), {
      status: body.id ? 200 : 201,
    });
  }),
  http.delete('/api/v1/cases/:id', () =>
    HttpResponse.json(
      errorBody('DELETION_NOT_SUPPORTED', 'Cases are closed, not deleted: POST /api/v1/cases with status=CLOSED'),
      { status: 405 },
    ),
  ),

  http.delete('/api/v1/rules/:id', () =>
    HttpResponse.json(
      errorBody('DELETION_NOT_SUPPORTED', 'Rules are disabled, not deleted: POST /api/v1/rules with enabled=false'),
      { status: 405 },
    ),
  ),

  http.get('/api/v1/person-cases', () => HttpResponse.json(page([], { totalElements: 0 }))),
  http.delete('/api/v1/person-cases/:id', () => new HttpResponse(null, { status: 204 })),
];

export { errorBody };
