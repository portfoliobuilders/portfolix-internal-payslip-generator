-- ============================================================================
-- 017_unify_base_salary_lifecycle_admins.sql
-- - Unify employees money on base_salary; drop duplicate compensation_amount
-- - Ensure slip status lifecycle (draft|final|superseded|voided)
-- - Ensure payroll_admins exists and seed the founding operator
-- ============================================================================

-- Resolve: only compensation_amount present / base missing or zero → copy into base_salary.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'employees'
      and column_name = 'compensation_amount'
  ) then
    update public.employees
    set base_salary = compensation_amount
    where compensation_amount is not null
      and (base_salary is null or base_salary = 0)
      and compensation_amount > 0;
  end if;
end $$;

-- Scrub accidental jsonb duplicate if any client ever wrote it.
update public.employees
set details_json = details_json - 'compensationAmount'
where details_json ? 'compensationAmount';

alter table public.employees
  drop column if exists compensation_amount;

-- Explicit lifecycle values on payroll_slips.status.
do $$
begin
  alter table public.payroll_slips
    drop constraint if exists payroll_slips_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_status_check
    check (lower(status) in ('draft', 'final', 'superseded', 'voided'));
exception
  when others then
    raise notice 'payroll_slips_status_check: %', SQLERRM;
end $$;

alter table public.payroll_slips
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by text,
  add column if not exists void_reason text;

comment on column public.payroll_slips.status is
  'Lifecycle: draft (replaceable), final (one active per employee-month), superseded, voided. Final/authorised are never hard-deleted.';

-- Repair rows that were superseded under the old half-written flow.
update public.payroll_slips
set status = 'superseded'
where lower(coalesce(status, '')) = 'final'
  and upper(coalesce(workflow_status, '')) = 'SUPERSEDED';

-- Admins who may run payroll server actions (checked server-side via service role).
create table if not exists public.payroll_admins (
  user_id uuid primary key,
  created_at timestamptz not null default now(),
  note text
);

alter table public.payroll_admins enable row level security;

drop policy if exists payroll_admins_select_authenticated on public.payroll_admins;
create policy payroll_admins_select_authenticated
  on public.payroll_admins
  for select
  to authenticated
  using (auth.uid() = user_id);

comment on table public.payroll_admins is
  'Users permitted for payroll mutating actions. Membership is checked server-side only — never a client checkbox.';

-- Seed founding operator (only auth user at go-live).
insert into public.payroll_admins (user_id, note)
values (
  '023716b9-d364-4a75-807a-a98a5b3d98dc',
  'Founding Portfolix operator — seeded at go-live hardening'
)
on conflict (user_id) do nothing;

-- One draft per employee + month (partial unique).
create unique index if not exists payroll_slips_one_draft_employee_month_idx
  on public.payroll_slips (employee_id, month_year)
  where lower(status) = 'draft';
