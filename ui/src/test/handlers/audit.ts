import { http, HttpResponse } from 'msw';
import { auditEntry, page } from '../fixtures';

// /audit-entries — create, update-with-masked-field, and delete entries (US5).
export const auditHandlers = [
  http.get('/api/v1/audit-entries', () =>
    HttpResponse.json(
      page(
        [
          auditEntry({ operation: 'DELETE', occurredAt: '2026-09-03T13:00:00Z', entityVersion: null, changes: null }),
          auditEntry({
            operation: 'UPDATE',
            occurredAt: '2026-09-03T12:30:00Z',
            changes: { nationalId: { from: '***', to: '***' }, city: { from: 'Haifa', to: 'Eilat' } },
          }),
          auditEntry({
            operation: 'CREATE',
            occurredAt: '2026-09-03T12:00:00Z',
            entityVersion: 0,
            changes: { name: { to: 'AVI COHEN' }, age: { to: 35 } },
          }),
        ],
        { totalElements: 3 },
      ),
    ),
  ),
];
