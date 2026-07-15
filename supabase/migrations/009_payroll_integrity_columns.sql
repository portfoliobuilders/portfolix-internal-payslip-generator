-- ============================================================================
-- 009_payroll_integrity_columns.sql
-- Phase 2: workflow / payment / attendance / integrity metadata on payroll_slips.
-- Preserves existing details_json amounts — does not rewrite legacy money.
-- ============================================================================

alter table public.payroll_slips
  add column if not exists workflow_status text not null default 'DRAFT',
  add column if not exists integrity_status text not null default 'OK',
  add column if not exists payment_status text not null default 'NOT_SCHEDULED',
  add column if not exists salary_credit_date date,
  add column if not exists expected_payment_date date,
  add column if not exists payment_mode text,
  add column if not exists bank_name text,
  add column if not exists bank_account_last4 text,
  add column if not exists payment_reference_masked text,
  add column if not exists payroll_batch_id text,
  add column if not exists calendar_days integer,
  add column if not exists working_days numeric,
  add column if not exists payable_days numeric,
  add column if not exists lop_days numeric,
  add column if not exists attendance_locked boolean not null default false,
  add column if not exists calculation_method_code text
    references public.payroll_calculation_methods (code),
  add column if not exists payroll_divisor numeric,
  add column if not exists server_computed_at timestamptz,
  add column if not exists superseded_by uuid,
  add column if not exists supersedes uuid,
  add column if not exists active_final boolean not null default false;

-- Expand check constraints idempotently
do $$
begin
  alter table public.payroll_slips
    drop constraint if exists payroll_slips_workflow_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_workflow_status_check
    check (workflow_status in (
      'DRAFT','CALCULATED','REVIEWED','APPROVED','PAYMENT_PENDING',
      'PAID','FINAL','CANCELLED','SUPERSEDED'
    ));

  alter table public.payroll_slips
    drop constraint if exists payroll_slips_integrity_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_integrity_status_check
    check (integrity_status in ('OK','LEGACY_UNVERIFIED','NEEDS_REVIEW'));

  alter table public.payroll_slips
    drop constraint if exists payroll_slips_payment_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_payment_status_check
    check (payment_status in (
      'NOT_SCHEDULED','SCHEDULED','PROCESSING','PARTIALLY_PAID','PAID',
      'FAILED','REJECTED_BY_BANK','ON_HOLD','PAYMENT_DEFERRED','OVERDUE',
      'REVERSED','CANCELLED','UNDER_RECONCILIATION'
    ));
end $$;

-- Mark ALL existing rows as legacy/unverified without changing financial JSON.
update public.payroll_slips
set
  integrity_status = 'LEGACY_UNVERIFIED',
  workflow_status = case
    when lower(coalesce(status, 'draft')) = 'final' then 'FINAL'
    else 'DRAFT'
  end,
  active_final = case
    when lower(coalesce(status, 'draft')) = 'final' then true
    else false
  end
where coalesce(integrity_status, 'OK') = 'OK'
  and server_computed_at is null;

-- One active FINAL per employee + month (period).
create unique index if not exists payroll_slips_one_active_final_idx
  on public.payroll_slips (employee_id, month_year)
  where active_final = true;

comment on column public.payroll_slips.integrity_status is
  'LEGACY_UNVERIFIED = pre-integrity historical row; do not invent YTD/payment/credit data.';
comment on column public.payroll_slips.active_final is
  'True for the single active FINAL per employee+month; supersession clears the old row.';
