# BACKUP_RECOVERY.md

## What to protect

- Supabase Postgres (employees, slips, obligations, issued docs, settings)  
- Storage: `signatory-assets`, branding logos  
- Vercel env var values (store in a secrets manager / 1Password — not git)

## Backups

1. Prefer **Supabase PITR / daily backups** on a paid plan before running real payroll volumes.  
2. After each payroll finalize cycle, export a JSON snapshot of slips for that month (ops checklist).  
3. Keep a copy of applied migration list (`schema_migrations`).

## Recovery

1. Restore DB to point-in-time **before** the incident.  
2. Re-deploy matching app git tag (`v1.0.0`, etc.).  
3. Re-verify `payroll_admins`, RLS (`019`), and one authorised PDF verify URL.  
4. Do **not** re-run historical conflicting migrations blindly — follow `DATABASE.md`.

## RPO / RTO (targets)

- RPO: ≤ 24h with standard backups; better with PITR.  
- RTO: &lt; 4h for restore + smoke (internal tool).
