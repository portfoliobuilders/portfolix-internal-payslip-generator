-- ============================================================================
-- 004_payroll_slips_fk_set_null.sql
-- SUPERSEDED SAFETY PATCH (v1.0 production readiness)
--
-- Historical intent: keep slip history when an employee is removed.
-- Bug: it re-added FK payroll_slips.employee_id → employees(employee_id)
-- (business id). The app stores employees.id (UUID) in payroll_slips.employee_id,
-- so that FK breaks every slip insert (see 004_fix_slip_fk.sql).
--
-- Correct posture (immutable snapshots): NO FK on payroll_slips.employee_id.
-- This file now only ensures the bad constraint is absent — safe to re-run.
-- ============================================================================

alter table public.payroll_slips
  drop constraint if exists payroll_slips_employee_id_fkey;

create index if not exists payroll_slips_employee_month_idx
  on public.payroll_slips (employee_id, month_year desc);
