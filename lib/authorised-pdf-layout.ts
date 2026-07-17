import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import {
  PDFDocument,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from 'pdf-lib';
import { formatAmount, formatDate, formatMonthYear } from './format';
import { formatAttendanceCycleRange } from './payroll-cycle';
import { formatRegisteredAddress, wrapRegisteredAddress } from './company-address';
import { financialYearLabel, AUTHORISED_PAGE } from './authorised-slip-policy';
import { shortVerificationDisplay } from './qr-png';
import type { AuthorisedSlipYtd, SlipSnapshot } from './types';
import type { AuthorisedPdfAssets } from './pdf-vector';

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  currencyRegular: PDFFont;
  currencyBold: PDFFont;
};

export interface BankReadyPdfInput {
  legalCompanyName: string;
  cin: string;
  registeredAddress: string;
  payrollEmail: string;
  verificationPhone: string;
  employeeName: string;
  employeeId: string;
  salaryMonth: string;
  attendancePeriodStart: string;
  attendancePeriodEnd: string;
  payrollFinalisedAt: string;
  issueDate: string;
  netSalary: number;
  documentNumber: string;
  revisionNumber: number;
  actualCreditDate: string;
  confirmedPaidAmount: number;
  outstandingAmount: number;
  paymentMode: string;
  bankName: string;
  bankLast4: string;
  ifsc?: string | null;
  payableDays: number;
  lopDays: number;
  department: string;
  designation: string;
  joiningDate: string;
  panMasked: string;
  verificationId: string;
  verificationUrl: string;
  signatoryName: string;
  signatoryDesignation: string;
  snapshot: SlipSnapshot;
  ytd: AuthorisedSlipYtd;
  assets?: AuthorisedPdfAssets | null;
  qrPng: Uint8Array;
}

const { width: PAGE_W, height: PAGE_H } = AUTHORISED_PAGE;
const M = AUTHORISED_PAGE.marginLeft;
const CONTENT_W = PAGE_W - M - AUTHORISED_PAGE.marginRight;
const INK = rgb(0.08, 0.1, 0.12);
const MUTED = rgb(0.34, 0.38, 0.42);
const LINE = rgb(0.78, 0.8, 0.82);
const SOFT = rgb(0.96, 0.97, 0.975);
const ACCENT = rgb(0.05, 0.34, 0.28);

function money(value: number): string {
  return `₹${formatAmount(value)}`;
}

function drawText(
  page: PDFPage,
  fonts: Fonts,
  text: string,
  x: number,
  y: number,
  opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number; align?: 'left' | 'right' | 'center' } = {},
): void {
  const size = opts.size ?? 9;
  const font = opts.bold ? fonts.bold : fonts.regular;
  const currencyFont = opts.bold ? fonts.currencyBold : fonts.currencyRegular;
  const chunks = text.split(/(₹)/).filter(Boolean);
  const textWidth = chunks.reduce(
    (total, chunk) =>
      total +
      (chunk === '₹' ? currencyFont : font).widthOfTextAtSize(chunk, size),
    0,
  );
  let tx = x;
  if (opts.align === 'right') tx -= textWidth;
  if (opts.align === 'center') tx -= textWidth / 2;
  for (const chunk of chunks) {
    const chunkFont = chunk === '₹' ? currencyFont : font;
    page.drawText(chunk, {
      x: tx,
      y,
      size,
      font: chunkFont,
      color: opts.color ?? INK,
      maxWidth: opts.maxWidth,
      lineHeight: size + 2,
    });
    tx += chunkFont.widthOfTextAtSize(chunk, size);
  }
}

function field(
  page: PDFPage,
  fonts: Fonts,
  label: string,
  value: string,
  x: number,
  topY: number,
  width: number,
  valueSize = 8.5,
): void {
  drawText(page, fonts, label.toUpperCase(), x, topY, {
    size: 6.8,
    bold: true,
    color: MUTED,
  });
  const lines = wrapText(value || '—', fonts.regular, valueSize, width);
  lines.slice(0, 2).forEach((line, index) => {
    drawText(page, fonts, line, x, topY - 12 - index * 10, {
      size: valueSize,
      bold: index === 0,
    });
  });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['—'];
}

function sectionTitle(page: PDFPage, fonts: Fonts, title: string, y: number): number {
  drawText(page, fonts, title, M, y, { size: 8.5, bold: true });
  page.drawLine({
    start: { x: M, y: y - 4 },
    end: { x: PAGE_W - M, y: y - 4 },
    thickness: 0.7,
    color: INK,
  });
  return y - 15;
}

async function loadFonts(pdf: PDFDocument): Promise<Fonts> {
  pdf.registerFontkit(fontkit);
  const fontPath = (filename: string) =>
    join(
      process.cwd(),
      'node_modules',
      '@fontsource',
      'noto-sans-devanagari',
      'files',
      filename,
    );
  const [regularBytes, boldBytes, currencyRegularBytes, currencyBoldBytes] = await Promise.all([
    readFile(fontPath('noto-sans-devanagari-latin-400-normal.woff')),
    readFile(fontPath('noto-sans-devanagari-latin-700-normal.woff')),
    readFile(fontPath('noto-sans-devanagari-devanagari-400-normal.woff')),
    readFile(fontPath('noto-sans-devanagari-devanagari-700-normal.woff')),
  ]);
  const [regular, bold, currencyRegular, currencyBold] = await Promise.all([
    pdf.embedFont(regularBytes, { subset: true }),
    pdf.embedFont(boldBytes, { subset: true }),
    pdf.embedFont(currencyRegularBytes, { subset: true }),
    pdf.embedFont(currencyBoldBytes, { subset: true }),
  ]);
  return { regular, bold, currencyRegular, currencyBold };
}

async function embedAsset(pdf: PDFDocument, asset: NonNullable<AuthorisedPdfAssets[keyof AuthorisedPdfAssets]>): Promise<PDFImage> {
  return asset.mimeType === 'image/png'
    ? pdf.embedPng(asset.bytes)
    : pdf.embedJpg(asset.bytes);
}

function fit(image: PDFImage, maxW: number, maxH: number): { width: number; height: number } {
  const scale = Math.min(maxW / image.width, maxH / image.height);
  return { width: image.width * scale, height: image.height * scale };
}

export async function buildBankReadyAuthorisedPdf(input: BankReadyPdfInput): Promise<{
  bytes: Uint8Array;
  extractedText: string;
  embedded: { signature: boolean; seal: boolean };
  geometry: { headerDividerY: number; titleTopY: number; titleBottomY: number };
}> {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  pdf.setTitle(`Authorised Salary Slip – ${input.employeeName} – ${formatMonthYear(input.salaryMonth)}`);
  pdf.setAuthor(input.legalCompanyName);
  pdf.setSubject('Employee Salary and Payment Verification');
  pdf.setKeywords(['Salary Slip', 'Payroll', 'Financial Year', 'Payslip Number']);
  pdf.setCreator('Portfolix Internal Payslip Generator');
  pdf.setProducer('Portfolix Payroll · pdf-lib');

  const extracted: string[] = [];
  const record = (value: string) => {
    extracted.push(value);
    return value;
  };

  // Three-column header: 17% logo, 65% identity, 18% QR.
  const headerTop = PAGE_H - AUTHORISED_PAGE.marginTop;
  const logoW = CONTENT_W * 0.17;
  const qrW = CONTENT_W * 0.18;
  const centreX = M + logoW + 8;
  const centreW = CONTENT_W - logoW - qrW - 16;
  const qrX = PAGE_W - M - qrW;

  if (input.assets?.logo) {
    const logo = await embedAsset(pdf, input.assets.logo);
    const fitted = fit(logo, logoW - 8, 54);
    page.drawImage(logo, {
      x: M + (logoW - fitted.width) / 2,
      y: headerTop - fitted.height,
      width: fitted.width,
      height: fitted.height,
    });
  } else {
    drawText(page, fonts, 'PORTFOLIX', M + logoW / 2, headerTop - 28, {
      size: 10,
      bold: true,
      align: 'center',
      color: ACCENT,
    });
  }

  drawText(page, fonts, record(input.legalCompanyName), centreX, headerTop - 10, {
    size: 13,
    bold: true,
    maxWidth: centreW,
  });
  drawText(page, fonts, record(`CIN: ${input.cin}`), centreX, headerTop - 25, {
    size: 8,
    color: MUTED,
  });
  const addressLines = wrapRegisteredAddress(input.registeredAddress, 58);
  addressLines.slice(0, 3).forEach((line, i) => {
    drawText(page, fonts, record(line), centreX, headerTop - 37 - i * 10, {
      size: 7.6,
      color: MUTED,
      maxWidth: centreW,
    });
  });
  const contactY = headerTop - 37 - Math.min(addressLines.length, 3) * 10;
  drawText(page, fonts, record(`${input.payrollEmail}  ·  ${input.verificationPhone}`), centreX, contactY, {
    size: 7.4,
    color: MUTED,
    maxWidth: centreW,
  });

  const qr = await pdf.embedPng(input.qrPng);
  page.drawImage(qr, { x: qrX + 8, y: headerTop - 54, width: 52, height: 52 });
  drawText(page, fonts, record(input.verificationId.slice(0, 12)), qrX + qrW / 2, headerTop - 65, {
    size: 6.5,
    align: 'center',
    color: MUTED,
  });

  const headerBottom = Math.min(contactY - 11, headerTop - 75);
  page.drawLine({
    start: { x: M, y: headerBottom },
    end: { x: PAGE_W - M, y: headerBottom },
    thickness: 1,
    color: INK,
  });

  // Divider is above title with a measured 12pt gap; never crosses title.
  const titleTop = headerBottom - AUTHORISED_PAGE.titleGapAfterDivider;
  drawText(page, fonts, record('AUTHORISED SALARY SLIP'), PAGE_W / 2, titleTop - 15, {
    size: 15,
    bold: true,
    align: 'center',
  });
  let y = titleTop - 31;

  // Structured 3×3 metadata panel.
  const metaH = 92;
  page.drawRectangle({ x: M, y: y - metaH, width: CONTENT_W, height: metaH, color: SOFT, borderColor: LINE, borderWidth: 0.6 });
  const colW = CONTENT_W / 3;
  for (let i = 1; i < 3; i++) page.drawLine({ start: { x: M + i * colW, y }, end: { x: M + i * colW, y: y - metaH }, color: LINE, thickness: 0.5 });
  for (let i = 1; i < 3; i++) page.drawLine({ start: { x: M, y: y - i * (metaH / 3) }, end: { x: PAGE_W - M, y: y - i * (metaH / 3) }, color: LINE, thickness: 0.5 });
  const meta = [
    ['Salary Month', formatMonthYear(input.salaryMonth)],
    ['Financial Year', `FY ${financialYearLabel(input.salaryMonth)}`],
    ['Document Status', 'ISSUED'],
    ['Attendance Cycle', formatAttendanceCycleRange(input.attendancePeriodStart, input.attendancePeriodEnd)],
    ['Payslip Number', input.documentNumber],
    ['Revision', String(input.revisionNumber)],
    ['Payroll Finalised', formatDate(input.payrollFinalisedAt)],
    ['Actual Credit Date', formatDate(input.actualCreditDate)],
    ['Issue Date', formatDate(input.issueDate)],
  ];
  meta.forEach(([label, value], index) => {
    const row = Math.floor(index / 3);
    const col = index % 3;
    field(page, fonts, record(label!), record(value!), M + col * colW + 8, y - row * (metaH / 3) - 10, colW - 16, index === 4 ? 7.2 : 8.1);
  });
  y -= metaH + 19;

  y = sectionTitle(page, fonts, record('EMPLOYEE INFORMATION'), y);
  const employeeH = 96;
  page.drawRectangle({ x: M, y: y - employeeH, width: CONTENT_W, height: employeeH, borderColor: LINE, borderWidth: 0.6 });
  const employeeFields = [
    ['Employee Name', input.employeeName], ['Employee ID', input.employeeId], ['Designation', input.designation], ['Department', input.department],
    ['Legal Entity Joining Date', formatDate(input.joiningDate)], ['Masked PAN', input.panMasked], ['Bank Name', input.bankName], ['Masked Bank Account', `•••• ${input.bankLast4}`],
    ['IFSC', input.ifsc || 'Not displayed'], ['Payment Mode', input.paymentMode], ['Payable Days', input.payableDays.toFixed(1)], ['LOP Days', input.lopDays.toFixed(1)],
  ];
  const eColW = CONTENT_W / 4;
  const eRowH = employeeH / 3;
  employeeFields.forEach(([label, value], index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    field(page, fonts, record(label!), record(value!), M + col * eColW + 7, y - row * eRowH - 9, eColW - 14, 7.8);
  });
  y -= employeeH + 19;

  const { inputs, computed } = input.snapshot;
  const earningRows: Array<[string, number, number, number]> = [];
  if (inputs.baseSalary !== 0 || input.ytd.basic !== 0) earningRows.push(['Basic', inputs.baseSalary, inputs.baseSalary, input.ytd.basic]);
  if (inputs.fixedAllowance !== 0 || input.ytd.fixedAllowance !== 0) earningRows.push(['Fixed Allowance', inputs.fixedAllowance, inputs.fixedAllowance, input.ytd.fixedAllowance]);
  if (computed.variablePaid !== 0 || input.ytd.variablePaid !== 0) earningRows.push([inputs.variableLabel || 'Variable Pay', 0, computed.variablePaid, input.ytd.variablePaid]);
  earningRows.push(['Gross Earnings', inputs.baseSalary + inputs.fixedAllowance, inputs.baseSalary + inputs.fixedAllowance + computed.variablePaid, input.ytd.grossEarnings]);

  y = sectionTitle(page, fonts, record('EARNINGS'), y);
  const earnCols = [M, M + 220, M + 320, M + 420, PAGE_W - M];
  ['Particulars', 'Monthly Rate', 'This Month', 'YTD (FY)'].forEach((heading, i) => drawText(page, fonts, record(heading), i === 0 ? earnCols[i]! + 5 : earnCols[i + 1]! - 5, y, { size: 7, bold: true, color: MUTED, align: i === 0 ? 'left' : 'right' }));
  y -= 12;
  earningRows.forEach((row, index) => {
    const bold = index === earningRows.length - 1;
    drawText(page, fonts, record(row[0]), earnCols[0]! + 5, y, { size: 8.2, bold });
    [row[1], row[2], row[3]].forEach((value, i) => drawText(page, fonts, record(money(value)), earnCols[i + 2]! - 5, y, { size: 8.2, bold, align: 'right' }));
    page.drawLine({ start: { x: M, y: y - 5 }, end: { x: PAGE_W - M, y: y - 5 }, color: LINE, thickness: 0.35 });
    y -= 15;
  });
  y -= 4;

  y = sectionTitle(page, fonts, record('DEDUCTIONS'), y);
  const deductionRows: Array<[string, number, number]> = [
    ['Loss of Pay', computed.lopDeduction, input.ytd.lopDeduction],
    ['Professional Tax', computed.pt ?? inputs.ptThisMonth ?? 0, input.ytd.professionalTax],
    ['TDS', computed.tds ?? inputs.tdsMonthly ?? 0, input.ytd.tds],
    ['Other Deductions', computed.otherDeductions, input.ytd.otherDeductions],
    ['Total Deductions', computed.totalDeductions, input.ytd.totalDeductions],
  ];
  ['Particulars', 'This Month', 'YTD (FY)'].forEach((heading, i) => drawText(page, fonts, record(heading), i === 0 ? M + 5 : (i === 1 ? M + 390 : PAGE_W - M) - 5, y, { size: 7, bold: true, color: MUTED, align: i === 0 ? 'left' : 'right' }));
  y -= 12;
  deductionRows.forEach((row, index) => {
    const bold = index === deductionRows.length - 1;
    drawText(page, fonts, record(row[0]), M + 5, y, { size: 8.1, bold });
    drawText(page, fonts, record(money(row[1])), M + 385, y, { size: 8.1, bold, align: 'right' });
    drawText(page, fonts, record(money(row[2])), PAGE_W - M - 5, y, { size: 8.1, bold, align: 'right' });
    y -= 14;
  });
  y -= 4;

  // One reconciled net/payment panel.
  const netH = 62;
  page.drawRectangle({ x: M, y: y - netH, width: CONTENT_W, height: netH, color: rgb(0.93, 0.97, 0.95), borderColor: ACCENT, borderWidth: 0.8 });
  drawText(page, fonts, record('NET SALARY'), M + 10, y - 15, { size: 7.5, bold: true, color: ACCENT });
  drawText(page, fonts, record(computed.netPayWords), M + 10, y - 31, { size: 7.6, maxWidth: 190 });
  drawText(page, fonts, record('Payment Status: Paid'), M + 215, y - 15, { size: 8, bold: true });
  drawText(page, fonts, record(`Actual Credit: ${formatDate(input.actualCreditDate)}`), M + 215, y - 29, { size: 7.5 });
  drawText(page, fonts, record(`Payment Mode: ${input.paymentMode}`), M + 215, y - 43, { size: 7.5 });
  drawText(page, fonts, record(`Confirmed Paid: ${money(input.confirmedPaidAmount)}`), PAGE_W - M - 10, y - 14, { size: 7.5, align: 'right' });
  drawText(page, fonts, record(`Outstanding: ${money(input.outstandingAmount)}`), PAGE_W - M - 10, y - 28, { size: 7.5, align: 'right' });
  drawText(page, fonts, record(money(input.netSalary)), PAGE_W - M - 10, y - 50, { size: 14, bold: true, align: 'right', color: ACCENT });
  y -= netH + 16;

  // Bottom blocks: verification left, signatory right.
  const bottomTop = y;
  drawText(page, fonts, record('VERIFY DOCUMENT'), M, bottomTop, { size: 8.5, bold: true });
  page.drawImage(qr, { x: M, y: bottomTop - 67, width: 54, height: 54 });
  drawText(page, fonts, record(`Verification ID: ${input.verificationId}`), M + 64, bottomTop - 18, { size: 7.2 });
  drawText(page, fonts, record(`Verify: ${shortVerificationDisplay(input.verificationUrl)}`), M + 64, bottomTop - 34, { size: 7.2, color: MUTED });

  const signX = M + 285;
  drawText(page, fonts, record(`For ${input.legalCompanyName}`), signX, bottomTop, { size: 8, bold: true, maxWidth: 240 });
  let embeddedSignature = false;
  let embeddedSeal = false;
  if (input.assets?.signature) {
    const signature = await embedAsset(pdf, input.assets.signature);
    const s = fit(signature, 105, 43);
    page.drawImage(signature, { x: signX, y: bottomTop - 53, ...s });
    embeddedSignature = true;
    if (input.assets.seal) {
      const seal = await embedAsset(pdf, input.assets.seal);
      const z = fit(seal, 58, 58);
      // 12% overlap at signature lower-right; text remains below both assets.
      page.drawImage(seal, {
        x: signX + s.width - s.width * 0.12,
        y: bottomTop - 53 - z.height + s.height * 0.12,
        ...z,
      });
      embeddedSeal = true;
    }
  }
  // Place all text below the lowest seal bound; assets can never cover it.
  const signTextY = bottomTop - 119;
  drawText(page, fonts, record(input.signatoryName), signX, signTextY, { size: 9, bold: true });
  drawText(page, fonts, record(`${input.signatoryDesignation} / Authorised Signatory`), signX, signTextY - 13, { size: 7.5, color: MUTED });
  drawText(page, fonts, record(`Place: Kochi  ·  Issue Date: ${formatDate(input.issueDate)}`), signX, signTextY - 26, { size: 7.5, color: MUTED });

  // Fixed readable footer.
  const footerY = AUTHORISED_PAGE.marginBottom + 11;
  page.drawLine({ start: { x: M, y: footerY + 21 }, end: { x: PAGE_W - M, y: footerY + 21 }, color: LINE, thickness: 0.6 });
  drawText(page, fonts, record('This authorised salary slip may be verified through the QR code and verification ID.'), M, footerY + 9, { size: 7.5, color: MUTED });
  drawText(page, fonts, record(`For employer verification, contact ${input.payrollEmail} or ${input.verificationPhone}.`), M, footerY - 1, { size: 7.5, color: MUTED });

  const bytes = await pdf.save({ useObjectStreams: true });
  return {
    bytes,
    extractedText: extracted.join('\n'),
    embedded: { signature: embeddedSignature, seal: embeddedSeal },
    geometry: {
      headerDividerY: headerBottom,
      titleTopY: titleTop,
      titleBottomY: titleTop - 19,
    },
  };
}
