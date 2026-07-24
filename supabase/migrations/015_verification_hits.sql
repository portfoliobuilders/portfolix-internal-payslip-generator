-- Append-only public verification hit log (employer-side visibility only).
-- Stores coarse browser family + platform — never IP, never fingerprint.

create table if not exists public.verification_hits (
  id uuid primary key default gen_random_uuid(),
  issued_document_id uuid not null
    references public.payroll_issued_documents (id) on delete cascade,
  hit_at timestamptz not null default timezone('utc', now()),
  coarse_user_agent text not null default 'Unknown'
);

create index if not exists verification_hits_document_hit_at_idx
  on public.verification_hits (issued_document_id, hit_at desc);

alter table public.verification_hits enable row level security;

drop policy if exists "Allow anon all verification hits" on public.verification_hits;
create policy "Allow anon all verification hits"
  on public.verification_hits for all
  using (true)
  with check (true);

comment on table public.verification_hits is
  'Append-only log of successful public verification token resolutions. Coarse UA only; no IP.';
comment on column public.verification_hits.coarse_user_agent is
  'Browser family + platform only (e.g. "Chrome · Windows"). Never store raw UA, IP, or fingerprint.';
