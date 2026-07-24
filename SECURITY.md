# SECURITY.md

Internal HR payroll tool. Treat salary, PAN, and bank details as confidential.

## Threat model (short)

- Attackers with the publishable anon key must not read payroll tables (RLS + no anon policies after harden).
- Any authenticated Supabase user who is **not** in `payroll_admins` must not read/write payroll (migration `019`).
- Authorised bank-copy PDFs must not issue while payment outstanding remains.
- Public `/verify` may confirm document authenticity without exposing full bank/PAN payloads beyond product policy.

## Required controls

1. Keep `SUPABASE_SECRET_KEY` server-only.  
2. Keep operators in `payroll_admins` only.  
3. Set `NEXT_PUBLIC_APP_URL` to the stable production origin.  
4. Enable MFA for admin accounts (Supabase dashboard).  
5. Never commit `.env.local`.

## Reporting

Internal: notify founding operator. Do not open public issues with live payroll data.

See also: `SECURITY_REPORT.md`.
