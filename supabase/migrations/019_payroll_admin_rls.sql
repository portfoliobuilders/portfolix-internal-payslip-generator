-- ============================================================================
-- 019_payroll_admin_rls.sql
-- Restrict authenticated PostgREST access to payroll_admins members only.
-- Middleware still requires a session; this closes the gap where any signed-in
-- user could CRUD payroll tables via the browser anon/publishable key.
-- Service role (server actions / verify) bypasses RLS as before.
-- ============================================================================

create or replace function public.is_payroll_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.payroll_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_payroll_admin() from public;
grant execute on function public.is_payroll_admin() to authenticated;
grant execute on function public.is_payroll_admin() to service_role;

comment on function public.is_payroll_admin() is
  'True when auth.uid() is listed in payroll_admins. Used by RLS policies.';

do $$
declare
  t text;
  tables text[] := array[
    'employees',
    'payroll_slips',
    'app_settings',
    'company_settings',
    'authorised_slip_log',
    'companies',
    'company_payroll_settings',
    'employee_employment_history',
    'payment_statements',
    'workforce_events',
    'person_documents',
    'payroll_audit_logs',
    'salary_payment_obligations',
    'salary_payment_transactions',
    'salary_payment_holds',
    'salary_payment_audit_events',
    'payroll_cycle_policies',
    'payroll_calculation_method_assignments',
    'employee_payment_schedules',
    'payroll_salary_exceptions',
    'salary_exception_records',
    'payroll_payment_evidence',
    'payroll_payment_approvals',
    'authorised_signatories',
    'company_identity',
    'verification_hits'
  ];
begin
  foreach t in array tables
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "authenticated_all_%s" on public.%I', t, t);
      execute format('drop policy if exists "payroll_admin_all_%s" on public.%I', t, t);
      execute format(
        'create policy "payroll_admin_all_%s" on public.%I for all to authenticated using (public.is_payroll_admin()) with check (public.is_payroll_admin())',
        t, t
      );
    end if;
  end loop;
end $$;

-- Reference method tables: payroll admins may read.
do $$
declare
  t text;
  tables text[] := array[
    'payroll_cycle_methods',
    'payroll_calculation_methods'
  ];
begin
  foreach t in array tables
  loop
    if exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter table public.%I enable row level security', t);
      execute format('drop policy if exists "authenticated_read_%s" on public.%I', t, t);
      execute format('drop policy if exists "payroll_admin_read_%s" on public.%I', t, t);
      execute format(
        'create policy "payroll_admin_read_%s" on public.%I for select to authenticated using (public.is_payroll_admin())',
        t, t
      );
    end if;
  end loop;
end $$;

-- Branding storage: payroll admins only.
drop policy if exists "authenticated_branding_select" on storage.objects;
drop policy if exists "authenticated_branding_insert" on storage.objects;
drop policy if exists "authenticated_branding_update" on storage.objects;
drop policy if exists "authenticated_branding_delete" on storage.objects;
drop policy if exists "payroll_admin_branding_select" on storage.objects;
drop policy if exists "payroll_admin_branding_insert" on storage.objects;
drop policy if exists "payroll_admin_branding_update" on storage.objects;
drop policy if exists "payroll_admin_branding_delete" on storage.objects;

create policy "payroll_admin_branding_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'branding' and public.is_payroll_admin());

create policy "payroll_admin_branding_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'branding' and public.is_payroll_admin());

create policy "payroll_admin_branding_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'branding' and public.is_payroll_admin())
  with check (bucket_id = 'branding' and public.is_payroll_admin());

create policy "payroll_admin_branding_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'branding' and public.is_payroll_admin());
