-- ============================================================================
-- 012_payroll_cycle_schedules_documents.sql
-- Payroll integrity phase: attendance-cycle methods (≠ LOP divisor),
-- employee payment schedules, expanded payment/document statuses,
-- salary exception records, issued-document registry + verification IDs,
-- payment evidence versions. Additive only — no silent money rewrites.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. Payroll cycle methods (attendance window) — separate from LOP divisor
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_cycle_methods (
  code text primary key
    check (code in (
      'CALENDAR_MONTH',
      'PREVIOUS_25_TO_CURRENT_24',
      'PREVIOUS_24_TO_CURRENT_23',
      'CUSTOM_FIXED_CYCLE'
    )),
  label text not null,
  active boolean not null default true
);

insert into public.payroll_cycle_methods (code, label) values
  ('CALENDAR_MONTH', 'Calendar month (1st–last day)'),
  ('PREVIOUS_25_TO_CURRENT_24', 'Previous 25th through current 24th (default)'),
  ('PREVIOUS_24_TO_CURRENT_23', 'Previous 24th through current 23rd'),
  ('CUSTOM_FIXED_CYCLE', 'Custom fixed cycle (requires start/end day + policy)')
on conflict (code) do update set label = excluded.label;

create table if not exists public.payroll_cycle_policies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  label text not null,
  cycle_method text not null references public.payroll_cycle_methods (code),
  custom_start_day integer check (custom_start_day between 1 and 28),
  custom_end_day integer check (custom_end_day between 1 and 28),
  max_days integer not null default 31,
  exception_documented boolean not null default false,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.payroll_cycle_policies (code, label, cycle_method, notes)
values
  (
    'DEFAULT_25_24',
    'Company default 25→24 attendance cycle',
    'PREVIOUS_25_TO_CURRENT_24',
    'Salary month July 2026 uses attendance 25 Jun 2026 – 24 Jul 2026.'
  ),
  (
    'CALENDAR_DEFAULT',
    'Calendar-month attendance (explicit opt-in)',
    'CALENDAR_MONTH',
    'Only when employee or policy explicitly uses calendar month.'
  )
on conflict (code) do nothing;

alter table public.company_payroll_settings
  add column if not exists default_payroll_cycle_method text
    references public.payroll_cycle_methods (code),
  add column if not exists default_payroll_cycle_policy_id uuid
    references public.payroll_cycle_policies (id);

update public.company_payroll_settings
set default_payroll_cycle_method = coalesce(
  default_payroll_cycle_method,
  'PREVIOUS_25_TO_CURRENT_24'
);

-- Align LOP divisor codes with requirement names (keep legacy aliases)
alter table public.payroll_calculation_methods drop constraint if exists payroll_calculation_methods_code_check;

-- Allow legacy + requirement codes in the lookup table
do $$
begin
  -- Expand by inserting new preferred codes if constraint was only on insert-time check.
  -- Recreate explicit check covering both naming schemes.
  alter table public.payroll_calculation_methods
    add constraint payroll_calculation_methods_code_check
    check (code in (
      'CALENDAR_DAYS','CALENDAR_DAY_DIVISOR',
      'FIXED_30','FIXED_30_DAY_DIVISOR',
      'FIXED_26','FIXED_26_DAY_DIVISOR',
      'FIXED_25','FIXED_25_DAY_DIVISOR',
      'ACTUAL_WORKING_DAYS',
      'EMPLOYEE_CONTRACTUAL','EMPLOYEE_CONTRACTUAL_DIVISOR'
    ));
exception when duplicate_object then null;
end $$;

insert into public.payroll_calculation_methods (code, label, fixed_divisor, requires_working_days)
values
  ('FIXED_25_DAY_DIVISOR', 'LOP Calculation Basis: Fixed 25-day divisor', 25, false),
  ('FIXED_26_DAY_DIVISOR', 'LOP Calculation Basis: Fixed 26-day divisor', 26, false),
  ('FIXED_30_DAY_DIVISOR', 'LOP Calculation Basis: Fixed 30-day divisor', 30, false),
  ('CALENDAR_DAY_DIVISOR', 'LOP Calculation Basis: Calendar-day divisor', null, false),
  ('EMPLOYEE_CONTRACTUAL_DIVISOR', 'LOP Calculation Basis: Employee contractual divisor', null, true)
on conflict (code) do update
set label = excluded.label,
    fixed_divisor = excluded.fixed_divisor,
    requires_working_days = excluded.requires_working_days;

update public.payroll_calculation_methods
set label = 'LOP Calculation Basis: Fixed 25-day divisor'
where code = 'FIXED_25';

-- Policy / approval metadata on calculation methods assignment history
create table if not exists public.payroll_calculation_method_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees (id) on delete cascade,
  salary_structure_code text,
  calculation_method_code text not null references public.payroll_calculation_methods (code),
  divisor numeric,
  effective_from date not null,
  effective_to date,
  policy_reference text,
  approval_reference text,
  created_by text,
  created_at timestamptz not null default timezone('utc', now()),
  check (effective_to is null or effective_to >= effective_from)
);

create index if not exists payroll_calc_assign_emp_idx
  on public.payroll_calculation_method_assignments (employee_id, effective_from);

-- ---------------------------------------------------------------------------
-- B. Employee / compensation payment schedules
-- ---------------------------------------------------------------------------

create table if not exists public.employee_payment_schedules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  payment_schedule_type text not null
    check (payment_schedule_type in (
      'FIXED_DAY_OF_SUCCEEDING_MONTH',
      'MANUAL_PER_PAYROLL',
      'BOARD_APPROVED_EXECUTIVE_SCHEDULE',
      'CONTRACTUAL',
      'OTHER_APPROVED'
    )),
  preferred_payment_day integer check (preferred_payment_day between 1 and 28),
  default_payment_day integer check (default_payment_day between 1 and 28),
  payment_schedule_effective_from date not null,
  payment_schedule_effective_to date,
  payment_schedule_notes text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    payment_schedule_effective_to is null
    or payment_schedule_effective_to >= payment_schedule_effective_from
  )
);

create index if not exists employee_payment_schedules_emp_idx
  on public.employee_payment_schedules (employee_id, active, payment_schedule_effective_from);

alter table public.employees
  add column if not exists preferred_payment_day integer
    check (preferred_payment_day is null or preferred_payment_day between 1 and 28),
  add column if not exists default_payment_day integer
    check (default_payment_day is null or default_payment_day between 1 and 28),
  add column if not exists payment_schedule_type text
    check (
      payment_schedule_type is null
      or payment_schedule_type in (
        'FIXED_DAY_OF_SUCCEEDING_MONTH',
        'MANUAL_PER_PAYROLL',
        'BOARD_APPROVED_EXECUTIVE_SCHEDULE',
        'CONTRACTUAL',
        'OTHER_APPROVED'
      )
    ),
  add column if not exists payroll_cycle_method text
    references public.payroll_cycle_methods (code),
  add column if not exists payroll_cycle_policy_id uuid
    references public.payroll_cycle_policies (id);

-- ---------------------------------------------------------------------------
-- C. Payroll slip attendance-cycle + payment schedule columns
-- ---------------------------------------------------------------------------

alter table public.payroll_slips
  add column if not exists salary_month text,
  add column if not exists attendance_period_start date,
  add column if not exists attendance_period_end date,
  add column if not exists payroll_cycle_method text
    references public.payroll_cycle_methods (code),
  add column if not exists payroll_cycle_policy_id uuid
    references public.payroll_cycle_policies (id),
  add column if not exists attendance_cycle_override_reason text,
  add column if not exists original_due_date date,
  add column if not exists scheduled_payment_date date,
  add column if not exists revised_expected_payment_date date,
  add column if not exists transfer_initiated_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists actual_credit_date date,
  add column if not exists final_settlement_date date,
  add column if not exists legal_entity_id text,
  add column if not exists supersedes_document_id uuid,
  add column if not exists correction_reason text,
  add column if not exists revision_number integer not null default 1;

-- Backfill salary_month from month_year where empty
update public.payroll_slips
set salary_month = coalesce(salary_month, month_year)
where salary_month is null;

-- Expand workflow statuses toward FINALISED alias (retain FINAL)
do $$
begin
  alter table public.payroll_slips
    drop constraint if exists payroll_slips_workflow_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_workflow_status_check
    check (workflow_status in (
      'DRAFT','CALCULATED','REVIEWED','APPROVED','FINALISED','FINAL',
      'PAYMENT_PENDING','PAID','CANCELLED','SUPERSEDED'
    ));
end $$;

-- Expand payment statuses
do $$
begin
  alter table public.payroll_slips
    drop constraint if exists payroll_slips_payment_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_payment_status_check
    check (payment_status in (
      'NOT_SCHEDULED','SCHEDULED','PROCESSING','PARTIALLY_PAID','PAID',
      'PAYMENT_DEFERRED','ON_HOLD','OVERDUE','FAILED','REJECTED_BY_BANK',
      'REVERSED','CANCELLED','UNDER_RECONCILIATION','NO_SALARY_DUE',
      'SALARY_WAIVED','UNPAID'
    ));
end $$;

-- One active final per employee + salary month + legal entity (when legal_entity set)
create unique index if not exists payroll_slips_one_active_final_entity_idx
  on public.payroll_slips (
    employee_id,
    (coalesce(salary_month, month_year)),
    (coalesce(legal_entity_id, ''))
  )
  where active_final = true;

-- ---------------------------------------------------------------------------
-- D. Obligation extensions (schedule dates + exception statuses)
-- ---------------------------------------------------------------------------

alter table public.salary_payment_obligations
  add column if not exists original_due_date date,
  add column if not exists scheduled_payment_date date,
  add column if not exists transfer_initiated_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists final_settlement_date date,
  add column if not exists exception_kind text
    check (
      exception_kind is null
      or exception_kind in (
        'NO_SALARY_DUE','SALARY_WAIVED','SALARY_DEFERRED','PAYMENT_ON_HOLD','PARTIALLY_PAID'
      )
    ),
  add column if not exists exception_reason text,
  add column if not exists exception_approval_reference text,
  add column if not exists exception_approved_by text,
  add column if not exists exception_approved_at timestamptz,
  add column if not exists exception_evidence_path text,
  add column if not exists tax_accounting_review_status text;

update public.salary_payment_obligations
set original_due_date = coalesce(original_due_date, original_statutory_due_date)
where original_due_date is null;

do $$
begin
  alter table public.salary_payment_obligations
    drop constraint if exists salary_payment_obligations_payment_status_check;
  alter table public.salary_payment_obligations
    add constraint salary_payment_obligations_payment_status_check
    check (payment_status in (
      'NOT_SCHEDULED','SCHEDULED','PROCESSING','PARTIALLY_PAID','PAID',
      'PAYMENT_DEFERRED','ON_HOLD','OVERDUE','FAILED','REJECTED_BY_BANK',
      'REVERSED','CANCELLED','UNDER_RECONCILIATION','NO_SALARY_DUE','SALARY_WAIVED'
    ));

  alter table public.salary_payment_obligations
    drop constraint if exists salary_payment_obligations_document_status_check;
  alter table public.salary_payment_obligations
    add constraint salary_payment_obligations_document_status_check
    check (document_status in (
      'NOT_READY','INTERNAL_AVAILABLE','PARTIAL_ADVICE_ALLOWED',
      'OUTSTANDING_STATEMENT_ALLOWED','AUTHORISED_BLOCKED',
      'AUTHORISED_ELIGIBLE','AUTHORISED_ISSUED',
      'DRAFT','ISSUED','SUPERSEDED','REVOKED','CANCELLED','LEGACY_UNVERIFIED'
    ));
end $$;

-- Expand hold reason categories
do $$
begin
  alter table public.salary_payment_holds
    drop constraint if exists salary_payment_holds_reason_category_check;
  alter table public.salary_payment_holds
    add constraint salary_payment_holds_reason_category_check
    check (reason_category in (
      'BANK_ISSUE','BANK_DETAILS_PENDING','BANK_TRANSFER_FAILED',
      'COMPLIANCE_HOLD','EMPLOYEE_REQUEST','FUNDING_DELAY',
      'INTERNAL_FINANCIAL_DELAY','PAYROLL_DISPUTE','DISPUTE',
      'EXIT_SETTLEMENT_REVIEW','STATUTORY_OR_COURT_DIRECTION','OTHER'
    ));
end $$;

-- Expand transaction statuses
do $$
begin
  alter table public.salary_payment_transactions
    drop constraint if exists salary_payment_transactions_status_check;
  alter table public.salary_payment_transactions
    add constraint salary_payment_transactions_status_check
    check (transaction_status in (
      'DRAFT','INITIATED','PROCESSING','SETTLED','CONFIRMED','FAILED',
      'REJECTED','REJECTED_BY_BANK','REVERSED','CANCELLED','PENDING_CONFIRMATION'
    ));
end $$;

alter table public.salary_payment_transactions
  add column if not exists evidence_uploaded_at timestamptz,
  add column if not exists evidence_uploaded_by text;

-- ---------------------------------------------------------------------------
-- E. Salary exception records (no salary / waiver / deferred statements)
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_salary_exceptions (
  id uuid primary key default gen_random_uuid(),
  payroll_record_id uuid references public.payroll_slips (id) on delete restrict,
  obligation_id uuid references public.salary_payment_obligations (id) on delete restrict,
  employee_id text not null,
  salary_month text not null,
  exception_kind text not null
    check (exception_kind in (
      'NO_SALARY_DUE','SALARY_WAIVED','SALARY_DEFERRED','PAYMENT_ON_HOLD'
    )),
  reason text not null,
  approval_basis text,
  approving_authority text not null,
  amount_waived numeric,
  original_amount_due numeric,
  original_due_date date,
  revised_expected_date date,
  date_approved date,
  tax_accounting_review_status text,
  employee_acknowledgement_at timestamptz,
  evidence_path text,
  evidence_sha256 text,
  supporting_document_path text,
  created_by text not null,
  created_at timestamptz not null default timezone('utc', now()),
  active boolean not null default true
);

create index if not exists payroll_salary_exceptions_emp_month_idx
  on public.payroll_salary_exceptions (employee_id, salary_month, active);

-- ---------------------------------------------------------------------------
-- F. Payment evidence versions (never overwrite prior)
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  obligation_id uuid not null references public.salary_payment_obligations (id) on delete restrict,
  transaction_id uuid references public.salary_payment_transactions (id),
  storage_path text not null,
  sha256 text not null,
  uploaded_by text not null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  content_type text,
  file_name text,
  notes text,
  supersedes_evidence_id uuid references public.payroll_payment_evidence (id),
  active boolean not null default true
);

create index if not exists payroll_payment_evidence_obligation_idx
  on public.payroll_payment_evidence (obligation_id, uploaded_at desc);

-- ---------------------------------------------------------------------------
-- G. Issued payroll documents + public verification
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_issued_documents (
  id uuid primary key default gen_random_uuid(),
  payroll_record_id uuid not null references public.payroll_slips (id) on delete restrict,
  obligation_id uuid references public.salary_payment_obligations (id),
  document_type text not null
    check (document_type in (
      'INTERNAL_PAY_SLIP',
      'AUTHORISED_SALARY_SLIP',
      'SALARY_PAYMENT_ADVICE_PARTIALLY_PAID',
      'OUTSTANDING_SALARY_STATEMENT',
      'DEFERRED_SALARY_STATEMENT',
      'NO_SALARY_DRAWN_STATEMENT',
      'SALARY_WAIVER_RECORD'
    )),
  document_number text not null unique,
  revision_number integer not null default 1,
  document_status text not null default 'DRAFT'
    check (document_status in (
      'DRAFT','ISSUED','SUPERSEDED','REVOKED','CANCELLED','LEGACY_UNVERIFIED'
    )),
  public_verification_id text not null unique,
  verification_fingerprint text,
  content_hash text,
  salary_month text not null,
  attendance_period_start date,
  attendance_period_end date,
  net_salary numeric,
  actual_credit_date date,
  issue_date date,
  supersedes_document_id uuid references public.payroll_issued_documents (id),
  correction_reason text,
  signatory_name text,
  signatory_designation text,
  snapshot_json jsonb not null default '{}'::jsonb,
  issued_by text,
  issued_at timestamptz,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists payroll_issued_documents_payroll_idx
  on public.payroll_issued_documents (payroll_record_id, document_type);

create unique index if not exists payroll_issued_documents_one_active_authorised_idx
  on public.payroll_issued_documents (payroll_record_id)
  where document_type = 'AUTHORISED_SALARY_SLIP'
    and document_status = 'ISSUED';

-- Controlled signatory registry (optional; settings jsonb remains source of truth for now)
create table if not exists public.authorised_signatories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  signatory_name text not null,
  signatory_designation text not null,
  signatory_authority_type text not null default 'DIRECTOR',
  signature_asset_path text,
  seal_asset_path text,
  authority_effective_from date not null,
  authority_effective_to date,
  approval_reference text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.payroll_cycle_methods enable row level security;
alter table public.payroll_cycle_policies enable row level security;
alter table public.payroll_calculation_method_assignments enable row level security;
alter table public.employee_payment_schedules enable row level security;
alter table public.payroll_salary_exceptions enable row level security;
alter table public.payroll_payment_evidence enable row level security;
alter table public.payroll_issued_documents enable row level security;
alter table public.authorised_signatories enable row level security;

drop policy if exists "Allow anon read cycle methods" on public.payroll_cycle_methods;
create policy "Allow anon read cycle methods"
  on public.payroll_cycle_methods for select using (true);

drop policy if exists "Allow anon all cycle policies" on public.payroll_cycle_policies;
create policy "Allow anon all cycle policies"
  on public.payroll_cycle_policies for all using (true) with check (true);

drop policy if exists "Allow anon all calc assignments" on public.payroll_calculation_method_assignments;
create policy "Allow anon all calc assignments"
  on public.payroll_calculation_method_assignments for all using (true) with check (true);

drop policy if exists "Allow anon all payment schedules" on public.employee_payment_schedules;
create policy "Allow anon all payment schedules"
  on public.employee_payment_schedules for all using (true) with check (true);

drop policy if exists "Allow anon all salary exceptions" on public.payroll_salary_exceptions;
create policy "Allow anon all salary exceptions"
  on public.payroll_salary_exceptions for all using (true) with check (true);

drop policy if exists "Allow anon all payment evidence" on public.payroll_payment_evidence;
create policy "Allow anon all payment evidence"
  on public.payroll_payment_evidence for all using (true) with check (true);

drop policy if exists "Allow anon all issued documents" on public.payroll_issued_documents;
create policy "Allow anon all issued documents"
  on public.payroll_issued_documents for all using (true) with check (true);

drop policy if exists "Allow anon all signatories" on public.authorised_signatories;
create policy "Allow anon all signatories"
  on public.authorised_signatories for all using (true) with check (true);

-- Public verify needs select on issued documents (already covered by anon all; tighten later)
comment on table public.payroll_cycle_methods is
  'Attendance-cycle methods. Independent from LOP calculation divisor methods.';
comment on table public.payroll_issued_documents is
  'Issued internal / authorised / exception documents with secure public_verification_id.';
comment on column public.payroll_slips.attendance_period_start is
  'Server-computed attendance cycle start; never infer solely in the browser.';
comment on column public.payroll_slips.payroll_divisor is
  'LOP / salary-calculation divisor — not the attendance cycle length.';
