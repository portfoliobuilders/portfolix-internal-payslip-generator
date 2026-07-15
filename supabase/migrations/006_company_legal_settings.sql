-- ============================================================================
-- 006_company_legal_settings.sql
-- Phase 2: centralized legal company identity + compliance flags.
-- Does NOT overwrite existing company_settings display values silently.
-- Legal name confirmation is required before treating the row as verified.
-- ============================================================================

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  cin text,
  registered_office text,
  corporate_office text,
  payroll_email text,
  payroll_phone text,
  website text,
  incorporation_date date,
  verification_base_url text,
  epfo_applicable boolean not null default false,
  esic_applicable boolean not null default false,
  professional_tax_registered boolean not null default false,
  default_payment_narration text,
  logo_path text,
  seal_path text,
  legal_name_confirmed boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint companies_single_org check (true)
);

-- Soft singleton: at most one company row.
create unique index if not exists companies_one_row_idx
  on public.companies ((1));

create table if not exists public.company_payroll_settings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  payday_day_of_month integer not null default 5
    check (payday_day_of_month between 3 and 28),
  review_deadline_time text not null default '6:00 PM',
  pt_deduction_months integer[] not null default '{8,2}',
  default_calculation_method text not null default 'FIXED_25',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint company_payroll_settings_company_unique unique (company_id)
);

-- Seed one unverified placeholder company. HR must confirm the registered legal name.
-- Do not silently rewrite historical slip branding.
insert into public.companies (
  legal_name,
  cin,
  registered_office,
  payroll_email,
  legal_name_confirmed
)
select
  'SET-IN-SETTINGS',
  'SET-IN-SETTINGS',
  'SET-IN-SETTINGS',
  'SET-IN-SETTINGS',
  false
where not exists (select 1 from public.companies);

insert into public.company_payroll_settings (company_id)
select c.id
from public.companies c
where not exists (
  select 1 from public.company_payroll_settings s where s.company_id = c.id
);

alter table public.companies enable row level security;
alter table public.company_payroll_settings enable row level security;

drop policy if exists "Allow anon full access companies" on public.companies;
create policy "Allow anon full access companies"
  on public.companies for all using (true) with check (true);

drop policy if exists "Allow anon full access company_payroll_settings" on public.company_payroll_settings;
create policy "Allow anon full access company_payroll_settings"
  on public.company_payroll_settings for all using (true) with check (true);

comment on table public.companies is
  'Canonical legal identity. Confirm legal_name before issuing external documents. Do not invent CIN/office.';
comment on column public.companies.legal_name_confirmed is
  'False until an administrator confirms the exact registered spelling (e.g. PORTFOLIX ENTREPRISE PRIVATE LIMITED).';
