-- Allow payday day-of-month 1–31 (was 3–28).
-- Credit date clamps to month length; review deadline = creditDate − 2 calendar days
-- (may roll into the prior month when payday is 1 or 2). See lib/format.ts.
--
-- Live note: some environments have company_settings.payday_day as text (no check);
-- coerce to integer when needed so the 1–31 check applies.

do $$
declare
  con_name text;
  payday_udt text;
begin
  -- company_settings.payday_day
  if to_regclass('public.company_settings') is not null
     and exists (
       select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'company_settings'
         and column_name = 'payday_day'
     )
  then
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

    select c.udt_name
      into payday_udt
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'company_settings'
      and c.column_name = 'payday_day';

    if payday_udt = 'text' or payday_udt = 'varchar' then
      -- Normalize non-numeric / out-of-range text before casting.
      update public.company_settings
      set payday_day = '5'
      where payday_day is null
         or payday_day !~ '^[0-9]+$'
         or payday_day::integer < 1
         or payday_day::integer > 31;

      alter table public.company_settings
        alter column payday_day type integer
        using greatest(1, least(31, coalesce(nullif(payday_day, '')::integer, 5)));

      alter table public.company_settings
        alter column payday_day set not null;

      alter table public.company_settings
        alter column payday_day set default 5;
    end if;

    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'company_settings'
        and c.conname = 'company_settings_payday_day_check'
    ) then
      alter table public.company_settings
        add constraint company_settings_payday_day_check
        check (payday_day between 1 and 31);
    end if;
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

    if not exists (
      select 1
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
        and t.relname = 'company_payroll_settings'
        and c.conname = 'company_payroll_settings_payday_day_of_month_check'
    ) then
      alter table public.company_payroll_settings
        add constraint company_payroll_settings_payday_day_of_month_check
        check (payday_day_of_month between 1 and 31);
    end if;
  end if;
end
$$;
