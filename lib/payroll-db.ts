/**
 * Maps between Supabase row shapes and the app's domain types.
 * Extended employee fields (department, flex log, TDS/PT, etc.) live in details_json.
 */

import type { Employee, EntityCode, FlexLogEntry, PaymentMode, SlipSnapshot } from './types';
import { slipStatutoryDeductions } from './payroll-calc';

export interface EmployeeDetailsJson {
  department: string;
  employeeAddress: string;
  paymentMode: PaymentMode;
  bankLast4: string;
  panMasked: string;
  flexLog: FlexLogEntry[];
  /** Monthly TDS (₹). Default 0 when absent (legacy rows). */
  tdsMonthly?: number;
  /** Kerala PT half-yearly (₹). Default 0 when absent (legacy rows). */
  ptHalfYearly?: number;
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

/** Trim and strip all internal whitespace from a business employee ID. */
export function normalizeEmployeeId(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

function emptyDetails(): EmployeeDetailsJson {
  return {
    department: '',
    employeeAddress: '',
    paymentMode: 'Bank Transfer',
    bankLast4: '',
    panMasked: '',
    flexLog: [],
    tdsMonthly: 0,
    ptHalfYearly: 0,
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
    baseSalary: row.base_salary,
    paymentMode: details.paymentMode,
    bankLast4: details.bankLast4,
    panMasked: details.panMasked,
    flexBankBalance: row.flex_bank_balance,
    flexLog: details.flexLog ?? [],
    tdsMonthly: Number(details.tdsMonthly ?? 0) || 0,
    ptHalfYearly: Number(details.ptHalfYearly ?? 0) || 0,
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
    flex_bank_balance: employee.flexBankBalance,
    details_json: {
      department: employee.department,
      employeeAddress: employee.employeeAddress,
      paymentMode: employee.paymentMode,
      bankLast4: employee.bankLast4,
      panMasked: employee.panMasked,
      flexLog: employee.flexLog,
      tdsMonthly: employee.tdsMonthly ?? 0,
      ptHalfYearly: employee.ptHalfYearly ?? 0,
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
