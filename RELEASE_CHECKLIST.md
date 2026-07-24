# Release Checklist — v1.0

## Pre-deploy (engineering)

- [x] All Critical backlog items closed or mitigated with residual documented
- [x] High code items closed (H10/H11 human)
- [x] `npm run typecheck` green
- [x] `npm test` green (212 tests)
- [x] `npm run lint` green
- [x] `npm run build` green
- [ ] Dependency advisories reviewed (`SECURITY_REPORT.md`) — Next/jspdf/xlsx deferred to v1.1 (no force upgrade in freeze)
- [ ] `SECURITY_REPORT.md` reviewed by operator
- [ ] Apply **`019_payroll_admin_rls.sql`** on live Supabase
- [ ] Confirm drift banner clear in Settings after `019`

## Vercel / env

- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable)
- [ ] `SUPABASE_SECRET_KEY` (server-only)
- [ ] `NEXT_PUBLIC_APP_URL` = stable production host (not `*-git-*`)
- [ ] No preview URL used for QR generation

## GitHub

- [ ] CI green on `main`
- [ ] Branch protection: require CI check on `main`
- [ ] Tag release `v1.0.0` after deploy smoke

## Dress rehearsal (production data or staging clone)

- [ ] Login as payroll admin
- [ ] Non-admin user denied (PostgREST + UI actions)
- [ ] Draft → Finalize (after attendance period end)
- [ ] Record + confirm payment to PAID / outstanding 0
- [ ] Authorised bank-copy PDF + QR
- [ ] Phone open `/verify/payslip/...`
- [ ] Supersede FINAL → amber / prior superseded
- [ ] Unpaid slip: bank copy **blocked**

## Human / ops

- [ ] Admin MFA enabled in Supabase Auth
- [ ] Uptime monitor on app + `/verify`
- [ ] Backup / PITR posture understood (Supabase plan)
- [ ] CA / payday / flex opening balances confirmed (founder)

## Go / no-go

**GO** only if engineering + Vercel + `019` + dress rehearsal pass.  
**NO-GO** if payment gate, admin RLS, or env fail-closed regress.
