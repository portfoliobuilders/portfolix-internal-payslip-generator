# CHANGELOG.md

## 1.0.0 — 2026-07-24

### Security

- Authorised salary slip PDF **fails closed** unless payment gate allows (paid / reconciled).
- Production **fails closed** when Supabase env is missing (no open mock shell).
- `requirePayrollAdmin` always requires `SUPABASE_SECRET_KEY` + `payroll_admins` membership.
- Schema health API and drift action require payroll admin.
- Verification hit summaries require payroll admin.
- Canonical `NEXT_PUBLIC_APP_URL` required (no silent default host).
- Migration `019_payroll_admin_rls.sql`: PostgREST limited to payroll admins.

### Reliability

- Finalize checks duplicate-final RPC errors, integrity update, audit, flex, and obligation creation (fail closed).
- Payment reverse uses conditional CONFIRMED update and restores on reversal insert failure.
- Generator finalize enables strict integrity gates; Finalize implies attendance locked.

### Cleanup

- Removed `/todos` demo page, unused AppShell/PayrollDataProvider, Settings stress panel UI.
- Neutralized dangerous historical slip FK migration sibling; documented migration plan (`DATABASE.md`).
- Aligned schema-drift expected set with live go-live migrations.

### Docs

- `PRODUCTION_BACKLOG.md`, `SECURITY_REPORT.md`, `PERFORMANCE_REPORT.md`, `CODE_QUALITY_REPORT.md`, `RELEASE_CHECKLIST.md`, `FINAL_AUDIT.md`, ops docs.
