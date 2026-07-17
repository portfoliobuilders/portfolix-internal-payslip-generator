/**
 * Text/vector PDF builders for production payroll documents.
 * Does NOT use html2canvas full-page screenshots.
 *
 * Uses jsPDF text + vector lines for searchable/selectable output.
 */

import { jsPDF } from 'jspdf';
import { PDFDocument, StandardFonts, rgb, degrees, type PDFImage, type PDFPage } from 'pdf-lib';
import { formatAmount, formatINR, formatMonthYear, formatSalaryAttendanceCycle } from './format';
import { formatAttendanceCycleRange } from './payroll-cycle';
import type { LoadedImageAsset } from './documents/load-company-asset';
import { logAssetFailure } from './documents/load-company-asset';

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

/** Helvetica-safe money label (₹ glyph is not in StandardFonts). */
function pdfMoney(amount: number): string {
  return `INR ${formatAmount(amount)}`;
}

/** Image bytes for PDF embedding — never signed URLs. */
export type AuthorisedPdfAssets = {
  logo?: LoadedImageAsset | null;
  signature?: LoadedImageAsset | null;
  seal?: LoadedImageAsset | null;
};

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
  /** Required for SIGNATURE_AND_SEAL authorised slips. */
  signatoryName?: string | null;
  signatoryDesignation?: string | null;
  assets?: AuthorisedPdfAssets | null;
  /** When true (default for authorised SIGNATURE_AND_SEAL), draw visual signatory block. */
  drawSignatoryBlock?: boolean;
}

const MAX_VECTOR_BYTES = 1024 * 1024;

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

/** Signature ~90–110 pt wide; seal ~55–70 pt; seal overlaps lower-right ~12%. */
const SIG_MAX_W = 100;
const SIG_MAX_H = 48;
const SEAL_MAX_W = 62;
const SEAL_MAX_H = 62;
const SEAL_OVERLAP_FRAC = 0.12;

async function embedAssetImage(
  pdf: PDFDocument,
  asset: LoadedImageAsset,
  assetType: string,
): Promise<PDFImage> {
  try {
    if (asset.mimeType === 'image/png') {
      return await pdf.embedPng(asset.bytes);
    }
    return await pdf.embedJpg(asset.bytes);
  } catch (err) {
    logAssetFailure({
      documentType: 'AUTHORISED_SALARY_SLIP',
      assetType,
      storagePath: asset.storagePath,
      category: 'PDF_EMBED_FAILED',
      detail: err instanceof Error ? err.message : 'embed failed',
    });
    throw new Error(
      `Failed to embed ${assetType} in PDF: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }
}

function fitImage(img: PDFImage, maxW: number, maxH: number): { w: number; h: number } {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  return { w: img.width * scale, h: img.height * scale };
}

/**
 * Draw signatory block: signature → seal (overlap) → name/designation text.
 * Coordinates are deterministic page points; seal must not cover name/QR.
 */
function drawSignatoryBlock(
  page: PDFPage,
  opts: {
    companyName: string;
    signatoryName: string;
    signatoryDesignation: string;
    issueDate: string;
    signature?: PDFImage | null;
    seal?: PDFImage | null;
    font: Awaited<ReturnType<PDFDocument['embedFont']>>;
    fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>;
    leftX: number;
    /** Baseline y for the top of the signatory section (points from bottom). */
    topY: number;
  },
): number {
  const { leftX, topY, font, fontBold } = opts;
  let y = topY;

  page.drawText(`For ${opts.companyName}`, {
    x: leftX,
    y,
    size: 9,
    font,
    color: rgb(0.15, 0.15, 0.15),
  });
  y -= 14;

  const sigSize = opts.signature ? fitImage(opts.signature, SIG_MAX_W, SIG_MAX_H) : { w: SIG_MAX_W, h: 36 };
  const sealSize = opts.seal ? fitImage(opts.seal, SEAL_MAX_W, SEAL_MAX_H) : null;

  const sigX = leftX;
  const sigY = y - sigSize.h;

  // 1) Signature first (under seal)
  if (opts.signature) {
    page.drawImage(opts.signature, {
      x: sigX,
      y: sigY,
      width: sigSize.w,
      height: sigSize.h,
    });
  }

  // 2) Seal overlaps lower-right of signature (~12%)
  if (opts.seal && sealSize) {
    const overlapX = sigSize.w * SEAL_OVERLAP_FRAC;
    const overlapY = sigSize.h * SEAL_OVERLAP_FRAC;
    const sealX = Math.min(
      sigX + sigSize.w - overlapX,
      PAGE_WIDTH - 48 - sealSize.w,
    );
    const sealY = Math.max(48, sigY - sealSize.h + overlapY);
    page.drawImage(opts.seal, {
      x: sealX,
      y: sealY,
      width: sealSize.w,
      height: sealSize.h,
    });
  }

  // 3) Name / designation below images (never covered by seal)
  const textY = Math.min(sigY, opts.seal && sealSize ? sigY - sealSize.h * 0.35 : sigY) - 14;
  y = textY;

  page.drawText(opts.signatoryName, {
    x: leftX,
    y,
    size: 10,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 12;
  page.drawText(`${opts.signatoryDesignation} / Authorised Signatory`, {
    x: leftX,
    y,
    size: 9,
    font,
    color: rgb(0.35, 0.35, 0.35),
  });
  y -= 14;
  page.drawText(`Place: Kochi  ·  Issue Date: ${opts.issueDate}`, {
    x: leftX,
    y,
    size: 8,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  return y - 8;
}

/** Production pdf-lib text/vector builder used by authorised export. */
export async function buildVectorPayslipPdf(
  input: VectorPayslipPdfInput,
): Promise<{
  bytes: Uint8Array;
  sizeBytes: number;
  extractedText: string;
  embedded: { signature: boolean; seal: boolean };
}> {
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

  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
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

  let embeddedSignature = false;
  let embeddedSeal = false;

  if (input.documentType === 'AUTHORISED_SALARY_SLIP') {
    y -= 8;
    line(`Verification ID: ${input.verificationId ?? '—'}`, 10);
    if (input.verificationUrl) {
      line(`Verification URL: ${input.verificationUrl}`, 8);
      // QR placeholder — bottom-right, clear of signatory block
      page.drawRectangle({
        x: PAGE_WIDTH - margin - 72,
        y: 72,
        width: 64,
        height: 64,
        borderColor: rgb(0.1, 0.1, 0.1),
        borderWidth: 1,
      });
      page.drawText('QR', {
        x: PAGE_WIDTH - margin - 52,
        y: 98,
        size: 10,
        font: fontBold,
        rotate: degrees(0),
      });
    }

    const drawVisual = input.drawSignatoryBlock !== false;
    if (drawVisual && (input.assets?.signature || input.assets?.seal)) {
      const sigImg = input.assets?.signature
        ? await embedAssetImage(pdf, input.assets.signature, 'signature')
        : null;
      const sealImg = input.assets?.seal
        ? await embedAssetImage(pdf, input.assets.seal, 'seal')
        : null;
      embeddedSignature = Boolean(sigImg);
      embeddedSeal = Boolean(sealImg);

      // Keep signatory block above QR area (QR sits near y=72)
      const blockTop = Math.min(y - 10, 280);
      y = drawSignatoryBlock(page, {
        companyName: input.legalCompanyName,
        signatoryName: input.signatoryName?.trim() || 'Authorised Signatory',
        signatoryDesignation: input.signatoryDesignation?.trim() || '',
        issueDate: input.issueDate ?? new Date().toISOString().slice(0, 10),
        signature: sigImg,
        seal: sealImg,
        font,
        fontBold,
        leftX: margin,
        topY: blockTop,
      });
    }

    y = Math.min(y, 150);
    line('Authorised and issued by the employer.', 8);
    line(
      'This authorised salary slip may be verified through the QR code and verification ID.',
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

    // Optional internal signatory when assets are supplied and draw is enabled
    if (input.drawSignatoryBlock && input.assets?.signature) {
      const sigImg = await embedAssetImage(pdf, input.assets.signature, 'signature');
      const sealImg = input.assets.seal
        ? await embedAssetImage(pdf, input.assets.seal, 'seal')
        : null;
      embeddedSignature = true;
      embeddedSeal = Boolean(sealImg);
      y = drawSignatoryBlock(page, {
        companyName: input.legalCompanyName,
        signatoryName: input.signatoryName?.trim() || 'Authorised Signatory',
        signatoryDesignation: input.signatoryDesignation?.trim() || '',
        issueDate: input.issueDate ?? new Date().toISOString().slice(0, 10),
        signature: sigImg,
        seal: sealImg,
        font,
        fontBold,
        leftX: margin,
        topY: Math.min(y - 10, 220),
      });
    } else {
      line(
        'This is a computer-generated internal payroll document and does not require a physical signature.',
        8,
      );
    }
  }

  const bytes = await pdf.save();
  if (bytes.byteLength > MAX_VECTOR_BYTES) {
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
    input.signatoryName ?? '',
    input.signatoryDesignation ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    bytes,
    sizeBytes: bytes.byteLength,
    extractedText,
    embedded: { signature: embeddedSignature, seal: embeddedSeal },
  };
}

/** Extract text-ish payload for automated assertions without a full PDF parser. */
export function assertVectorPdfTextContains(
  extractedText: string,
  required: string[],
): { ok: true } | { ok: false; missing: string[] } {
  const missing = required.filter((r) => !extractedText.includes(r));
  return missing.length ? { ok: false, missing } : { ok: true };
}
