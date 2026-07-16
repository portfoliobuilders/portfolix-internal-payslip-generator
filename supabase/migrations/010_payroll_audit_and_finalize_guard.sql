-- ============================================================================
-- 010_payroll_audit_and_finalize_guard.sql
-- Phase 2: append-only audit log + DB helper that blocks duplicate active finals.
-- Full atomic finalize RPC is expanded in later phases; this guards integrity basics.
-- ============================================================================

create table if not exists public.payroll_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  previous_values jsonb,
  new_values jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists payroll_audit_logs_entity_idx
  on public.payroll_audit_logs (entity_type, entity_id, created_at desc);

create index if not exists payroll_audit_logs_action_idx
  on public.payroll_audit_logs (action, created_at desc);

alter table public.payroll_audit_logs enable row level security;

drop policy if exists "Allow anon insert audit logs" on public.payroll_audit_logs;
create policy "Allow anon insert audit logs"
  on public.payroll_audit_logs for insert
  with check (true);

drop policy if exists "Allow anon read audit logs" on public.payroll_audit_logs;
create policy "Allow anon read audit logs"
  on public.payroll_audit_logs for select
  using (true);

-- Prevent updates/deletes for standard roles (service role bypasses RLS).
drop policy if exists "Deny update audit logs" on public.payroll_audit_logs;
create policy "Deny update audit logs"
  on public.payroll_audit_logs for update
  using (false);

drop policy if exists "Deny delete audit logs" on public.payroll_audit_logs;
create policy "Deny delete audit logs"
  on public.payroll_audit_logs for delete
  using (false);

-- Helper: assert no other active FINAL exists for employee+month (excluding self).
create or replace function public.assert_no_duplicate_active_final(
  p_employee_id text,
  p_month_year text,
  p_except_id uuid default null
) returns void
language plpgsql
as $$
declare
  conflict_id uuid;
begin
  select id into conflict_id
  from public.payroll_slips
  where employee_id = p_employee_id
    and month_year = p_month_year
    and active_final = true
    and (p_except_id is null or id <> p_except_id)
  limit 1;

  if conflict_id is not null then
    raise exception 'DUPLICATE_FINAL: active FINAL already exists for % % (id=%)',
      p_employee_id, p_month_year, conflict_id
      using errcode = '23505';
  end if;
end;
$$;

comment on table public.payroll_audit_logs is
  'Append-only payroll audit trail. Standard roles cannot update/delete.';
comment on function public.assert_no_duplicate_active_final is
  'Raises on duplicate active FINAL for employee+month. Call before inserting a new active FINAL.';
