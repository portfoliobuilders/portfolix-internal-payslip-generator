# SlipGen go-live board — status (2026-07-19)

Working document for the founder go-live checklist. **Does not invent missing playbooks.**
Next agent sessions must wait for the prompt pack (or paste Phase 5 + Prompt 2) before writing new RLS / CI from scratch.

## Blocker: prompt pack not in this repo

Searched `main`, all remote branches, `docs/`, Notion, and prior cloud-agent transcripts. **Missing:**

| Artifact | Needed for |
|---|---|
| Security playbook (Phase 5 RLS prompt) | A1 — confirm / finish RLS vs production |
| Runbook Prompt 2 | A2 — CI workflow + required checks |
| `cursor-prompt-payday-anyday-cycle-ratify.md` | B1 |
| `cursor-prompt-kerala-pt-slabs-monthly.md` | B2 |
| `cursor-prompt-unify-base-salary-field.md` | B3 |
| `cursor-prompt-remove-ytd-authorised-slip.md` | B4 |
| `cursor-prompt-document-lifecycle-cleanup.md` | B5 |
| `cursor-prompt-seal-overlay-verify-link.md` | B6 |
| `cursor-prompt-verify-page-fixes.md` | B7 |
| `cursor-prompt-verify-polish-and-log.md` | B8 |
| `cursor-prompt-roster-identity-data-update.md` | B9 |
| `cursor-prompt-onetime-history-reset.md` | B10 (run last) |
| Remaining-queue pack (Prompt C branch purge) | C — branch hygiene |
| Cloudflare / dpdns domain doc | A3 — custom domain |

**Ask:** paste or attach the prompt pack (folder, zip, or chat export). Prefer Phase 5 + Prompt 2 first.

---

## A. Security & infrastructure

### A1 — RLS (Phase 5) — code present; production apply + playbook gaps unconfirmed

| Item | Repo status (`main` @ this doc) |
|---|---|
| Login + middleware wall | Done — `/login`, `/auth/*`, `/verify/*` public; other routes redirect ([`utils/supabase/middleware.ts`](../utils/supabase/middleware.ts), [`lib/auth.ts`](../lib/auth.ts)) |
| `requirePayrollAdmin()` on mutating actions | Done — any signed-in Supabase user counts as admin (no `payroll_admins` table yet) |
| Migration [`015_authenticated_rls.sql`](../supabase/migrations/015_authenticated_rls.sql) | Present — drops policies whose *name/qual* contain `anon`; grants `authenticated` ALL on core payroll tables; issued docs stay service-role-only |
| Public `/verify` | Uses **service role** ([`app/actions/verification.ts`](../app/actions/verification.ts)) — matches 015 comment |
| `payroll_admins`-gated access | **Not done** — checklist wants an admins table; current model is “any authenticated user” |
| Storage re-check | **Gap** — `branding` still has insert/update `to anon, authenticated` ([`003_company_settings.sql`](../supabase/migrations/003_company_settings.sql)); `signatory-assets` already fail-closed |
| `company_settings` open policies | **Gap** — policy names lack `anon`, so 015’s drop loop may leave `to anon, authenticated` policies in place; table is also **not** in 015’s authenticated policy list |
| Applied on live Supabase? | **Unconfirmed** — agent cannot mark Phase 5 complete until founder confirms migration ran and anon PostgREST returns empty |

Do **not** write a follow-up migration until the security playbook Phase 5 prompt is available (or founder explicitly authorizes gap-only hardening of the two items above).

### A2 — CI + required checks — not started

- No `.github/workflows/` in repo.
- `package.json` already has `typecheck`, `lint`, `test`, `build` — ready for Prompt 2 once the runbook lands.
- Branch protection is a **human / GitHub settings** step after the workflow exists.

### A3 — Custom domain + canonical URL — partially gated in code

- [`lib/authorised-export.ts`](../lib/authorised-export.ts) `resolveCanonicalAppUrl()` requires `NEXT_PUBLIC_APP_URL`, blocks Vercel preview hosts.
- Human: wire preferred subdomain (or documented dpdns fallback), set env in Vercel, smoke a fresh PDF QR.

### A4 — Admin MFA / password hygiene — human (Supabase Auth dashboard)

### A5 — Uptime monitor on app + `/verify` — human (any free monitor)

---

## B. Written prompt queue — blocked on files

Partial overlap already on `main` (verify against prompt acceptance criteria when files arrive; do not assume done):

| Prompt | Likely already partially on `main` |
|---|---|
| Remove YTD authorised slip | Merged PR #50 (`cursor/remove-authorised-slip-ytd-column-89f8`) |
| Seal / verify / document lifecycle | Substantial authorised-slip + verify work in recent merges — still need prompt checklists |
| Roster identity | Bank/PAN fields exist; Athul/Fahad entry remains human |
| Unify base salary | No `014_unify_employee_base_salary.sql` on this `main` tip — treat as still open until prompt runs |
| Payday any-day / Kerala PT / history reset | Treat as open |

Order remains: B1 → … → B10 (history reset **last**, after smoke).

---

## C. Human tasks (agent cannot complete)

- [ ] Athul + Fahad: PAN, bank name, account, IFSC via Edit modals
- [ ] CA sitting (Athul TDS; Kochi PT schedule; mid-cycle PT; intern vs salary)
- [ ] Set real payday in Settings after any-day fix
- [ ] Confirm flex opening balances at history-reset Phase A
- [ ] Branch purge round two + GitHub “Automatically delete head branches”
- [x] AGENTS.md defers to `payroll-rules.mdc` — confirmed/added in same change set as this doc
- [ ] JSON export after every payroll; price Supabase Pro when paying real salaries

---

## D. Verification tests (after A1 confirmed on live DB)

- [ ] Incognito: every non-public route → `/login`; sign in; app works
- [ ] Anon-key PostgREST on payroll tables → empty / denied
- [ ] ₹20,400.00 vector on finished build
- [ ] Dress rehearsal: draft → finalize → pay → bank copy → phone QR → `/verify` → supersede → amber

---

## E. Freeze / F. Product calendar

Unchanged from founder board: no new features except Employment Verification Letter when founder says so; July close → Aug issue → three months of slips matching statements.

---

## Resume procedure (next agent)

1. Obtain prompt pack (or Phase 5 + Prompt 2 only).
2. One session per prompt, top to bottom; skip only after acceptance criteria pass on `main`.
3. Do not invent policies or CI beyond what the written prompt specifies.
4. After A1 lands on production: run Section D anon PostgREST proof before any real bank copy.
