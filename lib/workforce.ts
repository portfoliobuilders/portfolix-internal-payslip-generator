import type { EngagementType, EmploymentStatus, PaymentStatementMeta, PaymentType } from './types';

export function defaultPaymentTypeForEngagement(engagementType: EngagementType): PaymentType {
  if (engagementType === 'intern' || engagementType === 'trainee' || engagementType === 'apprentice') {
    return 'stipend';
  }
  if (engagementType === 'freelancer') return 'professional_fee';
  if (engagementType === 'consultant') return 'consultancy_fee';
  return 'salary';
}

export function compensationLabelForPaymentType(paymentType: PaymentType): string {
  switch (paymentType) {
    case 'stipend':
      return 'Monthly Stipend';
    case 'professional_fee':
      return 'Professional Fee';
    case 'consultancy_fee':
      return 'Consultancy Fee';
    case 'contract_remuneration':
      return 'Contract Remuneration';
    case 'honorarium':
      return 'Honorarium';
    case 'salary':
    default:
      return 'Base Salary';
  }
}

/** Form label for the single employee money field (baseSalary). */
export function baseSalaryInputLabel(paymentType: PaymentType): string {
  switch (paymentType) {
    case 'stipend':
      return 'Stipend (monthly, ₹)';
    case 'professional_fee':
    case 'consultancy_fee':
    case 'contract_remuneration':
    case 'honorarium':
      return 'Contract fee (₹)';
    case 'salary':
    default:
      return 'Base salary (monthly, ₹)';
  }
}

export function statementMetaFor(
  paymentType: PaymentType,
  engagementType: EngagementType,
  employmentStatus: EmploymentStatus,
): PaymentStatementMeta {
  let statementTitle = 'Salary Slip';
  let mainEarningLabel = 'Basic Salary';
  let disclaimer: string | null = null;

  if (paymentType === 'stipend') {
    statementTitle = 'Stipend Statement';
    mainEarningLabel = 'Monthly Stipend';
    disclaimer = 'This statement records stipend paid for internship/training period.';
  } else if (paymentType === 'professional_fee') {
    statementTitle = 'Professional Fee Statement';
    mainEarningLabel = 'Professional Fee';
    disclaimer = 'Subject to applicable TDS/compliance as per law.';
  } else if (paymentType === 'consultancy_fee') {
    statementTitle = 'Consultancy Fee Statement';
    mainEarningLabel = 'Consultancy Fee';
  } else if (paymentType === 'contract_remuneration') {
    statementTitle = 'Contract Remuneration Statement';
    mainEarningLabel = 'Contract Remuneration';
  } else if (paymentType === 'honorarium') {
    statementTitle = 'Honorarium Statement';
    mainEarningLabel = 'Honorarium';
  }

  let statusBadge: PaymentStatementMeta['statusBadge'] = null;
  if (engagementType === 'probation_employee') statusBadge = 'Probation';
  if (engagementType === 'notice_period_employee' || employmentStatus === 'notice_period') {
    statusBadge = 'Notice Period';
  }

  return { statementTitle, mainEarningLabel, disclaimer, statusBadge };
}
