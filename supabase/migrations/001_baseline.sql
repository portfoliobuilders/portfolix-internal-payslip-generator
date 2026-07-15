-- Baseline schema for Portfolix Internal Payslip Generator.
-- Documents the production shape of employees / payroll_slips / app_settings
-- so the database can be rebuilt from this repo. Apply before later migrations.

-- employees
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  entity_id text not null,
  employee_id text not null unique,
  joining_date date not null,
  designation text not null,
  base_salary numeric not null,
  flex_bank_balance integer default 0,
  -- Extended fields (department, address, paymentMode, bankLast4, panMasked,
  -- flexLog, tdsMonthly, ptHalfYearly) live in details_json — not SQL columns.
  details_json jsonb default '{}'::jsonb
);

alter table public.employees enable row level security;

drop policy if exists "Allow anon full access" on public.employees;
create policy "Allow anon full access"
  on public.employees for all using (true) with check (true);

-- payroll_slips (there is no payroll_runs table)
-- employee_id stores employees.id (UUID as text), NOT the business employee_id.
-- details_json holds the rest of SlipSnapshot (inputs, computed, employee, …).
create table if not exists public.payroll_slips (
  id uuid primary key default gen_random_uuid(),
  employee_id text,
  month_year text not null,
  status text default 'draft',
  details_json jsonb not null
);

create index if not exists payroll_slips_employee_month_idx
  on public.payroll_slips (employee_id, month_year desc);

alter table public.payroll_slips enable row level security;

drop policy if exists "Allow anon full access" on public.payroll_slips;
create policy "Allow anon full access"
  on public.payroll_slips for all using (true) with check (true);

-- app_settings — singleton jsonb row for Settings + EntityInfo branding/signatory
create table if not exists public.app_settings (
  id integer primary key default 1 check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.app_settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

drop policy if exists "app_settings read" on public.app_settings;
drop policy if exists "app_settings write" on public.app_settings;
create policy "app_settings read"
  on public.app_settings for select using (true);
create policy "app_settings write"
  on public.app_settings for all using (true) with check (true);
