-- ============================================================================
-- 011_salary_payment_reconciliation.sql
-- Phase 2 extension: parent salary-payment obligations + child transactions,
-- hold/deferral records, append-only payment audit. FINAL ≠ PAID.
-- ============================================================================

-- Parent obligation (1:1 with active finalised payroll record)
create table if not exists public.salary_payment_obligations (
  id uuid primary key default gen_random_uuid(),
  payroll_record_id uuid not null references public.payroll_slips (id) on delete restrict,
  employee_id text not null,
  month_year text not null,
  net_salary_payable numeric not null check (net_salary_payable >= 0),
  payment_status text not null default 'NOT_SCHEDULED',
  document_status text not null default 'NOT_READY',
  original_statutory_due_date date not null,
  company_committed_date date,
  revised_expected_date date,
  actual_final_credit_date date,
  overdue_event_at timestamptz,
  confirmed_paid_amount numeric not null default 0,
  outstanding_amount numeric not null,
  last_payment_date date,
  timeliness text not null default 'NOT_YET_PAID',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint salary_payment_obligations_payroll_unique unique (payroll_record_id)
);

do $$
begin
  alter table public.salary_payment_obligations
    drop constraint if exists salary_payment_obligations_payment_status_check;
  alter table public.salary_payment_obligations
    add constraint salary_payment_obligations_payment_status_check
    check (payment_status in (
      'NOT_SCHEDULED','SCHEDULED','PROCESSING','PARTIALLY_PAID','PAID',
      'FAILED','REJECTED_BY_BANK','ON_HOLD','PAYMENT_DEFERRED','OVERDUE',
      'REVERSED','CANCELLED','UNDER_RECONCILIATION'
    ));

  alter table public.salary_payment_obligations
    drop constraint if exists salary_payment_obligations_document_status_check;
  alter table public.salary_payment_obligations
    add constraint salary_payment_obligations_document_status_check
    check (document_status in (
      'NOT_READY','INTERNAL_AVAILABLE','PARTIAL_ADVICE_ALLOWED',
      'OUTSTANDING_STATEMENT_ALLOWED','AUTHORISED_BLOCKED',
      'AUTHORISED_ELIGIBLE','AUTHORISED_ISSUED'
    ));

  alter table public.salary_payment_obligations
    drop constraint if exists salary_payment_obligations_timeliness_check;
  alter table public.salary_payment_obligations
    add constraint salary_payment_obligations_timeliness_check
    check (timeliness in ('NOT_YET_PAID','PAID_ON_TIME','PAID_LATE','N/A'));
end $$;

create index if not exists salary_payment_obligations_employee_idx
  on public.salary_payment_obligations (employee_id, month_year);

create index if not exists salary_payment_obligations_status_idx
  on public.salary_payment_obligations (payment_status);

-- Child payment transactions (never hard-delete confirmed rows)
create table if not exists public.salary_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.salary_payment_obligations (id) on delete restrict,
  payroll_record_id uuid not null references public.payroll_slips (id) on delete restrict,
  amount numeric not null check (amount > 0),
  payment_mode text not null,
  initiated_at timestamptz not null,
  processed_at timestamptz,
  credited_at date,
  source_bank_account_ref text,
  masked_destination_account text,
  bank_transaction_reference text,
  transaction_status text not null default 'INITIATED',
  remarks text,
  supporting_evidence_path text,
  evidence_sha256 text,
  created_by text not null,
  confirmed_by text,
  created_at timestamptz not null default timezone('utc', now()),
  confirmed_at timestamptz,
  reversal_of_transaction_id uuid references public.salary_payment_transactions (id),
  reversal_reason text,
  cancelled_at timestamptz
);

do $$
begin
  alter table public.salary_payment_transactions
    drop constraint if exists salary_payment_transactions_status_check;
  alter table public.salary_payment_transactions
    add constraint salary_payment_transactions_status_check
    check (transaction_status in (
      'INITIATED','PROCESSING','SETTLED','CONFIRMED','FAILED',
      'REJECTED_BY_BANK','REVERSED','CANCELLED'
    ));
end $$;

create unique index if not exists salary_payment_transactions_utr_unique
  on public.salary_payment_transactions (upper(trim(bank_transaction_reference)))
  where bank_transaction_reference is not null
    and trim(bank_transaction_reference) <> ''
    and transaction_status <> 'CANCELLED';

create index if not exists salary_payment_transactions_obligation_idx
  on public.salary_payment_transactions (obligation_id, created_at);

-- Hold / deferral (requires reason category, explanation, dates, approval)
create table if not exists public.salary_payment_holds (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.salary_payment_obligations (id) on delete restrict,
  kind text not null check (kind in ('ON_HOLD','PAYMENT_DEFERRED')),
  reason_category text not null check (reason_category in (
    'BANK_ISSUE','COMPLIANCE_HOLD','EMPLOYEE_REQUEST','FUNDING_DELAY','DISPUTE','OTHER'
  )),
  detailed_explanation text not null,
  amount_affected numeric not null check (amount_affected > 0),
  revised_expected_date date not null,
  approving_user text not null,
  approval_timestamp timestamptz not null,
  employee_notification_timestamp timestamptz,
  evidence_path text,
  compliance_review_flag boolean not null default false,
  active boolean not null default true,
  released_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists salary_payment_holds_obligation_idx
  on public.salary_payment_holds (obligation_id, active);

-- Append-only payment audit (separate from payroll_audit_logs for clarity)
create table if not exists public.salary_payment_audit_events (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.salary_payment_obligations (id) on delete restrict,
  transaction_id uuid references public.salary_payment_transactions (id),
  action text not null,
  actor_user_id text not null,
  reason text,
  previous_values jsonb,
  new_values jsonb,
  emergency_override boolean not null default false,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists salary_payment_audit_obligation_idx
  on public.salary_payment_audit_events (obligation_id, created_at);

-- Expand Phase 2 payroll_slips.payment_status if that column exists
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payroll_slips'
      and column_name = 'payment_status'
  ) then
    update public.payroll_slips
    set payment_status = 'NOT_SCHEDULED'
    where payment_status = 'UNPAID';

    alter table public.payroll_slips
      drop constraint if exists payroll_slips_payment_status_check;
    alter table public.payroll_slips
      add constraint payroll_slips_payment_status_check
      check (payment_status in (
        'NOT_SCHEDULED','SCHEDULED','PROCESSING','PARTIALLY_PAID','PAID',
        'FAILED','REJECTED_BY_BANK','ON_HOLD','PAYMENT_DEFERRED','OVERDUE',
        'REVERSED','CANCELLED','UNDER_RECONCILIATION',
        -- legacy Phase 2 value retained temporarily if any row still has it
        'UNPAID'
      ));
  end if;
end $$;

-- RLS (anon open for current app auth posture; tighten with requirePayrollAdmin later)
alter table public.salary_payment_obligations enable row level security;
alter table public.salary_payment_transactions enable row level security;
alter table public.salary_payment_holds enable row level security;
alter table public.salary_payment_audit_events enable row level security;

drop policy if exists "Allow anon all obligations" on public.salary_payment_obligations;
create policy "Allow anon all obligations"
  on public.salary_payment_obligations for all using (true) with check (true);

drop policy if exists "Allow anon all payment txs" on public.salary_payment_transactions;
create policy "Allow anon all payment txs"
  on public.salary_payment_transactions for all using (true) with check (true);

drop policy if exists "Allow anon all payment holds" on public.salary_payment_holds;
create policy "Allow anon all payment holds"
  on public.salary_payment_holds for all using (true) with check (true);

drop policy if exists "Allow anon insert payment audit" on public.salary_payment_audit_events;
create policy "Allow anon insert payment audit"
  on public.salary_payment_audit_events for insert with check (true);

drop policy if exists "Allow anon read payment audit" on public.salary_payment_audit_events;
create policy "Allow anon read payment audit"
  on public.salary_payment_audit_events for select using (true);

drop policy if exists "Deny update payment audit" on public.salary_payment_audit_events;
create policy "Deny update payment audit"
  on public.salary_payment_audit_events for update using (false);

drop policy if exists "Deny delete payment audit" on public.salary_payment_audit_events;
create policy "Deny delete payment audit"
  on public.salary_payment_audit_events for delete using (false);

-- Prevent hard-delete of confirmed transactions via trigger
create or replace function public.prevent_delete_confirmed_payment_tx()
returns trigger
language plpgsql
as $$
begin
  if old.transaction_status in ('SETTLED','CONFIRMED','REVERSED') then
    raise exception 'CONFIRMED_PAYMENT_IMMUTABLE: confirmed payment transactions cannot be deleted';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_prevent_delete_confirmed_payment_tx on public.salary_payment_transactions;
create trigger trg_prevent_delete_confirmed_payment_tx
  before delete on public.salary_payment_transactions
  for each row execute function public.prevent_delete_confirmed_payment_tx();

comment on table public.salary_payment_obligations is
  'Parent salary-payment obligation per finalised payroll. FINAL payroll ≠ PAID.';
comment on table public.salary_payment_transactions is
  'Child payment transactions. Confirmed rows are never deleted — reverse instead.';
comment on column public.salary_payment_obligations.original_statutory_due_date is
  'Immutable statutory due date; reschedule writes revised_expected_date only.';
comment on column public.salary_payment_obligations.overdue_event_at is
  'Set on first overdue; never cleared by rescheduling.';
