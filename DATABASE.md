# Database — schema & migrations

## Live go-live set (production, 2026-07)

Apply / confirm these in order (stems as seen in `schema_migrations`):

1. Baseline through `015_authenticated_rls` / `015_verification_hits`
2. `016_align_payroll_document_lifecycle_columns` (document columns)
3. `016_harden_authenticated_rls` (drop anon; authenticated policies)
4. `017_unify_base_salary_lifecycle_admins` (base salary + `payroll_admins`)
5. `018_drop_compensation_sync_trigger`
6. **`019_payroll_admin_rls`** — restrict PostgREST to `payroll_admins` via `is_payroll_admin()`

## Conflicting siblings (do not invent a full squash for v1.0)

| Prefix | Conflict | Safe posture |
|--------|----------|--------------|
| `004_*` | `fix_slip_fk` drops wrong FK; old `payroll_slips_fk_set_null` re-added it | Repo now makes set-null a **drop-only** no-op. Prefer `fix_slip_fk`. |
| `012_*` | documents vs integrity table shapes | Live uses documents + `016_align` bridge. Integrity file is optional sibling for drift. |
| `017_*` / `018_*` | unify/drop vs document_lifecycle/compat | Live: unify + drop. Compat/document_lifecycle marked optional siblings in drift. |

## Fresh environment apply order

Apply every file under `supabase/migrations/` lexicographically **after** confirming no second apply of a conflicting sibling that already ran. Prefer the live go-live set above.

Never re-introduce `payroll_slips.employee_id → employees(employee_id)` (business-id FK).

## Drift check

`lib/schema-drift.ts` + Settings / `GET /api/health/schema` (payroll-admin only).  
`optionalSibling: true` means missing that file does not fail the banner.

## Atomic finalize (residual)

App-side finalize now **fails closed** on integrity / audit / flex / obligation errors and checks the duplicate-final RPC `{ error }`. A single Postgres RPC wrapping slip + flex + obligation remains **v1.1** work — see `PRODUCTION_BACKLOG.md` C5 residual.
