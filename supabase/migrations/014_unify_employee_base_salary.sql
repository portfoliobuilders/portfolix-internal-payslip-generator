-- Unify employee money on base_salary only.
-- Rule: when both exist and differ, base_salary wins (engine source of truth).
-- Then drop the duplicate compensation_amount column and scrub any jsonb key.

-- Canary SELECT (run before drop) is performed via execute_sql in the deploy step.
-- Resolve: only compensation_amount present / base missing or zero → copy into base_salary.
update public.employees
set base_salary = compensation_amount
where compensation_amount is not null
  and (base_salary is null or base_salary = 0)
  and compensation_amount > 0;

-- When both exist and differ: keep base_salary (no-op by design).

-- Scrub accidental jsonb duplicate if any client ever wrote it.
update public.employees
set details_json = details_json - 'compensationAmount'
where details_json ? 'compensationAmount';

alter table public.employees
  drop column if exists compensation_amount;
