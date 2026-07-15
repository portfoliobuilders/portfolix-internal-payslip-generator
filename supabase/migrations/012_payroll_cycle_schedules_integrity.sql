-- ============================================================================
-- 012_payroll_cycle_schedules_integrity.sql
-- Phase 3: attendance-cycle model, employee payment schedules, salary
-- waiver / no-salary / deferred records, document lifecycle columns,
-- verification identifiers, expanded hold reasons. Additive only —
-- does not rewrite legacy money or invent payment evidence.
-- ============================================================================

-- ── Payroll cycle method catalogue ───────────────────────────────────────────
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
  ('CALENDAR_MONTH', 'Calendar month (1st–last)'),
  ('PREVIOUS_25_TO_CURRENT_24', '25th previous month through 24th of salary month'),
  ('PREVIOUS_24_TO_CURRENT_23', '24th previous month through 23rd of salary month'),
  ('CUSTOM_FIXED_CYCLE', 'Custom fixed cycle (requires explicit dates)')
on conflict (code) do update set label = excluded.label;

alter table public.payroll_cycle_methods enable row level security;
drop policy if exists "Allow anon read payroll_cycle_methods" on public.payroll_cycle_methods;
create policy "Allow anon read payroll_cycle_methods"
  on public.payroll_cycle_methods for select using (true);

-- Optional named policies (company-level defaults / exceptions)
create table if not exists public.payroll_cycle_policies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  cycle_method text not null references public.payroll_cycle_methods (code),
  custom_start_day integer,
  custom_end_day integer,
  allow_multi_month_exception boolean not null default false,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.payroll_cycle_policies enable row level security;
drop policy if exists "Allow anon all payroll_cycle_policies" on public.payroll_cycle_policies;
create policy "Allow anon all payroll_cycle_policies"
  on public.payroll_cycle_policies for all using (true) with check (true);

-- Seed default Portfolix 25→24 policy
insert into public.payroll_cycle_policies (id, name, cycle_method, notes)
select
  'a0000000-0000-4000-8000-000000000024'::uuid,
  'Portfolix default (25 previous – 24 current)',
  'PREVIOUS_25_TO_CURRENT_24',
  'Company attendance/payroll cut-off on the 24th.'
where not exists (
  select 1 from public.payroll_cycle_policies
  where cycle_method = 'PREVIOUS_25_TO_CURRENT_24' and name like 'Portfolix default%'
);

-- ── Employee payment schedules + cycle assignment ────────────────────────────
alter table public.employees
  add column if not exists payroll_cycle_method text
    references public.payroll_cycle_methods (code),
  add column if not exists payroll_cycle_policy_id uuid
    references public.payroll_cycle_policies (id),
  add column if not exists preferred_payment_day integer,
  add column if not exists default_payment_day integer,
  add column if not exists payment_schedule_type text,
  add column if not exists payment_schedule_effective_from date,
  add column if not exists payment_schedule_effective_to date,
  add column if not exists payment_schedule_notes text;

do $$
begin
  alter table public.employees
    drop constraint if exists employees_payment_schedule_type_check;
  alter table public.employees
    add constraint employees_payment_schedule_type_check
    check (
      payment_schedule_type is null or payment_schedule_type in (
        'FIXED_DAY_OF_SUCCEEDING_MONTH',
        'MANUAL_PER_PAYROLL',
        'BOARD_APPROVED_EXECUTIVE_SCHEDULE',
        'CONTRACTUAL',
        'OTHER_APPROVED'
      )
    );
end $$;

update public.employees
set
  payroll_cycle_method = coalesce(payroll_cycle_method, 'PREVIOUS_25_TO_CURRENT_24'),
  default_payment_day = coalesce(default_payment_day, preferred_payment_day, 5),
  preferred_payment_day = coalesce(preferred_payment_day, default_payment_day, 5),
  payment_schedule_type = coalesce(payment_schedule_type, 'FIXED_DAY_OF_SUCCEEDING_MONTH')
where payroll_cycle_method is null
   or payment_schedule_type is null;

-- ── Calculation method aliases (expand catalogue; keep legacy codes) ─────────
alter table public.payroll_calculation_methods drop constraint if exists payroll_calculation_methods_code_check;

do $$
begin
  -- Recreate loose check including both legacy and required names
  alter table public.payroll_calculation_methods
    drop constraint if exists payroll_calculation_methods_code_check;
  alter table public.payroll_calculation_methods
    add constraint payroll_calculation_methods_code_check
    check (code in (
      'CALENDAR_DAYS', 'CALENDAR_DAY_DIVISOR',
      'FIXED_30', 'FIXED_30_DAY_DIVISOR',
      'FIXED_26', 'FIXED_26_DAY_DIVISOR',
      'FIXED_25', 'FIXED_25_DAY_DIVISOR',
      'ACTUAL_WORKING_DAYS',
      'EMPLOYEE_CONTRACTUAL', 'EMPLOYEE_CONTRACTUAL_DIVISOR'
    ));
exception when others then
  -- Table may use PK only; insert aliases anyway
  null;
end $$;

insert into public.payroll_calculation_methods (code, label, fixed_divisor, requires_working_days)
values
  ('FIXED_25_DAY_DIVISOR', 'Fixed 25-day divisor (LOP basis)', 25, false),
  ('FIXED_26_DAY_DIVISOR', 'Fixed 26-day divisor (LOP basis)', 26, false),
  ('FIXED_30_DAY_DIVISOR', 'Fixed 30-day divisor (LOP basis)', 30, false),
  ('CALENDAR_DAY_DIVISOR', 'Calendar-day divisor (LOP basis)', null, false),
  ('EMPLOYEE_CONTRACTUAL_DIVISOR', 'Employee contractual divisor', null, true)
on conflict (code) do update
set label = excluded.label,
    fixed_divisor = excluded.fixed_divisor,
    requires_working_days = excluded.requires_working_days;

-- Policy assignment metadata for calculation methods (optional)
create table if not exists public.payroll_calculation_method_assignments (
  id uuid primary key default gen_random_uuid(),
  calculation_method_code text not null references public.payroll_calculation_methods (code),
  divisor numeric,
  effective_from date not null,
  effective_to date,
  policy_reference text,
  approval_reference text,
  employee_id text,
  salary_structure_ref text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.payroll_calculation_method_assignments enable row level security;
drop policy if exists "Allow anon all calc_method_assignments" on public.payroll_calculation_method_assignments;
create policy "Allow anon all calc_method_assignments"
  on public.payroll_calculation_method_assignments for all using (true) with check (true);

-- ── payroll_slips: cycle + payment date dimensions + document statuses ───────
alter table public.payroll_slips
  add column if not exists salary_month text,
  add column if not exists attendance_period_start date,
  add column if not exists attendance_period_end date,
  add column if not exists payroll_cycle_method text
    references public.payroll_cycle_methods (code),
  add column if not exists payroll_cycle_policy_id uuid
    references public.payroll_cycle_policies (id),
  add column if not exists cycle_override_reason text,
  add column if not exists original_due_date date,
  add column if not exists scheduled_payment_date date,
  add column if not exists revised_expected_payment_date date,
  add column if not exists transfer_initiated_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists actual_credit_date date,
  add column if not exists final_settlement_date date,
  add column if not exists internal_document_status text not null default 'DRAFT',
  add column if not exists authorised_document_status text not null default 'DRAFT',
  add column if not exists internal_document_number text,
  add column if not exists authorised_document_number text,
  add column if not exists revision_number integer not null default 1,
  add column if not exists public_verification_id text,
  add column if not exists verification_fingerprint text,
  add column if not exists supersedes_document_id uuid,
  add column if not exists correction_reason text,
  add column if not exists legal_entity_id text;

-- Backfill salary_month from month_year for existing rows
update public.payroll_slips
set salary_month = coalesce(salary_month, month_year)
where salary_month is null;

do $$
begin
  alter table public.payroll_slips
    drop constraint if exists payroll_slips_workflow_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_workflow_status_check
    check (workflow_status in (
      'DRAFT','CALCULATED','REVIEWED','APPROVED','PAYMENT_PENDING',
      'PAID','FINAL','FINALISED','CANCELLED','SUPERSEDED'
    ));

  alter table public.payroll_slips
    drop constraint if exists payroll_slips_payment_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_payment_status_check
    check (payment_status in (
      'NOT_SCHEDULED','SCHEDULED','PROCESSING','PARTIALLY_PAID','PAID',
      'FAILED','REJECTED_BY_BANK','ON_HOLD','PAYMENT_DEFERRED','OVERDUE',
      'REVERSED','CANCELLED','UNDER_RECONCILIATION','UNPAID',
      'NO_SALARY_DUE','SALARY_WAIVED'
    ));

  alter table public.payroll_slips
    drop constraint if exists payroll_slips_internal_document_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_internal_document_status_check
    check (internal_document_status in (
      'DRAFT','ISSUED','SUPERSEDED','REVOKED','CANCELLED','LEGACY_UNVERIFIED'
    ));

  alter table public.payroll_slips
    drop constraint if exists payroll_slips_authorised_document_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_authorised_document_status_check
    check (authorised_document_status in (
      'DRAFT','ISSUED','SUPERSEDED','REVOKED','CANCELLED','LEGACY_UNVERIFIED'
    ));
end $$;

-- Mark legacy issued docs as LEGACY_UNVERIFIED for document status when final
update public.payroll_slips
set
  internal_document_status = case
    when lower(coalesce(status, 'draft')) = 'final' then 'LEGACY_UNVERIFIED'
    else coalesce(internal_document_status, 'DRAFT')
  end
where server_computed_at is null
  and coalesce(integrity_status, 'OK') = 'LEGACY_UNVERIFIED';

-- One active final per employee + salary month + legal entity (when entity set)
create unique index if not exists payroll_slips_one_active_final_entity_idx
  on public.payroll_slips (employee_id, coalesce(salary_month, month_year), coalesce(legal_entity_id, ''))
  where active_final = true;

create unique index if not exists payroll_slips_public_verification_id_uq
  on public.payroll_slips (public_verification_id)
  where public_verification_id is not null;

-- ── Expand obligation payment statuses ───────────────────────────────────────
do $$
begin
  alter table public.salary_payment_obligations
    drop constraint if exists salary_payment_obligations_payment_status_check;
  alter table public.salary_payment_obligations
    add constraint salary_payment_obligations_payment_status_check
    check (payment_status in (
      'NOT_SCHEDULED','SCHEDULED','PROCESSING','PARTIALLY_PAID','PAID',
      'FAILED','REJECTED_BY_BANK','ON_HOLD','PAYMENT_DEFERRED','OVERDUE',
      'REVERSED','CANCELLED','UNDER_RECONCILIATION',
      'NO_SALARY_DUE','SALARY_WAIVED'
    ));
end $$;

alter table public.salary_payment_obligations
  add column if not exists transfer_initiated_at timestamptz,
  add column if not exists processed_at timestamptz,
  add column if not exists final_settlement_date date,
  add column if not exists paid_late_indicator boolean not null default false,
  add column if not exists paid_on_time_indicator boolean not null default false;

-- Transaction status expansion + evidence versioning helpers
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
  add column if not exists evidence_uploaded_by text,
  add column if not exists evidence_version integer not null default 1;

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

alter table public.salary_payment_holds
  add column if not exists original_due_date date,
  add column if not exists follow_up_date date,
  add column if not exists compliance_review_status text;

-- ── Salary exception records (no salary / waiver / deferral statements) ──────
create table if not exists public.salary_exception_records (
  id uuid primary key default gen_random_uuid(),
  payroll_record_id uuid references public.payroll_slips (id) on delete restrict,
  employee_id text not null,
  salary_month text not null,
  exception_kind text not null check (exception_kind in (
    'NO_SALARY_DUE','SALARY_WAIVED','SALARY_DEFERRED','PAYMENT_ON_HOLD','PARTIALLY_PAID'
  )),
  reason text not null,
  approval_basis text,
  approving_authority text,
  amount_waived numeric,
  amount_deferred numeric,
  original_amount_due numeric,
  original_due_date date,
  revised_expected_date date,
  date_approved date,
  tax_accounting_review_status text,
  employee_acknowledgement_at timestamptz,
  evidence_path text,
  evidence_sha256 text,
  supporting_document_path text,
  notes text,
  created_by text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists salary_exception_records_employee_idx
  on public.salary_exception_records (employee_id, salary_month);

alter table public.salary_exception_records enable row level security;
drop policy if exists "Allow anon all salary_exception_records" on public.salary_exception_records;
create policy "Allow anon all salary_exception_records"
  on public.salary_exception_records for all using (true) with check (true);

-- Payment evidence versions (preserve prior uploads)
create table if not exists public.payroll_payment_evidence (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.salary_payment_transactions (id) on delete restrict,
  obligation_id uuid not null references public.salary_payment_obligations (id) on delete restrict,
  evidence_path text not null,
  evidence_hash text not null,
  version integer not null default 1,
  uploaded_by text not null,
  uploaded_at timestamptz not null default timezone('utc', now()),
  remarks text
);

alter table public.payroll_payment_evidence enable row level security;
drop policy if exists "Allow anon all payroll_payment_evidence" on public.payroll_payment_evidence;
create policy "Allow anon all payroll_payment_evidence"
  on public.payroll_payment_evidence for all using (true) with check (true);

-- Payment approvals (maker-checker explicit rows)
create table if not exists public.payroll_payment_approvals (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.salary_payment_transactions (id) on delete restrict,
  obligation_id uuid not null references public.salary_payment_obligations (id) on delete restrict,
  approval_kind text not null check (approval_kind in (
    'CONFIRM_PAYMENT','REVERSE_PAYMENT','HOLD','DEFER','RESCHEDULE',
    'WAIVER','NO_SALARY','EMERGENCY_OVERRIDE'
  )),
  approved_by text not null,
  approved_at timestamptz not null default timezone('utc', now()),
  reason text,
  emergency_override boolean not null default false
);

alter table public.payroll_payment_approvals enable row level security;
drop policy if exists "Allow anon all payroll_payment_approvals" on public.payroll_payment_approvals;
create policy "Allow anon all payroll_payment_approvals"
  on public.payroll_payment_approvals for all using (true) with check (true);

-- Company identity (central — documents must not hardcode)
create table if not exists public.company_identity (
  id integer primary key default 1 check (id = 1),
  legal_name text not null,
  cin text,
  registered_office text,
  corporate_office text,
  payroll_email text,
  official_phone text,
  verification_domain text,
  logo_asset_path text,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.company_identity (
  id, legal_name, cin, registered_office, payroll_email, official_phone, verification_domain
) values (
  1,
  'PORTFOLIX ENTREPRISE PRIVATE LIMITED',
  null,
  null,
  null,
  null,
  null
) on conflict (id) do update
  set legal_name = excluded.legal_name;

alter table public.company_identity enable row level security;
drop policy if exists "Allow anon read company_identity" on public.company_identity;
create policy "Allow anon read company_identity"
  on public.company_identity for select using (true);
drop policy if exists "Allow anon write company_identity" on public.company_identity;
create policy "Allow anon write company_identity"
  on public.company_identity for all using (true) with check (true);

-- Authorised signatory registry
create table if not exists public.authorised_signatories (
  id uuid primary key default gen_random_uuid(),
  legal_entity_id text,
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

alter table public.authorised_signatories enable row level security;
drop policy if exists "Allow anon all authorised_signatories" on public.authorised_signatories;
create policy "Allow anon all authorised_signatories"
  on public.authorised_signatories for all using (true) with check (true);

comment on table public.payroll_cycle_methods is
  'Attendance/payroll cut-off cycle methods. Distinct from LOP divisor methods.';
comment on column public.payroll_slips.attendance_period_start is
  'Server-computed attendance cycle start; do not infer in the browser.';
comment on column public.payroll_slips.attendance_period_end is
  'Server-computed attendance cycle end; finalisation blocked before this date.';
comment on column public.payroll_slips.public_verification_id is
  'Cryptographically unpredictable public verification id for authorised slips.';
comment on table public.salary_exception_records is
  'Formal no-salary / waiver / deferral records — never equate these to paid.';
