# Branch Consolidation Audit

Base branch: `main`  
Integration branch: `integration/consolidate-supabase-routing-settings`  
Backup branch: `backup/main-before-branch-consolidation`

## Remote branch inventory and recommendations

Legend for recommendations:
- `MERGE`
- `SKIP_DUPLICATE` (already merged / no unique commits)
- `SKIP_OLD` (older branch lineage superseded by main)
- `SKIP_EXPERIMENTAL` (risky/unrelated direction)
- `NEEDS_MANUAL_REVIEW` (contains potentially risky business logic)

| Branch | Last commit date (UTC) | Last commit message | Files changed vs `main` | Touch areas | Recommendation |
|---|---|---|---|---|---|
| `origin/main` | 2026-07-07 13:36:27 +0530 | Add files via upload | _baseline_ | _baseline_ | `SKIP_DUPLICATE` |
| `origin/cursor/static-company-config-f116` | 2026-07-07 08:09:14 +0000 | Switch bundled logos from SVG to PNG assets | `app/page.tsx`, `app/settings/page.tsx`, `components/GeneratorView.tsx`, `components/SettingsView.tsx`, `lib/constants/company.ts`, `lib/logos.ts`, `public/logos/*`, `store/useHRStore.ts` | settings, generator, assets/logos | `SKIP_EXPERIMENTAL` |
| `origin/cursor/app-router-navigation-fix-8649` | 2026-07-07 07:47:34 +0000 | Fix App Router routes and persistent navbar | `app/employee-roster/page.tsx`, `app/generator/page.tsx`, `app/history/page.tsx`, `app/layout.tsx`, `app/page.tsx`, `app/settings/page.tsx`, `components/AppHeader.tsx` | routing/pages | `MERGE` |
| `origin/cursor/settings-supabase-migration-5dd9` | 2026-07-07 07:38:46 +0000 | Add reproducible cloud agent setup with npm ci | `app/actions/settings.ts`, `components/EntityLogoUpload.tsx`, `components/SettingsView.tsx`, `store/useHRStore.ts`, `supabase/migrations/003_company_settings.sql`, `scripts/setup-env.sh`, `environment.json`, `README.md`, `package.json`, `utils/supabase/mock-client.ts` | Supabase persistence, settings persistence, migrations, environment setup | `MERGE` |
| `origin/cursor/handbook-reference-audit-1b92` | 2026-07-07 07:07:40 +0000 | Add handbook reference-only audit and backlog | `docs/handbook-reference-audit.md`, `README.md` | README/docs only | `MERGE` |
| `origin/cursor/workforce-payment-statements-2a00` | 2026-07-07 06:58:58 +0000 | Add workforce payment classifications and statement history | `app/actions/payroll.ts`, `app/page.tsx`, `components/EmployeeFormModal.tsx`, `components/GeneratorView.tsx`, `components/HistoryView.tsx`, `components/RosterView.tsx`, `components/SalarySlip.tsx`, `lib/workforce.ts`, `lib/types.ts`, `lib/payroll-db.ts`, `lib/employee-excel.ts`, `supabase/migrations/003_workforce_payment_statements.sql`, `README.md` | employee roster, generator, history, Supabase persistence, migrations | `MERGE` |
| `origin/cursor/persistence-routing-19c1` | 2026-07-07 06:45:02 +0000 | Add URL routing and Supabase-backed settings persistence | `app/(main)/*`, `app/actions/payroll.ts`, `app/page.tsx`, `components/AppShell.tsx`, `components/PayrollDataProvider.tsx`, `components/SettingsView.tsx`, `components/RosterView.tsx`, `components/HistoryView.tsx`, `components/GeneratorView.tsx`, `hooks/useAppSettings.ts`, `store/useHRStore.ts`, `lib/payroll-db.ts`, `lib/seed-settings.ts`, `supabase/migrations/003_app_settings.sql`, `README.md` | Supabase persistence, settings persistence, roster, generator, history, routing/pages, migrations | `MERGE` |
| `origin/cursor/payroll-slip-fk-fix-df21` | 2026-07-07 00:51:04 +0000 | Fix slip save FK mapping and add acceptance test | `app/actions/payroll.ts`, `components/GeneratorView.tsx`, `lib/payroll-db.ts`, `supabase/migrations/003_allow_anon_access.sql`, `supabase/migrations/004_payroll_slips_fk_set_null.sql`, `scripts/acceptance-test.mjs`, `package.json`, `package-lock.json` | Supabase persistence, generator, migrations | `NEEDS_MANUAL_REVIEW` |
| `origin/cursor/payroll-rules-architecture-7420` | 2026-07-07 00:10:25 +0000 | docs: update payroll-rules Architecture for Supabase stack | `.cursor/rules/payroll-rules.mdc` | docs/tooling only | `SKIP_EXPERIMENTAL` |
| `origin/cursor/supabase-mcp-setup-2de9` | 2026-07-06 23:27:25 +0000 | Document Supabase MCP and agent skills in README | `.agents/skills/*`, `.cursor/mcp.json`, `skills-lock.json`, `README.md` | package/environment/tooling docs | `SKIP_EXPERIMENTAL` |
| `origin/cursor/supabase-setup-0d18` | 2026-07-06 22:18:00 +0000 | Add Supabase MCP server configuration for Cursor | `.agents/skills/*`, `.cursor/mcp.json`, `utils/supabase/*`, `middleware.ts`, `app/todos/page.tsx`, lock/package updates | tooling, optional demo setup | `SKIP_EXPERIMENTAL` |
| `origin/cursor/portfolix-salary-slip-generator-c2b1` | 2026-07-06 22:13:59 +0000 | docs: update README with completed feature overview | broad app scaffold history branch | old scaffold lineage | `SKIP_OLD` |
| `origin/cursor/supabase-payroll-migration-241d` | 2026-07-06 22:09:56 +0000 | feat: add Excel template download and bulk employee upload | no unique diff vs main | already integrated in main history | `SKIP_DUPLICATE` |
| `origin/cursor/slip-finalize-audit-9f09` | 2026-07-06 21:49:37 +0000 | fix: slip visual parity, print/PDF margins, payroll stress-test panel | no unique diff vs main | already integrated in main history | `SKIP_DUPLICATE` |
| `origin/cursor/entity-logo-upload-9f09` | 2026-07-06 21:42:37 +0000 | feat: uploadable entity logos in Settings and Portfolix Enterprise header logo | no unique diff vs main | already integrated in main history | `SKIP_DUPLICATE` |
| `origin/cursor/add-settings-tab-9f09` | 2026-07-06 20:56:42 +0000 | feat: add Settings tab for payroll calendar and entity branding | no unique diff vs main | already integrated in main history | `SKIP_DUPLICATE` |
| `origin/cursor/portfolix-salary-slip-generator-c1f1` | 2026-07-06 20:39:47 +0000 | Add next-env.d.ts so typecheck works on fresh clones | no unique diff vs main | already integrated in main history | `SKIP_DUPLICATE` |
| `origin/cursor/portfolix-salary-slip-generator-915a` | 2026-07-06 20:34:29 +0000 | docs: note Settings tab and test script in README | broad old lineage | superseded by newer merged history | `SKIP_OLD` |
| `origin/cursor/step1-foundation-049e` | 2026-07-06 20:34:08 +0000 | Finalize spec alignment and handoff documentation | broad old lineage | superseded prototype branch | `SKIP_OLD` |
| `origin/cursor/portfolix-salary-slip-generator-5fd7` | 2026-07-06 20:31:48 +0000 | fix: cleanup unused imports, dead code, and logic issues | old `portfolix-slipgen/` nested app scaffold | experimental scaffold path | `SKIP_EXPERIMENTAL` |
| `origin/cursor/step1-scaffold-slipgen-4fda` | 2026-07-06 20:31:48 +0000 | Add salary slip PDF export and history | broad prototype lineage | old scaffold | `SKIP_OLD` |
| `origin/cursor/step4-slip-pdf-history-7650` | 2026-07-06 20:26:14 +0000 | feat: Step 4 — SalarySlip PDF export, finalize flow, and History | old `src/` app lineage | superseded scaffold branch | `SKIP_OLD` |
| `origin/cursor/generator-step3-7650` | 2026-07-06 20:23:46 +0000 | feat: Step 3 — split-screen Generator with live payroll preview | old `src/` app lineage | superseded scaffold branch | `SKIP_OLD` |
| `origin/cursor/employee-roster-step2-7650` | 2026-07-06 20:19:13 +0000 | feat: Step 2 — Employee Roster with CRUD, flex-bank, and backup bar | old `src/` app lineage | superseded scaffold branch | `SKIP_OLD` |
| `origin/cursor/scaffold-step1-payslip-7650` | 2026-07-06 20:12:41 +0000 | feat: Step 1 — scaffold Next.js app, payroll engine, and HR store | old `src/` app scaffold | superseded scaffold branch | `SKIP_OLD` |

## Planned merge order

1. `origin/cursor/settings-supabase-migration-5dd9`
2. `origin/cursor/persistence-routing-19c1`
3. `origin/cursor/workforce-payment-statements-2a00`
4. `origin/cursor/app-router-navigation-fix-8649`
5. `origin/cursor/handbook-reference-audit-1b92`

Deferred pending manual review:
- `origin/cursor/payroll-slip-fk-fix-df21`

