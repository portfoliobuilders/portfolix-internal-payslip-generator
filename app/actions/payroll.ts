'use server';

import { revalidatePath } from 'next/cache';
import type { Employee, SlipSnapshot } from '@/lib/types';
import {
  employeeToRow,
  generateId,
  rowToEmployee,
  rowToSlip,
  slipToRow,
  type EmployeeRow,
  type PayrollSlipRow,
} from '@/lib/payroll-db';
import { createClient } from '@/utils/supabase/server';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'Supabase credentials missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local.',
    );
  }
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

/** Inserts a new payroll slip snapshot into payroll_slips. */
export async function savePayrollSlip(slipData: SlipSnapshot): Promise<ActionResult<SlipSnapshot>> {
  try {
    const supabase = await getSupabase();
    const row = slipToRow(slipData);

    const { data, error } = await supabase
      .from('payroll_slips')
      .insert(row)
      .select('*')
      .single();

    if (error) return { ok: false, error: error.message };

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
): Promise<ActionResult<{ slip: SlipSnapshot; employee: Employee }>> {
  const slipResult = await savePayrollSlip({ ...snapshot, status: 'final' });
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
