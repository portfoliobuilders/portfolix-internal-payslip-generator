/**
 * Excel template download and bulk-import parsing for the employee roster.
 */

import * as XLSX from 'xlsx';
import type { Employee, EngagementType, EntityCode, PaymentMode, PaymentType } from '@/lib/types';
import { defaultPaymentTypeForEngagement } from './workforce';

export const EMPLOYEE_TEMPLATE_HEADERS = [
  'Full Name',
  'Entity ID',
  'Employee ID',
  'Joining Date',
  'Department',
  'Designation',
  'Engagement Type',
  'Employment Status',
  'Payment Type',
  'Compensation Amount',
  'Address',
  'Base Salary',
  'Start Date',
  'End Date',
  'Payment Mode',
  'Bank Details',
  'PAN Masked',
  'Opening Flex-Bank Balance',
  'Notes',
] as const;

export type EmployeeTemplateHeader = (typeof EMPLOYEE_TEMPLATE_HEADERS)[number];

export type BulkEmployeeInput = Omit<Employee, 'id' | 'flexLog'>;

const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];
const PAYMENT_MODES: PaymentMode[] = ['Bank Transfer', 'UPI', 'Cheque', 'Cash'];

function cellString(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function cellNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value ?? '').replace(/,/g, '').trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** Converts Excel serial dates and common string formats to yyyy-MM-dd. */
export function normalizeJoiningDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const month = String(parsed.m).padStart(2, '0');
      const day = String(parsed.d).padStart(2, '0');
      return `${parsed.y}-${month}-${day}`;
    }
  }

  const raw = cellString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const slashMatch = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slashMatch) {
    const [, d, m, y] = slashMatch;
    return `${y}-${m!.padStart(2, '0')}-${d!.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return raw;
}

function normalizePaymentMode(value: unknown): PaymentMode {
  const raw = cellString(value);
  const match = PAYMENT_MODES.find((mode) => mode.toLowerCase() === raw.toLowerCase());
  return match ?? 'Bank Transfer';
}

function normalizeEntityCode(value: unknown): EntityCode | null {
  const code = cellString(value).toUpperCase();
  return ENTITY_CODES.includes(code as EntityCode) ? (code as EntityCode) : null;
}

function normalizeBankLast4(value: unknown): string {
  const digits = cellString(value).replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : digits;
}

function normalizeEngagementType(value: unknown): EngagementType {
  const raw = cellString(value).toLowerCase();
  const values: EngagementType[] = ['regular_employee', 'probation_employee', 'notice_period_employee', 'intern', 'trainee', 'apprentice', 'contract_employee', 'freelancer', 'consultant'];
  return values.includes(raw as EngagementType) ? (raw as EngagementType) : 'regular_employee';
}

function normalizePaymentType(value: unknown, engagementType: EngagementType): PaymentType {
  const raw = cellString(value).toLowerCase();
  const values: PaymentType[] = ['salary', 'stipend', 'professional_fee', 'consultancy_fee', 'contract_remuneration', 'honorarium'];
  if (values.includes(raw as PaymentType)) return raw as PaymentType;
  return defaultPaymentTypeForEngagement(engagementType);
}

function isRowEmpty(row: Record<string, unknown>): boolean {
  return EMPLOYEE_TEMPLATE_HEADERS.every((header) => cellString(row[header]) === '');
}

function validateRow(
  employee: BulkEmployeeInput,
  rowNumber: number,
): string | null {
  if (!employee.fullName) return `Row ${rowNumber}: Full Name is required.`;
  if (!employee.empId) return `Row ${rowNumber}: Employee ID is required.`;
  if (!employee.empId.toUpperCase().startsWith(employee.entityCode)) {
    return `Row ${rowNumber}: Employee ID must be prefixed by Entity ID (e.g. ${employee.entityCode}-2024-042).`;
  }
  if (!employee.joiningDate) return `Row ${rowNumber}: Joining Date is required.`;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(employee.joiningDate)) {
    return `Row ${rowNumber}: Joining Date must be a valid date.`;
  }
  if (!Number.isFinite(employee.compensationAmount) || employee.compensationAmount <= 0) {
    return `Row ${rowNumber}: Compensation Amount must be greater than zero.`;
  }
  if (employee.bankLast4 && !/^\d{4}$/.test(employee.bankLast4)) {
    return `Row ${rowNumber}: Bank A/C must be exactly 4 digits.`;
  }
  if (employee.panMasked && /^[A-Z]{5}\d{4}[A-Z]$/i.test(employee.panMasked)) {
    return `Row ${rowNumber}: PAN looks like a full number — use a masked form (e.g. ABXXXXXX1F).`;
  }
  if (!Number.isFinite(employee.flexBankBalance) || employee.flexBankBalance < 0) {
    return `Row ${rowNumber}: Opening Flex-Bank Balance must be 0 or more.`;
  }
  if (!Number.isFinite(employee.tdsMonthly) || employee.tdsMonthly < 0) {
    return `Row ${rowNumber}: TDS Monthly must be 0 or more.`;
  }
  if (!Number.isFinite(employee.ptHalfYearly) || employee.ptHalfYearly < 0) {
    return `Row ${rowNumber}: PT Half-Yearly must be 0 or more.`;
  }
  return null;
}

function mapRow(row: Record<string, unknown>, rowNumber: number): BulkEmployeeInput | string {
  if (isRowEmpty(row)) return '';

  const entityCode = normalizeEntityCode(row['Entity ID']);
  if (!entityCode) {
    return `Row ${rowNumber}: Entity ID must be one of PX, PB, PT, PH.`;
  }

  const engagementType = normalizeEngagementType(row['Engagement Type']);
  const paymentType = normalizePaymentType(row['Payment Type'], engagementType);
  const compensationAmount = cellNumber(row['Compensation Amount']) || cellNumber(row['Base Salary']);
  const employee: BulkEmployeeInput = {
    fullName: cellString(row['Full Name']),
    entityCode,
    empId: cellString(row['Employee ID']).toUpperCase().replace(/\s+/g, ''),
    joiningDate: normalizeJoiningDate(row['Joining Date']),
    department: cellString(row['Department']),
    designation: cellString(row['Designation']),
    engagementType,
    employmentStatus: (cellString(row['Employment Status']).toLowerCase() as Employee['employmentStatus']) || 'active',
    paymentType,
    employeeAddress: cellString(row['Address']),
    compensationAmount,
    baseSalary: compensationAmount,
    paymentMode: normalizePaymentMode(row['Payment Mode']),
    bankLast4: normalizeBankLast4(row['Bank Details']),
    panMasked: cellString(row['PAN Masked']).toUpperCase(),
    flexBankBalance: cellNumber(row['Opening Flex-Bank Balance']) || 0,
    internshipStartDate: null,
    internshipEndDate: normalizeJoiningDate(row['End Date']) || null,
    probationStartDate: null,
    probationEndDate: null,
    noticeStartDate: null,
    noticeEndDate: null,
    contractStartDate: normalizeJoiningDate(row['Start Date']) || null,
    contractEndDate: normalizeJoiningDate(row['End Date']) || null,
    offboardingDate: null,
    reportingManager: '',
    workMode: 'office',
    agreementType: 'offer_letter',
    documentsStatus: 'pending',
    notes: cellString(row['Notes']),
  };

  const error = validateRow(employee, rowNumber);
  return error ?? employee;
}

/** Generates and downloads an empty employee import template. */
export function downloadEmployeeTemplate(): void {
  const worksheet = XLSX.utils.aoa_to_sheet([[...EMPLOYEE_TEMPLATE_HEADERS]]);
  worksheet['!cols'] = EMPLOYEE_TEMPLATE_HEADERS.map(() => ({ wch: 24 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');
  XLSX.writeFile(workbook, 'portfolix-employee-template.xlsx');
}

export interface ParseEmployeeSpreadsheetResult {
  employees: BulkEmployeeInput[];
  errors: string[];
}

/** Reads an Excel/CSV file and maps rows to employee payloads. */
export async function parseEmployeeSpreadsheet(file: File): Promise<ParseEmployeeSpreadsheetResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { employees: [], errors: ['The uploaded file has no worksheets.'] };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName]!, {
    defval: '',
    raw: true,
  });

  const employees: BulkEmployeeInput[] = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2; // account for header row
    const mapped = mapRow(row, rowNumber);
    if (mapped === '') return;
    if (typeof mapped === 'string') {
      errors.push(mapped);
      return;
    }
    employees.push(mapped);
  });

  if (employees.length === 0 && errors.length === 0) {
    errors.push('No employee rows found. Use the template headers and add at least one data row.');
  }

  return { employees, errors };
}
