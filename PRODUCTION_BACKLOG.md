# Production Backlog — Version 1.0 Stabilization

**Feature freeze.** No new business features unless required to remove a production blocker.  
**Status date:** 2026-07-24  
**Source audits:** `docs/go-live-board-status.md`, code review of auth/payment/payroll/migrations.

Legend: `[ ]` open · `[x]` done · `[~]` mitigated / documented residual · `[H]` human-only (cannot be completed by agent)

---

## Critical = Production blockers

### C1. Payment gate fails open on authorised bank-copy PDF
- **Description:** `assertAuthorisedSlipPaymentGate` is called in `buildAuthorisedSalarySlipPdf`, but failure is ignored — unpaid slips can still be registered/issued. `issueAuthorisedSalarySlipDocument` does not re-assert payment.
- **Files affected:** `lib/authorised-export.ts`, `app/actions/issued-documents.ts`, callers in `components/GeneratorView.tsx`, `components/HistoryView.tsx`
- **Risk:** Bank-copy PDFs issued for unpaid payroll (compliance / fraud risk)
- **Estimated time:** 1–2 h
- **Dependencies:** None
- **Priority:** Critical
- **Status:** [x] Done 2026-07-24 — fail closed in `buildAuthorisedSalarySlipPdf` when `registerDocument !== false`; re-assert gate in `issueAuthorisedSalarySlipDocument` before minting new ISSUED rows

### C2. App starts open when Supabase env is missing (mock / degraded shell)
- **Description:** Missing env returns mock client; middleware allows all routes. Violates fail-closed payroll rules in production.
- **Files affected:** `utils/supabase/config.ts`, `utils/supabase/middleware.ts`, `utils/supabase/client.ts`, `utils/supabase/server.ts`, `utils/supabase/mock-client.ts`
- **Risk:** Unauthenticated UI in misconfigured prod; silent mutation failures
- **Estimated time:** 2–3 h
- **Dependencies:** None
- **Priority:** Critical
- **Status:** [x] Done 2026-07-24 — production returns 503 without env; mock client only in non-production; removed config `console.log`

### C3. `requirePayrollAdmin` skips `payroll_admins` when secret key missing
- **Description:** With URL+anon key but no `SUPABASE_SECRET_KEY`, any authenticated user is treated as admin for server actions.
- **Files affected:** `lib/auth.ts`, `utils/supabase/service-role.ts`
- **Risk:** Privilege escalation under partial misconfiguration
- **Estimated time:** 1 h
- **Dependencies:** C2
- **Priority:** Critical
- **Status:** [x] Done 2026-07-24 — always requires `SUPABASE_SECRET_KEY` + `payroll_admins` membership

### C4. Authenticated RLS is `using (true)` — any signed-in user can CRUD payroll via PostgREST
- **Description:** Middleware only checks session; browser Supabase client can read/write payroll tables without being in `payroll_admins`. Server actions are gated, but direct PostgREST is not.
- **Files affected:** `supabase/migrations/015_authenticated_rls.sql`, `016_harden_authenticated_rls.sql`, new harden migration, optionally `utils/supabase/middleware.ts`
- **Risk:** Any leaked Magento/Google OAuth account with app access can exfiltrate salary data
- **Estimated time:** 4–6 h
- **Dependencies:** C3; live `payroll_admins` seeded
- **Priority:** Critical
- **Status:** [ ]

### C5. Payroll finalize is not atomic; errors swallowed
- **Description:** Multi-step finalize (supersede → insert → integrity update → audit → flex → obligation) has no DB transaction. `active_final` update and audit errors unchecked; obligation create swallowed; duplicate-final RPC return value ignored (Supabase JS does not throw).
- **Files affected:** `app/actions/payroll.ts`, `supabase/migrations/010_payroll_audit_and_finalize_guard.sql`, new finalize RPC migration
- **Risk:** Half-written FINAL slips; flex/obligation divergence; duplicate finals under race
- **Estimated time:** 6–10 h
- **Dependencies:** Schema canaries for payment tables
- **Priority:** Critical
- **Status:** [ ]

### C6. Conflicting migration siblings can restore broken slip FK / schema
- **Description:** Dual `004_*` (fix FK vs re-add wrong FK), dual `012_*` (documents vs integrity shapes), dual `017`/`018` compensation drop vs re-add. Fresh envs or mis-ordered apply are unsafe.
- **Files affected:** `supabase/migrations/*`, `lib/schema-drift.ts`
- **Risk:** Slip inserts fail; History empty; false schema-drift 503s
- **Estimated time:** 4–8 h (plan + drift align; full consolidation may be v1.1)
- **Dependencies:** Knowledge of what is applied on live
- **Priority:** Critical
- **Status:** [ ]

### C7. Unauthenticated schema disclosure endpoints
- **Description:** `GET /api/health/schema` has no admin gate; `checkSchemaDrift` server action has no `requirePayrollAdmin`.
- **Files affected:** `app/api/health/schema/route.ts`, `app/actions/schema-drift.ts`
- **Risk:** Ops/schema fingerprinting for attackers
- **Estimated time:** 1 h
- **Dependencies:** C3
- **Priority:** Critical
- **Status:** [x] Done 2026-07-24 — both require `requirePayrollAdmin`

---

## High = Must fix before release

### H1. Server actions missing auth (`fetchVerificationHitSummaries`)
- **Description:** Comment claims History-only; no `requirePayrollAdmin()`.
- **Files affected:** `app/actions/verification-hits.ts`
- **Risk:** Hit telemetry disclosure if action ID known
- **Estimated time:** 30 m
- **Dependencies:** None
- **Priority:** High
- **Status:** [x] Done 2026-07-24

### H2. Remove demo `/todos` page from app shell
- **Description:** Scaffolding page ships behind login.
- **Files affected:** `app/(app)/todos/page.tsx`, `app/todos/page.tsx` (if present), nav links, `components/AppHeader.tsx` / `AppShell.tsx`
- **Risk:** Attack surface / unprofessional surface
- **Estimated time:** 30 m
- **Dependencies:** None
- **Priority:** High
- **Status:** [x] Done 2026-07-24 — deleted todos route

### H3. Remove production `console.log` on every env check (middleware spam)
- **Description:** `getSupabaseEnv()` logs config posture on every call including middleware.
- **Files affected:** `utils/supabase/config.ts`
- **Risk:** Log noise; config posture leak
- **Estimated time:** 30 m
- **Dependencies:** None
- **Priority:** High
- **Status:** [x] Done 2026-07-24 (with C2)

### H4. Canonical URL fail-open default host
- **Description:** Hardcoded Vercel host used when `NEXT_PUBLIC_APP_URL` unset — wrong QR / verify hosts.
- **Files affected:** `lib/authorised-export.ts`, `.env.local.example`
- **Risk:** Verification URLs point at wrong deployment
- **Estimated time:** 1 h
- **Dependencies:** [H] Vercel env set
- **Priority:** High
- **Status:** [x] Done 2026-07-24 — fail closed when unset; human must confirm Vercel env (H11)

### H5. Payment reverse / concurrent payment races
- **Description:** Reverse updates original then inserts reversal (partial write); confirm/pay are read-check-write without row locks / conditional updates.
- **Files affected:** `app/actions/salary-payment.ts`, possibly migration for DB constraints
- **Risk:** Ledger totals wrong; overpayment under concurrency
- **Estimated time:** 4–6 h
- **Dependencies:** C5 patterns
- **Priority:** High
- **Status:** [ ]

### H6. `enforceStrictGates: false` in Generator finalize UI
- **Description:** Attendance/period gates are warnings only until Phase 5+.
- **Files affected:** `components/GeneratorView.tsx`, `lib/payroll-validate.ts`
- **Risk:** FINAL slips with unlocked attendance / soft period violations
- **Estimated time:** 1–2 h
- **Dependencies:** Founder confirmation that gates are ready
- **Priority:** High
- **Status:** [ ]

### H7. Align `EXPECTED_SCHEMA_MIGRATIONS` with live go-live set
- **Description:** Drift expect-list tracks compat/sibling paths; omits live `016_harden` / `017_unify` / `018_drop`.
- **Files affected:** `lib/schema-drift.ts`, `app/api/health/schema/route.ts`
- **Risk:** False 503 or missed real drift
- **Estimated time:** 2 h
- **Dependencies:** C6 inventory
- **Priority:** High
- **Status:** [ ]

### H8. Remove dead scaffolding / unused stress UI from production surfaces
- **Description:** Unused `PayrollDataProvider` / `AppShell` scaffolding; stress panel mounted in Settings; unused verification-hits UI wiring.
- **Files affected:** `components/PayrollDataProvider.tsx`, `components/AppShell.tsx`, `components/PayrollStressTestPanel.tsx`, `components/SettingsView.tsx`
- **Risk:** Operator confusion; accidental stress writes
- **Estimated time:** 1–2 h
- **Dependencies:** None
- **Priority:** High
- **Status:** [x] Done 2026-07-24 — deleted scaffolding + unmounted stress panel (lib stress tests retained)

### H9. Session actor fabricates `local-dev` actor when no user
- **Description:** Fail-open identity for local/mock paths.
- **Files affected:** `lib/session-actor.ts`
- **Risk:** Audit attribution wrong if reached in prod
- **Estimated time:** 1 h
- **Dependencies:** C2
- **Priority:** High
- **Status:** [x] Done 2026-07-24 — local-dev only when env missing AND not production

### H10. Branch protection / required CI checks
- **Description:** CI workflow exists; GitHub required checks not enabled.
- **Files affected:** `.github/workflows/ci.yml`, GitHub settings
- **Risk:** Broken main merges
- **Estimated time:** 30 m
- **Dependencies:** [H] First green CI on main
- **Priority:** High
- **Status:** [H]

### H11. Confirm `NEXT_PUBLIC_APP_URL` on Vercel production
- **Description:** Required for correct QR / verify URLs.
- **Files affected:** Vercel env
- **Risk:** Wrong verification hosts
- **Estimated time:** 15 m
- **Dependencies:** [H] Founder / DevOps
- **Priority:** High
- **Status:** [H]

---

## Medium = Quality improvements

### M1. Deduplicate logic / unused imports / dead code sweep
- **Description:** Full-repo unused imports, unreachable code, deprecated wrappers.
- **Files affected:** Broad (`lib/`, `components/`, `app/`)
- **Risk:** Low (behavior-preserving)
- **Estimated time:** 4–8 h
- **Dependencies:** Critical/High done
- **Priority:** Medium
- **Status:** [ ]

### M2. Accessibility pass (forms, dialogs, tables)
- **Description:** Focus traps, labels, contrast on Generator/History/Settings.
- **Files affected:** `components/*View.tsx`, modals
- **Risk:** Low–medium compliance
- **Estimated time:** 4 h
- **Dependencies:** None
- **Priority:** Medium
- **Status:** [ ]

### M3. Improve error surfacing (no silent best-effort where integrity matters)
- **Description:** Audit append / payment_status mirror should surface or retry, not only swallow.
- **Files affected:** `app/actions/salary-payment.ts`, `app/actions/payroll.ts`
- **Risk:** Medium audit gaps
- **Estimated time:** 3 h
- **Dependencies:** C5, H5
- **Priority:** Medium
- **Status:** [ ]

### M4. PDF edge-case polish (long names, large amounts, multi-entity)
- **Description:** Bank-grade print QA for authorised + internal slips.
- **Files affected:** `lib/pdf-vector.ts`, `lib/authorised-export.ts`, `components/SalarySlip.tsx`, `AuthorisedSlip.tsx`
- **Risk:** Clipping / overlap in edge cases
- **Estimated time:** 4–6 h
- **Dependencies:** C1
- **Priority:** Medium
- **Status:** [ ]

### M5. Test coverage for auth, payment gate, finalize failure paths
- **Description:** Expand Vitest for fail-closed paths and payment races (unit-level).
- **Files affected:** `lib/__tests__/*`, possibly action-level tests
- **Risk:** Low
- **Estimated time:** 4–6 h
- **Dependencies:** C1–C5 fixes
- **Priority:** Medium
- **Status:** [ ]

### M6. Migration consolidation plan (non-destructive)
- **Description:** Document linear apply order for fresh envs; do not rewrite live history blindly.
- **Files affected:** `docs/` + `DATABASE.md`, migrations README
- **Risk:** Ops confusion
- **Estimated time:** 3 h
- **Dependencies:** C6
- **Priority:** Medium
- **Status:** [ ]

### M7. Performance: proven bottlenecks only (History large lists, PDF gen)
- **Description:** Profile before optimizing; lazy routes if bundle proves heavy.
- **Files affected:** TBD after measurement
- **Risk:** Premature optimization
- **Estimated time:** 2–4 h
- **Dependencies:** Baseline build metrics
- **Priority:** Medium
- **Status:** [ ]

---

## Low = Future improvements (v1.1 / v2.0)

### L1. Admin MFA / password hygiene
- **Status:** [H] Supabase Auth dashboard
- **Priority:** Low (ops) — recommended before paying large salaries

### L2. Uptime monitor on app + `/verify`
- **Status:** [H]
- **Priority:** Low

### L3. Full document void UI (B5)
- **Status:** Partial — supersede works; void UI optional
- **Priority:** Low → v1.1

### L4. B1 payday any-day / B6–B9 / B10 history reset
- **Status:** Blocked on founder prompt pack — do not invent
- **Priority:** Low → v1.1+

### L5. Employment Verification Letter
- **Status:** Frozen until founder requests
- **Priority:** Low → v2.0

### L6. CA sitting items (TDS, Kochi PT, intern vs salary)
- **Status:** [H]
- **Priority:** Low (policy)

### L7. JSON export after every payroll; Supabase Pro pricing
- **Status:** [H] ops
- **Priority:** Low

### L8. Drop mock client entirely outside tests
- **Status:** After C2 production fail-closed; keep test doubles only
- **Priority:** Low → v1.1

---

## Execution order (this sprint)

1. C1 → C7 (blockers)  
2. H1–H9 (must-fix; skip H10–H11 human)  
3. M1–M6 as capacity allows  
4. Deliverables: `SECURITY_REPORT.md`, `PERFORMANCE_REPORT.md`, `CODE_QUALITY_REPORT.md`, `RELEASE_CHECKLIST.md`, `FINAL_AUDIT.md`, `CHANGELOG.md`, ops docs  

## Definition of done for v1.0

- [ ] All Critical closed or explicitly accepted in `FINAL_AUDIT.md` with residual risk
- [ ] All High closed or human-owned with checklist owners
- [ ] `npm run typecheck`, `lint`, `test`, `build` green
- [ ] Dress rehearsal path documented: draft → finalize → pay → bank copy → QR → `/verify` → supersede
