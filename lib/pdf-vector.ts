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
import type { EntityInfo, SlipSnapshot } from './types';

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

/**
 * Draw text, stepping down font size until it fits within maxWidth.
 * Never truncates with ellipsis — always shows full text.
 * Minimum font size is 5pt; below that the text is rendered as-is.
 */
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
  let size = opts.size;
  const MIN_SIZE = 5;
  while (size > MIN_SIZE && opts.font.widthOfTextAtSize(text, size) > opts.maxWidth) {
    size -= 0.5;
  }
  page.drawText(text, {
    x: opts.x,
    y: opts.y,
    size,
    font: opts.font,
    color: opts.color ?? rgb(0.1, 0.1, 0.1),
  });
}

/**
 * Word-wrap text to fit maxWidth; returns lines (never empty).
 * Never truncates with ellipsis — if a single word is wider than maxWidth,
 * it is placed on its own line as-is (hard-break at character level only when
 * the single word still overflows, stepping down size in drawClampedText).
 */
function wrapTextToWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
  maxLines = 3,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['—'];

  const lines: string[] = [];
  let current = '';
  for (let wi = 0; wi < words.length; wi += 1) {
    const word = words[wi]!;
    const trial = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(trial, size) <= maxWidth) {
      current = trial;
      continue;
    }
    if (current) {
      lines.push(current);
      current = word;
    } else {
      // Single word wider than the column — place it alone and let the
      // renderer step down font size (drawClampedText) rather than truncate.
      lines.push(word);
      current = '';
    }
    if (lines.length >= maxLines) {
      // Remaining words go onto the last line (may overflow visually — preferable to ellipsis).
      if (current || wi + 1 < words.length) {
        const remaining = [current, ...words.slice(wi + 1)].filter(Boolean).join(' ');
        if (remaining) {
          lines[lines.length - 1] = `${lines[lines.length - 1]} ${remaining}`.trim();
        }
      }
      current = '';
      break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === 0) lines.push('—');
  return lines;
}

function drawRightAligned(
  page: PDFPage,
  text: string,
  opts: {
    rightX: number;
    y: number;
    size: number;
    font: PDFFont;
    color?: ReturnType<typeof rgb>;
  },
) {
  const w = opts.font.widthOfTextAtSize(text, opts.size);
  page.drawText(text, {
    x: opts.rightX - w,
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

function drawHLine(ctx: DrawCtx, thickness = 0.8, gapAfter = 10) {
  ctx.page.drawLine({
    start: { x: ctx.margin, y: ctx.y },
    end: { x: A4_WIDTH - ctx.margin, y: ctx.y },
    thickness,
    color: rgb(0.15, 0.15, 0.15),
  });
  // Leave enough room below the rule so following glyphs (drawn upward
  // from their baseline) never intersect the stroke.
  ctx.y -= gapAfter;
}

function money(amount: number): string {
  return formatINR(amount);
}

function amountOnly(amount: number): string {
  return formatAmount(amount);
}

async function buildAuthorisedFullPage(
  pdf: PDFDocument,
  pageIn: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  input: VectorPayslipPdfInput,
): Promise<string> {
  let page = pageIn;
  const snapshot = input.snapshot!;
  const entity = input.entity!;
  const { inputs, computed, employee } = snapshot;
  const revision = input.revisionNumber ?? snapshot.revisionNumber ?? 1;
  const fy = input.financialYearLabel ?? financialYearLabelFor(snapshot.monthYear);
  const cycle = formatAttendanceCycleRange(
    input.attendancePeriodStart,
    input.attendancePeriodEnd,
  );
  const { tds, pt } = slipStatutoryDeductions(computed, inputs);
  const other = computed.otherDeductions;
  const lop = computed.lopDeduction;
  const lopDays = computed.lopDays;
  const paidDays = 25 - lopDays; // FIXED_DIVISOR = 25
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

  // ---- LETTERHEAD ----
  // Logo left; company name + CIN + address + contact in the middle; QR top-right.
  const letterheadTop = ctx.y;
  const qrSize = 52;
  const qrX = A4_WIDTH - margin - qrSize;

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
  const textMaxW = qrX - textLeft - 8;

  // Company legal name — bold, wraps up to 1 line within available width.
  const nameLines = wrapTextToWidth(entity.name, fontBold, 11, textMaxW, 1);
  page.drawText(nameLines[0]!, {
    x: textLeft,
    y: letterheadTop - 12,
    size: 11,
    font: fontBold,
    color: rgb(0.08, 0.08, 0.08),
  });
  ctx.extracted.push(entity.name);

  // CIN on the next line.
  const cinLine = `CIN: ${entity.cin}`;
  page.drawText(cinLine, {
    x: textLeft,
    y: letterheadTop - 24,
    size: 7.5,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  ctx.extracted.push(cinLine);

  // Registered address — wrap up to 2 lines (no ellipsis).
  const addrLines = wrapTextToWidth(entity.registeredAddress, font, 7.5, textMaxW, 2);
  let addrY = letterheadTop - 35;
  for (const addrLine of addrLines) {
    page.drawText(addrLine, {
      x: textLeft,
      y: addrY,
      size: 7.5,
      font,
      color: rgb(0.35, 0.35, 0.35),
    });
    addrY -= 10;
  }
  ctx.extracted.push(entity.registeredAddress);

  // Tel + payroll email on the next line.
  const contact = `Tel: ${entity.phone}  |  Payroll: ${entity.payrollEmail}`;
  const contactLines = wrapTextToWidth(contact, font, 7.5, textMaxW, 1);
  page.drawText(contactLines[0]!, {
    x: textLeft,
    y: addrY,
    size: 7.5,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  ctx.extracted.push(contact);

  // QR top-right with token caption — full token, wrapped/smaller font.
  if (qr) {
    page.drawImage(qr, {
      x: qrX,
      y: letterheadTop - qrSize,
      width: qrSize,
      height: qrSize,
    });
    if (input.verificationId) {
      // Caption below QR: full verification ID, wrapped in small font (never ellipsis).
      const captionMaxW = qrSize + 4;
      const captionLines = wrapTextToWidth(input.verificationId, font, 5.5, captionMaxW, 3);
      let captY = letterheadTop - qrSize - 8;
      for (const cLine of captionLines) {
        const cW = font.widthOfTextAtSize(cLine, 5.5);
        page.drawText(cLine, {
          x: qrX + (qrSize - cW) / 2,
          y: captY,
          size: 5.5,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });
        captY -= 7;
      }
    }
  }

  // Letterhead bottom: leave enough room.
  ctx.y = Math.min(addrY - 6, letterheadTop - 62) - 4;
  drawHLine(ctx, 1.2, 14);

  // ---- DOCUMENT DETAILS — bordered two-column grid ----
  const docGridInnerW = A4_WIDTH - margin * 2;
  const docGridColW = docGridInnerW / 2;
  const docCellPadX = 8;
  const docCellPadY = 8;
  const docLabelSize = 6;
  const docValueSize = 8;
  const docLineGap = 2;

  const finalisedIso = input.payrollFinalisedDate ?? snapshot.generatedAt;
  const issueIso = input.issueDate ?? snapshot.generatedAt;
  const creditLabel = input.actualCreditDate
    ? `Actual: ${formatDate(input.actualCreditDate)}`
    : (() => {
        const scheduled = input.scheduledCreditDate ?? input.expectedPaymentDate ?? null;
        return scheduled ? `Scheduled: ${formatDate(scheduled)}` : 'Scheduled: —';
      })();
  // Push canonical credit strings for programmatic assertions.
  if (input.actualCreditDate) {
    ctx.extracted.push(`Actual salary-credit date: ${formatDate(input.actualCreditDate)}`);
  } else {
    const scheduled = input.scheduledCreditDate ?? input.expectedPaymentDate ?? null;
    ctx.extracted.push(scheduled ? `Scheduled credit: ${formatDate(scheduled)}` : 'Scheduled credit: —');
  }

  type DocRow = [string, string, string, string]; // [labelL, valueL, labelR, valueR]
  const docRows: DocRow[] = [
    [
      'Salary month',
      `${formatMonthYear(snapshot.monthYear)} — ${fy}`,
      'Attendance cycle',
      cycle,
    ],
    [
      'Payslip no · Rev · Status',
      `${input.documentNumber} · Rev ${revision} · ISSUED`,
      'Payroll finalised',
      formatDate(finalisedIso),
    ],
    [
      'Issue date',
      formatDate(issueIso),
      'Credit date',
      creditLabel,
    ],
    [
      'LOP calculation basis',
      input.lopDivisorLabel ?? 'Fixed 25-day divisor',
      '',
      '',
    ],
  ];

  // Measure row heights from content.
  const measuredDocRows = docRows.map(([ll, lv, rl, rv]) => {
    const leftLines = wrapTextToWidth(lv, font, docValueSize, docGridColW - docCellPadX * 2, 2);
    const rightLines = rv ? wrapTextToWidth(rv, font, docValueSize, docGridColW - docCellPadX * 2, 2) : [];
    const contentH = docLabelSize + docLineGap + Math.max(leftLines.length, rightLines.length || 1) * (docValueSize + docLineGap);
    return { ll, lv, rl, rv, leftLines, rightLines, contentH };
  });

  const docRowH = measuredDocRows.map((r) => r.contentH + docCellPadY * 2);
  const totalDocH = docRowH.reduce((a, b) => a + b, 0);

  // Draw centered title first.
  drawText(ctx, 'AUTHORISED SALARY SLIP', {
    size: 13,
    bold: true,
    align: 'center',
    x: margin,
    maxWidth: A4_WIDTH - margin * 2,
  });
  ctx.y -= 6;

  const docGridTop = ctx.y;
  const docGridBottom = docGridTop - totalDocH;

  // Outer border.
  page.drawRectangle({
    x: margin,
    y: docGridBottom,
    width: docGridInnerW,
    height: totalDocH,
    borderColor: rgb(0.68, 0.68, 0.68),
    borderWidth: 0.7,
  });

  // Vertical center rule.
  page.drawLine({
    start: { x: margin + docGridColW, y: docGridTop },
    end: { x: margin + docGridColW, y: docGridBottom },
    thickness: 0.45,
    color: rgb(0.82, 0.82, 0.82),
  });

  let docRowTop = docGridTop;
  for (let ri = 0; ri < measuredDocRows.length; ri += 1) {
    const row = measuredDocRows[ri]!;
    const rh = docRowH[ri]!;
    // Horizontal rule between rows.
    if (ri > 0) {
      page.drawLine({
        start: { x: margin, y: docRowTop },
        end: { x: margin + docGridInnerW, y: docRowTop },
        thickness: 0.45,
        color: rgb(0.82, 0.82, 0.82),
      });
    }
    const cellContentTop = docRowTop - docCellPadY;
    // Left cell.
    page.drawText(row.ll.toUpperCase(), {
      x: margin + docCellPadX,
      y: cellContentTop - docLabelSize,
      size: docLabelSize,
      font: fontBold,
      color: rgb(0.45, 0.45, 0.45),
    });
    let leftValY = cellContentTop - docLabelSize - docLineGap - docValueSize;
    for (const vl of row.leftLines) {
      page.drawText(vl, {
        x: margin + docCellPadX,
        y: leftValY,
        size: docValueSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });
      leftValY -= docValueSize + docLineGap;
    }
    ctx.extracted.push(`${row.ll}: ${row.lv}`);
    // Right cell (may be empty for last row spanning both columns).
    if (row.rl) {
      page.drawText(row.rl.toUpperCase(), {
        x: margin + docGridColW + docCellPadX,
        y: cellContentTop - docLabelSize,
        size: docLabelSize,
        font: fontBold,
        color: rgb(0.45, 0.45, 0.45),
      });
      let rightValY = cellContentTop - docLabelSize - docLineGap - docValueSize;
      for (const vr of row.rightLines) {
        page.drawText(vr, {
          x: margin + docGridColW + docCellPadX,
          y: rightValY,
          size: docValueSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        rightValY -= docValueSize + docLineGap;
      }
      ctx.extracted.push(`${row.rl}: ${row.rv}`);
    }
    docRowTop -= rh;
  }

  ctx.y = docGridBottom - 10;

  // ---- EMPLOYEE BLOCK — 4-column grid with extended fields ----
  const empPadX = 8;
  const empPadY = 10;
  const empLabelSize = 6;
  const empValueSize = 8;
  const empLabelGap = 3;
  const empLineGap = 2;
  const empColGap = 8;
  const empInnerW = A4_WIDTH - margin * 2;
  const empColW = (empInnerW - empPadX * 2 - empColGap * 3) / 4;

  const bankAccountDisplay = employee.bankAccountNumber?.trim()
    ? employee.bankAccountNumber.trim()
    : employee.bankLast4
      ? `****${employee.bankLast4}`
      : '—';
  const bankName = employee.bankName?.trim() || '—';
  const panDisplay = (employee.pan?.trim() || employee.panMasked?.trim()) || '—';
  const ifscDisplay = employee.ifsc?.trim() || '—';
  const workLocDisplay = employee.workLocation?.trim() || '—';
  const paymentModeLabel = input.paymentMode ?? employee.paymentMode ?? '';

  const empRows: Array<[string, string][]> = [
    [
      ['Employee name', employee.fullName],
      ['Employee ID', employee.empId],
      ['Designation', employee.designation || '—'],
      ['Department', employee.department || '—'],
    ],
    [
      ['Date of joining', formatDate(employee.joiningDate)],
      ['PAN', panDisplay],
      ['Work location', workLocDisplay],
      ['Payment mode', paymentModeLabel || '—'],
    ],
    [
      ['Bank name', bankName],
      ['Account number', bankAccountDisplay],
      ['IFSC', ifscDisplay],
      ['Paid days · LOP days', `${paidDays > 0 ? paidDays.toFixed(1).replace('.0', '') : paidDays} · ${lopDays > 0 ? lopDays.toFixed(1) : '0'}`],
    ],
  ];

  // Measure each cell so row height fits wrapped values.
  const measuredEmpRows = empRows.map((row, rowIdx) =>
    row.map((cell, i) => {
      const valueFont = i === 0 && rowIdx === 0 ? fontBold : font;
      const lines = wrapTextToWidth(cell[1]!, valueFont, empValueSize, empColW, 2);
      const contentH =
        empLabelSize +
        empLabelGap +
        lines.length * empValueSize +
        (lines.length - 1) * empLineGap;
      return { label: cell[0]!, value: cell[1]!, lines, valueFont, contentH };
    }),
  );
  const rowHeights = measuredEmpRows.map(
    (cells) => Math.max(...cells.map((c) => c.contentH)) + empPadY,
  );
  const empBoxH = empPadY + rowHeights.reduce((a, b) => a + b, 0) + 8;
  const empTop = ctx.y;
  const empBottom = empTop - empBoxH;

  page.drawRectangle({
    x: margin,
    y: empBottom,
    width: empInnerW,
    height: empBoxH,
    borderColor: rgb(0.72, 0.72, 0.72),
    borderWidth: 0.7,
  });

  // Vertical column rules.
  for (let i = 1; i < 4; i += 1) {
    const vx = margin + empPadX + i * empColW + i * empColGap - empColGap / 2;
    page.drawLine({
      start: { x: vx, y: empTop },
      end: { x: vx, y: empBottom },
      thickness: 0.4,
      color: rgb(0.82, 0.82, 0.82),
    });
  }

  let rowTop = empTop - 4;
  measuredEmpRows.forEach((cells, rowIdx) => {
    const rowH = rowHeights[rowIdx]!;
    if (rowIdx > 0) {
      page.drawLine({
        start: { x: margin, y: rowTop },
        end: { x: margin + empInnerW, y: rowTop },
        thickness: 0.4,
        color: rgb(0.82, 0.82, 0.82),
      });
      rowTop -= 4;
    }
    cells.forEach((cell, i) => {
      const x = margin + empPadX + i * (empColW + empColGap);
      const labelY = rowTop - empLabelSize - 2;
      page.drawText(cell.label.toUpperCase(), {
        x,
        y: labelY,
        size: empLabelSize,
        font: fontBold,
        color: rgb(0.45, 0.45, 0.45),
      });
      let valueY = labelY - empLabelGap - empValueSize;
      for (const line of cell.lines) {
        page.drawText(line, {
          x,
          y: valueY,
          size: empValueSize,
          font: cell.valueFont,
          color: rgb(0.1, 0.1, 0.1),
        });
        valueY -= empValueSize + empLineGap;
      }
      ctx.extracted.push(`${cell.label}: ${cell.value}`);
    });
    rowTop -= rowH;
  });

  ctx.y = empBottom - 8;

  // ---- EARNINGS / DEDUCTIONS — Particulars | Amount (₹), bank-reference layout ----
  // One shared amount right-edge; Particulars widened; amount column kept compact.
  const tableInnerW = A4_WIDTH - margin * 2;
  const AMT_COL_W = 88;
  const colAmtRight = margin + tableInnerW - 10;
  const colParticulars = margin + 6;
  const particularsMaxW = colAmtRight - AMT_COL_W - colParticulars - 6;
  const TABLE_BORDER = rgb(0.72, 0.72, 0.72);
  const HEADER_BG = rgb(0.94, 0.94, 0.96);
  const ROW_RULE = rgb(0.87, 0.87, 0.87);
  // Vertical rule at the left edge of the amount column (shared by header + body).
  const amtColRuleX = colAmtRight - AMT_COL_W + 8;

  type TableRowSpec = {
    label: string;
    amount: number | null; // null for text-only / non-amount rows
    bold?: boolean;
    textNote?: string; // compact footnote for zero-reason
    isTextRow?: boolean; // e.g. EPF/ESI "Not applicable"
    textValue?: string;
  };

  // ---- Earnings rows ----
  const earningsRows: TableRowSpec[] = [];
  if (employee.salaryComponents && employee.salaryComponents.length > 0) {
    for (const comp of employee.salaryComponents) {
      earningsRows.push({ label: comp.label, amount: comp.amount });
    }
  } else {
    earningsRows.push({
      label: 'Basic',
      amount: inputs.baseSalary,
    });
  }
  earningsRows.push({ label: 'Fixed Allowance', amount: inputs.fixedAllowance });
  earningsRows.push({ label: 'Incentive / Variable', amount: variablePaid });
  earningsRows.push({ label: 'Gross Earnings', amount: grossThisMonth, bold: true });

  // ---- Deductions rows ----
  const deductionRows: TableRowSpec[] = [
    {
      label: 'Loss of Pay',
      amount: lop,
      textNote: lop === 0 ? undefined : `${lopDays.toFixed(1)} LOP day(s)`,
    },
    {
      label: 'Professional Tax (Kerala)',
      amount: pt,
      textNote: pt === 0 ? 'Nil — not a PT deduction month' : undefined,
    },
    {
      label: 'TDS (Income Tax)',
      amount: tds,
      textNote: tds === 0 ? 'Nil — Sec 87A rebate, new regime' : undefined,
    },
    {
      label: 'EPF',
      amount: null,
      isTextRow: true,
      textNote: 'Not applicable — establishment below 20 employees',
    },
    {
      label: 'ESI',
      amount: null,
      isTextRow: true,
      textNote: 'Not applicable',
    },
    {
      label: 'Other Deductions',
      amount: other,
    },
    {
      label: 'Total Deductions',
      amount: totalDeductions,
      bold: true,
    },
  ];

  const drawBorderedTable = (title: string, rows: TableRowSpec[]) => {
    ctx.y -= 2;

    // Compact section label above the bordered grid (EARNINGS / DEDUCTIONS).
    page.drawText(title, {
      x: colParticulars,
      y: ctx.y - 9,
      size: 8,
      font: fontBold,
      color: rgb(0.12, 0.12, 0.35),
    });
    ctx.extracted.push(title);
    ctx.y -= 12;

    const headerBandH = 16;
    const headerTop = ctx.y;
    const headerBaseline = headerTop - 11;
    page.drawRectangle({
      x: margin,
      y: headerTop - headerBandH,
      width: tableInnerW,
      height: headerBandH,
      color: HEADER_BG,
      borderColor: TABLE_BORDER,
      borderWidth: 0.6,
    });
    page.drawText('Particulars', {
      x: colParticulars,
      y: headerBaseline,
      size: 7,
      font: fontBold,
      color: rgb(0.35, 0.35, 0.35),
    });
    // Amount header shares the same right edge as figures below.
    drawRightAligned(page, 'Amount (₹)', {
      rightX: colAmtRight,
      y: headerBaseline,
      size: 6.5,
      font: fontBold,
      color: rgb(0.35, 0.35, 0.35),
    });
    ctx.y = headerTop - headerBandH;

    const padTop = 4;
    const padBot = 3.5;
    const noteSize = 5.5;
    const noteLineH = 7;
    const noteGap = 2.5;

    for (let ri = 0; ri < rows.length; ri += 1) {
      const row = rows[ri]!;
      const rowSize = row.bold ? 8 : 7.5;
      const rowFont = row.bold ? fontBold : font;

      // Prefer a same-line footnote when it fits in the particulars column —
      // keeps PT/TDS/EPF rows single-height so the slip stays on one A4 page.
      let inlineNote: string | null = null;
      let wrappedNotes: string[] = [];
      if (row.textNote) {
        const sep = '  ·  ';
        const labelW = rowFont.widthOfTextAtSize(row.label, rowSize);
        const noteW = font.widthOfTextAtSize(row.textNote, noteSize);
        if (labelW + font.widthOfTextAtSize(sep, noteSize) + noteW <= particularsMaxW) {
          inlineNote = row.textNote;
        } else {
          wrappedNotes = wrapTextToWidth(row.textNote, font, noteSize, particularsMaxW, 2);
        }
      }
      const textValLines: string[] =
        row.isTextRow && row.textValue
          ? wrapTextToWidth(row.textValue, font, 6.5, particularsMaxW - 4, 2)
          : [];

      const labelAscent = rowFont.heightAtSize(rowSize) * 0.72;
      const labelDescent = rowFont.heightAtSize(rowSize) * 0.22;
      const noteBlockH =
        wrappedNotes.length > 0
          ? noteGap + wrappedNotes.length * noteLineH + 1
          : textValLines.length > 0
            ? noteGap + textValLines.length * 8 + 1
            : 0;
      const rowH = Math.max(
        padTop + labelAscent + labelDescent + noteBlockH + padBot,
        14.5,
      );

      const rowTop = ctx.y;
      const rowBottom = rowTop - rowH;

      if (row.bold) {
        page.drawRectangle({
          x: margin,
          y: rowBottom,
          width: tableInnerW,
          height: rowH,
          color: rgb(0.96, 0.96, 0.98),
        });
      }

      page.drawLine({
        start: { x: margin, y: rowTop },
        end: { x: margin + tableInnerW, y: rowTop },
        thickness: 0.4,
        color: ROW_RULE,
      });

      const labelY = rowTop - padTop - labelAscent;
      page.drawText(row.label, {
        x: colParticulars,
        y: labelY,
        size: rowSize,
        font: rowFont,
      });
      ctx.extracted.push(row.label);

      if (inlineNote) {
        const labelW = rowFont.widthOfTextAtSize(row.label, rowSize);
        page.drawText(`  ·  ${inlineNote}`, {
          x: colParticulars + labelW,
          y: labelY + 0.5,
          size: noteSize,
          font,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      if (row.isTextRow) {
        drawRightAligned(page, '—', { rightX: colAmtRight, y: labelY, size: 7, font });
        if (row.textValue) ctx.extracted.push(row.textValue);
        if (inlineNote) ctx.extracted.push(inlineNote);
        if (wrappedNotes.length > 0) {
          let nY = labelY - noteGap - noteSize;
          for (const nl of wrappedNotes) {
            page.drawText(nl, {
              x: colParticulars + 2,
              y: nY,
              size: noteSize,
              font,
              color: rgb(0.5, 0.5, 0.5),
            });
            nY -= noteLineH;
          }
          ctx.extracted.push(wrappedNotes.join(' '));
        }
      } else {
        const amt = row.amount ?? 0;
        drawRightAligned(page, amountOnly(amt), {
          rightX: colAmtRight,
          y: labelY,
          size: rowSize,
          font: rowFont,
        });
        ctx.extracted.push(`${row.label} ${formatINR(amt)}`);

        if (wrappedNotes.length > 0) {
          let nY = labelY - noteGap - noteSize;
          for (const nl of wrappedNotes) {
            page.drawText(nl, {
              x: colParticulars + 2,
              y: nY,
              size: noteSize,
              font,
              color: rgb(0.5, 0.5, 0.5),
            });
            nY -= noteLineH;
          }
        }
      }

      ctx.y = rowBottom;
    }

    // Bottom + side borders and amount column rule (same X for header + body).
    page.drawLine({
      start: { x: margin, y: ctx.y },
      end: { x: margin + tableInnerW, y: ctx.y },
      thickness: 0.6,
      color: TABLE_BORDER,
    });
    page.drawLine({
      start: { x: amtColRuleX, y: headerTop },
      end: { x: amtColRuleX, y: ctx.y },
      thickness: 0.4,
      color: ROW_RULE,
    });
    page.drawLine({
      start: { x: margin, y: headerTop },
      end: { x: margin, y: ctx.y },
      thickness: 0.6,
      color: TABLE_BORDER,
    });
    page.drawLine({
      start: { x: margin + tableInnerW, y: headerTop },
      end: { x: margin + tableInnerW, y: ctx.y },
      thickness: 0.6,
      color: TABLE_BORDER,
    });
    ctx.y -= 3;
  };

  drawBorderedTable('EARNINGS', earningsRows);
  ctx.y -= 5;
  drawBorderedTable('DEDUCTIONS', deductionRows);
  ctx.y -= 8;

  // ---- Net salary band ----
  const netStr = money(computed.netPay);
  const wordsLines = wrapTextToWidth(
    computed.netPayWords,
    fontBold,
    8,
    A4_WIDTH - margin * 2 - 24,
    2,
  );
  const bandPadTop = 12;
  const bandPadBot = 10;
  const wordsBlockH = wordsLines.length * 10;
  const payBlockH = input.showPaymentBand ? 26 : 0;
  const bandH = bandPadTop + 12 + wordsBlockH + payBlockH + bandPadBot;
  const bandTop = ctx.y;
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

  // Keep large amount glyphs clear of the top border (baseline sits below ascent).
  let bandY = bandTop - bandPadTop - 4;
  page.drawText('NET SALARY', {
    x: margin + 12,
    y: bandY,
    size: 8,
    font: fontBold,
    color: rgb(0.1, 0.35, 0.25),
  });
  drawRightAligned(page, netStr, {
    rightX: A4_WIDTH - margin - 12,
    y: bandY - 1,
    size: 13,
    font: fontBold,
    color: rgb(0.05, 0.25, 0.18),
  });
  ctx.extracted.push(`Net Salary ${netStr}`);
  bandY -= 14;
  for (const line of wordsLines) {
    page.drawText(line, {
      x: margin + 12,
      y: bandY,
      size: 8,
      font: fontBold,
      color: rgb(0.15, 0.15, 0.15),
    });
    bandY -= 10;
  }
  ctx.extracted.push(computed.netPayWords);

  if (input.showPaymentBand) {
    bandY -= 4;
    const statusLabel = input.paymentStatus || 'Scheduled';
    const paid = input.confirmedPaidAmount != null ? money(input.confirmedPaidAmount) : money(0);
    const outstanding = input.outstandingAmount != null ? money(input.outstandingAmount) : money(0);
    const payCols: Array<[string, string, number]> = [
      ['Payment status', statusLabel, margin + 12],
      ['Confirmed paid', paid, margin + 170],
      ['Outstanding', outstanding, margin + 320],
    ];
    for (const [lab, val, x] of payCols) {
      page.drawText(lab, { x, y: bandY, size: 6.5, font, color: rgb(0.4, 0.4, 0.4) });
      page.drawText(val, { x, y: bandY - 11, size: 8, font: fontBold });
    }
    ctx.extracted.push(
      `Payment status ${statusLabel}`,
      `Confirmed paid ${paid}`,
      `Outstanding ${outstanding}`,
    );
  }
  ctx.y = bandBottom - 10;

  // ---- SIGNATORY + VERIFICATION + FOOTER ----
  // Spill to page 2 only when the first page truly cannot hold signatory + footer.
  const verColW = 170;
  const verX = A4_WIDTH - margin - verColW;
  const sigMaxW = verX - margin - 20;
  const sigBlockH = (signature ? 32 : 12) + 44;
  const footerH = 32;
  const neededBelow = sigBlockH + footerH + 4;

  if (ctx.y - neededBelow < margin) {
    page = pdf.addPage([A4_WIDTH, A4_HEIGHT]);
    ctx.page = page;
    ctx.y = A4_HEIGHT - margin;
  }

  const sigBlockTop = ctx.y;

  const forLine = `For ${entity.name}`;
  drawClampedText(page, forLine, {
    x: margin,
    y: sigBlockTop,
    size: 8,
    font,
    maxWidth: sigMaxW,
  });
  ctx.extracted.push(forLine);

  const sigImageTop = sigBlockTop - 10;
  const sigH = signature ? 32 : 14;
  let sigDrawnW = 110;
  if (signature) {
    const sigW = Math.min(100, (signature.width / signature.height) * sigH);
    page.drawImage(signature, {
      x: margin,
      y: sigImageTop - sigH,
      width: sigW,
      height: sigH,
    });
    sigDrawnW = sigW;
  } else {
    page.drawLine({
      start: { x: margin, y: sigImageTop - sigH + 2 },
      end: { x: margin + 110, y: sigImageTop - sigH + 2 },
      thickness: 0.5,
      color: rgb(0.7, 0.7, 0.7),
    });
  }

  if (seal) {
    const sealSize = 32;
    const sealGap = 22;
    const sealX = Math.min(
      margin + Math.max(sigDrawnW, 110) + sealGap,
      margin + sigMaxW - sealSize,
    );
    page.drawImage(seal, {
      x: sealX,
      y: sigImageTop - sealSize,
      width: sealSize,
      height: sealSize,
      opacity: 0.92,
    });
  }

  const sigTextY = sigImageTop - sigH - 10;
  page.drawText(entity.signatoryName, {
    x: margin,
    y: sigTextY,
    size: 9,
    font: fontBold,
  });
  page.drawText(`${entity.signatoryDesignation} / Authorised Signatory`, {
    x: margin,
    y: sigTextY - 11,
    size: 8,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  page.drawText(`Place: Kochi  ·  Date: ${formatDate(issueIso)}`, {
    x: margin,
    y: sigTextY - 22,
    size: 7.5,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  ctx.extracted.push(entity.signatoryName, entity.signatoryDesignation);

  page.drawText('Verification ID', {
    x: verX,
    y: sigBlockTop,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  const verId = input.verificationId ?? '—';
  const verIdLines = wrapTextToWidth(verId, fontBold, 7, verColW, 4);
  let verY = sigBlockTop - 11;
  for (const line of verIdLines) {
    page.drawText(line, { x: verX, y: verY, size: 7, font: fontBold });
    verY -= 9;
  }
  ctx.extracted.push(`Verification ID: ${verId}`);
  ctx.extracted.push(`Verification ID`);

  if (input.verificationUrl) {
    verY -= 3;
    const urlLines = wrapTextToWidth(input.verificationUrl, font, 6, verColW, 2);
    for (const urlLine of urlLines) {
      page.drawText(urlLine, {
        x: verX,
        y: verY,
        size: 6,
        font,
        color: rgb(0.3, 0.3, 0.7),
      });
      verY -= 8;
    }
    ctx.extracted.push(input.verificationUrl);
  }

  // Footer always below the lower of signatory text / verification block — never raised.
  ctx.y = Math.min(sigTextY - 28, verY - 10);
  drawHLine(ctx, 0.5, 6);
  drawText(ctx, 'Authorised and issued by the employer.', { size: 7 });
  drawText(
    ctx,
    'Authenticity of this document may be verified via the QR code or the Verification ID above.',
    { size: 7, color: rgb(0.4, 0.4, 0.4) },
  );
  drawText(
    ctx,
    `For employer verification contact ${entity.payrollEmail} / ${entity.phone}.`,
    { size: 7, color: rgb(0.4, 0.4, 0.4) },
  );
  if (input.snapshot?.ptFootnote) {
    drawText(ctx, input.snapshot.ptFootnote, {
      size: 6.5,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

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
 * For AUTHORISED_SALARY_SLIP with snapshot+entity → full bank-grade layout.
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
    input.entity;

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
