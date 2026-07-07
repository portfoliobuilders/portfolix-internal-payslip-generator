-- Application-wide payroll settings and entity branding (single JSONB row).
-- Matches production: id integer primary key, data jsonb.

create table if not exists app_settings (
  id integer primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into app_settings (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;
