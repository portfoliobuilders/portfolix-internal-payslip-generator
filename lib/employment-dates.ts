/**
 * Employment-date consistency helpers.
 * Never invent transfer / joining dates — only validate and warn.
 */

export interface EmploymentDatesInput {
  /** Company incorporation date (ISO YYYY-MM-DD). Null = not configured. */
  companyIncorporationDate: string | null;
  /** Original group joining date (may predate incorporation with continuity). */
  groupJoiningDate: string | null;
  /** Joining date under the current legal entity. */
  legalEntityJoiningDate: string | null;
  employmentTransferDate: string | null;
  confirmationDate: string | null;
  currentSalaryEffectiveDate: string | null;
  /** True only when an explicit employment-continuity / transfer record exists. */
  hasEmploymentContinuityRecord: boolean;
}

export type EmploymentDateIssue =
  | { level: 'error' | 'warning'; code: string; message: string };

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validateEmploymentDates(input: EmploymentDatesInput): EmploymentDateIssue[] {
  const issues: EmploymentDateIssue[] = [];
  const incorporation = parseIsoDate(input.companyIncorporationDate);
  const groupJoin = parseIsoDate(input.groupJoiningDate);
  const legalJoin = parseIsoDate(input.legalEntityJoiningDate);
  const transfer = parseIsoDate(input.employmentTransferDate);
  const confirmation = parseIsoDate(input.confirmationDate);
  const salaryEffective = parseIsoDate(input.currentSalaryEffectiveDate);

  if (!legalJoin && groupJoin) {
    issues.push({
      level: 'warning',
      code: 'MISSING_LEGAL_ENTITY_JOINING_DATE',
      message:
        'Legal entity joining date is missing. Historical group joining date needs HR review before finalisation.',
    });
  }

  if (incorporation && legalJoin && legalJoin < incorporation) {
    issues.push({
      level: 'error',
      code: 'LEGAL_JOIN_BEFORE_INCORPORATION',
      message:
        'Legal entity joining date cannot be earlier than the company incorporation date.',
    });
  }

  if (incorporation && groupJoin && groupJoin < incorporation && !input.hasEmploymentContinuityRecord) {
    issues.push({
      level: 'warning',
      code: 'GROUP_JOIN_BEFORE_INCORPORATION',
      message:
        'Original group joining date predates incorporation. Add an employment-continuity or transfer record, or correct the dates. Do not invent a transfer date.',
    });
  }

  if (transfer && !input.hasEmploymentContinuityRecord) {
    issues.push({
      level: 'warning',
      code: 'TRANSFER_WITHOUT_CONTINUITY',
      message:
        'Employment transfer date is set without a continuity/source-entity record. Require HR confirmation.',
    });
  }

  const employmentStart = legalJoin ?? groupJoin;
  if (salaryEffective && employmentStart && salaryEffective < employmentStart) {
    issues.push({
      level: 'error',
      code: 'SALARY_EFFECTIVE_BEFORE_START',
      message: 'Salary-effective date cannot be before the employment start date.',
    });
  }

  if (confirmation && employmentStart && confirmation < employmentStart) {
    issues.push({
      level: 'error',
      code: 'CONFIRMATION_BEFORE_START',
      message: 'Confirmation date cannot be before the employment start date.',
    });
  }

  return issues;
}

/** Display policy for joining dates — never invent values. */
export function joiningDateDisplay(input: {
  groupJoiningDate: string | null;
  legalEntityJoiningDate: string | null;
  employmentTransferDate: string | null;
  legacyJoiningDate: string | null;
}): {
  mode: 'legal_only' | 'group_and_transfer' | 'legacy_unreviewed';
  primaryDate: string | null;
  groupJoiningDate: string | null;
  transferDate: string | null;
} {
  if (input.legalEntityJoiningDate && input.groupJoiningDate && input.employmentTransferDate) {
    return {
      mode: 'group_and_transfer',
      primaryDate: input.legalEntityJoiningDate,
      groupJoiningDate: input.groupJoiningDate,
      transferDate: input.employmentTransferDate,
    };
  }
  if (input.legalEntityJoiningDate) {
    return {
      mode: 'legal_only',
      primaryDate: input.legalEntityJoiningDate,
      groupJoiningDate: null,
      transferDate: null,
    };
  }
  return {
    mode: 'legacy_unreviewed',
    primaryDate: input.legacyJoiningDate,
    groupJoiningDate: input.groupJoiningDate,
    transferDate: null,
  };
}
