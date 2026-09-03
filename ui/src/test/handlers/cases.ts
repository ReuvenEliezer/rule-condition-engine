import { http, HttpResponse } from 'msw';
import { caseDetail, personSummary, ruleSummary } from '../fixtures';

// GET /cases/{id} variants — with a rule, without a rule, and with more than twenty links (US4).
export const casesHandlers = [
  http.get('/api/v1/cases/:id/with-rule', ({ params }) =>
    HttpResponse.json(caseDetail({ id: String(params.id), ruleId: ruleSummary().id })),
  ),
  http.get('/api/v1/cases/:id/overlinked', ({ params }) =>
    HttpResponse.json(
      caseDetail({
        id: String(params.id),
        linkedPersons: Array.from({ length: 20 }, (_, i) =>
          personSummary({ id: `44444444-4444-4444-4444-0000000000${String(i).padStart(2, '0')}` }),
        ),
        linkedPersonCount: 41,
      }),
    ),
  ),
];
