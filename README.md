# Portfolix Internal Workforce Payment Statement Generator

A workforce payment statement generator for Portfolix Enterprise Pvt Ltd and its brands (Portfolio Builders,
Portfolix.tech, Portfolix Hub). A stopgap for the HR team until the official Portfolix EMS ships.

**Live app:** [portfolix-internal-payslip-generato.vercel.app](https://portfolix-internal-payslip-generato.vercel.app)

> The old employee handbook is reference-only (`docs/handbook-reference-audit.md`). It is **not**
> enforced by the app. Any policy implementation needs founder approval (and legal/HR review where
> required).

## What it does

**Supabase-backed.** Employees, slip history, payroll settings, and entity branding sync to the
cloud. Bank-copy signatory assets (signature + seal) live in a private Storage bucket.

| Page | Route | Purpose |
|------|-------|---------|
| Employee Roster | `/employee-roster` | Workforce CRUD, Flex-Bank adjustments, Excel bulk upload |
| Generator | `/generator` | Split-screen inputs + live A4 preview, Draft/Final, PDF/print |
| History | `/history` | Immutable slip snapshots; re-download; Authorised bank copy |
| Settings | `/settings` | Payroll calendar, contact, per-entity branding + logo |

## Features

- **Workforce Roster** — supports regular employees, probation/notice period staff, interns/trainees/apprentices, contract employees, freelancers, and consultants.
- **Roster management** — add/edit/archive people, inline Flex-Bank adjustments with a required
  reason (audit-logged), **Excel template download** and **bulk upload** to Supabase.
- **Generator** — split-screen: inputs on the left, live A4 preview on the right, Draft/Final
  toggle, dynamic output (Salary Slip / Stipend Statement / Payment Statement), print-identical `@media print` CSS.
- **Payment History** — immutable snapshots of every generated statement, filterable, re-downloadable from the
  stored snapshot (never recomputed).
- **Settings** — edit payroll calendar, payroll contact, per-entity branding (name, legal line,
  address, contact), and **upload a logo** per entity. Click **Save Settings** to persist changes.
  The app header uses the Portfolix Entreprise (PX) logo.

## Payroll rules (enforced by `lib/payroll-calc.ts`)

- `perDayRate = baseSalary ÷ 25` — the 25-day constant is hardcoded and not editable in the UI.
- Flex bank: `flexAvailable = balance + earned`; `unpaidLate = max(late − flexAvailable, 0)`;
  LOP-from-lateness = `unpaidLate ÷ 480` **floored to 0.5 day (always favors the employee)**.
- `lopDays = absent + 0.5 × halfDays + LOP-from-lateness`.
- `net = (base + fixedAllowance) − (lopDays × rate + otherDeductions) + variablePaid`, rounded once.
- Deferral is **variable-only**; `deferredClosing > 0` requires a committed payout date before
  export; the deferred-opening ledger auto-chains from the last FINAL slip.

All math lives in dependency-free pure modules (`lib/payroll-calc.ts`, `lib/amount-in-words.ts`)
covered by unit tests, ready to be lifted into the Portfolix EMS unchanged.

## Setup

1. Copy `.env.local.example` to `.env.local` and fill in:

   | Variable | Where used |
   |----------|------------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Browser + server Supabase client |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) | Anon key |
   | `SUPABASE_SECRET_KEY` | **Server-only.** Required for payroll admin checks, signature/seal uploads, signed URLs. Never prefix with `NEXT_PUBLIC`. |
   | `NEXT_PUBLIC_APP_URL` | **Required** canonical origin for QR / verification links (no preview hosts). |

   Production fails closed if Supabase URL/key or (for admin/QR paths) secret / app URL are missing.

2. Apply SQL migrations in `supabase/migrations/` against your Supabase project (see `DATABASE.md`). **Production must include `019_payroll_admin_rls.sql`.**
3. Ensure the private `signatory-assets` Storage bucket exists (see `005_authorised_slip.sql`).
4. Install and run:

```bash
npm install
npm run dev
```

## Development

```bash
npm install
npm run dev        # local dev server (http://localhost:3000)
npm run typecheck  # TypeScript strict check
npm test           # payroll engine unit tests (vitest)
npm run build      # production build
npm start          # serve production build
```

Useful scripts:

- `scripts/smoke-test.mjs` — quick smoke checks
- `scripts/acceptance-test.mjs` — acceptance flow against a running app / DB
- `scripts/setup-env.sh` — `npm ci` + typecheck + build (used by cloud agent setup)

Optional auditor panel: open Settings with `?audit=1` or `?stress=1` to show the payroll stress-test panel.

## Project layout

```
app/                 App Router pages + Server Actions
components/          Roster, Generator, History, Settings, slip renders
lib/                 Pure payroll math, types, PDF helpers, DB mappers
store/               Zustand HR + UI stores
utils/supabase/      Browser, server, middleware, and service-role clients
supabase/migrations/ Schema (employees, slips, settings, authorised slip)
docs/                Audits and reference notes (not runtime)
```

## Cursor AI (Supabase MCP)

This repo includes a Cursor MCP config so AI assistants can query and manage the linked Supabase
project (inspect tables, run SQL, check logs, apply migrations).

Config: `.cursor/mcp.json` → project `portfolixslipgen` (`kbiewyddztpsrcxjczlc`).

After cloning, reload Cursor so it picks up the config. On first use you may be prompted to
authenticate Supabase in **Settings → MCP**.

To point at a different project, change the `project_ref` query parameter in the URL.

## Agent skills (optional)

Official Supabase agent skills live under `.agents/skills/`:

- `supabase` — general Supabase development guidance
- `supabase-postgres-best-practices` — Postgres performance and security patterns

```bash
npx skills add supabase/agent-skills
```

## Deployment

Deploy to Vercel (or any Node host that supports Next.js Server Actions). Set the same env vars as
local setup — especially `SUPABASE_SECRET_KEY` if you need Authorised Slip bank copies.

Run migrations in `supabase/migrations/` against the target Supabase project before first deploy
(baseline through `005_authorised_slip.sql`).

## Payroll calendar

Draft PDFs are emailed on the 1st (T−4); employees reply with queries by the **3rd at 6:00 PM**
(T−2, derived as payday − 2); final slips go out with salary on the **5th**. Every slip prints the
review deadline and the payroll contact on the document itself.
