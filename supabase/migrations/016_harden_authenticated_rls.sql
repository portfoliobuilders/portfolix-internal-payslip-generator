-- ============================================================================
-- 016_harden_authenticated_rls.sql
-- Apply authenticated-only RLS for payroll data + close company_settings / branding gaps.
-- Public /verify stays on service-role server actions (no anon SELECT on issued docs).
-- ============================================================================

-- Drop any policy that targets anon (by name, roles, or expression).
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and (
        policyname ilike '%anon%'
        or qual ilike '%anon%'
        or with_check ilike '%anon%'
        or 'anon' = any (roles)
        or 'public' = any (roles)
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Explicitly drop known open company_settings policies (names lack "anon").
drop policy if exists "Allow read company settings" on public.company_settings;
drop policy if exists "Allow write company settings" on public.company_settings;
drop policy if exists "Allow update company settings" on public.company_settings;

-- Core payroll tables: authenticated full access (internal HR tool).
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
      execute format(
        'create policy "authenticated_all_%s" on public.%I for all to authenticated using (true) with check (true)',
        t, t
      );
    end if;
  end loop;
end $$;

-- Read-only reference tables for authenticated users.
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
      execute format(
        'create policy "authenticated_read_%s" on public.%I for select to authenticated using (true)',
        t, t
      );
    end if;
  end loop;
end $$;

-- Issued documents + registry: service-role only (no anon/authenticated policies).
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payroll_issued_documents'
  loop
    execute format('drop policy if exists %I on public.payroll_issued_documents', r.policyname);
  end loop;
end $$;

alter table public.payroll_issued_documents enable row level security;

-- payroll_admins: members may read their own row; writes via service role / SQL only.
alter table public.payroll_admins enable row level security;
drop policy if exists payroll_admins_select_authenticated on public.payroll_admins;
create policy payroll_admins_select_authenticated
  on public.payroll_admins
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Branding storage: authenticated only (was open to public/anon).
do $$
declare
  r record;
begin
  for r in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike '%public%'
        or policyname ilike '%anon%'
        or coalesce(qual, '') ilike '%branding%'
        or coalesce(with_check, '') ilike '%branding%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

drop policy if exists "authenticated_branding_select" on storage.objects;
drop policy if exists "authenticated_branding_insert" on storage.objects;
drop policy if exists "authenticated_branding_update" on storage.objects;
drop policy if exists "authenticated_branding_delete" on storage.objects;

create policy "authenticated_branding_select"
  on storage.objects for select to authenticated
  using (bucket_id = 'branding');

create policy "authenticated_branding_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'branding');

create policy "authenticated_branding_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'branding')
  with check (bucket_id = 'branding');

create policy "authenticated_branding_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'branding');
