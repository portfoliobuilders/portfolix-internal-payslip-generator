-- Allow payday day-of-month 1–31 (was 3–28).
-- Credit date clamps to month length; review deadline = creditDate − 2 calendar days
-- (may roll into the prior month when payday is 1 or 2). See lib/format.ts.

do $$
declare
  con_name text;
begin
  -- company_settings.payday_day
  if to_regclass('public.company_settings') is not null then
    for con_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'company_settings'
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%payday_day%'
    loop
      execute format('alter table public.company_settings drop constraint %I', con_name);
    end loop;

    alter table public.company_settings
      add constraint company_settings_payday_day_check
      check (payday_day between 1 and 31);
  end if;

  -- company_payroll_settings.payday_day_of_month
  if to_regclass('public.company_payroll_settings') is not null then
    for con_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'company_payroll_settings'
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%payday_day_of_month%'
    loop
      execute format(
        'alter table public.company_payroll_settings drop constraint %I',
        con_name
      );
    end loop;

    alter table public.company_payroll_settings
      add constraint company_payroll_settings_payday_day_of_month_check
      check (payday_day_of_month between 1 and 31);
  end if;
end
$$;
