-- Authorised Slip (bank copy) foundation:
-- statutory deduction inputs, entity/signatory settings fields (via app_settings seed),
-- authorised generation log, private signatory-assets bucket, employee_id whitespace fix.

-- 1) Employee statutory deduction inputs
alter table public.employees
  add column if not exists tds_monthly numeric(12, 2) not null default 0,
  add column if not exists pt_half_yearly numeric(8, 2) not null default 0;

comment on column public.employees.tds_monthly is
  'Monthly TDS (income tax) deduction amount; frozen into each slip snapshot at generation.';
comment on column public.employees.pt_half_yearly is
  'Kerala Professional Tax half-yearly amount; deducted only in configured PT months.';

-- 2) Authorised slip generation log (reprints are logged, never blocked)
create table if not exists public.authorised_slip_log (
  id uuid primary key default gen_random_uuid(),
  payroll_run_id uuid not null references public.payroll_slips (id) on delete cascade,
  generated_at timestamptz not null default timezone('utc', now()),
  signatory_snapshot jsonb not null default '{}'::jsonb
);

create index if not exists authorised_slip_log_run_idx
  on public.authorised_slip_log (payroll_run_id, generated_at desc);

alter table public.authorised_slip_log enable row level security;

drop policy if exists "Allow anon full access" on public.authorised_slip_log;
create policy "Allow anon full access"
  on public.authorised_slip_log
  for all
  using (true)
  with check (true);

-- 3) One-off employee_id whitespace collapse (e.g. "PX-OPS-2512 -005")
update public.employees
set employee_id = upper(trim(regexp_replace(employee_id, '\s+', '', 'g')))
where employee_id ~ '\s';

-- Also fix any frozen empId strings already captured in slip snapshots
update public.payroll_slips
set details_json = jsonb_set(
  details_json,
  '{employee,empId}',
  to_jsonb(upper(trim(regexp_replace(details_json #>> '{employee,empId}', '\s+', '', 'g'))))
)
where details_json #>> '{employee,empId}' ~ '\s';

-- 4) Seed global PT months + per-entity company/signatory placeholders into app_settings
--    Misspelled or missing contact/CIN/phone values become obvious "SET-IN-SETTINGS" markers.
update public.app_settings
set
  data = jsonb_set(
    jsonb_set(
      coalesce(data, '{}'::jsonb),
      '{ptDeductionMonths}',
      coalesce(data->'ptDeductionMonths', '[8, 2]'::jsonb),
      true
    ),
    '{payrollContact}',
    to_jsonb(
      case
        when coalesce(data->>'payrollContact', '') = '' then 'SET-IN-SETTINGS'
        when data->>'payrollContact' ~* 'erntreprise|entreprise\.com$' then 'SET-IN-SETTINGS'
        else data->>'payrollContact'
      end
    ),
    true
  ),
  updated_at = timezone('utc', now())
where id = 1;

-- Ensure each entity object has company/signatory keys with placeholders when blank
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
          'cin',
          case
            when coalesce(ent->>'cin', '') = '' then 'SET-IN-SETTINGS'
            else ent->>'cin'
          end,
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
          'contactPhone',
          case
            when coalesce(ent->>'contactPhone', '') = '' then 'SET-IN-SETTINGS'
            else ent->>'contactPhone'
          end,
          'payrollEmail',
          case
            when coalesce(ent->>'payrollEmail', '') = ''
              and coalesce(ent->>'contact', '') <> ''
              and ent->>'contact' !~* 'erntreprise|entreprise\.com$'
              then ent->>'contact'
            when coalesce(ent->>'payrollEmail', '') = '' then 'SET-IN-SETTINGS'
            when ent->>'payrollEmail' ~* 'erntreprise|entreprise\.com$' then 'SET-IN-SETTINGS'
            else ent->>'payrollEmail'
          end,
          'signatoryName',
          coalesce(nullif(ent->>'signatoryName', ''), 'SET-IN-SETTINGS'),
          'signatoryDesignation',
          coalesce(nullif(ent->>'signatoryDesignation', ''), 'SET-IN-SETTINGS'),
          'signatureAssetPath',
          ent->'signatureAssetPath',
          'sealAssetPath',
          ent->'sealAssetPath'
        )
      )
      from jsonb_each(coalesce(data->'entities', '{}'::jsonb)) as e(code, ent)
    ),
    true
  ),
  updated_at = timezone('utc', now())
where id = 1
  and data ? 'entities';

-- 5) Private signatory-assets storage bucket (PNG/JPEG/WebP, max 1 MB)
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
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow app (anon key) to manage objects for signed-URL workflows.
-- Bucket is private: /object/public/... URLs fail; only createSignedUrl works.
drop policy if exists "Signatory assets insert" on storage.objects;
drop policy if exists "Signatory assets select" on storage.objects;
drop policy if exists "Signatory assets update" on storage.objects;
drop policy if exists "Signatory assets delete" on storage.objects;

create policy "Signatory assets insert"
  on storage.objects for insert
  with check (bucket_id = 'signatory-assets');

create policy "Signatory assets select"
  on storage.objects for select
  using (bucket_id = 'signatory-assets');

create policy "Signatory assets update"
  on storage.objects for update
  using (bucket_id = 'signatory-assets')
  with check (bucket_id = 'signatory-assets');

create policy "Signatory assets delete"
  on storage.objects for delete
  using (bucket_id = 'signatory-assets');
