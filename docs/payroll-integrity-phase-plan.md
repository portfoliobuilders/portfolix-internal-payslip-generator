# Payroll Integrity Phase — Inspection & Execution Plan

## Exact current payroll date model

| Concept | Current field / computation | Gap |
|---|---|---|
| Salary month key | `payroll_slips.month_year` (`YYYY-MM`) | OK |
| Attendance period | **Implied as calendar month** via `payPeriodEnd()` / `endOfMonth(monthYear)` | Must become configurable `25 previous → 24 current` by default |
| LOP divisor | `FIXED_25` / `payroll_divisor` (calc method table) | Exists, but UI hardcodes 25 and labels it as rate basis mixed with period |
| Payment due | `payrollCycleDates(monthYear, paydayDayOfMonth)` → payday of next month | Global payday only; no per-employee schedule |
| Actual credit | obligation `actual_final_credit_date` / slip `salary_credit_date` | Exists in schema + domain |

**Live DB note (pre-fix):** production Supabase only had baseline slip columns + salary_payment_* tables. Migrations 006–010 were applied during this phase before code ships.

## Existing status model

- **Payroll/workflow:** `DRAFT | CALCULATED | REVIEWED | APPROVED | PAYMENT_PENDING | PAID | FINAL | CANCELLED | SUPERSEDED` (on `payroll_slips.workflow_status`) plus legacy `status` draft/final
- **Payment:** obligation statuses including NOT_SCHEDULED…UNDER_RECONCILIATION (missing `NO_SALARY_DUE`, `SALARY_WAIVED`)
- **Document:** obligation `document_status` eligibility gates (NOT_READY…AUTHORISED_ISSUED) — not the requirement’s ISSUED/REVOKED document lifecycle

Rule already encoded: **FINAL ≠ PAID**.

## Existing payment fields

- Tables: `salary_payment_obligations`, `salary_payment_transactions`, `salary_payment_holds`, `salary_payment_audit_events`
- Due dates: `original_statutory_due_date` (immutable), `company_committed_date`, `revised_expected_date`, `actual_final_credit_date`
- Maker-checker + UTR uniqueness + delete-confirmed trigger exist

## History page data source

- Prefer `payment_statements.snapshot_data`, fallback `payroll_slips`
- Payment columns joined via `fetchPaymentObligationsForHistory()`
- Columns today: Employee, Pay month, Payroll, Payment, Net due, Confirmed, Outstanding, Original due, Revised expected, Last paid, Timeliness, Actions

## Duplicate-record behaviour

- Unique index `(employee_id, month_year) WHERE active_final`
- App `finalizePayrollSlip` + RPC `assert_no_duplicate_active_final`
- Supersede sets prior `active_final=false`, `workflow_status=SUPERSEDED`

## Risk-ranked execution plan

1. **HIGH — Apply missing integrity migrations** (additive) so domain columns exist
2. **HIGH — Payroll cycle model + server validation** (attendance ≠ calendar month; period gate uses cycle end)
3. **HIGH — Extend payment statuses** (NO_SALARY_DUE / SALARY_WAIVED) + schedule fields; never fabricate payments
4. **HIGH — Authorised-slip gates** (Generator + History); block unpaid / waived / partial
5. **MED — History attendance cycle + document status columns; delete safety**
6. **MED — Internal / authorised template field corrections + central logo / legal name**
7. **MED — Verification route + QR + secure verification IDs**
8. **HIGH — Vector/text PDF path** (replace screenshot as production bank PDF)
9. **MED — Tests for cycle, schedules, ledger edge cases, document gates, PDF extract**

Destructive migrations: none required. Constraint expansions are additive. No silent legacy money rewrites.

## Files / migrations to change

- New: `supabase/migrations/012_payroll_cycle_schedules_documents.sql`
- New: `lib/payroll-cycle.ts`, `lib/payment-schedule.ts`, `lib/pdf-vector.ts`, `app/verify/payslip/[publicVerificationId]/page.tsx`
- Update: calculation-method, payroll-validate, payroll-integrity, salary-payment*, format, types, payroll actions, History/SalarySlip/AuthorisedSlip/Generator, pdf-export, tests
