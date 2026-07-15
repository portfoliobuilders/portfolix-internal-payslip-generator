-- Application-wide payroll settings and entity branding.
-- Single-row table keyed by id = 'default'.

create table if not exists app_settings (
  id text primary key default 'default',
  payday_day_of_month integer not null default 5,
  payroll_contact text not null default 'payroll@portfolix.tech',
  entity_branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed the default row if missing.
insert into app_settings (id, payday_day_of_month, payroll_contact, entity_branding)
values ('default', 5, 'payroll@portfolix.tech', '{}'::jsonb)
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
