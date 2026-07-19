# AGENTS.md

`portfolix-slipgen` — a single-package **Next.js 14 (App Router) + Supabase** web app that
generates workforce payment statements (salary slips / stipend / payment statements). It is **not**
a monorepo and has no Express/SQLite/Chrome-extension code. Standard commands live in `README.md`
and `package.json` (`dev`, `build`, `start`, `lint`, `typecheck`, `test`).

## Payroll / product rules (source of truth)

For payroll math, auth posture, identifier policy, design tokens, and workflow constraints, **defer to**
[`.cursor/rules/payroll-rules.mdc`](.cursor/rules/payroll-rules.mdc). If this file and that rule
disagree, follow `payroll-rules.mdc`.

Go-live checklist progress (what is blocked vs already on `main`) lives in
[`docs/go-live-board-status.md`](docs/go-live-board-status.md). Do not invent missing playbook /
`cursor-prompt-*.md` content — obtain the prompt pack first.

## Cursor Cloud specific instructions

### Node version
- The project targets **Node 20** (`environment.json`). The base image also puts a Node 22 binary at
  `/exec-daemon/node` **first on `PATH`**, so a plain `node` resolves to v22 even after `nvm use 20`.
  To run with the intended Node 20, prepend the nvm bin for the command/session:
  `export PATH="$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"`. Next.js 14 also runs fine under the
  default Node 22 (one transitive dep prefers `node >=22`), so either works; prefer 20 for parity.

### Running the app
- Dev server: `npm run dev` → http://localhost:3000 (boots in ~1s). Use a tmux session so it keeps
  running.

### Supabase (required for real data flows)
- The app **degrades gracefully** without credentials: `utils/supabase/config.ts` returns `null` and
  a mock client (`utils/supabase/mock-client.ts`) makes every data operation fail with a
  `503 SUPABASE_CONFIG_MISSING`. The UI shell loads but roster/history/settings persistence and
  authorised-slip uploads do nothing. For meaningful end-to-end testing, copy `.env.local.example`
  to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`), and `SUPABASE_SECRET_KEY`, then apply
  `supabase/migrations/` (in order) and ensure the private `signatory-assets` Storage bucket exists.
- Auth: when credentials are configured, middleware redirects unauthenticated users to `/login`
  (except `/login`, `/auth/*`, `/verify/*`). Server actions call `requirePayrollAdmin()`.
- RLS: see `supabase/migrations/015_authenticated_rls.sql`. Confirm it is applied on the live
  project before treating Phase 5 as done (see go-live status doc).
- `middleware.ts` runs Supabase session refresh on (almost) every route, so its import graph is
  compiled for every request — a compile error in the payroll libs takes down all pages, not just
  one route.

### Core payroll engine is dependency-free
- All money math lives in pure modules under `lib/` (`payroll-calc.ts`, `amount-in-words.ts`, etc.)
  and is covered by Vitest (`npm test`) with **no** services needed. This is the fastest way to
  verify the environment/core logic without Supabase.
