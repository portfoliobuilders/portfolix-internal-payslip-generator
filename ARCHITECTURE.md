# ARCHITECTURE.md

## Overview

Single-package **Next.js 14 App Router** app + **Supabase**. Not a monorepo.

```
Browser (untrusted)
  → Server Actions / Route Handlers (auth + recompute)
    → Supabase (RLS + service role where required)
```

## Layers

| Layer | Location | Responsibility |
|-------|----------|----------------|
| UI | `components/`, `app/(app)/` | Inputs, display stored snapshots |
| Server actions | `app/actions/` | Auth, persistence, payment, registry |
| Domain | `lib/payroll-calc.ts`, `salary-payment.ts`, … | Pure math + policy |
| Data access | `utils/supabase/*`, `lib/payroll-db.ts` | Clients, mapping |
| Auth wall | `middleware.ts`, `lib/auth.ts` | Session + payroll admin |
| PDF | `lib/pdf-vector.ts`, `lib/authorised-export.ts` | Bank-copy + internal slips |
| Public verify | `app/verify/`, `app/actions/verification.ts` | Service-role, minimal fields |

## Critical invariants

1. Never trust client-computed net pay / LOP / deferred balances.  
2. FINAL ≠ PAID — payment ledger is separate.  
3. Authorised slip requires paid/reconciled obligation.  
4. Fail closed on missing env, failed auth, failed gates.

## Routes

- App shell: `/employee-roster`, `/generator`, `/history`, `/settings`  
- Auth: `/login`, `/auth/callback`  
- Public: `/verify/payslip/[publicVerificationId]`
