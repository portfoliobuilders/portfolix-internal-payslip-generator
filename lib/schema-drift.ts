/**
 * Expected schema migrations for the deployed app.
 *
 * Local files use numbered prefixes (001_…); live `schema_migrations.name`
 * values are snake_case stems (sometimes historical aliases). The drift check
 * treats a migration as applied when ANY alias in `appliedNames` is present.
 *
 * Read-only — the app never auto-applies migrations.
 */

export type ExpectedMigration = {
  /** Repo filename under supabase/migrations/ */
  file: string;
  /** Names that may appear in supabase_migrations.schema_migrations */
  appliedNames: string[];
  /**
   * When true, this file is a sibling of another migration that covers the
   * same concern; satisfied if ANY of appliedNames is present.
   * When false (default), at least one appliedNames entry must be present.
   */
  optionalSibling?: boolean;
};

/**
 * Migrations the running code depends on. Order matches repo chronology.
 * Historical remote names are listed as aliases where they diverge from the file stem.
 */
export const EXPECTED_SCHEMA_MIGRATIONS: ExpectedMigration[] = [
  {
    file: '002_employee_details_json.sql',
    appliedNames: ['employee_details_json', 'add_employee_details_json'],
  },
  {
    file: '003_allow_anon_access.sql',
    appliedNames: ['allow_anon_access', 'allow_anon_payroll_access'],
  },
  {
    file: '003_workforce_payment_statements.sql',
    appliedNames: ['workforce_payment_statements'],
  },
  {
    file: '004_fix_slip_fk.sql',
    appliedNames: ['fix_slip_fk'],
  },
  {
    file: '004_payroll_slips_fk_set_null.sql',
    appliedNames: ['payroll_slips_fk_set_null', 'payroll_slips_fk_set_null_on_delete'],
  },
  {
    file: '005_authorised_slip.sql',
    appliedNames: ['authorised_slip'],
  },
  {
    // Prior drift incident — align was applied as a separate remote entry.
    file: '005_authorised_slip.sql (align)',
    appliedNames: ['align_authorised_slip_schema'],
  },
  {
    file: '006_company_legal_settings.sql',
    appliedNames: ['company_legal_settings'],
  },
  {
    file: '006_portfolix_entreprise_spelling.sql',
    appliedNames: ['portfolix_entreprise_spelling'],
  },
  {
    file: '007_employment_dates.sql',
    appliedNames: ['employment_dates'],
  },
  {
    file: '008_payroll_calculation_methods.sql',
    appliedNames: ['payroll_calculation_methods'],
  },
  {
    file: '009_payroll_integrity_columns.sql',
    appliedNames: ['payroll_integrity_columns'],
  },
  {
    file: '010_payroll_audit_and_finalize_guard.sql',
    appliedNames: ['payroll_audit_and_finalize_guard'],
  },
  {
    file: '011_salary_payment_reconciliation.sql',
    appliedNames: ['salary_payment_reconciliation'],
  },
  {
    file: '012_payroll_cycle_schedules_documents.sql',
    appliedNames: [
      'payroll_cycle_schedules_documents',
      'payroll_slip_cycle_obligation_document_registry',
    ],
  },
  {
    // Full integrity file conflicts with documents schema on live; the bridge
    // migration below carries the document-lifecycle columns the code needs.
    file: '012_payroll_cycle_schedules_integrity.sql',
    appliedNames: [
      'payroll_cycle_schedules_integrity',
      'payroll_cycle_methods_and_schedules',
      'align_payroll_document_lifecycle_columns',
    ],
  },
  {
    file: '013_issued_pdf_immutability.sql',
    appliedNames: ['issued_pdf_immutability'],
  },
  {
    // main — persist ASL document_number on authorised_slip_log
    file: '013_authorised_slip_document_number.sql',
    appliedNames: [
      '013_authorised_slip_document_number',
      'authorised_slip_document_number',
    ],
  },
  {
    file: '014_unify_employee_base_salary.sql',
    appliedNames: ['unify_employee_base_salary'],
  },
  {
    file: '014_authorised_registry_harden.sql',
    appliedNames: [
      '014_authorised_registry_harden',
      'authorised_registry_harden',
    ],
  },
  {
    file: '015_verification_hits.sql',
    appliedNames: ['verification_hits'],
  },
  {
    file: '015_authenticated_rls.sql',
    appliedNames: ['015_authenticated_rls', 'authenticated_rls'],
  },
  {
    file: '016_align_payroll_document_lifecycle_columns.sql',
    appliedNames: ['align_payroll_document_lifecycle_columns'],
  },
  {
    file: '017_document_lifecycle_and_payroll_admins.sql',
    appliedNames: [
      '017_document_lifecycle_and_payroll_admins',
      'document_lifecycle_and_payroll_admins',
    ],
  },
  {
    file: '018_compat_compensation_and_issued_doc_unique.sql',
    appliedNames: [
      '018_compat_compensation_and_issued_doc_unique',
      'compat_compensation_and_issued_doc_unique',
    ],
  },
];

/** Canary columns the deployed code reads/writes — belt-and-suspenders vs name tracking alone. */
export const SCHEMA_CANARY_COLUMNS: Array<{ table: string; column: string; migrationHint: string }> =
  [
    {
      table: 'payroll_slips',
      column: 'internal_document_status',
      migrationHint: '016_align_payroll_document_lifecycle_columns.sql',
    },
    {
      table: 'payroll_slips',
      column: 'authorised_document_status',
      migrationHint: '016_align_payroll_document_lifecycle_columns.sql',
    },
    {
      table: 'payroll_slips',
      column: 'voided_at',
      migrationHint: '017_document_lifecycle_and_payroll_admins.sql',
    },
    {
      table: 'payroll_issued_documents',
      column: 'pdf_storage_path',
      migrationHint: '013_issued_pdf_immutability.sql',
    },
    {
      table: 'verification_hits',
      column: 'issued_document_id',
      migrationHint: '015_verification_hits.sql',
    },
  ];

export type SchemaDriftReport = {
  ok: boolean;
  pendingMigrations: string[];
  missingCanaries: string[];
  appliedCount: number;
  expectedCount: number;
  bannerMessage: string | null;
};

export function buildDriftReport(
  appliedNames: string[],
  missingCanaries: string[],
): SchemaDriftReport {
  const applied = new Set(appliedNames.map((n) => n.trim().toLowerCase()));
  const pendingMigrations: string[] = [];

  for (const expected of EXPECTED_SCHEMA_MIGRATIONS) {
    const hit = expected.appliedNames.some((n) => applied.has(n.toLowerCase()));
    if (!hit) pendingMigrations.push(expected.file);
  }

  // Deduplicate display names (align entry shares stem with 005)
  const uniquePending = [...new Set(pendingMigrations)];
  const ok = uniquePending.length === 0 && missingCanaries.length === 0;

  let bannerMessage: string | null = null;
  if (!ok) {
    const names =
      uniquePending.length > 0
        ? uniquePending.join(', ')
        : missingCanaries.map((c) => `${c} (canary)`).join(', ');
    bannerMessage = `Database schema is behind the deployed code — ${uniquePending.length || missingCanaries.length} pending migration${
      (uniquePending.length || missingCanaries.length) === 1 ? '' : 's'
    }: ${names}. Run them in the Supabase SQL Editor.`;
  }

  return {
    ok,
    pendingMigrations: uniquePending,
    missingCanaries,
    appliedCount: appliedNames.length,
    expectedCount: EXPECTED_SCHEMA_MIGRATIONS.length,
    bannerMessage,
  };
}
