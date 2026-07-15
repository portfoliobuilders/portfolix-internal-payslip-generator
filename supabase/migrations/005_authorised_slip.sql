-- Authorised Slip foundation — the ONLY schema addition for this feature.
-- Entity branding/signatory fields and employee TDS/PT live in jsonb
-- (app_settings.data / employees.details_json), not as SQL columns.
--
-- Idempotent: safe if partially applied from an earlier draft of this migration.

-- 1) authorised_slip_log — one row per bank-copy generation (reprints never blocked)
create table if not exists public.authorised_slip_log (
  id uuid primary key default gen_random_uuid(),
  payroll_slip_id uuid not null references public.payroll_slips (id) on delete cascade,
  generated_at timestamptz not null default timezone('utc', now()),
  signatory_snapshot jsonb not null default '{}'::jsonb
);

-- Align column name if an earlier draft used payroll_run_id
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'authorised_slip_log'
      and column_name = 'payroll_run_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'authorised_slip_log'
      and column_name = 'payroll_slip_id'
  ) then
    alter table public.authorised_slip_log rename column payroll_run_id to payroll_slip_id;
  end if;
end $$;

create index if not exists authorised_slip_log_slip_idx
  on public.authorised_slip_log (payroll_slip_id, generated_at desc);

alter table public.authorised_slip_log enable row level security;

drop policy if exists "Allow anon full access" on public.authorised_slip_log;
create policy "Allow anon full access"
  on public.authorised_slip_log
  for all
  using (true)
  with check (true);

-- 2) One-off employee_id whitespace collapse (e.g. "PX-OPS-2512 -005")
update public.employees
set employee_id = upper(trim(regexp_replace(employee_id, '\s+', '', 'g')))
where employee_id ~ '\s';

update public.payroll_slips
set details_json = jsonb_set(
  details_json,
  '{employee,empId}',
  to_jsonb(upper(trim(regexp_replace(details_json #>> '{employee,empId}', '\s+', '', 'g'))))
)
where details_json #>> '{employee,empId}' ~ '\s';

-- 3) If a draft migration added SQL TDS/PT columns, fold values into details_json then drop them
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employees' and column_name = 'tds_monthly'
  ) then
    update public.employees
    set details_json = coalesce(details_json, '{}'::jsonb)
      || jsonb_build_object(
        'tdsMonthly', coalesce(tds_monthly, 0),
        'ptHalfYearly', coalesce(pt_half_yearly, 0)
      )
    where details_json is null
       or details_json->>'tdsMonthly' is null
       or details_json->>'ptHalfYearly' is null;

    alter table public.employees drop column if exists tds_monthly;
    alter table public.employees drop column if exists pt_half_yearly;
  end if;
end $$;

-- 4) Seed Settings jsonb keys (not SQL columns): PT months + entity signatory placeholders
update public.app_settings
set
  data = jsonb_set(
    jsonb_set(
      coalesce(data, '{}'::jsonb),
      '{ptDeductionMonths}',
      coalesce(data->'ptDeductionMonths', '[8, 2]'::jsonb),
      true
    ),
    '{reviewDeadlineTime}',
    coalesce(data->'reviewDeadlineTime', '"6:00 PM"'::jsonb),
    true
  ),
  updated_at = timezone('utc', now())
where id = 1;

update public.app_settings
set
  data = jsonb_set(
    data,
    '{entities}',
    (
      select jsonb_object_agg(
        code,
        coalesce(ent, '{}'::jsonb)
        || jsonb_build_object(
          'cin', coalesce(nullif(ent->>'cin', ''), 'SET-IN-SETTINGS'),
          'registeredAddress',
          case
            when coalesce(ent->>'registeredAddress', '') <> '' then ent->>'registeredAddress'
            when jsonb_typeof(ent->'addressLines') = 'array'
              and jsonb_array_length(ent->'addressLines') > 0
              then (
                select string_agg(value, ', ')
                from jsonb_array_elements_text(ent->'addressLines') as t(value)
              )
            else 'SET-IN-SETTINGS'
          end,
          'phone',
          coalesce(
            nullif(ent->>'phone', ''),
            nullif(ent->>'contactPhone', ''),
            'SET-IN-SETTINGS'
          ),
          'payrollEmail',
          case
            when coalesce(ent->>'payrollEmail', '') <> ''
              and ent->>'payrollEmail' !~* 'erntreprise|entreprise\.com$'
              then ent->>'payrollEmail'
            when coalesce(ent->>'contact', '') <> ''
              and ent->>'contact' !~* 'erntreprise|entreprise\.com$'
              then ent->>'contact'
            else 'SET-IN-SETTINGS'
          end,
          'signatoryName', coalesce(nullif(ent->>'signatoryName', ''), 'SET-IN-SETTINGS'),
          'signatoryDesignation',
            coalesce(nullif(ent->>'signatoryDesignation', ''), 'SET-IN-SETTINGS'),
          'signatureAssetPath', ent->'signatureAssetPath',
          'sealAssetPath', ent->'sealAssetPath'
        )
        - 'contactPhone'
      )
      from jsonb_each(coalesce(data->'entities', '{}'::jsonb)) as e(code, ent)
    ),
    true
  ),
  updated_at = timezone('utc', now())
where id = 1
  and data ? 'entities';

-- 5) Ensure private signatory-assets bucket exists (created in dashboard; assert shape here)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signatory-assets',
  'signatory-assets',
  false,
  1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 1048576,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

-- Fail closed: no anon/public object policies — server uses SUPABASE_SECRET_KEY (service role)
drop policy if exists "Signatory assets insert" on storage.objects;
drop policy if exists "Signatory assets select" on storage.objects;
drop policy if exists "Signatory assets update" on storage.objects;
drop policy if exists "Signatory assets delete" on storage.objects;
