/**
 * Shared AUTHORISED SALARY SLIP export path.
 * Uses text/vector PDF + issued-document registry. Never fabricates payment data.
 */

import { issueAuthorisedSalarySlipDocument } from '@/app/actions/issued-documents';
import { assertAuthorisedSlipPaymentGate } from '@/app/actions/salary-payment';
import { downloadPdfBytes } from '@/lib/download-pdf';
import { authorisedSlipFilename } from '@/lib/format';
import {
  computeAttendancePeriod,
  DEFAULT_PAYROLL_CYCLE_METHOD,
} from '@/lib/payroll-cycle';
import { lopCalculationBasisDisplayText } from '@/lib/calculation-method';
import { buildVectorPayslipPdf } from '@/lib/pdf-vector';
import type { EntityInfo, SlipSnapshot } from '@/lib/types';

export interface AuthorisedExportResult {
  documentNumber: string;
  publicVerificationId: string;
  verificationUrl: string;
  filename: string;
  sizeBytes: number;
}

function resolveAttendance(snapshot: SlipSnapshot): {
  start: string;
  end: string;
} {
  if (snapshot.attendancePeriodStart && snapshot.attendancePeriodEnd) {
    return {
      start: snapshot.attendancePeriodStart,
      end: snapshot.attendancePeriodEnd,
    };
  }
  const period = computeAttendancePeriod({
    salaryMonth: snapshot.salaryMonth ?? snapshot.monthYear,
    method: DEFAULT_PAYROLL_CYCLE_METHOD,
  });
  return {
    start: period.attendancePeriodStart,
    end: period.attendancePeriodEnd,
  };
}

function verificationBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://portfolix-internal-payslip-generato.vercel.app';
}

/**
 * Gate → issue/reuse verification document → build vector PDF → download.
 * Caller should still log authorised_slip_log separately if desired.
 */
export async function exportAuthorisedSalarySlipPdf(input: {
  snapshot: SlipSnapshot;
  entity: EntityInfo;
}): Promise<
  | { ok: true; data: AuthorisedExportResult }
  | { ok: false; error: string }
> {
  const paymentGate = await assertAuthorisedSlipPaymentGate(input.snapshot.id);
  if (!paymentGate.ok) return { ok: false, error: paymentGate.error };

  const attendance = resolveAttendance(input.snapshot);
  const issued = await issueAuthorisedSalarySlipDocument({
    snapshot: {
      ...input.snapshot,
      attendancePeriodStart: attendance.start,
      attendancePeriodEnd: attendance.end,
    },
    obligationId: paymentGate.data.obligationId,
    netSalary: paymentGate.data.netSalaryPayable,
    actualCreditDate: paymentGate.data.actualCreditDate,
    legalCompanyName: input.entity.name,
    cin: input.entity.cin,
    signatoryName: input.entity.signatoryName,
    signatoryDesignation: input.entity.signatoryDesignation,
    verificationBaseUrl: verificationBaseUrl(),
    issuedBy: 'hr-export',
  });
  if (!issued.ok) return { ok: false, error: issued.error };

  const pdf = await buildVectorPayslipPdf({
    documentType: 'AUTHORISED_SALARY_SLIP',
    legalCompanyName: input.entity.name,
    employeeName: input.snapshot.employee.fullName,
    employeeId: input.snapshot.employee.empId,
    salaryMonth: input.snapshot.monthYear,
    attendancePeriodStart: attendance.start,
    attendancePeriodEnd: attendance.end,
    netSalary: paymentGate.data.netSalaryPayable,
    documentNumber: issued.data.documentNumber,
    paymentStatus: 'Paid',
    verificationId: issued.data.publicVerificationId,
    verificationUrl: issued.data.verificationUrl,
    actualCreditDate: paymentGate.data.actualCreditDate,
    confirmedPaidAmount: paymentGate.data.confirmedPaidAmount,
    outstandingAmount: paymentGate.data.outstandingAmount,
    cin: input.entity.cin,
    issueDate: new Date().toISOString().slice(0, 10),
    lopDivisorLabel:
      input.snapshot.calculationMethodLabel ??
      lopCalculationBasisDisplayText(
        input.snapshot.calculationMethodCode ?? 'FIXED_25_DAY_DIVISOR',
      ),
  });

  const filename = authorisedSlipFilename(
    input.snapshot.monthYear,
    input.snapshot.employee.empId,
    issued.data.documentNumber,
  );
  downloadPdfBytes(pdf.bytes, filename);

  return {
    ok: true,
    data: {
      documentNumber: issued.data.documentNumber,
      publicVerificationId: issued.data.publicVerificationId,
      verificationUrl: issued.data.verificationUrl,
      filename,
      sizeBytes: pdf.sizeBytes,
    },
  };
}
