// Application shell and routing (FR-042, FR-045).
//
//   - An in-flight indicator shows whenever any request is pending (FR-042).
//   - There is NO sign-in, user menu, or permission affordance anywhere. Every change is
//     attributed to `system` and there is no authentication to represent (FR-045, contract §6.9).

import { QueryClientProvider } from '@tanstack/react-query';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './api/queries';
import { LiveRegionProvider } from './ui/LiveRegion';
import { RecordsPage } from './records/RecordsPage';
import { RuleBuilderPage } from './rules/RuleBuilderPage';
import { CaseWorkspacePage } from './cases/CaseWorkspacePage';
import { AuditTrailView } from './audit/AuditTrailView';

function InFlightIndicator() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  if (fetching + mutating === 0) return null;
  return <div className="inflight-indicator" role="status" aria-label="Loading" />;
}

function Shell() {
  return (
    <div className="app-shell">
      <InFlightIndicator />
      <header>
        <h1>Rule Condition Engine</h1>
        <nav className="app-nav" aria-label="Primary">
          <NavLink to="/persons">Persons</NavLink>
          <NavLink to="/cases">Cases</NavLink>
          <NavLink to="/rules">Rules</NavLink>
          <NavLink to="/person-cases">Links</NavLink>
          <NavLink to="/audit">Audit trail</NavLink>
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Navigate to="/persons" replace />} />
          <Route path="/persons/*" element={<RecordsPage resource="persons" />} />
          <Route path="/cases" element={<RecordsPage resource="cases" />} />
          <Route path="/cases/:id" element={<CaseWorkspacePage />} />
          <Route path="/rules" element={<RecordsPage resource="rules" />} />
          <Route path="/rules/new" element={<RuleBuilderPage mode="create" />} />
          <Route path="/rules/:id" element={<RecordsPage resource="rules" />} />
          <Route path="/rules/:id/condition" element={<RuleBuilderPage mode="edit" />} />
          <Route path="/rules/:id/matches" element={<RuleBuilderPage mode="matches" />} />
          <Route path="/person-cases" element={<RecordsPage resource="person-cases" />} />
          <Route path="/audit" element={<AuditTrailView />} />
          <Route path="*" element={<Navigate to="/persons" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LiveRegionProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </LiveRegionProvider>
    </QueryClientProvider>
  );
}
