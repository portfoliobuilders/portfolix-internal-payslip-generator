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

/** How Kerala Professional Tax is collected from salary. */
export type PtCollectionMode = 'half_yearly_lump' | 'monthly_accrual';

/**
 * One row of the configurable Kerala PT schedule.
 * Basis = half-yearly gross income (monthly fixed pay × 6).
 */
export interface PtSlab {
  /** Inclusive lower bound of half-yearly gross (₹). */
  minGross: number;
  /** Inclusive upper bound of half-yearly gross (₹); null = open-ended. */
  maxGross: number | null;
  /** Half-yearly professional tax (₹) for this band. */
  tax: number;
}

export interface Settings {
  paydayDayOfMonth: number;
  payrollContact: string;
  /** Local time label printed on slips, e.g. "6:00 PM". */
  reviewDeadlineTime: string;
  /** Calendar months (1–12) when Kerala PT is deducted in half_yearly_lump mode. */
  ptDeductionMonths: number[];
  /**
   * PT collection mode. Default `monthly_accrual` (founder decision).
   * `half_yearly_lump` preserves the legacy Aug/Feb full-half deduction.
   */
  ptCollectionMode: PtCollectionMode;
  /** Configurable Kerala PT slabs (cap-enforced on save). */
  ptSlabs: PtSlab[];
  /**
   * Suggested Kerala PT half-yearly amount (₹) for bulk apply / new hires.
   * Per-employee `ptHalfYearly` is what slips actually use.
   */
  defaultPtHalfYearly: number;
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
  /** Sole stored compensation figure (salary / stipend / contract fee). */
  baseSalary: number;
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
  /** Bank name for salary credit (e.g. HDFC Bank). Never invent. */
  bankName?: string;
  /** Optional verified IFSC — omit when unverified. */
  ifsc?: string | null;
  /** Explicit HR confirmation that bank name/account details were verified. */
  bankDetailsVerified?: boolean;
  /** Full account number — Authorised Slip only; internal slip uses bankLast4. */
  bankAccountNumber?: string;
  /** Last 4 digits (also derived from bankAccountNumber when present). */
  bankLast4: string;
  /** Full PAN — Authorised Slip only; internal slip uses panMasked. */
  pan?: string;
  /** Masked PAN, e.g. 'ABXXXXXX1F' — internal / legacy snapshots. */
  panMasked: string;
  /** Work location shown on Authorised Slip (e.g. Kochi Office). */
  workLocation?: string;
  /** Flex-bank balance in minutes. */
  flexBankBalance: number;
  flexLog: FlexLogEntry[];
  /** Monthly TDS deduction (₹). Stored in details_json. Default 0. */
  tdsMonthly: number;
  /** Kerala Professional Tax half-yearly amount (₹). details_json. Default 0. */
  ptHalfYearly: number;
  /**
   * When true, global “Recalculate PT from slabs” skips this employee
   * unless the operator explicitly includes manual overrides (CA adjustments).
   */
  ptManualOverride: boolean;
}

/**
 * Document lifecycle on payroll_slips.status.
 * - draft: replaceable; hard-deletable
 * - final: the single ACTIVE final for an employee-month
 * - superseded: prior final kept for audit (hidden from default views / aggregations)
 * - voided: cleaned-up final with reason (hidden; never row-deleted)
 */
export type SlipStatus = 'draft' | 'final' | 'superseded' | 'voided';

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
  bankName?: string;
  ifsc?: string | null;
  bankDetailsVerified?: boolean;
  bankAccountNumber?: string;
  bankLast4: string;
  pan?: string;
  panMasked: string;
  workLocation?: string;
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
  baseSalary: number;
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
  /**
   * Frozen PT footnote for this slip (monthly accrual mode).
   * Missing on older finals — renderers must not invent one.
   */
  ptFootnote?: string | null;
  /**
   * Mid-half joiner: partial-half PT liability needs one CA confirmation.
   * Frozen at generation; missing on older finals → treat as false.
   */
  ptPartialHalfCaFlag?: boolean;
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
