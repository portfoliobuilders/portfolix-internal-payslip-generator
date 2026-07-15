-- ============================================================================
-- 004_fix_slip_fk.sql
-- Fix: insert on payroll_slips violates payroll_slips_employee_id_fkey
--
-- The app writes the employee's UUID (employees.id) into payroll_slips.employee_id,
-- but the foreign key pointed at employees.employee_id — the BUSINESS id column
-- (e.g. 'PX-EXE-2408-006'). A UUID never matches a business id, so every slip
-- insert was rejected and History stayed empty.
--
-- Slips are immutable, self-contained snapshots: all employee display data is
-- copied into details_json and must survive the employee being deleted from the
-- roster. A hard FK is therefore both wrong (mismatched column) and undesirable
-- (it would block deleting an employee who has slips). Drop it.
-- ============================================================================

alter table public.payroll_slips
  drop constraint if exists payroll_slips_employee_id_fkey;

-- (Optional) keep fast lookups by employee — this index already exists from
-- migration 002, so it's a no-op if you've run that:
create index if not exists payroll_slips_employee_month_idx
  on public.payroll_slips (employee_id, month_year desc);
