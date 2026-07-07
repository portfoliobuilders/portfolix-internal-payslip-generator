# Portfolix Internal Salary Slip Generator

A salary slip generator for Portfolix Enterprise Pvt Ltd and its brands (Portfolio Builders,
Portfolix.tech, Portfolix Hub). A stopgap for the HR team until the official Portfolix EMS ships.

**Supabase-backed.** Employees, slip history, payroll settings, and entity branding (including
custom logos) are stored in the cloud and survive browser reloads.

## Routes

| URL | Page |
|-----|------|
| `/employee-roster` | Employee Roster |
| `/generator` | Slip Generator |
| `/history` | Slip History |
| `/settings` | Payroll & Entity Settings |
| `/` | Redirects to `/employee-roster` |

Friendly aliases (e.g. `/roster`, `/EmployeeRoster`, `/Settings`) redirect to the canonical routes.

## Data stored in Supabase

| Data | Table | When saved |
|------|-------|------------|
| Employees | `employees` | Immediately on add, edit, delete, or bulk upload |
| Slip history | `payroll_slips` | When a draft or final slip is generated/exported |
| App settings | `app_settings` | When you click **Save Settings** on the Settings page |
| Entity branding & logos | `app_settings.entity_branding` (JSONB) | With **Save Settings** |

Temporary UI state (active modal, filter text, generator form drafts) stays in the browser only.

## Features

- **Employee Roster** — add/edit/delete employees, inline Flex-Bank adjustments with a required
  reason (audit-logged), **Excel template download** and **bulk upload** to Supabase.
- **Generator** — split-screen: inputs on the left, live A4 preview on the right, Draft/Final
  toggle, PDF export (`PX_PaySlip_YYYY-MM_<EMPID>[_DRAFT].pdf`), print-identical `@media print` CSS.
- **History** — immutable snapshots of every generated slip, filterable, re-downloadable from the
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

## Development

```bash
npm install
npm run dev        # local dev server
npm run typecheck  # TypeScript strict check
npm test           # payroll engine unit tests (vitest)
npm run build      # production build
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
