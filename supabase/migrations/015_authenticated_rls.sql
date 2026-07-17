-- Replace open anon policies with authenticated-only access for payroll data.
-- Public payslip verification continues via service-role server actions (no anon SELECT).
-- Apply after 014_authorised_registry_harden.sql.

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
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- Core payroll tables: authenticated full access (internal HR tool; row-level ownership TBD).
do $$
declare
  t text;
  tables text[] := array[
    'employees',
    'payroll_slips',
    'app_settings',
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
    'company_identity'
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

-- payroll_issued_documents remains service-role only (no anon/authenticated policies).
