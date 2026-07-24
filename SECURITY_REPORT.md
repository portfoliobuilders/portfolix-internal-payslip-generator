# Security Report — Portfolix SlipGen v1.0

**Date:** 2026-07-24  
**Scope:** Authentication, authorization, middleware, server actions, API routes, Supabase RLS, secrets, OWASP Top 10 posture.

## Executive summary

Critical fail-open paths identified in the pre-release audit were fixed in this sprint. Residual risks that require human action or v1.1 work are listed below. **Do not pay real salaries until `019_payroll_admin_rls.sql` is applied on the live database and H10/H11 checklist items are confirmed.**

## Fixed in this sprint

| ID | Issue | Resolution |
|----|-------|------------|
| C1 | Authorised PDF payment gate fail-open | Fail closed in export + registry insert |
| C2 | Missing env → open shell / mock client | Production 503 / throw; mock only in non-prod |
| C3 | Admin check skipped without secret | Always requires `SUPABASE_SECRET_KEY` + `payroll_admins` |
| C4 | RLS `authenticated … using (true)` | Migration `019_payroll_admin_rls.sql` |
| C7 | Public schema health / drift | `requirePayrollAdmin` on both |
| H1 | Ungated verification-hits action | `requirePayrollAdmin` |
| H2 | `/todos` demo page | Removed |
| H3 | Config `console.log` spam | Removed |
| H4 | Canonical URL fail-open default | Fail closed without `NEXT_PUBLIC_APP_URL` |
| H9 | `local-dev` actor in prod paths | Only when env missing and not production |

## Authentication & session

- Middleware refreshes Supabase session; non-public routes require a signed-in user when env is configured.
- Public: `/login`, `/auth/*`, `/verify/*`.
- Production without Supabase env returns **503** (fail closed).

## Authorization

- Server actions: `requirePayrollAdmin()` → session + `payroll_admins` via service role.
- Browser PostgREST: after `019`, policies use `is_payroll_admin()`.
- Public verify: service-role read of issued docs with minimized fields (by design).

## Secrets & environment

| Variable | Client? | Required in production |
|----------|---------|------------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `PUBLISHABLE_KEY` | Yes | Yes |
| `SUPABASE_SECRET_KEY` | **No** | Yes |
| `NEXT_PUBLIC_APP_URL` | Yes | Yes (QR / verify) |

No service-role key is exposed via `NEXT_PUBLIC_*`.

## OWASP Top 10 (abbreviated)

| Area | Status |
|------|--------|
| A01 Broken access control | Mitigated (admin RLS + actions); apply `019` on live |
| A02 Cryptographic failures | TLS via Vercel/Supabase; no app-level encryption of PAN at rest (accepted for internal HR tool — document in ops) |
| A03 Injection | Parameterized Supabase client; Zod not used everywhere — prefer typed inputs on new work |
| A04 Insecure design | Payment gate + finalize integrity improved |
| A05 Security misconfiguration | Env fail-closed; schema endpoint gated |
| A07 Identification failures | MFA not enforced — **human** (Supabase Auth) |
| A08 Software integrity | CI typecheck/lint/test/build; branch protection **human** |
| A09 Logging | Reduced config noise; avoid logging PII |
| A10 SSRF | No user-controlled fetch URLs for SSRF-sensitive paths identified beyond signatory signed URLs |

## Open / residual

1. **[H] Apply `019_payroll_admin_rls.sql` on live** before release.  
2. **[H] Branch protection + required CI checks** (H10).  
3. **[H] Confirm `NEXT_PUBLIC_APP_URL` on Vercel** (H11).  
4. **[H] Admin MFA** (L1).  
5. **v1.1:** Single-transaction finalize RPC; payment overpay DB constraint / advisory locks.  
6. **Dependency audit (2026-07-24):** `npm audit --omit=dev` reports **5** issues (1 low, 3 high, 1 critical): `jspdf` (critical advisories; fix wants 4.2.1 major), transitive `dompurify`, `next@14` advisories (fix wants Next 16 — out of scope for freeze), `xlsx` (no fix). **Do not** `npm audit fix --force` before v1.0. Track upgrades in v1.1 with regression PDF + Excel tests.

## Verification checklist

- [ ] Incognito: unauthenticated → `/login` for all app routes  
- [ ] Non-admin authenticated user cannot read `employees` via PostgREST after `019`  
- [ ] Unpaid FINAL cannot generate authorised bank-copy PDF  
- [ ] `/api/health/schema` returns 401 without admin session  
- [ ] `/todos` is 404  
