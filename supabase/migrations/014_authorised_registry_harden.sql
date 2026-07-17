-- Harden authorised document registry:
-- 1) Allow same ASL number across SUPERSEDED → ISSUED revisions (partial unique).
-- 2) Close anon dump of payroll_issued_documents (service-role only).

-- Drop full unique on document_number; keep one active ISSUED number.
do $$
declare
  con_name text;
begin
  select c.conname into con_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'payroll_issued_documents'
    and c.contype = 'u'
    and pg_get_constraintdef(c.oid) ilike '%document_number%';
  if con_name is not null then
    execute format('alter table public.payroll_issued_documents drop constraint %I', con_name);
  end if;
end $$;

drop index if exists public.payroll_issued_documents_document_number_key;

create unique index if not exists payroll_issued_documents_active_number_idx
  on public.payroll_issued_documents (document_number)
  where document_status = 'ISSUED';

-- Anon must not list/dump issued documents. Server actions use SUPABASE_SECRET_KEY.
drop policy if exists "Allow anon all issued documents" on public.payroll_issued_documents;
-- No replacement anon policy — service role bypasses RLS.
