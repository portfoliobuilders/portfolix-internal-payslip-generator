-- Run in Supabase SQL Editor if not already applied.
-- Persists payroll settings + company branding in one row.

create table if not exists public.company_settings (
  id integer primary key default 1,
  payday_day integer not null check (payday_day between 3 and 28),
  payroll_contact text not null default '',
  display_name text not null default '',
  legal_line text not null default '',
  address text not null default '',
  logo_url text,
  updated_at timestamptz not null default now(),
  constraint company_settings_single_row check (id = 1)
);

insert into public.company_settings (id, payday_day, payroll_contact, display_name, legal_line, address)
values (
  1,
  5,
  'payroll@portfolix.tech',
  'Portfolix Enterprise Pvt Ltd',
  '',
  'Portfolix House, 2nd Floor
Sector 62, Noida, UP 201309, India'
)
on conflict (id) do nothing;

alter table public.company_settings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'company_settings'
      and policyname = 'Allow read company settings'
  ) then
    create policy "Allow read company settings"
      on public.company_settings
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'company_settings'
      and policyname = 'Allow write company settings'
  ) then
    create policy "Allow write company settings"
      on public.company_settings
      for insert
      to anon, authenticated
      with check (id = 1);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'company_settings'
      and policyname = 'Allow update company settings'
  ) then
    create policy "Allow update company settings"
      on public.company_settings
      for update
      to anon, authenticated
      using (id = 1)
      with check (id = 1);
  end if;
end
$$;

insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Public branding read'
  ) then
    create policy "Public branding read"
      on storage.objects
      for select
      to public
      using (bucket_id = 'branding');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Branding upload authenticated'
  ) then
    create policy "Branding upload authenticated"
      on storage.objects
      for insert
      to anon, authenticated
      with check (bucket_id = 'branding');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Branding update authenticated'
  ) then
    create policy "Branding update authenticated"
      on storage.objects
      for update
      to anon, authenticated
      using (bucket_id = 'branding')
      with check (bucket_id = 'branding');
  end if;
end
$$;
