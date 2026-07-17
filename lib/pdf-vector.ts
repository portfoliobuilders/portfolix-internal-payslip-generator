/**
 * Text/vector PDF builders for production payroll documents.
 * Canonical AUTHORISED layout lives ONLY in buildVectorPayslipPdf.
 * Does NOT use html2canvas full-page screenshots.
 */

import { jsPDF } from 'jspdf';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFArray,
  PDFDocument,
  PDFHexString,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import {
  formatAmount,
  formatDate,
  formatINR,
  formatMonthYear,
  formatSalaryAttendanceCycle,
} from './format';
import { formatAttendanceCycleRange } from './payroll-cycle';
import { loadPdfFontBold, loadPdfFontRegular } from './pdf-fonts';
import { buildQrPngBytes } from './qr-png';
import { slipStatutoryDeductions } from './payroll-calc';
import type { AuthorisedSlipYtd, EntityInfo, SlipSnapshot } from './types';

/** Browser-safe deterministic 32-hex seed for PDF trailer IDs (hash identity). */
function deterministicHex(seed: string): string {
  let h1 = 2166136261;
  let h2 = 2166136261 ^ 0xdeadbeef;
  for (let i = 0; i < seed.length; i += 1) {
    const c = seed.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 16777619);
    h2 ^= c + ((i * 131) % 251);
    h2 = Math.imul(h2, 16777619);
  }
  const a = (h1 >>> 0).toString(16).padStart(8, '0');
  const b = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${a}${b}${a}${b}`.slice(0, 32);
}

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
const MAX_VECTOR_BYTES = 1024 * 1024;
const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

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

/** Legacy jsPDF authorised stub — prefer buildVectorPayslipPdf. */
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

/** Canonical input for the ONE authorised (and internal summary) vector renderer. */
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
  /** ISO date from payment ledger only — never invented. */
  actualCreditDate?: string | null;
  /** Settings-payday-derived ISO date when no ledger credit exists. */
  scheduledCreditDate?: string | null;
  expectedPaymentDate?: string | null;
  lopDivisorLabel?: string | null;
  confirmedPaidAmount?: number | null;
  outstandingAmount?: number | null;
  cin?: string | null;
  /** Snapshot/log timestamp — never new Date() at render. */
  issueDate?: string | null;
  payrollFinalisedDate?: string | null;
  /** Full authorised layout (required for AUTHORISED_SALARY_SLIP). */
  snapshot?: SlipSnapshot | null;
  entity?: EntityInfo | null;
  ytd?: AuthorisedSlipYtd | null;
  revisionNumber?: number;
  financialYearLabel?: string | null;
  paymentMode?: string | null;
  /** Raw image bytes (PNG/JPEG) fetched via signed URLs. */
  signatureBytes?: Uint8Array | null;
  sealBytes?: Uint8Array | null;
  logoBytes?: Uint8Array | null;
  /** When true, render payment status / confirmed / outstanding band. */
  showPaymentBand?: boolean;
}

function financialYearLabelFor(monthYear: string): string {
  const [yStr, mStr] = monthYear.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  return m >= 4 ? `FY ${y}-${String(y + 1).slice(-2)}` : `FY ${y - 1}-${String(y).slice(-2)}`;
}

function deterministicPdfId(seed: string): PDFHexString {
  return PDFHexString.of(deterministicHex(seed));
}

function drawClampedText(
  page: PDFPage,
  text: string,
  opts: {
    x: number;
    y: number;
    size: number;
    font: PDFFont;
    color?: ReturnType<typeof rgb>;
    maxWidth: number;
  },
) {
  let shown = text;
  while (
    shown.length > 1 &&
    opts.font.widthOfTextAtSize(shown, opts.size) > opts.maxWidth
  ) {
    shown = shown.slice(0, -1);
  }
  if (shown !== text && shown.length > 1) shown = `${shown.slice(0, -1)}…`;
  page.drawText(shown, {
    x: opts.x,
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: opts.color ?? rgb(0.1, 0.1, 0.1),
  });
}

async function embedImageSafe(
  pdf: PDFDocument,
  bytes: Uint8Array | null | undefined,
): Promise<PDFImage | null> {
  if (!bytes || bytes.byteLength === 0) return null;
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
      return await pdf.embedJpg(bytes);
    }
    return await pdf.embedPng(bytes);
  } catch {
    try {
      return await pdf.embedJpg(bytes);
    } catch {
      return null;
    }
  }
}

type DrawCtx = {
  page: PDFPage;
  font: PDFFont;
  fontBold: PDFFont;
  margin: number;
  width: number;
  y: number;
  extracted: string[];
};

function drawText(
  ctx: DrawCtx,
  text: string,
  opts: {
    size?: number;
    bold?: boolean;
    x?: number;
    color?: ReturnType<typeof rgb>;
    maxWidth?: number;
    align?: 'left' | 'center' | 'right';
  } = {},
) {
  const size = opts.size ?? 9;
  const font = opts.bold ? ctx.fontBold : ctx.font;
  const color = opts.color ?? rgb(0.1, 0.1, 0.1);
  let x = opts.x ?? ctx.margin;
  const maxWidth = opts.maxWidth ?? ctx.width - ctx.margin * 2;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  if (lines.length === 0) lines.push('');

  for (const line of lines) {
    let drawX = x;
    const lineWidth = font.widthOfTextAtSize(line, size);
    if (opts.align === 'center') drawX = x + (maxWidth - lineWidth) / 2;
    if (opts.align === 'right') drawX = x + maxWidth - lineWidth;
    ctx.page.drawText(line, { x: drawX, y: ctx.y, size, font, color });
    ctx.y -= size + 3;
  }
  ctx.extracted.push(text);
}

function drawHLine(ctx: DrawCtx, thickness = 0.8) {
  ctx.page.drawLine({
    start: { x: ctx.margin, y: ctx.y },
    end: { x: A4_WIDTH - ctx.margin, y: ctx.y },
    thickness,
    color: rgb(0.15, 0.15, 0.15),
  });
  ctx.y -= 8;
}

function money(amount: number): string {
  return formatINR(amount);
}

function amountOnly(amount: number): string {
  return formatAmount(amount);
}

async function buildAuthorisedFullPage(
  pdf: PDFDocument,
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  input: VectorPayslipPdfInput,
): Promise<string> {
  const snapshot = input.snapshot!;
  const entity = input.entity!;
  const ytd = input.ytd!;
  const { inputs, computed, employee } = snapshot;
  const revision = input.revisionNumber ?? snapshot.revisionNumber ?? 1;
  const fy =
    input.financialYearLabel ?? financialYearLabelFor(snapshot.monthYear);
  const cycle = formatAttendanceCycleRange(
    input.attendancePeriodStart,
    input.attendancePeriodEnd,
  );
  const { tds, pt } = slipStatutoryDeductions(computed, inputs);
  const other = computed.otherDeductions;
  const lop = computed.lopDeduction;
  const variablePaid = computed.variablePaid;
  const grossThisMonth = inputs.baseSalary + inputs.fixedAllowance + variablePaid;
  const totalDeductions = computed.totalDeductions;
  const margin = 36;
  const ctx: DrawCtx = {
    page,
    font,
    fontBold,
    margin,
    width: A4_WIDTH,
    y: A4_HEIGHT - 36,
    extracted: [],
  };

  const [logo, signature, seal, qr] = await Promise.all([
    embedImageSafe(pdf, input.logoBytes),
    embedImageSafe(pdf, input.signatureBytes),
    embedImageSafe(pdf, input.sealBytes),
    input.verificationUrl
      ? buildQrPngBytes(input.verificationUrl, 140).then((b) => embedImageSafe(pdf, b))
      : Promise.resolve(null),
  ]);

  // ---- Letterhead ----
  const letterheadTop = ctx.y;
  if (logo) {
    const logoH = 36;
    const logoW = Math.min(90, (logo.width / logo.height) * logoH);
    page.drawImage(logo, {
      x: margin,
      y: letterheadTop - logoH,
      width: logoW,
      height: logoH,
    });
  }

  const textLeft = margin + (logo ? 98 : 0);
  ctx.y = letterheadTop;
  page.drawText(entity.name, {
    x: textLeft,
    y: ctx.y - 12,
    size: 12,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08),
  });
  ctx.extracted.push(entity.name);
  ctx.y -= 26;
  const cinLine = `CIN: ${entity.cin}`;
  page.drawText(cinLine, {
    x: textLeft,
    y: ctx.y,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  ctx.extracted.push(cinLine);
  ctx.y -= 11;
  drawClampedText(page, entity.registeredAddress, {
    x: textLeft,
    y: ctx.y,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
    maxWidth: 280,
  });
  ctx.extracted.push(entity.registeredAddress);
  ctx.y -= 11;
  const contact = `Tel: ${entity.phone} · Payroll: ${entity.payrollEmail}`;
  drawClampedText(page, contact, {
    x: textLeft,
    y: ctx.y,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
    maxWidth: 300,
  });
  ctx.extracted.push(contact);

  if (qr) {
    const qrSize = 52;
    page.drawImage(qr, {
      x: A4_WIDTH - margin - qrSize,
      y: letterheadTop - qrSize,
      width: qrSize,
      height: qrSize,
    });
    if (input.verificationId) {
      const idShort = input.verificationId.slice(0, 10);
      const idW = font.widthOfTextAtSize(idShort, 6);
      page.drawText(idShort, {
        x: A4_WIDTH - margin - qrSize / 2 - idW / 2,
        y: letterheadTop - qrSize - 9,
        size: 6,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  }

  ctx.y = Math.min(ctx.y, letterheadTop - 58) - 6;
  drawHLine(ctx, 1.2);

  // ---- Title block ----
  drawText(ctx, 'AUTHORISED SALARY SLIP', {
    size: 13,
    bold: true,
    align: 'center',
    x: margin,
    maxWidth: A4_WIDTH - margin * 2,
  });
  drawText(ctx, `Salary month: ${formatMonthYear(snapshot.monthYear)} · ${fy}`, {
    size: 9,
    align: 'center',
    x: margin,
    maxWidth: A4_WIDTH - margin * 2,
  });
  drawText(ctx, `Attendance cycle: ${cycle}`, {
    size: 8,
    align: 'center',
    x: margin,
    maxWidth: A4_WIDTH - margin * 2,
    color: rgb(0.35, 0.35, 0.35),
  });
  drawText(
    ctx,
    `Payslip no: ${input.documentNumber} · Rev ${revision} · Status: ISSUED`,
    {
      size: 8,
      align: 'center',
      x: margin,
      maxWidth: A4_WIDTH - margin * 2,
      color: rgb(0.35, 0.35, 0.35),
    },
  );

  const finalisedIso = input.payrollFinalisedDate ?? snapshot.generatedAt;
  const issueIso = input.issueDate ?? snapshot.generatedAt;
  drawText(
    ctx,
    `Payroll finalised: ${formatDate(finalisedIso)} · Issue date: ${formatDate(issueIso)}`,
    {
      size: 8,
      align: 'center',
      x: margin,
      maxWidth: A4_WIDTH - margin * 2,
      color: rgb(0.35, 0.35, 0.35),
    },
  );

  if (input.actualCreditDate) {
    drawText(ctx, `Actual salary-credit date: ${formatDate(input.actualCreditDate)}`, {
      size: 9,
      bold: true,
      align: 'center',
      x: margin,
      maxWidth: A4_WIDTH - margin * 2,
    });
  } else {
    const scheduled =
      input.scheduledCreditDate ?? input.expectedPaymentDate ?? null;
    drawText(
      ctx,
      scheduled
        ? `Scheduled credit: ${formatDate(scheduled)}`
        : 'Scheduled credit: —',
      {
        size: 9,
        bold: true,
        align: 'center',
        x: margin,
        maxWidth: A4_WIDTH - margin * 2,
      },
    );
  }

  if (input.lopDivisorLabel) {
    drawText(ctx, input.lopDivisorLabel, {
      size: 7.5,
      align: 'center',
      x: margin,
      maxWidth: A4_WIDTH - margin * 2,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  ctx.y -= 4;

  // ---- Employee block ----
  const empTop = ctx.y + 4;
  const empBottom = ctx.y - 52;
  page.drawRectangle({
    x: margin,
    y: empBottom,
    width: A4_WIDTH - margin * 2,
    height: empTop - empBottom,
    borderColor: rgb(0.75, 0.75, 0.75),
    borderWidth: 0.6,
  });

  const colW = (A4_WIDTH - margin * 2 - 16) / 4;
  const rows: Array<[string, string][]> = [
    [
      ['Employee name', employee.fullName],
      ['Employee ID', employee.empId],
      ['Designation', employee.designation || '—'],
      ['Department', employee.department || '—'],
    ],
    [
      ['Date of joining', formatDate(employee.joiningDate)],
      ['PAN', employee.panMasked || '—'],
      ['Bank a/c', employee.bankLast4 ? `····${employee.bankLast4}` : '—'],
      [
        'Payment mode',
        input.paymentMode ?? employee.paymentMode ?? '—',
      ],
    ],
  ];

  let rowY = ctx.y - 2;
  for (const row of rows) {
    row.forEach((cell, i) => {
      const x = margin + 8 + i * colW;
      page.drawText(cell[0]!.toUpperCase(), {
        x,
        y: rowY,
        size: 6.5,
        font: fontBold,
        color: rgb(0.45, 0.45, 0.45),
      });
      drawClampedText(page, cell[1]!, {
        x,
        y: rowY - 11,
        size: 8.5,
        font: i === 0 && rows.indexOf(row) === 0 ? fontBold : font,
        color: rgb(0.1, 0.1, 0.1),
        maxWidth: colW - 6,
      });
      ctx.extracted.push(`${cell[0]}: ${cell[1]}`);
    });
    rowY -= 24;
  }
  ctx.y = empBottom - 10;

  // ---- Tables ----
  const drawTableHeader = (title: string) => {
    drawText(ctx, title, { size: 9, bold: true });
    drawHLine(ctx, 0.7);
    const cols = ['Particulars', 'This Month', 'YTD (FY)'];
    const x0 = margin;
    const x1 = A4_WIDTH - margin - 150;
    const x2 = A4_WIDTH - margin - 70;
    page.drawText(cols[0]!, {
      x: x0,
      y: ctx.y,
      size: 7,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(cols[1]!, {
      x: x1,
      y: ctx.y,
      size: 7,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(cols[2]!, {
      x: x2,
      y: ctx.y,
      size: 7,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4),
    });
    ctx.y -= 12;
  };

  const drawRow = (
    label: string,
    monthAmt: number,
    ytdAmt: number,
    opts?: { bold?: boolean; note?: string },
  ) => {
    const size = opts?.bold ? 8.5 : 8;
    const f = opts?.bold ? fontBold : font;
    page.drawText(label, { x: margin, y: ctx.y, size, font: f });
    const mStr = amountOnly(monthAmt);
    const yStr = amountOnly(ytdAmt);
    page.drawText(mStr, {
      x: A4_WIDTH - margin - 150,
      y: ctx.y,
      size,
      font: f,
    });
    page.drawText(yStr, {
      x: A4_WIDTH - margin - 70,
      y: ctx.y,
      size,
      font: f,
    });
    ctx.extracted.push(`${label} ${formatINR(monthAmt)} ${formatINR(ytdAmt)}`);
    ctx.y -= size + 3;
    if (opts?.note) {
      drawClampedText(page, opts.note, {
        x: margin + 4,
        y: ctx.y,
        size: 6.5,
        font,
        color: rgb(0.45, 0.45, 0.45),
        maxWidth: 300,
      });
      ctx.extracted.push(opts.note);
      ctx.y -= 9;
    }
    ctx.y -= 2;
  };

  drawTableHeader('EARNINGS');
  drawRow('Basic', inputs.baseSalary, ytd.basic);
  drawRow('Fixed Allowance', inputs.fixedAllowance, ytd.fixedAllowance);
  drawRow('Incentive / Variable', variablePaid, ytd.variablePaid);
  drawRow('Gross Earnings', grossThisMonth, ytd.grossEarnings, { bold: true });
  ctx.y -= 4;

  drawTableHeader('DEDUCTIONS');
  drawRow('Loss of Pay', lop, ytd.lopDeduction, {
    note: `${computed.lopDays.toFixed(1)} LOP day(s) · payable days referenced for rate basis`,
  });
  drawRow('Professional Tax (Kerala)', pt, ytd.professionalTax, {
    note: pt === 0 ? 'Nil for this month — not a PT deduction month' : undefined,
  });
  drawRow('TDS (Income Tax)', tds, ytd.tds, {
    note: tds === 0 ? 'Nil — Sec 87A rebate, new regime' : undefined,
  });
  drawRow('Other', other, ytd.otherDeductions);
  drawRow('Total Deductions', totalDeductions, ytd.totalDeductions, {
    bold: true,
  });
  ctx.y -= 6;

  // ---- Net band ----
  const bandTop = ctx.y + 4;
  const bandH = input.showPaymentBand ? 58 : 42;
  const bandBottom = bandTop - bandH;
  page.drawRectangle({
    x: margin,
    y: bandBottom,
    width: A4_WIDTH - margin * 2,
    height: bandH,
    borderColor: rgb(0.1, 0.45, 0.3),
    borderWidth: 1,
    color: rgb(0.93, 0.97, 0.94),
  });
  page.drawText('NET SALARY', {
    x: margin + 12,
    y: bandTop - 16,
    size: 8,
    font: fontBold,
    color: rgb(0.1, 0.35, 0.25),
  });
  // Use input.netSalary (same value fingerprinted / registered) — not a second source.
  const netStr = money(input.netSalary);
  const netW = fontBold.widthOfTextAtSize(netStr, 16);
  page.drawText(netStr, {
    x: A4_WIDTH - margin - 12 - netW,
    y: bandTop - 18,
    size: 16,
    font: fontBold,
    color: rgb(0.05, 0.25, 0.18),
  });
  ctx.extracted.push(`Net Salary ${netStr}`);
  drawClampedText(page, computed.netPayWords, {
    x: margin + 12,
    y: bandTop - 32,
    size: 8,
    font: fontBold,
    color: rgb(0.15, 0.15, 0.15),
    maxWidth: A4_WIDTH - margin * 2 - 24,
  });
  ctx.extracted.push(computed.netPayWords);

  if (input.showPaymentBand) {
    const statusLabel = input.paymentStatus || 'Scheduled';
    const paid =
      input.confirmedPaidAmount != null
        ? money(input.confirmedPaidAmount)
        : money(0);
    const outstanding =
      input.outstandingAmount != null ? money(input.outstandingAmount) : money(0);
    const bandY = bandTop - 48;
    page.drawText('Payment status', {
      x: margin + 12,
      y: bandY + 8,
      size: 6.5,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(statusLabel, {
      x: margin + 12,
      y: bandY - 2,
      size: 8,
      font: fontBold,
    });
    page.drawText('Confirmed paid', {
      x: margin + 150,
      y: bandY + 8,
      size: 6.5,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(paid, {
      x: margin + 150,
      y: bandY - 2,
      size: 8,
      font: fontBold,
    });
    page.drawText('Outstanding', {
      x: margin + 300,
      y: bandY + 8,
      size: 6.5,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText(outstanding, {
      x: margin + 300,
      y: bandY - 2,
      size: 8,
      font: fontBold,
    });
    ctx.extracted.push(
      `Payment status ${statusLabel}`,
      `Confirmed paid ${paid}`,
      `Outstanding ${outstanding}`,
    );
  }
  ctx.y = bandBottom - 14;

  // ---- Signatory + verification ----
  page.drawText(`For ${entity.name}`, {
    x: margin,
    y: ctx.y,
    size: 8,
    font,
  });
  ctx.extracted.push(`For ${entity.name}`);
  ctx.y -= 6;

  const sigY = ctx.y - 40;
  if (signature) {
    const sigH = 36;
    const sigW = Math.min(140, (signature.width / signature.height) * sigH);
    page.drawImage(signature, {
      x: margin,
      y: sigY,
      width: sigW,
      height: sigH,
    });
  } else {
    page.drawLine({
      start: { x: margin, y: sigY + 8 },
      end: { x: margin + 120, y: sigY + 8 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
  }
  if (seal) {
    const sealSize = 42;
    const sealX = signature ? margin + 100 : margin + 80;
    page.drawImage(seal, {
      x: sealX,
      y: sigY - 6,
      width: sealSize,
      height: sealSize,
      opacity: 0.9,
    });
  }

  page.drawText(entity.signatoryName, {
    x: margin,
    y: sigY - 12,
    size: 9,
    font: fontBold,
  });
  page.drawText(`${entity.signatoryDesignation} / Authorised Signatory`, {
    x: margin,
    y: sigY - 23,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText(`Place: Kochi · Date: ${formatDate(issueIso)}`, {
    x: margin,
    y: sigY - 34,
    size: 7.5,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  ctx.extracted.push(entity.signatoryName, entity.signatoryDesignation);

  // Verification block (right)
  const verX = A4_WIDTH - margin - 160;
  page.drawText('Verification ID', {
    x: verX,
    y: ctx.y,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  drawClampedText(page, input.verificationId ?? '—', {
    x: verX,
    y: ctx.y - 11,
    size: 8,
    font: fontBold,
    maxWidth: 150,
  });
  ctx.extracted.push(`Verification ID: ${input.verificationId ?? '—'}`);
  if (input.verificationUrl) {
    drawClampedText(page, input.verificationUrl, {
      x: verX,
      y: ctx.y - 22,
      size: 6,
      font,
      color: rgb(0.4, 0.4, 0.4),
      maxWidth: 150,
    });
    ctx.extracted.push(input.verificationUrl);
  }

  // Footer
  ctx.y = 48;
  drawHLine(ctx, 0.5);
  drawText(ctx, 'Authorised and issued by the employer.', { size: 7 });
  drawText(
    ctx,
    `This computer-generated authorised salary slip may be verified through the QR code and verification ID${
      input.verificationUrl ? ` at ${input.verificationUrl}` : ''
    }.`,
    { size: 7, color: rgb(0.4, 0.4, 0.4) },
  );
  drawText(
    ctx,
    `For employer verification contact ${entity.payrollEmail} / ${entity.phone}. Do not treat a pasted signature image as a cryptographic digital signature.`,
    { size: 7, color: rgb(0.4, 0.4, 0.4) },
  );

  return ctx.extracted.filter(Boolean).join('\n');
}

async function buildSummaryPage(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  input: VectorPayslipPdfInput,
): Promise<string> {
  const margin = 48;
  let y = 800;
  const extracted: string[] = [];
  const line = (text: string, size = 10, bold = false) => {
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: bold ? fontBold : font,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= size + 6;
    extracted.push(text);
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
  line(`Net salary: ${money(input.netSalary)}`, 10, true);
  line(`Payment status: ${input.paymentStatus}`, 10);
  if (input.lopDivisorLabel) line(input.lopDivisorLabel, 9);
  if (input.confirmedPaidAmount != null) {
    line(`Confirmed amount paid: ${money(input.confirmedPaidAmount)}`, 10);
  }
  if (input.outstandingAmount != null) {
    line(`Outstanding balance: ${money(input.outstandingAmount)}`, 10);
  }
  if (input.actualCreditDate) {
    line(`Actual salary-credit date: ${formatDate(input.actualCreditDate)}`, 10);
  } else if (input.scheduledCreditDate || input.expectedPaymentDate) {
    line(
      `Scheduled credit: ${formatDate(
        (input.scheduledCreditDate ?? input.expectedPaymentDate)!,
      )}`,
      10,
    );
  }
  if (input.issueDate) line(`Issue date: ${formatDate(input.issueDate)}`, 10);

  y -= 8;
  line(
    'Confidential internal payroll record. This document is intended for the named employee and authorised company personnel only.',
    8,
  );
  return extracted.join('\n');
}

/**
 * ONE canonical vector PDF builder.
 * For AUTHORISED_SALARY_SLIP with snapshot+entity+ytd → full bank-grade layout.
 * Future authorised layout changes belong HERE only.
 */
export async function buildVectorPayslipPdf(
  input: VectorPayslipPdfInput,
): Promise<{ bytes: Uint8Array; sizeBytes: number; extractedText: string }> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(
    input.documentType === 'AUTHORISED_SALARY_SLIP'
      ? 'AUTHORISED SALARY SLIP'
      : 'INTERNAL PAY SLIP',
  );
  pdf.setAuthor(input.legalCompanyName);
  pdf.setSubject(`${input.salaryMonth} · ${input.employeeName}`);
  pdf.setCreator('Portfolix SlipGen');
  pdf.setProducer('Portfolix SlipGen pdf-lib');

  const metaDate = input.issueDate
    ? new Date(input.issueDate)
    : input.payrollFinalisedDate
      ? new Date(input.payrollFinalisedDate)
      : new Date('2020-01-01T00:00:00.000Z');
  pdf.setCreationDate(metaDate);
  pdf.setModificationDate(metaDate);

  const idSeed = [
    input.documentNumber,
    input.verificationId ?? '',
    input.salaryMonth,
    String(input.netSalary),
    input.revisionNumber ?? 1,
  ].join('|');
  const idArray = PDFArray.withContext(pdf.context);
  idArray.push(deterministicPdfId(idSeed));
  idArray.push(deterministicPdfId(idSeed));
  pdf.context.trailerInfo.ID = idArray;

  const page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
  const [regularBytes, boldBytes] = await Promise.all([
    loadPdfFontRegular(),
    loadPdfFontBold(),
  ]);
  const font = await pdf.embedFont(regularBytes, { subset: true });
  const fontBold = await pdf.embedFont(boldBytes, { subset: true });

  let extractedText: string;
  const canFullAuthorised =
    input.documentType === 'AUTHORISED_SALARY_SLIP' &&
    input.snapshot &&
    input.entity &&
    input.ytd;

  if (canFullAuthorised) {
    extractedText = await buildAuthorisedFullPage(pdf, page, font, fontBold, input);
  } else {
    extractedText = await buildSummaryPage(page, font, fontBold, input);
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  if (bytes.byteLength > MAX_VECTOR_BYTES) {
    throw new Error(`PDF exceeds 1 MB size target (${bytes.byteLength} bytes).`);
  }

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
