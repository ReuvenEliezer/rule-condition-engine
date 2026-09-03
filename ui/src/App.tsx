// Application shell and routing (FR-042, FR-045).
//
//   - An in-flight indicator shows whenever any request is pending (FR-042).
//   - There is NO sign-in, user menu, or permission affordance anywhere. Every change is
//     attributed to `system` and there is no authentication to represent (FR-045, contract §6.9).

import { useState } from 'react';
import { QueryClientProvider, useIsFetching, useIsMutating } from '@tanstack/react-query';
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { Boxes, GitBranch, Link2, Menu, ScrollText, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { queryClient } from './api/queries';
import { LiveRegionProvider } from './ui/LiveRegion';
import { cn } from './lib/cn';
import { RecordsPage } from './records/RecordsPage';
import { RuleBuilderPage } from './rules/RuleBuilderPage';
import { CaseWorkspacePage } from './cases/CaseWorkspacePage';
import { AuditTrailView } from './audit/AuditTrailView';

type NavItem = { to: string; label: string; icon: LucideIcon };

const NAV: NavItem[] = [
  { to: '/persons', label: 'Persons', icon: Users },
  { to: '/cases', label: 'Cases', icon: Boxes },
  { to: '/rules', label: 'Rules', icon: GitBranch },
  { to: '/person-cases', label: 'Links', icon: Link2 },
  { to: '/audit', label: 'Audit trail', icon: ScrollText },
];

function InFlightIndicator() {
  const pending = useIsFetching() + useIsMutating();
  return (
    <div
      aria-hidden={pending === 0}
      role="status"
      aria-label={pending > 0 ? 'Loading' : undefined}
      className={cn(
        'fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-brand-500 transition-opacity duration-200',
        pending > 0 ? 'animate-pulse opacity-100' : 'opacity-0',
      )}
    />
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-200'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
            )
          }
        >
          {({ isActive }) => (
            <>
              <Icon
                className={cn(
                  'size-4 shrink-0 transition-colors',
                  isActive ? 'text-brand-600 dark:text-brand-300' : 'text-slate-400 group-hover:text-slate-500',
                )}
              />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="grid size-8 place-items-center rounded-lg bg-brand-600 text-white shadow-sm">
        <GitBranch className="size-4" />
      </span>
      <span className="text-sm font-semibold leading-tight text-slate-900 dark:text-slate-100">
        Rule Condition
        <br />
        Engine
      </span>
    </div>
  );
}

function Shell() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <InFlightIndicator />

      {/* Desktop sidebar */}
      <aside className="hidden border-r border-slate-200 bg-white lg:flex lg:flex-col dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center border-b border-slate-200 px-4 dark:border-slate-800">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <NavItems />
        </div>
        <p className="px-4 py-3 text-xs text-slate-400">Every change is attributed to <code>system</code>.</p>
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 lg:hidden dark:border-slate-800 dark:bg-slate-900">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="grid size-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="Open navigation"
        >
          <Menu className="size-5" />
        </button>
        <Brand />
      </header>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-white p-3 shadow-xl dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between px-1">
              <Brand />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close navigation"
              >
                <X className="size-4" />
              </button>
            </div>
            <NavItems onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-5xl">
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
        </div>
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
