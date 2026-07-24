# OPERATIONS.md

## Daily / payday

1. Confirm attendance cycle ended (24th cycle) before Finalize.  
2. Finalize → obligation appears UNPAID.  
3. Record bank payment → confirm → outstanding 0 / PAID.  
4. Generate authorised bank copy; scan QR on phone.  
5. Export JSON backup of payroll run (founder ops preference).

## Monitoring

- Uptime: hit production origin + a known `/verify/payslip/...` sample (non-sensitive).  
- Settings drift banner / admin schema probe after deploys.  
- Vercel + Supabase status pages.

## Incidents

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| 503 on app | Missing Supabase env in production | Fix Vercel env; redeploy |
| Cannot finalize | Strict gates / period not ended | Wait for cycle end or fix attendance |
| Bank copy blocked | Unpaid / no obligation | Complete payment ledger |
| History empty / insert fails | Bad slip FK | Ensure `fix_slip_fk` posture; see DATABASE.md |
| Non-admin sees data | `019` not applied | Apply `019_payroll_admin_rls.sql` |

## Logging

Prefer `console.error` for failures. Do not log full PAN/account numbers.
