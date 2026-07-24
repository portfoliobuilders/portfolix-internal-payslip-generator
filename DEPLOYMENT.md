# DEPLOYMENT.md

## Stack

- Next.js 14 (App Router) on **Vercel**
- **Supabase** (Postgres + Auth + Storage)
- Node 20 (CI)

## One-time database

1. Apply migrations per `DATABASE.md` (live go-live set).  
2. Apply **`019_payroll_admin_rls.sql`** if not yet on live.  
3. Ensure Storage buckets: `signatory-assets` (private), `branding` as configured.  
4. Seed / confirm founding row in `payroll_admins`.

## Vercel environment

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_APP_URL=https://<stable-production-host>
```

Production fails closed if URL/anon key or (for admin actions) secret key / app URL are missing.

## Deploy

1. Merge to `main` (CI: typecheck, lint, test, build).  
2. Vercel production deploy from `main`.  
3. Smoke: login → roster → settings drift banner → one unpaid bank-copy blocked.  
4. Tag `v1.0.0`.

## Rollback

- Vercel: promote previous deployment.  
- DB: do **not** casually reverse `019`; if needed, restore from backup / PITR. Prefer forward fixes.

## Post-deploy

See `RELEASE_CHECKLIST.md` dress rehearsal and `OPERATIONS.md`.
