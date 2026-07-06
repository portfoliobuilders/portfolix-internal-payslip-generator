# Portfolix Internal Salary Slip Generator

A **local-first, frontend-only** salary slip generator for Portfolix Enterprise Pvt Ltd and its
brands (Portfolio Builders, Portfolix.tech, Portfolix Hub). A stopgap for the HR team until the
official Portfolix EMS ships.

**No servers. No databases. No network calls.** All data lives in the browser's localStorage
(key `portfolix-slipgen-v1`). Salary data never leaves the machine.

## Features

- **Employee Roster** — add/edit/delete employees, inline Flex-Bank adjustments with a required
  reason (audit-logged), JSON backup export/import with confirm-overwrite.
- **Generator** — split-screen: inputs on the left, live A4 preview on the right, Draft/Final
  toggle, PDF export (`PX_PaySlip_YYYY-MM_<EMPID>[_DRAFT].pdf`), print-identical `@media print` CSS.
- **History** — immutable snapshots of every generated slip, filterable, re-downloadable from the
  stored snapshot (never recomputed).

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
npm run build      # static export → out/
```

## Deployment

`next.config.mjs` uses `output: 'export'` — `npm run build` emits a fully static site in `out/`,
deployable to Vercel free tier or any static host. Hosting publicly is safe by design: every
visitor's browser sees only its own (empty) localStorage.

**Operational discipline:** run payroll from one dedicated browser profile on the HR machine, and
**export a JSON backup after every payroll run** (Roster tab → Export JSON).

## Payroll calendar

Draft PDFs are emailed on the 1st (T−4); employees reply with queries by the **3rd at 6:00 PM**
(T−2, derived as payday − 2); final slips go out with salary on the **5th**. Every slip prints the
review deadline and the payroll contact on the document itself.
