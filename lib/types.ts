/**
 * Shared domain types for the Portfolix Internal Salary Slip Generator.
 * Pure type definitions — no runtime code, no framework imports.
 */

export type EntityCode = 'PX' | 'PB' | 'PT' | 'PH';

export interface EntityInfo {
  name: string;
  /** e.g. "A unit of Portfolix Enterprise Pvt Ltd" — empty for the parent. */
  legalLine: string;
  addressLines: string[];
  contact: string;
}

export interface Settings {
  paydayDayOfMonth: number;
  payrollContact: string;
  entities: Record<EntityCode, EntityInfo>;
}

export type PaymentMode = 'Bank Transfer' | 'UPI' | 'Cheque' | 'Cash';

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
  paymentMode: PaymentMode;
  /** Only the last 4 digits are ever stored. */
  bankLast4: string;
  /** Masked PAN, e.g. 'ABXXXXXX1F'. Never store the full number. */
  panMasked: string;
  /** Flex-bank balance in minutes. */
  flexBankBalance: number;
  flexLog: FlexLogEntry[];
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
  variableLabel: string;
  variableEarned: number;
  variablePaid: number;
  deferredOpening: number;
  /** ISO date string; required whenever deferredClosing > 0. */
  committedPayoutDate: string | null;
  remarks: string;
  /** Flex balance the computation started from (for audit). */
  flexBankBalanceBefore: number;
  baseSalary: number;
}

/** Every derived number on a slip — produced only by lib/payroll-calc.ts. */
export interface SlipComputed {
  perDayRate: number;
  flexAvailable: number;
  unpaidLateMinutes: number;
  flexOffsetMinutes: number;
  lopFromLateness: number;
  lopDays: number;
  lopDeduction: number;
  otherDeductions: number;
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
  bankLast4: string;
  panMasked: string;
}

export interface SlipSnapshot {
  id: string;
  employeeId: string;
  /** '2026-07' style. */
  monthYear: string;
  status: SlipStatus;
  inputs: SlipInputs;
  computed: SlipComputed;
  /** Flex-bank balance after this slip's late minutes were settled. */
  flexBalanceAfter: number;
  /** ISO datetime. */
  generatedAt: string;
  /** Denormalised so history renders even if the employee is later deleted. */
  employee: SlipEmployeeInfo;
}
