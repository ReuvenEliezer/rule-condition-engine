import { http, HttpResponse } from 'msw';
import { page, personDetail, personSummary, personCaseSummary } from '../fixtures';

// Handlers for /rules/{id}/matches, GET /persons/{id} and POST /person-cases (US2).
export const matchesHandlers = [
  http.get('/api/v1/rules/:id/matches', ({ request }) => {
    const scope = new URL(request.url).searchParams.get('scope');
    const rows =
      scope === 'CASE_SCOPED'
        ? [personSummary()]
        : [personSummary(), personSummary({ id: '11111111-1111-1111-1111-111111111112', name: 'AVI LEVI' })];
    return HttpResponse.json(page(rows, { totalElements: rows.length }));
  }),

  http.get('/api/v1/persons/:id', ({ params }) => HttpResponse.json(personDetail({ id: String(params.id) }))),

  http.post('/api/v1/person-cases', async ({ request }) => {
    const body = (await request.json()) as { personId: string; caseId: string; role: string };
    return HttpResponse.json(
      personCaseSummary({ personId: body.personId, caseId: body.caseId, role: body.role as never }),
      { status: 201, headers: { Location: `/api/v1/person-cases/${body.personId}:${body.caseId}` } },
    );
  }),
];
