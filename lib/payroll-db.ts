/**
 * Maps between Supabase row shapes and the app's domain types.
 * Extended employee fields (department, flex log, TDS/PT, etc.) live in details_json.
 */

import type {
  AgreementType,
  DocumentsStatus,
  Employee,
  EmploymentStatus,
  EngagementType,
  EntityCode,
  EntityInfo,
  FlexLogEntry,
  PaymentMode,
  PaymentType,
  Settings,
  SlipSnapshot,
  WorkMode,
} from '@/lib/types';
import { mergeSettings, SEED_SETTINGS } from '@/lib/settings-defaults';
import { bankLast4FromAccount, maskPan, normalizeBankAccountNumber } from './identity';
import { defaultPaymentTypeForEngagement } from './workforce';
import { slipStatutoryDeductions } from './payroll-calc';

export interface EmployeeDetailsJson {
  department: string;
  employeeAddress: string;
  paymentMode: PaymentMode;
  bankName?: string;
  bankAccountNumber?: string;
  bankLast4: string;
  /** Full PAN when known; legacy rows may omit and only have panMasked. */
  pan?: string;
  panMasked: string;
  ifsc?: string;
  workLocation?: string;
  salaryComponents?: { label: string; amount: number }[];
  flexLog: FlexLogEntry[];
  reportingManager?: string;
  workMode?: WorkMode;
  agreementType?: AgreementType;
  documentsStatus?: DocumentsStatus;
  notes?: string;
  tdsMonthly?: number;
  ptHalfYearly?: number;
  ptManualOverride?: boolean;
}

export interface EmployeeRow {
  id: string;
  full_name: string;
  entity_id: string;
  employee_id: string;
  joining_date: string;
  designation: string;
  base_salary: number;
  engagement_type: EngagementType | null;
  employment_status: EmploymentStatus | null;
  payment_type: PaymentType | null;
  internship_start_date: string | null;
  internship_end_date: string | null;
  probation_start_date: string | null;
  probation_end_date: string | null;
  notice_start_date: string | null;
  notice_end_date: string | null;
  contract_start_date: string | null;
  contract_end_date: string | null;
  offboarding_date: string | null;
  flex_bank_balance: number;
  details_json: EmployeeDetailsJson | null;
}

export interface PayrollSlipRow {
  id: string;
  employee_id: string;
  month_year: string;
  status: 'draft' | 'final' | 'superseded' | 'voided';
  details_json: Omit<SlipSnapshot, 'id' | 'employeeId' | 'monthYear' | 'status'>;
  /** Present when selected from payroll_slips (active FINAL / supersede chains). */
  active_final?: boolean | null;
  workflow_status?: string | null;
}

const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];

/** Trim and strip all internal whitespace from a business employee ID. */
export function normalizeEmployeeId(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

function emptyDetails(): EmployeeDetailsJson {
  return {
    department: '',
    employeeAddress: '',
    paymentMode: 'Bank Transfer',
    bankName: '',
    bankAccountNumber: '',
    bankLast4: '',
    pan: '',
    panMasked: '',
    ifsc: '',
    workLocation: '',
    flexLog: [],
    reportingManager: '',
    workMode: 'office',
    agreementType: 'offer_letter',
    documentsStatus: 'pending',
    notes: '',
    tdsMonthly: 0,
    ptHalfYearly: 0,
    ptManualOverride: false,
  };
}

export function rowToEmployee(row: EmployeeRow): Employee {
  const details = row.details_json ?? emptyDetails();
  const entityCode = ENTITY_CODES.includes(row.entity_id as EntityCode)
    ? (row.entity_id as EntityCode)
    : 'PX';

  return {
    id: row.id,
    fullName: row.full_name,
    empId: normalizeEmployeeId(row.employee_id),
    entityCode,
    department: details.department,
    designation: row.designation,
    joiningDate: row.joining_date,
    employeeAddress: details.employeeAddress,
    baseSalary: Number(row.base_salary) || 0,
    engagementType: row.engagement_type ?? 'regular_employee',
    employmentStatus: row.employment_status ?? 'active',
    paymentType:
      row.payment_type ?? defaultPaymentTypeForEngagement(row.engagement_type ?? 'regular_employee'),
    paymentMode: details.paymentMode,
    internshipStartDate: row.internship_start_date,
    internshipEndDate: row.internship_end_date,
    probationStartDate: row.probation_start_date,
    probationEndDate: row.probation_end_date,
    noticeStartDate: row.notice_start_date,
    noticeEndDate: row.notice_end_date,
    contractStartDate: row.contract_start_date,
    contractEndDate: row.contract_end_date,
    offboardingDate: row.offboarding_date,
    reportingManager: details.reportingManager ?? '',
    workMode: details.workMode ?? 'office',
    agreementType: details.agreementType ?? 'offer_letter',
    documentsStatus: details.documentsStatus ?? 'pending',
    notes: details.notes ?? '',
    bankName: (details.bankName ?? '').trim(),
    bankAccountNumber: normalizeBankAccountNumber(details.bankAccountNumber ?? ''),
    bankLast4:
      bankLast4FromAccount(details.bankAccountNumber ?? '') ||
      (details.bankLast4 ?? '').replace(/\D/g, '').slice(-4),
    pan: (details.pan ?? '').trim().toUpperCase(),
    panMasked: maskPan(details.pan || details.panMasked || ''),
    ifsc: (details.ifsc ?? '').trim().toUpperCase(),
    workLocation: (details.workLocation ?? '').trim(),
    salaryComponents: details.salaryComponents,
    flexBankBalance: row.flex_bank_balance,
    flexLog: details.flexLog ?? [],
    tdsMonthly: Number(details.tdsMonthly ?? 0) || 0,
    ptHalfYearly: Number(details.ptHalfYearly ?? 0) || 0,
    ptManualOverride: details.ptManualOverride === true,
  };
}

export function employeeToRow(
  employee: Omit<Employee, 'id'> & { id?: string },
): Omit<EmployeeRow, 'id'> & { id?: string } {
  return {
    ...(employee.id ? { id: employee.id } : {}),
    full_name: employee.fullName,
    entity_id: employee.entityCode,
    employee_id: normalizeEmployeeId(employee.empId),
    joining_date: employee.joiningDate,
    designation: employee.designation,
    base_salary: employee.baseSalary,
    engagement_type: employee.engagementType,
    employment_status: employee.employmentStatus,
    payment_type: employee.paymentType,
    internship_start_date: employee.internshipStartDate,
    internship_end_date: employee.internshipEndDate,
    probation_start_date: employee.probationStartDate,
    probation_end_date: employee.probationEndDate,
    notice_start_date: employee.noticeStartDate,
    notice_end_date: employee.noticeEndDate,
    contract_start_date: employee.contractStartDate,
    contract_end_date: employee.contractEndDate,
    offboarding_date: employee.offboardingDate,
    flex_bank_balance: employee.flexBankBalance,
    details_json: {
      department: employee.department,
      employeeAddress: employee.employeeAddress,
      paymentMode: employee.paymentMode,
      bankName: (employee.bankName ?? '').trim(),
      bankAccountNumber: normalizeBankAccountNumber(employee.bankAccountNumber ?? ''),
      bankLast4:
        bankLast4FromAccount(employee.bankAccountNumber ?? '') ||
        (employee.bankLast4 ?? '').replace(/\D/g, '').slice(-4),
      pan: (employee.pan ?? '').trim().toUpperCase(),
      panMasked: maskPan(employee.pan || employee.panMasked || ''),
      ifsc: (employee.ifsc ?? '').trim().toUpperCase(),
      workLocation: (employee.workLocation ?? '').trim(),
      salaryComponents: employee.salaryComponents,
      flexLog: employee.flexLog,
      reportingManager: employee.reportingManager,
      workMode: employee.workMode,
      agreementType: employee.agreementType,
      documentsStatus: employee.documentsStatus,
      notes: employee.notes,
      tdsMonthly: employee.tdsMonthly ?? 0,
      ptHalfYearly: employee.ptHalfYearly ?? 0,
      ptManualOverride: employee.ptManualOverride === true,
    },
  };
}

/** Back-compat: older frozen snapshots may omit tds / pt. */
export function rowToSlip(row: PayrollSlipRow): SlipSnapshot {
  const details = row.details_json;
  const inputs = {
    ...details.inputs,
    tdsMonthly: details.inputs?.tdsMonthly ?? 0,
    ptThisMonth: details.inputs?.ptThisMonth ?? 0,
  };
  const statutory = slipStatutoryDeductions(details.computed ?? {}, inputs);
  const computed = {
    ...details.computed,
    tds: statutory.tds,
    pt: statutory.pt,
  };
  return {
    id: row.id,
    employeeId: row.employee_id,
    monthYear: row.month_year,
    status: row.status,
    ...details,
    inputs,
    computed,
    employee: {
      ...details.employee,
      empId: normalizeEmployeeId(details.employee.empId),
    },
    activeFinal:
      row.active_final === undefined || row.active_final === null
        ? details.activeFinal
        : Boolean(row.active_final),
    workflowStatus: row.workflow_status ?? details.workflowStatus ?? null,
  };
}

export function slipToRow(snapshot: SlipSnapshot): Omit<PayrollSlipRow, 'id'> & { id?: string } {
  const { id, employeeId, monthYear, status, ...details } = snapshot;
  return {
    ...(id ? { id } : {}),
    employee_id: employeeId,
    month_year: monthYear,
    status,
    details_json: {
      ...details,
      employee: {
        ...details.employee,
        empId: normalizeEmployeeId(details.employee.empId),
      },
    },
  };
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export interface AppSettingsRow {
  id: string;
  payday_day_of_month: number;
  payroll_contact: string;
  entity_branding: Record<EntityCode, EntityInfo> | null;
  created_at: string;
  updated_at: string;
}

export const APP_SETTINGS_ID = 'default';

function mergeEntityBranding(
  stored: Record<EntityCode, EntityInfo> | null | undefined,
): Record<EntityCode, EntityInfo> {
  const merged = { ...SEED_SETTINGS.entities };
  if (!stored) return merged;
  for (const code of ENTITY_CODES) {
    if (stored[code]) {
      merged[code] = { ...merged[code], ...stored[code] };
    }
  }
  return merged;
}

/** Maps a Supabase app_settings row to the app's Settings type. */
export function rowToSettings(row: AppSettingsRow): Settings {
  const merged = mergeSettings({
    paydayDayOfMonth: row.payday_day_of_month,
    payrollContact: row.payroll_contact,
    entities: row.entity_branding ?? undefined,
  });
  return merged;
}

/** Maps app Settings to a Supabase upsert row. */
export function settingsToRow(settings: Settings): Omit<AppSettingsRow, 'created_at' | 'updated_at'> {
  return {
    id: APP_SETTINGS_ID,
    payday_day_of_month: settings.paydayDayOfMonth,
    payroll_contact: settings.payrollContact,
    entity_branding: settings.entities,
  };
}

/** Default settings used when seeding the app_settings row. */
export function defaultSettingsRow(): Omit<AppSettingsRow, 'created_at' | 'updated_at'> {
  return settingsToRow(SEED_SETTINGS);
}
