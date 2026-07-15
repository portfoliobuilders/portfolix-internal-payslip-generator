-- ============================================================================
-- 007_employment_dates.sql
-- Phase 2: separate employment dates; never invent transfer dates.
-- Existing joining_date is preserved as legacy; new columns nullable.
-- ============================================================================

alter table public.employees
  add column if not exists group_joining_date date,
  add column if not exists legal_entity_joining_date date,
  add column if not exists employment_transfer_date date,
  add column if not exists confirmation_date date,
  add column if not exists current_salary_effective_date date,
  add column if not exists employment_dates_review_required boolean not null default false;

-- Flag rows whose legacy joining_date likely needs review once incorporation is set.
-- Do not rewrite joining_date values.
update public.employees
set employment_dates_review_required = true
where legal_entity_joining_date is null
  and joining_date is not null;

create table if not exists public.employee_employment_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  event_type text not null
    check (event_type in (
      'GROUP_JOIN',
      'LEGAL_ENTITY_JOIN',
      'TRANSFER',
      'CONFIRMATION',
      'SALARY_EFFECTIVE',
      'CONTINUITY_NOTE'
    )),
  event_date date not null,
  source_entity text,
  notes text,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists employee_employment_history_emp_idx
  on public.employee_employment_history (employee_id, event_date);

alter table public.employee_employment_history enable row level security;

drop policy if exists "Allow anon full access employment_history" on public.employee_employment_history;
create policy "Allow anon full access employment_history"
  on public.employee_employment_history for all using (true) with check (true);

comment on column public.employees.group_joining_date is
  'Original group joining date; may predate incorporation only with a continuity record.';
comment on column public.employees.legal_entity_joining_date is
  'Joining date under the current legal entity; must not predate incorporation.';
comment on column public.employees.employment_dates_review_required is
  'Set for legacy rows needing HR confirmation — do not silently correct dates.';
