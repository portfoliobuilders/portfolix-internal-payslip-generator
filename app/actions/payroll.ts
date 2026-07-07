'use server';

import { revalidatePath } from 'next/cache';
import type { Employee, Settings, SlipSnapshot } from '@/lib/types';
import {
  employeeToRow,
  generateId,
  rowToEmployee,
  rowToSlip,
  slipToRow,
  type EmployeeRow,
  type PayrollSlipRow,
} from '@/lib/payroll-db';
import type { BulkEmployeeInput } from '@/lib/employee-excel';
import { createClient } from '@/utils/supabase/server';
import { statementMetaFor } from '@/lib/workforce';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function getSupabase() {
  return createClient();
}

function revalidatePayrollViews() {
  revalidatePath('/');
}

/** Returns all employee rows from Supabase, newest first by name. */
export async function fetchEmployees(): Promise<ActionResult<Employee[]>> {
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .order('full_name', { ascending: true });

    if (error) return { ok: false, error: error.message };

    const employees = (data as EmployeeRow[]).map(rowToEmployee);
    return { ok: true, data: employees };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to fetch employees.' };
  }
}

/** Inserts or updates an employee record (upsert on primary key). */
export async function upsertEmployee(
  employeeData: Omit<Employee, 'id' | 'flexLog'> & {
    id?: string;
    flexLog?: Employee['flexLog'];
  },
): Promise<ActionResult<Employee>> {
  try {
    const supabase = await getSupabase();
    const id = employeeData.id || generateId();
    const row = employeeToRow({
      ...employeeData,
      id,
      flexLog: employeeData.flexLog ?? [],
    });

    const { data, error } = await supabase
      .from('employees')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single();

    if (error) return { ok: false, error: error.message };

    revalidatePayrollViews();
    return { ok: true, data: rowToEmployee(data as EmployeeRow) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save employee.' };
  }
}

/** Inserts or updates many employees in one request (matched by employee_id). */
export async function bulkUpsertEmployees(
  employees: BulkEmployeeInput[],
): Promise<ActionResult<{ count: number; employees: Employee[] }>> {
  if (employees.length === 0) {
    return { ok: false, error: 'No employees to upload.' };
  }

  try {
    const supabase = await getSupabase();

    const existingResult = await supabase.from('employees').select('*');
    if (existingResult.error) return { ok: false, error: existingResult.error.message };

    const existingByEmpId = new Map(
      (existingResult.data as EmployeeRow[]).map((row) => [row.employee_id, row]),
    );

    const rows = employees.map((employee) => {
      const existing = existingByEmpId.get(employee.empId);
      const flexLog = existing ? rowToEmployee(existing).flexLog : [];
      return employeeToRow({
        ...employee,
        id: existing?.id ?? generateId(),
        flexLog,
      });
    });

    const { data, error } = await supabase
      .from('employees')
      .upsert(rows, { onConflict: 'id' })
      .select('*');

    if (error) return { ok: false, error: error.message };

    revalidatePayrollViews();
    const saved = (data as EmployeeRow[]).map(rowToEmployee);
    return { ok: true, data: { count: saved.length, employees: saved } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to bulk upload employees.',
    };
  }
}

/** Removes an employee from the roster. Past slips in history are kept. */
export async function deleteEmployee(id: string): Promise<ActionResult<{ id: string }>> {
  try {
    const supabase = await getSupabase();
    const { error } = await supabase.from('employees').delete().eq('id', id);

    if (error) return { ok: false, error: error.message };

    revalidatePayrollViews();
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to delete employee.' };
  }
}

/** Soft-offboards an employee while retaining complete roster history. */
export async function archiveEmployee(
  id: string,
  offboardingDate: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const employeesResult = await fetchEmployees();
    if (!employeesResult.ok) return employeesResult;
    const employee = employeesResult.data.find((entry) => entry.id === id);
    if (!employee) return { ok: false, error: 'Employee not found.' };
    const result = await upsertEmployee({
      ...employee,
      employmentStatus: 'offboarded',
      offboardingDate,
    });
    if (!result.ok) return result;
    return { ok: true, data: { id } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to offboard employee.' };
  }
}

/** Inserts a new payroll slip snapshot into payroll_slips. */
export async function savePayrollSlip(
  slipData: SlipSnapshot,
  settingsSnapshot?: Settings,
): Promise<ActionResult<SlipSnapshot>> {
  try {
    const supabase = await getSupabase();
    const row = slipToRow(slipData);
    const [year, month] = slipData.monthYear.split('-').map(Number);
    const statementMeta = statementMetaFor(
      slipData.employee.paymentType,
      slipData.employee.engagementType,
      slipData.employee.employmentStatus,
    );

    const { data, error } = await supabase
      .from('payroll_slips')
      .insert(row)
      .select('*')
      .single();

    if (error) return { ok: false, error: error.message };

    const { error: statementError } = await supabase.from('payment_statements').insert({
      id: slipData.id,
      person_id: slipData.employeeId,
      employee_id: slipData.employee.empId,
      person_name: slipData.employee.fullName,
      entity_id: slipData.employee.entityCode,
      engagement_type: slipData.employee.engagementType,
      employment_status: slipData.employee.employmentStatus,
      payment_type: slipData.employee.paymentType,
      statement_title: statementMeta.statementTitle,
      month,
      year,
      gross_pay: slipData.computed.grossFixed,
      net_pay: slipData.computed.netPay,
      compensation_amount: slipData.inputs.compensationAmount,
      earnings: {
        main: slipData.inputs.compensationAmount,
        fixedAllowance: slipData.inputs.fixedAllowance,
        variablePaid: slipData.computed.variablePaid,
      },
      deductions: {
        lopDeduction: slipData.computed.lopDeduction,
        otherDeductions: slipData.computed.otherDeductions,
      },
      payment_mode: slipData.employee.paymentMode,
      transaction_reference: null,
      generated_by: 'system',
      generated_at: slipData.generatedAt,
      pdf_url: null,
      pdf_data: null,
      snapshot_person_data: slipData.employee,
      snapshot_settings_data: settingsSnapshot ?? null,
      snapshot_data: slipData,
    });
    if (statementError) return { ok: false, error: statementError.message };

    revalidatePayrollViews();
    return { ok: true, data: rowToSlip(data as PayrollSlipRow) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save payroll slip.' };
  }
}

/**
 * Returns all payroll slips for the current session.
 * When auth is configured, RLS on payroll_slips scopes rows to the logged-in user/entity.
 */
export async function fetchPayrollHistory(): Promise<ActionResult<SlipSnapshot[]>> {
  try {
    const supabase = await getSupabase();
    const { data: statementsData, error: statementsError } = await supabase
      .from('payment_statements')
      .select('snapshot_data')
      .order('generated_at', { ascending: false });

    if (!statementsError && statementsData) {
      const snapshots = statementsData
        .map((row) => (row as { snapshot_data: SlipSnapshot | null }).snapshot_data)
        .filter((snapshot): snapshot is SlipSnapshot => Boolean(snapshot));
      snapshots.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
      return { ok: true, data: snapshots };
    }

    const { data, error } = await supabase
      .from('payroll_slips')
      .select('*')
      .order('month_year', { ascending: false });

    if (error) return { ok: false, error: error.message };

    const slips = (data as PayrollSlipRow[]).map(rowToSlip);
    slips.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return { ok: true, data: slips };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch payroll history.',
    };
  }
}

/** Convenience: finalize a slip and commit the employee's new flex-bank balance atomically (best-effort). */
export async function finalizePayrollSlip(
  snapshot: SlipSnapshot,
  newFlexBalance: number,
  settingsSnapshot?: Settings,
): Promise<ActionResult<{ slip: SlipSnapshot; employee: Employee }>> {
  const slipResult = await savePayrollSlip({ ...snapshot, status: 'final' }, settingsSnapshot);
  if (!slipResult.ok) return slipResult;

  const employeesResult = await fetchEmployees();
  if (!employeesResult.ok) return employeesResult;

  const employee = employeesResult.data.find((e) => e.id === snapshot.employeeId);
  if (!employee) {
    return { ok: false, error: 'Employee not found after saving slip.' };
  }

  const delta = newFlexBalance - employee.flexBankBalance;
  const flexLog =
    delta === 0
      ? employee.flexLog
      : [
          ...employee.flexLog,
          {
            date: new Date().toISOString(),
            delta,
            reason: `Payroll finalized for ${snapshot.monthYear}`,
          },
        ];

  const employeeResult = await upsertEmployee({
    ...employee,
    flexBankBalance: newFlexBalance,
    flexLog,
  });
  if (!employeeResult.ok) return employeeResult;

  return { ok: true, data: { slip: slipResult.data, employee: employeeResult.data } };
}
