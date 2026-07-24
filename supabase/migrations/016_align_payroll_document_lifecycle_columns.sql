-- ============================================================================
-- 016_align_payroll_document_lifecycle_columns.sql
-- Bridge: document-lifecycle columns from 012_payroll_cycle_schedules_integrity
-- that never landed on live (documents sibling of 012 was applied instead;
-- full integrity cannot run verbatim — payroll_cycle_policies uses code/label,
-- not name). Additive only — matches code expectations in app/actions/payroll.ts.
-- ============================================================================

alter table public.payroll_slips
  add column if not exists cycle_override_reason text,
  add column if not exists internal_document_status text not null default 'DRAFT',
  add column if not exists authorised_document_status text not null default 'DRAFT',
  add column if not exists internal_document_number text,
  add column if not exists authorised_document_number text,
  add column if not exists public_verification_id text,
  add column if not exists verification_fingerprint text;

do $$
begin
  alter table public.payroll_slips
    drop constraint if exists payroll_slips_internal_document_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_internal_document_status_check
    check (internal_document_status in (
      'DRAFT','ISSUED','SUPERSEDED','REVOKED','CANCELLED','LEGACY_UNVERIFIED'
    ));

  alter table public.payroll_slips
    drop constraint if exists payroll_slips_authorised_document_status_check;
  alter table public.payroll_slips
    add constraint payroll_slips_authorised_document_status_check
    check (authorised_document_status in (
      'DRAFT','ISSUED','SUPERSEDED','REVOKED','CANCELLED','LEGACY_UNVERIFIED'
    ));
end $$;

-- Mark legacy issued docs as LEGACY_UNVERIFIED for document status when final
update public.payroll_slips
set
  internal_document_status = case
    when lower(coalesce(status, 'draft')) = 'final' then 'LEGACY_UNVERIFIED'
    else coalesce(internal_document_status, 'DRAFT')
  end
where server_computed_at is null
  and coalesce(integrity_status, 'OK') = 'LEGACY_UNVERIFIED';

create unique index if not exists payroll_slips_public_verification_id_uq
  on public.payroll_slips (public_verification_id)
  where public_verification_id is not null;

comment on column public.payroll_slips.public_verification_id is
  'Cryptographically unpredictable public verification id for authorised slips.';
comment on column public.payroll_slips.internal_document_status is
  'Internal slip document lifecycle: DRAFT / ISSUED / SUPERSEDED / REVOKED / CANCELLED.';
comment on column public.payroll_slips.authorised_document_status is
  'Authorised (bank-copy) document lifecycle; ISSUED blocks hard delete.';
