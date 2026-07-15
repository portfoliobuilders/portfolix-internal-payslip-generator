# Portfolix Internal Workforce Payment Statement Generator

A workforce payment statement generator for Portfolix Enterprise Pvt Ltd and its brands (Portfolio Builders,
Portfolix.tech, Portfolix Hub). A stopgap for the HR team until the official Portfolix EMS ships.

**Supabase-backed.** Employees, slip history, payroll settings, and entity branding are stored in
the cloud.

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
  The app header uses the Portfolix Enterprise (PX) logo.

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

1. Copy `.env.local.example` to `.env.local` and fill in your Supabase project URL and anon key.
2. Run `npm install`, then start the dev server (see **Development** below).

## Development

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # TypeScript strict check
npm test           # payroll engine unit tests (vitest)
npm run build      # production build
```

## Cursor AI (Supabase MCP)

This repo includes a Cursor MCP config so AI assistants can query and manage the linked Supabase
project directly (inspect tables, run SQL, check logs, apply migrations, and more).

The config lives at `.cursor/mcp.json` and points at project `portfolixslipgen`
(`kbiewyddztpsrcxjczlc`):

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?project_ref=kbiewyddztpsrcxjczlc"
    }
  }
}
```

After cloning, reload Cursor (or restart) so it picks up the config. On first use you may be
prompted to authenticate Supabase in **Settings → MCP**.

To point at a different Supabase project, change the `project_ref` query parameter in the URL.

## Agent skills (optional)

Official Supabase agent skills are installed under `.agents/skills/` to help Cursor work more
accurately with Supabase and Postgres:

- `supabase` — general Supabase development guidance
- `supabase-postgres-best-practices` — Postgres performance and security patterns

To refresh or install on a new machine:

```bash
npx skills add supabase/agent-skills
```

## Deployment

Requires Supabase environment variables (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Deploy to Vercel or any Node.js host that supports Next.js Server
Actions.

Run migrations in `supabase/migrations/` against your Supabase project (including
`003_app_settings.sql` for the settings table).

## Payroll calendar

Draft PDFs are emailed on the 1st (T−4); employees reply with queries by the **3rd at 6:00 PM**
(T−2, derived as payday − 2); final slips go out with salary on the **5th**. Every slip prints the
review deadline and the payroll contact on the document itself.
