-- Application-wide payroll settings and entity branding (single JSONB row).

create table if not exists app_settings (
  id text primary key default 'default',
  settings_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_settings (id, settings_json)
values ('default', '{}'::jsonb)
on conflict (id) do nothing;
