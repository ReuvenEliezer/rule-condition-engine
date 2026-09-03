# `ui/` — Rule Condition Engine browser client

React 19 + TypeScript + Vite. One consumer, one application — not a reusable package.

## Develop

```bash
npm ci
npm run dev          # Vite on http://localhost:5173
```

Vite proxies `/api` to `http://localhost:8080`, so the browser sees **one origin** and no CORS
configuration has to exist anywhere (research [R2](../specs/002-rule-engine-ui/research.md)). Start
the backend with `mvn spring-boot:run` first.

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Vite dev server with the `/api` proxy |
| `npm run build` | `tsc -b` then `vite build` → `dist/` |
| `npm run typecheck` | `tsc -b --noEmit` — `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| `npm run lint` | ESLint with `typescript-eslint` type-checked rules and `jsx-a11y` (errors, not warnings) |
| `npm test` / `npx vitest run` | Vitest + React Testing Library + MSW |

The CI `ui` job runs `npm ci → typecheck → lint → vitest --reporter=junit → build` on Node 24, in
parallel with the Java job and with **no `needs:`** — a UI failure and a backend failure are
independent signals.

## Packaging into the jar — the `-Pui` profile

```bash
# from the repository root
~/.m2/wrapper/dists/apache-maven-3.9.16/56ba1f9f/bin/mvn -Pui clean package
```

The non-default `ui` Maven profile runs `npm ci` and `npm run build` here and copies `ui/dist` into
`target/classes/static`, so the jar serves the app and the API from one origin. The **default**
build and the CI Java job need no Node at all. `SpaForwardingConfig` forwards client-side routes to
`/index.html` while **excluding `/api/**`** — a catch-all would render API 404s as HTML and defeat
the failure vocabulary.

## Design system

Tailwind CSS v4 (via `@tailwindcss/vite`, no config file) with tokens in `src/styles.css`
(`@theme`) — slate neutrals, an indigo `brand` ramp. Primitives live in `src/ui/components/`
(`Button`, `Select`, `Input`, `Card`, `Badge`) and shared layout in `src/ui/` (`PageHeader`,
`EmptyState`, `Pager`, `FailureBanner`). `src/lib/cn.ts` is the `clsx` + `tailwind-merge` helper.

`Select` is a **styled native `<select>`**, never a JS listbox — research R9 keeps field/operator
choices keyboard- and screen-reader-correct. Icons are `lucide-react`. Dark mode follows
`prefers-color-scheme`. Views not yet migrated to the primitives (the rule builder, links, preview)
are kept coherent by a small `@layer components` block in `styles.css` that styles only *unclassed*
native elements under `<main>`.

## Architecture notes

- **`src/api/`** — the typed client. `client.ts` resolves the base URL once
  (`VITE_API_BASE_URL ?? '/api/v1'`) and turns every failure into either a `transport` or a
  `refusal` kind. `errors.ts` is the exhaustive sixteen-code map; an unhandled code is a **compile**
  error. `ruleWire.ts` handles the condition tree losslessly (`10.50` is never re-rounded) while
  leaving scalar fields to plain JSON.
- **Summary and detail are separate types.** `nationalId` exists on `PersonDetail` only, so reading
  it from a list row does not compile. The person-detail query uses `gcTime: 0` so it is dropped on
  unmount.
- **Nothing is persisted** — no `localStorage`, `sessionStorage`, IndexedDB or persisted query
  cache.

## The field catalog is a stopgap — read this

`GET /api/v1/rules/fields` publishes field **names only**. The builder needs each field's type,
operators and enum values, so `src/rules/catalog.ts` holds a **hand-derived copy of server-side
truth**. It will drift the moment a field is added, retyped or removed.

`catalogValidation.ts` runs a set-equality check against the published names at start-up and turns
an added or removed field into a **blocking configuration error** that names the field and blocks
*only* the rule builder. It **cannot** detect a field that was retyped under an unchanged name.

The real fix is to publish the metadata server-side. See
[`contracts/field-catalog.md §4`](../specs/002-rule-engine-ui/contracts/field-catalog.md#4-start-up-validation-spec-dependency-2).
