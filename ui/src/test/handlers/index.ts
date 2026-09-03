import type { RequestHandler } from 'msw';
import { rulesHandlers } from './rules';
import { matchesHandlers } from './matches';
import { recordsHandlers } from './records';
import { casesHandlers } from './cases';
import { auditHandlers } from './audit';

// Aggregated MSW handlers, one module per story's routes. Each module's bodies are captured from
// a running service (research R10) so the mock cannot drift from the API it stands in for.
export const handlers: RequestHandler[] = [
  ...rulesHandlers,
  ...matchesHandlers,
  ...recordsHandlers,
  ...casesHandlers,
  ...auditHandlers,
];
