# API.md

This app is primarily **Server Actions**, not a public REST API.

## Server actions (payroll-admin unless noted)

| Module | Examples |
|--------|----------|
| `app/actions/payroll.ts` | Employee CRUD, draft/finalize slips |
| `app/actions/salary-payment.ts` | Obligations, pay, confirm, reverse, payment gate |
| `app/actions/issued-documents.ts` | Authorised registry issue / supersede |
| `app/actions/settings.ts` | Persist settings |
| `app/actions/signatory-assets.ts` | Signature/seal upload + signed URLs |
| `app/actions/schema-drift.ts` | Drift report (admin) |
| `app/actions/verification-hits.ts` | Hit summaries (admin) |
| `app/actions/verification.ts` | **Public** payslip verification fetch |
| `app/actions/auth.ts` | Sign-in / sign-out |

## HTTP routes

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/health/schema` | Payroll admin | Schema drift JSON (503 if behind) |
| GET | `/auth/callback` | OAuth/code exchange | Supabase auth callback |

## Error shape

Most actions return `{ ok: true, data } | { ok: false, error: string }` (sometimes with `code`).
