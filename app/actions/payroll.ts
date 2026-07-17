'use server';

import { requirePayrollAdmin } from '@/lib/auth';

/**
 * Payroll server actions.
 * Every export is gated by requirePayrollAdmin() (fail closed).
 */

import { revalidatePath } from 'next/cache';
import type {
  AuthorisedSlipYtd,
  Employee,
  Settings,
  SignatorySnapshot,
  SlipSnapshot,
} from '@/lib/types';
import {
  APP_SETTINGS_ID,
  defaultSettingsRow,
  employeeToRow,
  generateId,
  normalizeEmployeeId,
  rowToEmployee,
  rowToSettings,
  rowToSlip,
  settingsToRow,
  slipToRow,
  type AppSettingsRow,
  type EmployeeRow,
  type PayrollSlipRow,
} from '@/lib/payroll-db';
import type { BulkEmployeeInput } from '@/lib/employee-excel';
import { createClient } from '@/utils/supabase/server';
import { statementMetaFor } from '@/lib/workforce';
import { computeAuthorisedYtd } from '@/lib/authorised-slip';
import { calendarDaysInMonthYear } from '@/lib/calculation-method';
import { buildServerFinalSnapshot } from '@/lib/payroll-integrity';
import { findFinalSlipForMonth } from '@/lib/payroll-helpers';

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function getSupabase() {
  return createClient();
}

function revalidatePayrollViews() {
  revalidatePath('/');
  revalidatePath('/employee-roster');
  revalidatePath('/generator');
  revalidatePath('/history');
  revalidatePath('/settings');
}

/** Returns all employee rows from Supabase, newest first by name. */
export async function fetchEmployees(): Promise<ActionResult<Employee[]>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
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
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const supabase = await getSupabase();
    const id = employeeData.id || generateId();
    const row = employeeToRow({
      ...employeeData,
      empId: normalizeEmployeeId(employeeData.empId),
      id,
      flexLog: employeeData.flexLog ?? [],
      tdsMonthly: employeeData.tdsMonthly ?? 0,
      ptHalfYearly: employeeData.ptHalfYearly ?? 0,
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

/**
 * Sets Kerala PT half-yearly amount on every employee roster row.
 * Use from Settings to reduce/raise PT for everyone in one step.
 */
export async function applyPtHalfYearlyToAll(
  amount: number,
): Promise<ActionResult<{ count: number; amount: number }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const pt = Math.max(0, Number(amount) || 0);
  if (!Number.isFinite(pt)) {
    return { ok: false, error: 'PT amount must be 0 or more.' };
  }

  try {
    const supabase = await getSupabase();
    const existingResult = await supabase.from('employees').select('*');
    if (existingResult.error) return { ok: false, error: existingResult.error.message };

    const rows = (existingResult.data as EmployeeRow[]).map((row) => {
      const employee = rowToEmployee(row);
      return employeeToRow({ ...employee, ptHalfYearly: pt });
    });

    if (rows.length === 0) {
      return { ok: true, data: { count: 0, amount: pt } };
    }

    const { error } = await supabase.from('employees').upsert(rows, { onConflict: 'id' });
    if (error) return { ok: false, error: error.message };

    revalidatePayrollViews();
    return { ok: true, data: { count: rows.length, amount: pt } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to apply Professional Tax to roster.',
    };
  }
}

/** Inserts or updates many employees in one request (matched by employee_id). */
export async function bulkUpsertEmployees(
  employees: BulkEmployeeInput[],
): Promise<ActionResult<{ count: number; employees: Employee[] }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  if (employees.length === 0) {
    return { ok: false, error: 'No employees to upload.' };
  }

  try {
    const supabase = await getSupabase();

    const existingResult = await supabase.from('employees').select('*');
    if (existingResult.error) return { ok: false, error: existingResult.error.message };

    const existingByEmpId = new Map(
      (existingResult.data as EmployeeRow[]).map((row) => [
        normalizeEmployeeId(row.employee_id),
        row,
      ]),
    );

    const rows = employees.map((employee) => {
      const empId = normalizeEmployeeId(employee.empId);
      const existing = existingByEmpId.get(empId);
      const existingEmployee = existing ? rowToEmployee(existing) : null;
      const flexLog = existingEmployee?.flexLog ?? [];
      return employeeToRow({
        ...employee,
        empId,
        id: existing?.id ?? generateId(),
        flexLog,
        tdsMonthly: employee.tdsMonthly ?? existingEmployee?.tdsMonthly ?? 0,
        ptHalfYearly: employee.ptHalfYearly ?? existingEmployee?.ptHalfYearly ?? 0,
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
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
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
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
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
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
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

    // Secondary history mirror — never fail the primary payroll_slips save when missing/unavailable.
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
    if (statementError) {
      console.warn(
        '[payroll] payment_statements mirror skipped:',
        statementError.message,
      );
    }

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
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
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

/**
 * Finalize a payroll slip with server-side recomputation.
 *
 * Client-supplied `computed` / `newFlexBalance` are NOT trusted.
 * Duplicate active FINALs are blocked unless supersedeConfirmed=true.
 * Legacy period/attendance gates emit warnings until enforceStrictGates is enabled.
 */
export async function finalizePayrollSlip(
  snapshot: SlipSnapshot,
  _clientNewFlexBalance: number,
  settingsSnapshot?: Settings,
  options?: {
    supersedeConfirmed?: boolean;
    enforceStrictGates?: boolean;
    attendanceLocked?: boolean;
    paymentStatus?:
      | 'NOT_SCHEDULED'
      | 'SCHEDULED'
      | 'PROCESSING'
      | 'PARTIALLY_PAID'
      | 'PAID'
      | 'FAILED'
      | 'REJECTED_BY_BANK'
      | 'ON_HOLD'
      | 'PAYMENT_DEFERRED'
      | 'OVERDUE'
      | 'REVERSED'
      | 'CANCELLED'
      | 'UNDER_RECONCILIATION'
      | 'UNPAID';
    salaryCreditDate?: string | null;
    expectedPaymentDate?: string | null;
  },
): Promise<ActionResult<{ slip: SlipSnapshot; employee: Employee; warnings: string[] }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const settings =
      settingsSnapshot ??
      (
        await (async () => {
          const { fetchSettings } = await import('@/app/actions/settings');
          const result = await fetchSettings();
          return result.ok ? result.data : null;
        })()
      );

    if (!settings) {
      return { ok: false, error: 'Settings unavailable; cannot finalize payroll.' };
    }

    const employeesResult = await fetchEmployees();
    if (!employeesResult.ok) return employeesResult;

    const employee = employeesResult.data.find(
      (e) => e.id === snapshot.employeeId || e.empId === snapshot.employeeId,
    );
    if (!employee) {
      return { ok: false, error: 'Employee not found.' };
    }

    const historyResult = await fetchPayrollHistory();
    if (!historyResult.ok) return historyResult;

    const existingFinal = findFinalSlipForMonth(
      historyResult.data,
      snapshot.employeeId,
      snapshot.monthYear,
    );

    const built = buildServerFinalSnapshot({
      trusted: {
        employeeId: snapshot.employeeId,
        monthYear: snapshot.monthYear,
        baseSalary: snapshot.inputs.baseSalary,
        flexBankBalance: snapshot.inputs.flexBankBalanceBefore,
        flexMinutesEarned: snapshot.inputs.flexMinutesEarned,
        totalLateMinutes: snapshot.inputs.lateMinutes,
        absentDays: snapshot.inputs.absentDays,
        halfDays: snapshot.inputs.halfDays,
        fixedAllowance: snapshot.inputs.fixedAllowance,
        otherDeductions: snapshot.inputs.otherDeductions,
        tdsMonthly: snapshot.inputs.tdsMonthly ?? employee.tdsMonthly ?? 0,
        ptHalfYearly: employee.ptHalfYearly ?? 0,
        variableEarned: snapshot.inputs.variableEarned,
        variablePaid: snapshot.inputs.variablePaid,
        deferredOpening: snapshot.inputs.deferredOpening,
        committedPayoutDate: snapshot.inputs.committedPayoutDate,
        variableLabel: snapshot.inputs.variableLabel,
        remarks: snapshot.inputs.remarks,
        compensationAmount: snapshot.inputs.compensationAmount,
        attendanceLocked: options?.attendanceLocked ?? false,
      },
      settings,
      employeeSnapshot: {
        fullName: employee.fullName,
        empId: employee.empId,
        entityCode: employee.entityCode,
        department: employee.department,
        designation: employee.designation,
        joiningDate: employee.joiningDate,
        employeeAddress: employee.employeeAddress,
        paymentMode: employee.paymentMode,
        engagementType: employee.engagementType,
        employmentStatus: employee.employmentStatus,
        paymentType: employee.paymentType,
        compensationAmount: employee.compensationAmount,
        bankName: employee.bankName,
        bankAccountNumber: employee.bankAccountNumber,
        bankLast4: employee.bankLast4,
        pan: employee.pan,
        panMasked: employee.panMasked,
        ifsc: employee.ifsc,
        workLocation: employee.workLocation,
        salaryComponents: employee.salaryComponents,
      },
      slipId: snapshot.id && snapshot.id !== 'preview' ? snapshot.id : generateId(),
      generatedAt: new Date().toISOString(),
      existingFinal: Boolean(existingFinal),
      supersedeConfirmed: options?.supersedeConfirmed ?? false,
      history: historyResult.data,
      workflowStatus: 'APPROVED',
      paymentStatus: options?.paymentStatus ?? 'NOT_SCHEDULED',
      salaryCreditDate: options?.salaryCreditDate ?? null,
      expectedPaymentDate: options?.expectedPaymentDate ?? null,
      integrityStatus: 'OK',
      enforceStrictGates: options?.enforceStrictGates ?? false,
      clientComputed: snapshot.computed,
    });

    if (!built.ok || !built.snapshot || built.newFlexBalance == null) {
      const message = built.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join(' ');
      return {
        ok: false,
        error: message || 'Payroll finalization blocked by integrity checks.',
      };
    }

    const warnings = built.issues
      .filter((i) => i.severity === 'warning')
      .map((i) => i.message);

    const supabase = await getSupabase();

    // Supersede prior active FINAL when explicitly confirmed.
    if (existingFinal && options?.supersedeConfirmed) {
      await supabase
        .from('payroll_slips')
        .update({
          active_final: false,
          workflow_status: 'SUPERSEDED',
          status: 'final',
        })
        .eq('id', existingFinal.id);

      await supabase.from('payroll_audit_logs').insert({
        action: 'PAYROLL_SUPERSEDED',
        entity_type: 'payroll_slip',
        entity_id: existingFinal.id,
        previous_values: { status: existingFinal.status },
        new_values: { workflow_status: 'SUPERSEDED', superseded_by: built.snapshot.id },
        reason: `Superseded by ${built.snapshot.id} for ${built.snapshot.monthYear}`,
      });
    } else {
      // DB-level duplicate guard (no-op if migrations not yet applied).
      try {
        await supabase.rpc('assert_no_duplicate_active_final', {
          p_employee_id: built.snapshot.employeeId,
          p_month_year: built.snapshot.monthYear,
          p_except_id: null,
        });
      } catch {
        // Function may be missing before migrations are applied — app-level check already ran.
      }
    }

    const slipResult = await savePayrollSlip(built.snapshot, settings);
    if (!slipResult.ok) return slipResult;

    // Annotate integrity columns when migration 009 is present.
    await supabase
      .from('payroll_slips')
      .update({
        workflow_status: 'FINAL',
        integrity_status: 'OK',
        payment_status: options?.paymentStatus === 'UNPAID'
          ? 'NOT_SCHEDULED'
          : (options?.paymentStatus ?? 'NOT_SCHEDULED'),
        salary_credit_date: options?.salaryCreditDate ?? null,
        expected_payment_date: options?.expectedPaymentDate ?? null,
        lop_days: built.snapshot.computed.lopDays,
        calendar_days: calendarDaysInMonthYear(built.snapshot.monthYear),
        attendance_locked: options?.attendanceLocked ?? false,
        calculation_method_code: built.calculationMethodCode,
        payroll_divisor: built.payrollDivisor,
        server_computed_at: new Date().toISOString(),
        active_final: true,
        supersedes: existingFinal && options?.supersedeConfirmed ? existingFinal.id : null,
        salary_month: built.snapshot.monthYear,
        attendance_period_start: built.attendancePeriod?.attendancePeriodStart ?? null,
        attendance_period_end: built.attendancePeriod?.attendancePeriodEnd ?? null,
        payroll_cycle_method: built.attendancePeriod?.payrollCycleMethod ?? 'PREVIOUS_25_TO_CURRENT_24',
        internal_document_status: 'ISSUED',
        legal_entity_id: employee.entityCode,
      })
      .eq('id', built.snapshot.id);

    await supabase.from('payroll_audit_logs').insert({
      action: 'PAYROLL_FINALIZED',
      entity_type: 'payroll_slip',
      entity_id: built.snapshot.id,
      previous_values: null,
      new_values: {
        monthYear: built.snapshot.monthYear,
        netPay: built.snapshot.computed.netPay,
        newFlexBalance: built.newFlexBalance,
        warnings,
      },
      reason: `Server-recomputed final for ${built.snapshot.monthYear}`,
    });

    const delta = built.newFlexBalance - employee.flexBankBalance;
    const flexLog =
      delta === 0
        ? employee.flexLog
        : [
            ...employee.flexLog,
            {
              date: new Date().toISOString(),
              delta,
              reason: `Payroll finalized for ${built.snapshot.monthYear}`,
            },
          ];

    const employeeResult = await upsertEmployee({
      ...employee,
      flexBankBalance: built.newFlexBalance,
      flexLog,
    });
    if (!employeeResult.ok) return employeeResult;

    // Parent salary-payment obligation — FINAL ≠ PAID.
    try {
      const { ensureSalaryPaymentObligation } = await import('@/app/actions/salary-payment');
      const { resolvePaymentSchedule } = await import('@/lib/payment-schedule');
      const schedule = resolvePaymentSchedule({
        salaryMonth: built.snapshot.monthYear,
        companyDefaultPaymentDay: settings.paydayDayOfMonth,
        employeePreferredPaymentDay:
          (employee as { preferredPaymentDay?: number | null }).preferredPaymentDay ??
          null,
        employeeDefaultPaymentDay:
          (employee as { defaultPaymentDay?: number | null }).defaultPaymentDay ?? null,
      });
      const dueCommitted =
        options?.expectedPaymentDate ?? schedule.scheduledPaymentDate;
      await ensureSalaryPaymentObligation({
        payrollRecordId: built.snapshot.id,
        employeeId: built.snapshot.employeeId,
        monthYear: built.snapshot.monthYear,
        netSalaryPayable: built.snapshot.computed.netPay,
        paydayDayOfMonth: settings.paydayDayOfMonth,
        originalDueDate: schedule.originalDueDate,
        scheduledPaymentDate: dueCommitted,
        companyCommittedDate: dueCommitted,
        actorUserId: 'system',
      });
    } catch {
      // Payment tables may not exist until migration 011 is applied.
    }

    return {
      ok: true,
      data: { slip: slipResult.data, employee: employeeResult.data, warnings },
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to finalize payroll slip.',
    };
  }
}

/**
 * YTD line items for the Authorised Slip — Indian FY, FINAL snapshots only,
 * up to and including the given slip month.
 */
export async function fetchAuthorisedSlipYtd(
  employeeId: string,
  throughMonthYear: string,
): Promise<ActionResult<AuthorisedSlipYtd>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const history = await fetchPayrollHistory();
  if (!history.ok) return history;
  return {
    ok: true,
    data: computeAuthorisedYtd(history.data, employeeId, throughMonthYear),
  };
}

/**
 * Logs one Authorised Slip (bank copy) generation. Reprints are logged, never blocked.
 */
export async function logAuthorisedSlipGeneration(
  payrollSlipId: string,
  signatorySnapshot: SignatorySnapshot,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from('authorised_slip_log')
      .insert({
        payroll_slip_id: payrollSlipId,
        signatory_snapshot: signatorySnapshot,
        document_number: signatorySnapshot.documentNumber ?? null,
        revision_number: signatorySnapshot.revisionNumber ?? 1,
        public_verification_id: signatorySnapshot.publicVerificationId ?? null,
      })
      .select('id')
      .single();

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: { id: (data as { id: string }).id } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to log authorised slip generation.',
    };
  }
}

/** Returns application settings from Supabase, seeding defaults if missing. */
export async function getAppSettings(): Promise<ActionResult<Settings>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const { fetchSettings } = await import('@/app/actions/settings');
  return fetchSettings();
}

/** Inserts default settings when the singleton row does not exist. */
export async function seedDefaultAppSettingsIfMissing(): Promise<ActionResult<Settings>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  return getAppSettings();
}

/** Saves application settings to Supabase. */
export async function upsertAppSettings(settings: Settings): Promise<ActionResult<Settings>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  const { saveSettings } = await import('@/app/actions/settings');
  return saveSettings(settings);
}

/** Removes a payroll slip from history. */
/**
 * Soft-cancels / blocks hard-delete of final, issued, or payment-linked slips.
 * Draft records with no payment obligation or issued document may still be deleted.
 */
export async function deletePayrollSlip(
  id: string,
  opts?: { reason?: string; actorUserId?: string; forceCancel?: boolean },
): Promise<ActionResult<{ id: string; action: 'deleted' | 'cancelled' | 'revoked' }>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const supabase = await getSupabase();
    const { data: row, error: fetchError } = await supabase
      .from('payroll_slips')
      .select('id, status, workflow_status, active_final, internal_document_status, authorised_document_status, details_json')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) return { ok: false, error: fetchError.message };
    if (!row) return { ok: false, error: 'Payroll slip not found.' };

    const status = String((row as { status?: string }).status ?? 'draft').toLowerCase();
    const workflow = String((row as { workflow_status?: string }).workflow_status ?? '');
    const activeFinal = Boolean((row as { active_final?: boolean }).active_final);
    const authDoc = String((row as { authorised_document_status?: string }).authorised_document_status ?? '');
    const isFinal =
      status === 'final' ||
      activeFinal ||
      ['FINAL', 'FINALISED', 'PAID', 'PAYMENT_PENDING'].includes(workflow);
    const isIssued = ['ISSUED', 'LEGACY_UNVERIFIED'].includes(authDoc);

    let hasPayment = false;
    try {
      const { data: obl } = await supabase
        .from('salary_payment_obligations')
        .select('id, confirmed_paid_amount')
        .eq('payroll_record_id', id)
        .maybeSingle();
      if (obl) {
        hasPayment = true;
        const paid = Number((obl as { confirmed_paid_amount?: number }).confirmed_paid_amount ?? 0);
        if (paid > 0) {
          return {
            ok: false,
            error:
              'Cannot delete a payroll record with confirmed payment transactions. Use reverse / cancel / supersede with a reason.',
          };
        }
      }
    } catch {
      // payment tables may be absent
    }

    if (isFinal || isIssued || hasPayment) {
      if (!opts?.reason?.trim()) {
        return {
          ok: false,
          error:
            'Final or issued payroll records cannot be permanently deleted. Provide a reason to Cancel / Revoke, or supersede via a correction.',
        };
      }
      const { error } = await supabase
        .from('payroll_slips')
        .update({
          active_final: false,
          workflow_status: 'CANCELLED',
          payment_status: 'CANCELLED',
          internal_document_status: 'CANCELLED',
          authorised_document_status:
            authDoc === 'ISSUED' || authDoc === 'LEGACY_UNVERIFIED' ? 'REVOKED' : 'CANCELLED',
        })
        .eq('id', id);
      if (error) return { ok: false, error: error.message };

      await supabase.from('payroll_audit_logs').insert({
        action: authDoc === 'ISSUED' ? 'PAYROLL_DOCUMENT_REVOKED' : 'PAYROLL_CANCELLED',
        entity_type: 'payroll_slip',
        entity_id: id,
        reason: opts.reason.trim(),
        actor_user_id: opts.actorUserId ?? 'hr-user',
        new_values: { workflow_status: 'CANCELLED' },
      });

      revalidatePayrollViews();
      return {
        ok: true,
        data: {
          id,
          action: authDoc === 'ISSUED' || authDoc === 'LEGACY_UNVERIFIED' ? 'revoked' : 'cancelled',
        },
      };
    }

    const { error } = await supabase.from('payroll_slips').delete().eq('id', id);
    if (error) return { ok: false, error: error.message };

    await supabase.from('payroll_audit_logs').insert({
      action: 'PAYROLL_DRAFT_DELETED',
      entity_type: 'payroll_slip',
      entity_id: id,
      reason: opts?.reason ?? 'Draft deleted',
      actor_user_id: opts?.actorUserId ?? 'hr-user',
    });

    revalidatePayrollViews();
    return { ok: true, data: { id, action: 'deleted' } };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to delete payroll slip.',
    };
  }
}

// Aliases matching the requested helper names
export const getEmployees = fetchEmployees;
export const getSlipHistory = fetchPayrollHistory;
export const saveSlipHistory = savePayrollSlip;
export const deleteSlipHistory = deletePayrollSlip;
