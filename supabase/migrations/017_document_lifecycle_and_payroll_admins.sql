-- ============================================================================
-- 017_document_lifecycle_and_payroll_admins.sql
-- Slip status lifecycle: draft | final | superseded | voided
-- Session-proven elevated permission: payroll_admins membership
-- ============================================================================

-- Explicit lifecycle values on payroll_slips.status (was free text).
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

-- Audit columns for void
alter table public.payroll_slips
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by text,
  add column if not exists void_reason text;

comment on column public.payroll_slips.status is
  'Lifecycle: draft (replaceable), final (one active per employee-month), superseded, voided. Final/authorised are never hard-deleted.';

-- Repair rows that were superseded under the old half-written flow
-- (workflow_status=SUPERSEDED but status left as 'final').
update public.payroll_slips
set status = 'superseded'
where lower(coalesce(status, '')) = 'final'
  and upper(coalesce(workflow_status, '')) = 'SUPERSEDED';

-- Sync frozen payment_statements snapshot status when slip status changes
-- (application updates both; this is documentation of the contract).

-- Admins who may emergency-override maker-checker (server-checked only).
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
  'Users permitted for elevated payroll actions (e.g. maker-checker emergency override). Membership is checked server-side only — never a client checkbox.';

-- One draft per employee + month (partial unique).
create unique index if not exists payroll_slips_one_draft_employee_month_idx
  on public.payroll_slips (employee_id, month_year)
  where lower(status) = 'draft';
