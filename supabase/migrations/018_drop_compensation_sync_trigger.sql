-- Drop compat trigger/function that synced the removed employees.compensation_amount column.
drop trigger if exists employees_sync_compensation_amount on public.employees;
drop trigger if exists trg_employees_sync_compensation_amount on public.employees;
drop function if exists public.employees_sync_compensation_amount() cascade;
