import { http, HttpResponse } from 'msw';
import { caseDetail, personSummary, ruleSummary } from '../fixtures';

// GET /cases/{id} bodies for the workspace (US4): with a rule, without a rule, and with more than
// twenty links. Tests pick one via server.use(...).
export const caseWithRule = (id = caseDetail().id) => caseDetail({ id, ruleId: ruleSummary().id });

export const caseWithoutRule = (id = caseDetail().id) => caseDetail({ id, ruleId: null });

export const caseOverlinked = (id = caseDetail().id) =>
  caseDetail({
    id,
    linkedPersons: Array.from({ length: 20 }, (_, i) =>
      personSummary({ id: `44444444-4444-4444-4444-0000000000${String(i).padStart(2, '0')}`, name: `LINKED ${i}` }),
    ),
    linkedPersonCount: 41,
  });

// Default: a case with no rule and no links. Overridden per test.
export const casesHandlers = [
  http.get('/api/v1/cases/:id', ({ params }) => HttpResponse.json(caseWithoutRule(String(params.id)))),
];
