-- Run in Supabase SQL Editor if not already applied.
-- Extended employee profile fields (department, flex log, etc.) are stored in details_json.

alter table employees
  add column if not exists details_json jsonb default '{}'::jsonb;

-- Optional: index for slip history lookups by employee + month
create index if not exists payroll_slips_employee_month_idx
  on payroll_slips (employee_id, month_year desc);
