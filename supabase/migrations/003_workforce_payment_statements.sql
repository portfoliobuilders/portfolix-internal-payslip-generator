-- Workforce expansion + immutable payment statement history.

alter table if exists employees
  add column if not exists engagement_type text default 'regular_employee',
  add column if not exists employment_status text default 'active',
  add column if not exists payment_type text default 'salary',
  add column if not exists compensation_amount numeric,
  add column if not exists internship_start_date date,
  add column if not exists internship_end_date date,
  add column if not exists probation_start_date date,
  add column if not exists probation_end_date date,
  add column if not exists notice_start_date date,
  add column if not exists notice_end_date date,
  add column if not exists contract_start_date date,
  add column if not exists contract_end_date date,
  add column if not exists offboarding_date date;

update employees
set compensation_amount = coalesce(compensation_amount, base_salary)
where compensation_amount is null;

alter table if exists employees
  alter column compensation_amount set default 0;

create table if not exists payment_statements (
  id uuid primary key default gen_random_uuid(),
  person_id text,
  employee_id text,
  person_name text,
  entity_id text,
  engagement_type text,
  employment_status text,
  payment_type text,
  statement_title text,
  month integer,
  year integer,
  gross_pay numeric,
  net_pay numeric,
  compensation_amount numeric,
  earnings jsonb default '{}'::jsonb,
  deductions jsonb default '{}'::jsonb,
  payment_mode text,
  transaction_reference text,
  generated_by text,
  generated_at timestamptz default now(),
  pdf_url text,
  pdf_data text,
  snapshot_person_data jsonb,
  snapshot_settings_data jsonb,
  snapshot_data jsonb,
  created_at timestamptz default now()
);

create index if not exists payment_statements_person_month_idx
  on payment_statements (person_id, year desc, month desc);

create table if not exists workforce_events (
  id uuid primary key default gen_random_uuid(),
  person_id text,
  employee_id text,
  event_type text,
  event_date date,
  notes text,
  created_by text,
  created_at timestamptz default now(),
  metadata jsonb default '{}'::jsonb
);

create table if not exists person_documents (
  id uuid primary key default gen_random_uuid(),
  person_id text not null,
  document_type text not null,
  file_url text,
  uploaded_at timestamptz default now(),
  verified_status text default 'pending',
  notes text
);
