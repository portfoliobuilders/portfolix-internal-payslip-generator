-- ============================================================================
-- 018_compat_compensation_and_issued_doc_unique.sql
--
-- Production currently still deploys clients that:
--   1) upsert employees.compensation_amount (dropped by 014), and
--   2) re-issue the same ASL document_number after marking the prior row SUPERSEDED
--      (blocked by a global UNIQUE on document_number).
--
-- This migration restores a compatibility shim + corrects uniqueness so live
-- payroll finalize / authorised bank-copy flows work again. New app code still
-- treats base_salary as the source of truth and prefers revision-unique PX-AUTH ids.
-- ============================================================================

-- 1) Compatibility column for older clients that still write compensation_amount.
alter table public.employees
  add column if not exists compensation_amount numeric default 0;

update public.employees
set compensation_amount = coalesce(base_salary, 0)
where compensation_amount is distinct from coalesce(base_salary, 0);

create or replace function public.employees_sync_compensation_amount()
returns trigger
language plpgsql
as $$
begin
  -- If base is missing/zero but compensation was supplied, copy into base_salary.
  if (new.base_salary is null or new.base_salary = 0)
     and new.compensation_amount is not null
     and new.compensation_amount > 0 then
    new.base_salary := new.compensation_amount;
  end if;

  -- Keep the shim column mirrored from base_salary (engine source of truth).
  new.compensation_amount := coalesce(new.base_salary, 0);
  return new;
end;
$$;

drop trigger if exists trg_employees_sync_compensation_amount on public.employees;
create trigger trg_employees_sync_compensation_amount
  before insert or update on public.employees
  for each row
  execute function public.employees_sync_compensation_amount();

comment on column public.employees.compensation_amount is
  'Compatibility shim for older clients. Mirrored from base_salary; prefer base_salary.';

-- 2) Document numbers: only one ACTIVE (ISSUED) row may hold a given number.
--    SUPERSEDED / REVOKED / CANCELLED rows may retain the historical number so
--    ASL supersede (same number, new ISSUED row) no longer 409s.
alter table public.payroll_issued_documents
  drop constraint if exists payroll_issued_documents_document_number_key;

drop index if exists payroll_issued_documents_document_number_key;

create unique index if not exists payroll_issued_documents_active_document_number_uidx
  on public.payroll_issued_documents (document_number)
  where document_status = 'ISSUED';

comment on index public.payroll_issued_documents_active_document_number_uidx is
  'At most one ISSUED document per document_number; historical statuses may reuse.';

-- Ensure PostgREST picks up the restored employees.compensation_amount column.
notify pgrst, 'reload schema';
