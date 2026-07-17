/**
 * Shared domain types for the Portfolix Internal Salary Slip Generator.
 * Pure type definitions — no runtime code, no framework imports.
 */

export type EntityCode = 'PX' | 'PB' | 'PT' | 'PH';

export interface EntityInfo {
  name: string;
  /** e.g. "A unit of Portfolix Entreprise Pvt Ltd" — empty for the parent. */
  legalLine: string;
  addressLines: string[];
  /** Legacy display contact; prefer payrollEmail for payroll documents. */
  contact: string;
  /** Custom logo as a data URL; null uses the bundled default for this entity. */
  logoDataUrl: string | null;
  /** Company Identification Number — from Settings, never hardcoded on documents. */
  cin: string;
  /** Full registered office address printed on the Authorised Slip letterhead. */
  registeredAddress: string;
  phone: string;
  payrollEmail: string;
  signatoryName: string;
  signatoryDesignation: string;
  /** Private storage path in the signatory-assets bucket (never a public URL). */
  signatureAssetPath: string | null;
  /** Private storage path in the signatory-assets bucket (never a public URL). */
  sealAssetPath: string | null;
  /**
   * How authorised slips prove authenticity.
   * SIGNATURE_AND_SEAL requires both visual assets — never auto-falls back.
   */
  authorisationMode?:
    | 'SIGNATURE_AND_SEAL'
    | 'COMPUTER_GENERATED_VERIFICATION'
    | 'CRYPTOGRAPHIC_DIGITAL_SIGNATURE';
  /** ISO date — authority window start (inclusive). Null = no start constraint. */
  authorityEffectiveFrom?: string | null;
  /** ISO date — authority window end (inclusive). Null = open-ended. */
  authorityEffectiveTo?: string | null;
  /** When false, authorised issuance is blocked. */
  signatoryActive?: boolean;
}

export interface Settings {
  paydayDayOfMonth: number;
  payrollContact: string;
  /** Local time label printed on slips, e.g. "6:00 PM". */
  reviewDeadlineTime: string;
  /** Calendar months (1–12) when Kerala PT is deducted from salary. */
  ptDeductionMonths: number[];
  authorizedSignatoryName: string;
  authorizedSignatoryTitle: string;
  bankVerificationEnabledByDefault: boolean;
  entities: Record<EntityCode, EntityInfo>;
}

export type PaymentMode = 'Bank Transfer' | 'UPI' | 'Cheque' | 'Cash';
export type EngagementType =
  | 'regular_employee'
  | 'probation_employee'
  | 'notice_period_employee'
  | 'intern'
  | 'trainee'
  | 'apprentice'
  | 'contract_employee'
  | 'freelancer'
  | 'consultant';
export type EmploymentStatus =
  | 'active'
  | 'probation'
  | 'notice_period'
  | 'completed'
  | 'resigned'
  | 'terminated'
  | 'offboarded'
  | 'inactive';
export type PaymentType =
  | 'salary'
  | 'stipend'
  | 'professional_fee'
  | 'consultancy_fee'
  | 'contract_remuneration'
  | 'honorarium';
export type WorkMode = 'office' | 'remote' | 'hybrid';
export type AgreementType =
  | 'offer_letter'
  | 'internship_offer'
  | 'freelancer_agreement'
  | 'consultancy_agreement'
  | 'contract_agreement'
  | 'apprenticeship_contract';
export type DocumentsStatus = 'pending' | 'partially_collected' | 'completed';

export interface FlexLogEntry {
  /** ISO date string of the adjustment. */
  date: string;
  /** Minutes added (positive) or removed (negative). */
  delta: number;
  reason: string;
}

export interface Employee {
  id: string;
  fullName: string;
  /** e.g. 'PB-2024-042' — prefixed by entity code. */
  empId: string;
  entityCode: EntityCode;
  department: string;
  designation: string;
  /** ISO date string. */
  joiningDate: string;
  employeeAddress: string;
  baseSalary: number;
  compensationAmount: number;
  engagementType: EngagementType;
  employmentStatus: EmploymentStatus;
  paymentType: PaymentType;
  paymentMode: PaymentMode;
  internshipStartDate: string | null;
  internshipEndDate: string | null;
  probationStartDate: string | null;
  probationEndDate: string | null;
  noticeStartDate: string | null;
  noticeEndDate: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  offboardingDate: string | null;
  reportingManager: string;
  workMode: WorkMode;
  agreementType: AgreementType;
  documentsStatus: DocumentsStatus;
  notes: string;
  /** Only the last 4 digits are ever stored. */
  bankLast4: string;
  /** Masked PAN, e.g. 'ABXXXXXX1F'. Never store the full number. */
  panMasked: string;
  /** Flex-bank balance in minutes. */
  flexBankBalance: number;
  flexLog: FlexLogEntry[];
  /** Monthly TDS deduction (₹). Stored in details_json. Default 0. */
  tdsMonthly: number;
  /** Kerala Professional Tax half-yearly amount (₹). details_json. Default 0. */
  ptHalfYearly: number;
}

export type SlipStatus = 'draft' | 'final';

/** Raw inputs captured on the generator form for one slip. */
export interface SlipInputs {
  absentDays: number;
  halfDays: number;
  lateMinutes: number;
  flexMinutesEarned: number;
  fixedAllowance: number;
  otherDeductions: number;
  /** Monthly TDS amount applied for this slip (frozen at generation). */
  tdsMonthly: number;
  /** PT amount applied for this slip month (0 when month ∉ ptDeductionMonths). */
  ptThisMonth: number;
  variableLabel: string;
  variableEarned: number;
  variablePaid: number;
  deferredOpening: number;
  /** ISO date string; required whenever deferredClosing > 0. */
  committedPayoutDate: string | null;
  remarks: string;
  /** Enables an additional declaration block for bank verification. */
  authorizedForBankVerification?: boolean;
  /** Flex balance the computation started from (for audit). */
  flexBankBalanceBefore: number;
  baseSalary: number;
  compensationAmount: number;
}

/**
 * Every derived number on a slip — produced only by lib/payroll-calc.ts.
 * Older finalized snapshots may omit `tds` / `pt` — renderers must treat missing as 0.
 */
export interface SlipComputed {
  perDayRate: number;
  flexAvailable: number;
  unpaidLateMinutes: number;
  flexOffsetMinutes: number;
  lopFromLateness: number;
  lopDays: number;
  lopDeduction: number;
  otherDeductions: number;
  /** Statutory TDS for this slip. Missing on old finals → treat as 0. */
  tds?: number;
  /** Professional Tax for this slip month. Missing on old finals → treat as 0. */
  pt?: number;
  totalDeductions: number;
  grossFixed: number;
  variableEarned: number;
  variablePaid: number;
  variableDeferred: number;
  deferredOpening: number;
  deferredClosing: number;
  committedPayoutDate: string | null;
  netPay: number;
  netPayWords: string;
}

/** Employee display data frozen into a snapshot at generation time. */
export interface SlipEmployeeInfo {
  fullName: string;
  empId: string;
  entityCode: EntityCode;
  department: string;
  designation: string;
  joiningDate: string;
  employeeAddress: string;
  paymentMode: PaymentMode;
  engagementType: EngagementType;
  employmentStatus: EmploymentStatus;
  paymentType: PaymentType;
  compensationAmount: number;
  bankLast4: string;
  panMasked: string;
}

export interface PaymentStatementMeta {
  statementTitle: string;
  mainEarningLabel: string;
  disclaimer: string | null;
  statusBadge: 'Probation' | 'Notice Period' | null;
}

export interface PaymentStatementHistoryEntry {
  statementId: string;
  personId: string;
  employeeId: string;
  personName: string;
  entityId: string;
  engagementType: EngagementType;
  employmentStatus: EmploymentStatus;
  paymentType: PaymentType;
  statementTitle: string;
  month: number;
  year: number;
  grossPay: number;
  netPay: number;
  compensationAmount: number;
  earnings: Record<string, number>;
  deductions: Record<string, number>;
  paymentMode: PaymentMode;
  transactionReference: string | null;
  generatedBy: string;
  generatedAt: string;
  pdfUrl: string | null;
  pdfData: string | null;
  snapshotPersonData: SlipEmployeeInfo;
  snapshotSettingsData: Settings;
  createdAt: string;
  snapshot: SlipSnapshot;
}

export interface SlipSnapshot {
  id: string;
  employeeId: string;
  /** '2026-07' style. */
  monthYear: string;
  /** Prefer salaryMonth when present; coincides with monthYear for new rows. */
  salaryMonth?: string;
  status: SlipStatus;
  inputs: SlipInputs;
  computed: SlipComputed;
  /** Flex-bank balance after this slip's late minutes were settled. */
  flexBalanceAfter: number;
  /** ISO datetime. */
  generatedAt: string;
  /** Denormalised so history renders even if the employee is later deleted. */
  employee: SlipEmployeeInfo;
  /** Server-computed attendance cycle (not inferred in the browser). */
  attendancePeriodStart?: string | null;
  attendancePeriodEnd?: string | null;
  payrollCycleMethod?: string | null;
  payrollDivisor?: number | null;
  calculationMethodCode?: string | null;
  calculationMethodLabel?: string | null;
  paymentStatus?: string | null;
  expectedPaymentDate?: string | null;
  actualCreditDate?: string | null;
  originalDueDate?: string | null;
  confirmedPaidAmount?: number | null;
  outstandingAmount?: number | null;
  revisionNumber?: number | null;
  internalDocumentNumber?: string | null;
  payrollBatchId?: string | null;
}

/** Signatory fields frozen into authorised_slip_log at bank-copy generation. */
export interface SignatorySnapshot {
  signatoryName: string;
  signatoryDesignation: string;
  signatureAssetPath: string | null;
  sealAssetPath: string | null;
  entityLegalName: string;
  cin: string;
  registeredAddress: string;
  phone: string;
  payrollEmail: string;
}

/** Per-line YTD totals for an Indian financial year, derived from FINAL snapshots only. */
export interface AuthorisedSlipYtd {
  basic: number;
  fixedAllowance: number;
  variablePaid: number;
  grossEarnings: number;
  lopDeduction: number;
  professionalTax: number;
  tds: number;
  otherDeductions: number;
  totalDeductions: number;
}
