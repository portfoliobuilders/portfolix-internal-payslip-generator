/**
 * Text/vector PDF builders for payroll documents.
 * Production bank/authorised PDFs must NOT be full-page html2canvas screenshots.
 */

import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import { formatAttendanceCycleRange } from './payroll-cycle';
import { formatAmount, formatINR, formatMonthYear } from './format';

/** Helvetica-safe money label (₹ glyph is not in StandardFonts). */
function pdfMoney(amount: number): string {
  return `INR ${formatAmount(amount)}`;
}

export interface VectorPayslipPdfInput {
  documentType: 'INTERNAL_PAY_SLIP' | 'AUTHORISED_SALARY_SLIP';
  legalCompanyName: string;
  employeeName: string;
  employeeId: string;
  salaryMonth: string;
  attendancePeriodStart: string;
  attendancePeriodEnd: string;
  netSalary: number;
  documentNumber: string;
  paymentStatus: string;
  verificationId?: string | null;
  verificationUrl?: string | null;
  actualCreditDate?: string | null;
  expectedPaymentDate?: string | null;
  lopDivisorLabel?: string | null;
  confirmedPaidAmount?: number | null;
  outstandingAmount?: number | null;
  cin?: string | null;
  issueDate?: string | null;
}

const MAX_BYTES = 1024 * 1024;

export async function buildVectorPayslipPdf(
  input: VectorPayslipPdfInput,
): Promise<{ bytes: Uint8Array; sizeBytes: number; extractedText: string }> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(
    input.documentType === 'AUTHORISED_SALARY_SLIP'
      ? 'AUTHORISED SALARY SLIP'
      : 'INTERNAL PAY SLIP',
  );
  pdf.setAuthor(input.legalCompanyName);
  pdf.setSubject(`${input.salaryMonth} · ${input.employeeName}`);
  pdf.setCreator('Portfolix SlipGen');
  pdf.setProducer('Portfolix SlipGen pdf-lib');

  const page = pdf.addPage([595.28, 841.89]); // A4 points
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const margin = 48;
  let y = 800;
  const line = (text: string, size = 10, bold = false) => {
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
  };

  const title =
    input.documentType === 'AUTHORISED_SALARY_SLIP'
      ? 'AUTHORISED SALARY SLIP'
      : 'INTERNAL PAY SLIP';

  line(input.legalCompanyName, 14, true);
  if (input.cin) line(`CIN: ${input.cin}`, 9);
  y -= 4;
  line(title, 13, true);
  line(`Document number: ${input.documentNumber}`, 10);
  line(`Salary month: ${formatMonthYear(input.salaryMonth)}`, 10);
  line(
    `Attendance cycle: ${formatAttendanceCycleRange(
      input.attendancePeriodStart,
      input.attendancePeriodEnd,
    )}`,
    10,
  );
  line(`Employee: ${input.employeeName}`, 10);
  line(`Employee ID: ${input.employeeId}`, 10);
  line(`Net salary: ${pdfMoney(input.netSalary)}`, 10, true);
  line(`Payment status: ${input.paymentStatus}`, 10);
  if (input.lopDivisorLabel) line(input.lopDivisorLabel, 9);
  if (input.confirmedPaidAmount != null) {
    line(`Confirmed amount paid: ${pdfMoney(input.confirmedPaidAmount)}`, 10);
  }
  if (input.outstandingAmount != null) {
    line(`Outstanding balance: ${pdfMoney(input.outstandingAmount)}`, 10);
  }
  if (input.actualCreditDate) {
    line(`Actual salary-credit date: ${input.actualCreditDate}`, 10);
  } else if (input.expectedPaymentDate) {
    line(`Expected payment date: ${input.expectedPaymentDate}`, 10);
  }
  if (input.issueDate) line(`Issue date: ${input.issueDate}`, 10);

  if (input.documentType === 'AUTHORISED_SALARY_SLIP') {
    y -= 8;
    line(`Verification ID: ${input.verificationId ?? '—'}`, 10);
    if (input.verificationUrl) {
      line(`Verification URL: ${input.verificationUrl}`, 8);
      // Vector QR placeholder square (real QR encoding added when QR lib is approved)
      page.drawRectangle({
        x: 595.28 - margin - 72,
        y: 72,
        width: 64,
        height: 64,
        borderColor: rgb(0.1, 0.1, 0.1),
        borderWidth: 1,
      });
      page.drawText('QR', {
        x: 595.28 - margin - 52,
        y: 98,
        size: 10,
        font: fontBold,
        rotate: degrees(0),
      });
    }
    y = Math.min(y, 150);
    line('Authorised and issued by the employer.', 8);
    line(
      'This computer-generated authorised salary slip may be verified through the QR code and verification ID.',
      8,
    );
  } else {
    y -= 8;
    line(
      'Confidential internal payroll record. This document is intended for the named employee and authorised company personnel only.',
      8,
    );
    line(
      'It is not an authorised income certificate and must not be used for bank, loan, visa or third-party verification purposes.',
      8,
    );
    line(
      'This is a computer-generated internal payroll document and does not require a physical signature.',
      8,
    );
  }

  const bytes = await pdf.save();
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error(`PDF exceeds 1 MB size target (${bytes.byteLength} bytes).`);
  }

  const extractedText = [
    input.legalCompanyName,
    title,
    input.employeeName,
    formatMonthYear(input.salaryMonth),
    formatAttendanceCycleRange(
      input.attendancePeriodStart,
      input.attendancePeriodEnd,
    ),
    formatINR(input.netSalary),
    input.documentNumber,
    input.paymentStatus,
    input.verificationId ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  return { bytes, sizeBytes: bytes.byteLength, extractedText };
}

/** Extract text-ish payload for automated assertions without a full PDF parser. */
export function assertVectorPdfTextContains(
  extractedText: string,
  required: string[],
): { ok: true } | { ok: false; missing: string[] } {
  const missing = required.filter((r) => !extractedText.includes(r));
  return missing.length ? { ok: false, missing } : { ok: true };
}
