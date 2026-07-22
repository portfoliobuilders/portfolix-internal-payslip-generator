import { describe, expect, it } from 'vitest';
import { buildDriftReport } from '@/lib/schema-drift';
import { toUserFacingDbError } from '@/lib/supabase-errors';

describe('schema drift guard', () => {
  it('reports pending when a required migration name is missing', () => {
    const report = buildDriftReport(
      [
        'authorised_slip',
        'align_authorised_slip_schema',
        'salary_payment_reconciliation',
        'payroll_integrity_columns',
        'payroll_audit_and_finalize_guard',
        'payroll_slip_cycle_obligation_document_registry',
        'payroll_cycle_methods_and_schedules',
        'verification_hits',
        'unify_employee_base_salary',
        // missing issued_pdf_immutability + align_payroll_document_lifecycle_columns
      ],
      [],
    );
    expect(report.ok).toBe(false);
    expect(report.pendingMigrations.some((f) => f.includes('013_issued_pdf'))).toBe(true);
    expect(report.pendingMigrations.some((f) => f.includes('016_align'))).toBe(true);
    expect(report.bannerMessage).toMatch(/Database schema is behind the deployed code/);
  });

  it('is ok when applied names cover expected set and canaries are clean', () => {
    const report = buildDriftReport(
      [
        'add_employee_details_json',
        'allow_anon_payroll_access',
        'workforce_payment_statements',
        'fix_slip_fk',
        'payroll_slips_fk_set_null_on_delete',
        'authorised_slip',
        'align_authorised_slip_schema',
        'company_legal_settings',
        'portfolix_entreprise_spelling',
        'employment_dates',
        'payroll_calculation_methods',
        'payroll_integrity_columns',
        'payroll_audit_and_finalize_guard',
        'salary_payment_reconciliation',
        'payroll_slip_cycle_obligation_document_registry',
        'payroll_cycle_methods_and_schedules',
        'issued_pdf_immutability',
        'authorised_slip_document_number',
        'unify_employee_base_salary',
        'authorised_registry_harden',
        'verification_hits',
        'authenticated_rls',
        'align_payroll_document_lifecycle_columns',
        'document_lifecycle_and_payroll_admins',
        'compat_compensation_and_issued_doc_unique',
      ],
      [],
    );
    expect(report.ok).toBe(true);
    expect(report.bannerMessage).toBeNull();
  });
});

describe('toUserFacingDbError', () => {
  it('maps missing-column Postgres text to schema-drift copy', () => {
    const msg = toUserFacingDbError(
      { message: 'column payroll_slips.internal_document_status does not exist', code: '42703' },
      'Failed.',
      'test',
    );
    expect(msg).toMatch(/Database schema is behind/);
    expect(msg).not.toMatch(/internal_document_status/);
  });
});
