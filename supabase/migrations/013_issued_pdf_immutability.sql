-- Issued authorised PDF immutability + versioned signatory asset metadata
-- Keeps signature/seal private; stores paths + hashes + optional PDF object path.

alter table public.payroll_issued_documents
  add column if not exists pdf_storage_path text,
  add column if not exists signature_asset_path text,
  add column if not exists seal_asset_path text,
  add column if not exists signature_asset_hash text,
  add column if not exists seal_asset_hash text,
  add column if not exists authorisation_mode text;

comment on column public.payroll_issued_documents.pdf_storage_path is
  'Private storage path of the immutable issued PDF (issued-documents bucket).';
comment on column public.payroll_issued_documents.signature_asset_path is
  'Signatory signature object path frozen at issue time.';
comment on column public.payroll_issued_documents.seal_asset_path is
  'Company seal object path frozen at issue time.';

-- Raise signatory-assets size limit to 2 MB; keep bucket private
update storage.buckets
set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['image/png', 'image/jpeg']
where id = 'signatory-assets';

-- Private bucket for immutable issued PDFs (service-role only)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'issued-documents',
  'issued-documents',
  false,
  2097152,
  array['application/pdf']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = 2097152,
  allowed_mime_types = array['application/pdf'];

-- Fail closed: no anon/public object policies on issued-documents
drop policy if exists "Issued documents insert" on storage.objects;
drop policy if exists "Issued documents select" on storage.objects;
drop policy if exists "Issued documents update" on storage.objects;
drop policy if exists "Issued documents delete" on storage.objects;
