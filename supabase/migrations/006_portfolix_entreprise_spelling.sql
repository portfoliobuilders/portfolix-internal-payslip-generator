-- Correct parental firm spelling: Enterprise → Entreprise.
-- Safe / idempotent: only rewrites the known misspelling.

-- company_settings display name (if that table exists)
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'company_settings'
  ) then
    update public.company_settings
    set
      display_name = replace(display_name, 'Portfolix Enterprise', 'Portfolix Entreprise'),
      legal_line = replace(legal_line, 'Portfolix Enterprise', 'Portfolix Entreprise'),
      updated_at = timezone('utc', now())
    where display_name like '%Portfolix Enterprise%'
       or legal_line like '%Portfolix Enterprise%';
  end if;
end $$;

-- app_settings jsonb branding blob
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'app_settings'
  ) then
    update public.app_settings
    set data = replace(data::text, 'Portfolix Enterprise', 'Portfolix Entreprise')::jsonb
    where data::text like '%Portfolix Enterprise%';
  end if;
end $$;
