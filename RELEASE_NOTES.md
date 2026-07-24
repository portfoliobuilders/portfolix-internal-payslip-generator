# RELEASE_NOTES.md — v1.0.0

Portfolix SlipGen is ready for **controlled production use** as an internal payroll slip and bank-copy tool, subject to the human checklist in `RELEASE_CHECKLIST.md`.

## What operators get

- Roster, generator, history, settings on Supabase  
- Draft → Final payroll with integrity checks  
- Payment ledger before authorised bank-copy PDF  
- QR verification page for issued bank copies  

## What changed for go-live safety

- Unpaid slips cannot mint authorised bank copies  
- Misconfigured production env no longer opens the app shell  
- Only payroll admins can access payroll data via the API (after DB migration `019`)  
- Stricter finalize rules (attendance period must have ended)

## Before first real payday

1. Apply `019_payroll_admin_rls.sql` on live.  
2. Confirm Vercel env including `NEXT_PUBLIC_APP_URL`.  
3. Run the dress rehearsal on the release checklist.  
4. Enable admin MFA.

## Not in 1.0

- Full atomic finalize RPC (mitigated in app; RPC in 1.1)  
- Employment verification letter  
- Destructive history reset  
- Handbook auto-enforcement
