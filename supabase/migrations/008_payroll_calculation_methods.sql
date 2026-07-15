-- ============================================================================
-- 008_payroll_calculation_methods.sql
-- Phase 2: configurable day-count basis (25 is the historical default, not hardcoded forever).
-- ============================================================================

create table if not exists public.payroll_calculation_methods (
  code text primary key
    check (code in (
      'CALENDAR_DAYS',
      'FIXED_30',
      'FIXED_26',
      'FIXED_25',
      'ACTUAL_WORKING_DAYS',
      'EMPLOYEE_CONTRACTUAL'
    )),
  label text not null,
  fixed_divisor numeric,
  requires_working_days boolean not null default false,
  active boolean not null default true
);

insert into public.payroll_calculation_methods (code, label, fixed_divisor, requires_working_days)
values
  ('CALENDAR_DAYS', 'Calendar-day basis', null, false),
  ('FIXED_30', 'Fixed 30-day basis', 30, false),
  ('FIXED_26', 'Fixed 26-day basis', 26, false),
  ('FIXED_25', 'Fixed 25-day basis', 25, false),
  ('ACTUAL_WORKING_DAYS', 'Actual working-day basis', null, true),
  ('EMPLOYEE_CONTRACTUAL', 'Employee-specific contractual basis', null, true)
on conflict (code) do update
set
  label = excluded.label,
  fixed_divisor = excluded.fixed_divisor,
  requires_working_days = excluded.requires_working_days;

alter table public.employees
  add column if not exists calculation_method_code text
    references public.payroll_calculation_methods (code),
  add column if not exists contractual_divisor numeric;

update public.employees
set calculation_method_code = coalesce(calculation_method_code, 'FIXED_25')
where calculation_method_code is null;

alter table public.payroll_calculation_methods enable row level security;

drop policy if exists "Allow anon read calculation_methods" on public.payroll_calculation_methods;
create policy "Allow anon read calculation_methods"
  on public.payroll_calculation_methods for select using (true);

comment on table public.payroll_calculation_methods is
  'Approved payroll day-count methods. Per-day rate must be recomputed server-side from method + salary.';
