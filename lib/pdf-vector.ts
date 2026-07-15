/**
 * Text/vector PDF builders for production payroll documents.
 * Does NOT use html2canvas full-page screenshots.
 *
 * Uses jsPDF text + vector lines for searchable/selectable output.
 */

import { jsPDF } from 'jspdf';
import { formatINR, formatMonthYear, formatSalaryAttendanceCycle } from './format';

export interface VectorInternalSlipInput {
  legalCompanyName: string;
  employeeName: string;
  employeeId: string;
  salaryMonth: string;
  attendanceCycleLabel?: string;
  netSalary: number;
  documentType: string;
  documentNumber: string;
  paymentStatus: string;
  expectedOrCreditLabel: string;
  expectedOrCreditDate: string;
}

export interface VectorAuthorisedSlipInput {
  legalCompanyName: string;
  employeeName: string;
  employeeId: string;
  salaryMonth: string;
  attendanceCycleLabel?: string;
  netSalary: number;
  documentType: string;
  documentNumber: string;
  paymentStatus: string;
  actualCreditDate: string;
  verificationId: string;
  cin?: string;
  designation?: string;
}

const MAX_PDF_BYTES = 1_000_000;

function applyMetadata(doc: jsPDF, title: string, subject: string) {
  doc.setProperties({
    title,
    subject,
    author: 'Portfolix Payroll',
    creator: 'Portfolix Internal Payslip Generator',
    keywords: 'payroll,salary,authorised',
  });
}

function drawHeader(doc: jsPDF, legalName: string, y: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(legalName, 20, y);
  doc.setDrawColor(20);
  doc.setLineWidth(0.4);
  doc.line(20, y + 3, 190, y + 3);
  return y + 12;
}

/** Build a searchable A4 internal pay slip PDF (text/vector). */
export function buildInternalSlipPdf(input: VectorInternalSlipInput): {
  blob: Blob;
  byteLength: number;
  textContent: string;
} {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  applyMetadata(doc, 'Internal Pay Slip', `${input.employeeName} ${input.salaryMonth}`);

  let y = 20;
  y = drawHeader(doc, input.legalCompanyName, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(input.documentType, 20, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const cycle =
    input.attendanceCycleLabel ??
    formatSalaryAttendanceCycle(input.salaryMonth, 'PREVIOUS_25_TO_CURRENT_24');

  const lines = [
    `Document number: ${input.documentNumber}`,
    `Employee: ${input.employeeName}`,
    `Employee ID: ${input.employeeId}`,
    `Salary month: ${formatMonthYear(input.salaryMonth)}`,
    `Attendance cycle: ${cycle}`,
    `Net salary: ${formatINR(input.netSalary)}`,
    `Payment status: ${input.paymentStatus}`,
    `${input.expectedOrCreditLabel}: ${input.expectedOrCreditDate}`,
  ];
  for (const line of lines) {
    doc.text(line, 20, y);
    y += 6;
  }

  y += 4;
  doc.setFontSize(8);
  doc.text(
    'Confidential internal payroll record. Not an authorised income certificate.',
    20,
    y,
    { maxWidth: 170 },
  );
  y += 8;
  doc.text(
    'This is a computer-generated internal payroll document and does not require a physical signature.',
    20,
    y,
    { maxWidth: 170 },
  );

  const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer;
  const byteLength = arrayBuffer.byteLength;
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const textContent = [
    input.legalCompanyName,
    input.documentType,
    input.employeeName,
    formatMonthYear(input.salaryMonth),
    cycle,
    formatINR(input.netSalary),
    input.documentNumber,
    input.paymentStatus,
  ].join('\n');

  return { blob, byteLength, textContent };
}

/** Build a searchable A4 authorised salary slip PDF (text/vector). */
export function buildAuthorisedSlipPdf(input: VectorAuthorisedSlipInput): {
  blob: Blob;
  byteLength: number;
  textContent: string;
} {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  applyMetadata(doc, 'AUTHORISED SALARY SLIP', `${input.employeeName} ${input.salaryMonth}`);

  let y = 20;
  y = drawHeader(doc, input.legalCompanyName, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('AUTHORISED SALARY SLIP', 105, y, { align: 'center' });
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const cycle =
    input.attendanceCycleLabel ??
    formatSalaryAttendanceCycle(input.salaryMonth, 'PREVIOUS_25_TO_CURRENT_24');

  const lines = [
    `Payslip number: ${input.documentNumber}`,
    `Employee: ${input.employeeName}`,
    `Employee ID: ${input.employeeId}`,
    input.designation ? `Designation: ${input.designation}` : null,
    `Salary month: ${formatMonthYear(input.salaryMonth)}`,
    `Attendance cycle: ${cycle}`,
    `Net salary: ${formatINR(input.netSalary)}`,
    `Payment status: ${input.paymentStatus}`,
    `Actual salary-credit date: ${input.actualCreditDate}`,
    `Verification ID: ${input.verificationId}`,
    input.cin ? `CIN: ${input.cin}` : null,
  ].filter(Boolean) as string[];

  for (const line of lines) {
    doc.text(line, 20, y);
    y += 6;
  }

  // Simple vector QR placeholder box labelled with verification id (decorative area
  // for layout; QR pixels can be added when a bitmap is supplied separately).
  doc.setDrawColor(40);
  doc.rect(150, 30, 28, 28);
  doc.setFontSize(6);
  doc.text('QR', 164, 45, { align: 'center' });
  doc.text(input.verificationId.slice(0, 12), 164, 55, { align: 'center' });

  y += 6;
  doc.setFontSize(8);
  doc.text(
    'Authorised and issued by the employer. Verify through the QR code and verification ID.',
    20,
    y,
    { maxWidth: 170 },
  );

  const arrayBuffer = doc.output('arraybuffer') as ArrayBuffer;
  const byteLength = arrayBuffer.byteLength;
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const textContent = [
    input.legalCompanyName,
    'AUTHORISED SALARY SLIP',
    input.employeeName,
    formatMonthYear(input.salaryMonth),
    cycle,
    formatINR(input.netSalary),
    input.documentNumber,
    input.paymentStatus,
    input.verificationId,
  ].join('\n');

  if (byteLength > MAX_PDF_BYTES) {
    throw new Error(`PDF exceeds size limit (${byteLength} > ${MAX_PDF_BYTES}).`);
  }

  return { blob, byteLength, textContent };
}

export function pdfWithinSizeLimit(byteLength: number, limit = MAX_PDF_BYTES): boolean {
  return byteLength > 0 && byteLength < limit;
}
