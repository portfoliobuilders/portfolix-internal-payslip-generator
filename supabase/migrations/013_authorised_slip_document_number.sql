-- Persist the canonical authorised payslip number on each bank-copy log row.
-- Reprints reuse the stored number; they never re-derive a new scheme.

alter table public.authorised_slip_log
  add column if not exists document_number text;

alter table public.authorised_slip_log
  add column if not exists revision_number integer not null default 1;

alter table public.authorised_slip_log
  add column if not exists public_verification_id text;

create index if not exists authorised_slip_log_document_number_idx
  on public.authorised_slip_log (document_number);
