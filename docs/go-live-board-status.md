# SlipGen go-live board — status (2026-07-24)

Working document for the founder go-live checklist.

## A. Security & infrastructure

### A1 — RLS (Phase 5) — **done in repo + applied on live**

| Item | Status |
|---|---|
| Login + middleware wall | Done |
| `requirePayrollAdmin()` | Done — requires membership in `payroll_admins` when `SUPABASE_SECRET_KEY` is set |
| Migration [`015_authenticated_rls.sql`](../supabase/migrations/015_authenticated_rls.sql) | Present (baseline) |
| Migration [`016_harden_authenticated_rls.sql`](../supabase/migrations/016_harden_authenticated_rls.sql) | **Applied on live** — drops anon/public policies; authenticated on core tables + `company_settings`; branding storage authenticated-only; issued docs service-role-only |
| Migration [`017_unify_base_salary_lifecycle_admins.sql`](../supabase/migrations/017_unify_base_salary_lifecycle_admins.sql) | **Applied on live** — drops `employees.compensation_amount`; lifecycle statuses; seeds founding `payroll_admins` row |
| Public `/verify` | Service role — unchanged |
| `payroll_admins`-gated access | **Done** — founding operator seeded (`portfoliobuilders.ind@gmail.com`) |
| Storage branding | **Hardened** — authenticated only |
| `company_settings` | **Hardened** — authenticated policies |
| Anon PostgREST on payroll tables | **Confirmed 2026-07-24** — anon key returns `[]` for employees / slips / issued docs / app_settings |

### A2 — CI + required checks — **workflow added**

- [x] [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — typecheck, lint, test, build on `main` + PRs
- [ ] Branch protection / required checks — **human** (GitHub settings after first green CI run)

### A3 — Custom domain + canonical URL — partially gated in code

- `resolveCanonicalAppUrl()` requires `NEXT_PUBLIC_APP_URL`, blocks Vercel preview hosts.
- Human: wire preferred subdomain (or dpdns fallback), set env in Vercel, smoke a fresh PDF QR.

### A4 — Admin MFA / password hygiene — human (Supabase Auth dashboard)

### A5 — Uptime monitor on app + `/verify` — human (any free monitor)

---

## B. Written prompt queue — status vs missing prompt pack

Prompt pack files are still not in the repo. Items completed from known gaps / prior merges:

| Prompt | Status |
|---|---|
| B2 Kerala PT slabs monthly | Done on `main` (#52) |
| B3 Unify base salary field | **Done** — code + migration 017 |
| B4 Remove YTD authorised slip | Done on `main` (#50) |
| B5 Document lifecycle cleanup | **Partial** — supersede writes `status=superseded`; void columns present; full void UI still optional |
| B1 Payday any-day / B6–B9 / B10 history reset | Still need prompt pack or founder criteria — do **not** invent destructive history reset |

---

## C. Human tasks (agent cannot complete)

- [ ] Athul + Fahad: PAN, bank name, account, IFSC via Edit modals
- [ ] CA sitting (Athul TDS; Kochi PT schedule; mid-cycle PT; intern vs salary)
- [ ] Set real payday in Settings
- [ ] Confirm flex opening balances before any history reset
- [ ] Branch purge + GitHub “Automatically delete head branches”
- [x] AGENTS.md defers to `payroll-rules.mdc`
- [ ] JSON export after every payroll; price Supabase Pro when paying real salaries
- [ ] Enable required status checks on `main` after CI is green
- [ ] Confirm `NEXT_PUBLIC_APP_URL` on Vercel production

---

## D. Verification tests (run after this deploy)

- [ ] Incognito: every non-public route → `/login`; sign in; app works
- [x] Anon-key PostgREST on payroll tables → empty / denied (proven live 2026-07-24)
- [ ] ₹20,400.00 vector on finished build
- [ ] Dress rehearsal: draft → finalize → pay → bank copy → phone QR → `/verify` → supersede → amber

---

## E. Freeze / F. Product calendar

Unchanged: no new features except Employment Verification Letter when founder says so.

---

## Resume procedure (next agent)

1. Confirm Section D anon PostgREST proof after production deploy of this branch.
2. Do not invent destructive history reset (B10) without the written prompt.
3. Human items in C remain founder-owned.
