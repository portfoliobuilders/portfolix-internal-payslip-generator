/**
 * Maps between Supabase row shapes and the app's domain types.
 * Extended employee fields (department, flex log, etc.) live in details_json.
 */

import type {
  Employee,
  EntityCode,
  EntityInfo,
  FlexLogEntry,
  PaymentMode,
  Settings,
  SlipSnapshot,
} from '@/lib/types';
import { SEED_SETTINGS } from '@/lib/seed-settings';

export interface EmployeeDetailsJson {
  department: string;
  employeeAddress: string;
  paymentMode: PaymentMode;
  bankLast4: string;
  panMasked: string;
  flexLog: FlexLogEntry[];
}

export interface EmployeeRow {
  id: string;
  full_name: string;
  entity_id: string;
  employee_id: string;
  joining_date: string;
  designation: string;
  base_salary: number;
  flex_bank_balance: number;
  details_json: EmployeeDetailsJson | null;
}

export interface PayrollSlipRow {
  id: string;
  employee_id: string;
  month_year: string;
  status: 'draft' | 'final';
  details_json: Omit<SlipSnapshot, 'id' | 'employeeId' | 'monthYear' | 'status'>;
}

const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];

function emptyDetails(): EmployeeDetailsJson {
  return {
    department: '',
    employeeAddress: '',
    paymentMode: 'Bank Transfer',
    bankLast4: '',
    panMasked: '',
    flexLog: [],
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
    empId: row.employee_id,
    entityCode,
    department: details.department,
    designation: row.designation,
    joiningDate: row.joining_date,
    employeeAddress: details.employeeAddress,
    baseSalary: row.base_salary,
    paymentMode: details.paymentMode,
    bankLast4: details.bankLast4,
    panMasked: details.panMasked,
    flexBankBalance: row.flex_bank_balance,
    flexLog: details.flexLog ?? [],
  };
}

export function employeeToRow(
  employee: Omit<Employee, 'id'> & { id?: string },
): Omit<EmployeeRow, 'id'> & { id?: string } {
  return {
    ...(employee.id ? { id: employee.id } : {}),
    full_name: employee.fullName,
    entity_id: employee.entityCode,
    employee_id: employee.empId,
    joining_date: employee.joiningDate,
    designation: employee.designation,
    base_salary: employee.baseSalary,
    flex_bank_balance: employee.flexBankBalance,
    details_json: {
      department: employee.department,
      employeeAddress: employee.employeeAddress,
      paymentMode: employee.paymentMode,
      bankLast4: employee.bankLast4,
      panMasked: employee.panMasked,
      flexLog: employee.flexLog,
    },
  };
}

export function rowToSlip(row: PayrollSlipRow): SlipSnapshot {
  return {
    id: row.id,
    employeeId: row.employee_id,
    monthYear: row.month_year,
    status: row.status,
    ...row.details_json,
  };
}

export function slipToRow(snapshot: SlipSnapshot): Omit<PayrollSlipRow, 'id'> & { id?: string } {
  const { id, employeeId, monthYear, status, ...details } = snapshot;
  return {
    ...(id ? { id } : {}),
    employee_id: employeeId,
    month_year: monthYear,
    status,
    details_json: details,
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
  return {
    paydayDayOfMonth: row.payday_day_of_month,
    payrollContact: row.payroll_contact,
    entities: mergeEntityBranding(row.entity_branding),
  };
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
