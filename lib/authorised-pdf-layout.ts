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
import { wrapRegisteredAddress } from './company-address';
import { AUTHORISED_PAGE } from './authorised-slip-policy';
import { shortVerificationDisplay } from './qr-png';
import type { AuthorisedSlipYtd, SlipSnapshot } from './types';
import type { AuthorisedPdfAssets } from './pdf-vector';

/** Vertical rhythm for one-page enforcement. */
export type AuthorisedSpacingTier = 'comfortable' | 'compact';

export interface AuthorisedSpacing {
  titleSize: number;
  monthSize: number;
  titleBlockH: number;
  metaH: number;
  afterMeta: number;
  sectionTitleH: number;
  employeeH: number;
  afterSection: number;
  tableHeadGap: number;
  earnRowH: number;
  dedRowH: number;
  lopFootnoteH: number;
  afterTable: number;
  netH: number;
  afterNet: number;
  verifyBlockH: number;
  footnoteSize: number;
  bodySize: number;
  footerBlockH: number;
}

export const AUTHORISED_SPACING: Record<AuthorisedSpacingTier, AuthorisedSpacing> = {
  comfortable: {
    titleSize: 15,
    monthSize: 10,
    titleBlockH: 34,
    metaH: 36,
    afterMeta: 14,
    sectionTitleH: 15,
    employeeH: 112,
    afterSection: 14,
    tableHeadGap: 11,
    earnRowH: 14,
    dedRowH: 13,
    lopFootnoteH: 10,
    afterTable: 4,
    netH: 58,
    afterNet: 10,
    verifyBlockH: 108,
    footnoteSize: 7.2,
    bodySize: 8.1,
    footerBlockH: 34,
  },
  compact: {
    titleSize: 13.5,
    monthSize: 9,
    titleBlockH: 28,
    metaH: 32,
    afterMeta: 10,
    sectionTitleH: 13,
    employeeH: 100,
    afterSection: 10,
    tableHeadGap: 9,
    earnRowH: 12,
    dedRowH: 11,
    lopFootnoteH: 8,
    afterTable: 2,
    netH: 52,
    afterNet: 6,
    verifyBlockH: 96,
    footnoteSize: 6.5,
    bodySize: 7.5,
    footerBlockH: 30,
  },
};

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
  bankAccountNumber?: string | null;
  ifsc?: string | null;
  workLocation?: string | null;
  payableDays: number;
  lopDays: number;
  department: string;
  designation: string;
  joiningDate: string;
  pan?: string | null;
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

function buildEarningRows(
  snapshot: SlipSnapshot,
  ytd: AuthorisedSlipYtd,
): Array<[string, number, number, number]> {
  const { inputs, computed } = snapshot;
  const rows: Array<[string, number, number, number]> = [];
  if (inputs.baseSalary !== 0 || ytd.basic !== 0) {
    rows.push(['Basic', inputs.baseSalary, inputs.baseSalary, ytd.basic]);
  }
  if (inputs.fixedAllowance !== 0 || ytd.fixedAllowance !== 0) {
    rows.push(['Fixed Allowance', inputs.fixedAllowance, inputs.fixedAllowance, ytd.fixedAllowance]);
  }
  if (computed.variablePaid !== 0 || ytd.variablePaid !== 0) {
    rows.push([inputs.variableLabel || 'Variable Pay', 0, computed.variablePaid, ytd.variablePaid]);
  }
  rows.push([
    'Gross Earnings',
    inputs.baseSalary + inputs.fixedAllowance,
    inputs.baseSalary + inputs.fixedAllowance + computed.variablePaid,
    ytd.grossEarnings,
  ]);
  return rows;
}

function buildDeductionRows(
  snapshot: SlipSnapshot,
  ytd: AuthorisedSlipYtd,
): Array<[string, number, number]> {
  const { inputs, computed } = snapshot;
  return [
    ['Loss of Pay', computed.lopDeduction, ytd.lopDeduction],
    ['Professional Tax', computed.pt ?? inputs.ptThisMonth ?? 0, ytd.professionalTax],
    ['TDS', computed.tds ?? inputs.tdsMonthly ?? 0, ytd.tds],
    ['Other Deductions', computed.otherDeductions, ytd.otherDeductions],
    ['Total Deductions', computed.totalDeductions, ytd.totalDeductions],
  ];
}

/** Content height from top margin through footer (points). Excludes unused bottom whitespace. */
export function measureAuthorisedContentHeight(
  input: Pick<BankReadyPdfInput, 'snapshot' | 'ytd' | 'lopDays' | 'registeredAddress'>,
  tier: AuthorisedSpacingTier,
  headerBlockH = 75,
): number {
  const s = AUTHORISED_SPACING[tier];
  const earningRows = buildEarningRows(input.snapshot, input.ytd);
  const deductionRows = buildDeductionRows(input.snapshot, input.ytd);
  const lopFootnote =
    input.lopDays > 0 && input.snapshot.calculationMethodLabel?.trim()
      ? s.lopFootnoteH
      : 0;
  const addressLines = Math.min(wrapRegisteredAddress(input.registeredAddress, 58).length, 3);
  const headerH = Math.max(headerBlockH, 37 + addressLines * 10 + 11);
  const ptFoot = input.snapshot.ptFootnote ? s.footnoteSize + 4 : 0;

  return (
    AUTHORISED_PAGE.marginTop +
    headerH +
    AUTHORISED_PAGE.titleGapAfterDivider +
    s.titleBlockH +
    s.metaH +
    s.afterMeta +
    s.sectionTitleH +
    s.employeeH +
    s.afterSection +
    s.sectionTitleH +
    s.tableHeadGap +
    earningRows.length * s.earnRowH +
    s.afterTable +
    s.sectionTitleH +
    s.tableHeadGap +
    deductionRows.length * s.dedRowH +
    lopFootnote +
    s.afterTable +
    s.netH +
    s.afterNet +
    s.verifyBlockH +
    s.footerBlockH +
    ptFoot +
    AUTHORISED_PAGE.marginBottom
  );
}

export function chooseAuthorisedSpacingTier(
  input: Pick<BankReadyPdfInput, 'snapshot' | 'ytd' | 'lopDays' | 'registeredAddress'>,
): { tier: AuthorisedSpacingTier; contentHeight: number; requiresSecondPage: boolean } {
  const comfortableH = measureAuthorisedContentHeight(input, 'comfortable');
  if (comfortableH <= PAGE_H) {
    return { tier: 'comfortable', contentHeight: comfortableH, requiresSecondPage: false };
  }
  const compactH = measureAuthorisedContentHeight(input, 'compact');
  if (compactH <= PAGE_H) {
    return { tier: 'compact', contentHeight: compactH, requiresSecondPage: false };
  }
  // Even compact overflows: permit page 2 only when earnings table cannot fit.
  return { tier: 'compact', contentHeight: compactH, requiresSecondPage: true };
}

export async function buildBankReadyAuthorisedPdf(input: BankReadyPdfInput): Promise<{
  bytes: Uint8Array;
  extractedText: string;
  embedded: { signature: boolean; seal: boolean };
  geometry: { headerDividerY: number; titleTopY: number; titleBottomY: number };
  layoutTier: AuthorisedSpacingTier;
  contentHeight: number;
  pageCount: number;
}> {
  const pdf = await PDFDocument.create();
  const fonts = await loadFonts(pdf);
  pdf.setTitle(`Authorised Salary Slip – ${input.employeeName} – ${formatMonthYear(input.salaryMonth)}`);
  pdf.setAuthor(input.legalCompanyName);
  pdf.setSubject('Employee Salary and Payment Verification');
  pdf.setKeywords(['Salary Slip', 'Payroll', 'Payslip Number']);
  pdf.setCreator('Portfolix Internal Payslip Generator');
  pdf.setProducer('Portfolix Payroll · pdf-lib');

  const extracted: string[] = [];
  const record = (value: string) => {
    extracted.push(value);
    return value;
  };

  const layout = chooseAuthorisedSpacingTier(input);
  const s = AUTHORISED_SPACING[layout.tier];
  const { computed } = input.snapshot;
  const earningRows = buildEarningRows(input.snapshot, input.ytd);
  const deductionRows = buildDeductionRows(input.snapshot, input.ytd);
  const lopFootnoteText =
    input.lopDays > 0 && input.snapshot.calculationMethodLabel?.trim()
      ? input.snapshot.calculationMethodLabel.trim()
      : null;

  const page1 = pdf.addPage([PAGE_W, PAGE_H]);
  let page = page1;

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

  // Title + salary month subtitle (month is not a grid cell).
  const titleTop = headerBottom - AUTHORISED_PAGE.titleGapAfterDivider;
  drawText(page, fonts, record('AUTHORISED SALARY SLIP'), PAGE_W / 2, titleTop - 14, {
    size: s.titleSize,
    bold: true,
    align: 'center',
  });
  drawText(page, fonts, record(formatMonthYear(input.salaryMonth)), PAGE_W / 2, titleTop - 28, {
    size: s.monthSize,
    bold: true,
    align: 'center',
  });
  let y = titleTop - s.titleBlockH;

  // Document-details grid: single row — ISSUE DATE | CREDIT DATE.
  const metaH = s.metaH;
  page.drawRectangle({
    x: M,
    y: y - metaH,
    width: CONTENT_W,
    height: metaH,
    color: SOFT,
    borderColor: LINE,
    borderWidth: 0.6,
  });
  const colW = CONTENT_W / 2;
  page.drawLine({
    start: { x: M + colW, y },
    end: { x: M + colW, y: y - metaH },
    color: LINE,
    thickness: 0.5,
  });
  field(page, fonts, record('Issue Date'), record(formatDate(input.issueDate)), M + 10, y - 10, colW - 20, 8.2);
  field(page, fonts, record('Credit Date'), record(formatDate(input.actualCreditDate)), M + colW + 10, y - 10, colW - 20, 8.2);
  y -= metaH + s.afterMeta;

  y = sectionTitle(page, fonts, record('EMPLOYEE INFORMATION'), y);
  const employeeH = s.employeeH;
  page.drawRectangle({
    x: M,
    y: y - employeeH,
    width: CONTENT_W,
    height: employeeH,
    borderColor: LINE,
    borderWidth: 0.6,
  });
  const emp = input.snapshot.employee;
  const panDisplay = (input.pan ?? emp.pan)?.trim() || input.panMasked || emp.panMasked || '—';
  const accountDisplay =
    (input.bankAccountNumber ?? emp.bankAccountNumber)?.trim() ||
    (input.bankLast4 || emp.bankLast4 ? `•••• ${input.bankLast4 || emp.bankLast4}` : '—');
  const ifscDisplay = (input.ifsc ?? emp.ifsc)?.trim() || '—';
  const workLocationDisplay =
    (input.workLocation ?? emp.workLocation)?.trim() || '—';
  const bankNameDisplay = (input.bankName || emp.bankName || '').trim() || '—';

  const employeeFields = [
    ['Employee Name', input.employeeName],
    ['Employee ID', input.employeeId],
    ['Designation', input.designation],
    ['Department', input.department],
    ['Legal Entity Joining Date', formatDate(input.joiningDate)],
    ['PAN', panDisplay],
    ['Bank Name', bankNameDisplay],
    ['Account Number', accountDisplay],
    ['IFSC', ifscDisplay],
    ['Work Location', workLocationDisplay],
    ['Payment Mode', input.paymentMode],
    ['Payable Days', input.payableDays.toFixed(1)],
    ['LOP Days', input.lopDays.toFixed(1)],
  ];
  // 4 columns × up to 4 rows (13 fields → last cell empty)
  const eColW = CONTENT_W / 4;
  const eRowH = employeeH / 4;
  employeeFields.forEach(([label, value], index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;
    field(
      page,
      fonts,
      record(label!),
      record(value!),
      M + col * eColW + 7,
      y - row * eRowH - 9,
      eColW - 14,
      s.bodySize - 0.3,
    );
  });
  y -= employeeH + s.afterSection;

  y = sectionTitle(page, fonts, record('EARNINGS'), y);
  const earnCols = [M, M + 220, M + 320, M + 420, PAGE_W - M];
  ['Particulars', 'Monthly Rate', 'This Month', 'YTD (FY)'].forEach((heading, i) =>
    drawText(page, fonts, record(heading), i === 0 ? earnCols[i]! + 5 : earnCols[i + 1]! - 5, y, {
      size: 7,
      bold: true,
      color: MUTED,
      align: i === 0 ? 'left' : 'right',
    }),
  );
  y -= s.tableHeadGap;
  earningRows.forEach((row, index) => {
    const bold = index === earningRows.length - 1;
    drawText(page, fonts, record(row[0]), earnCols[0]! + 5, y, { size: s.bodySize, bold });
    [row[1], row[2], row[3]].forEach((value, i) =>
      drawText(page, fonts, record(money(value)), earnCols[i + 2]! - 5, y, {
        size: s.bodySize,
        bold,
        align: 'right',
      }),
    );
    page.drawLine({
      start: { x: M, y: y - 4 },
      end: { x: PAGE_W - M, y: y - 4 },
      color: LINE,
      thickness: 0.35,
    });
    y -= s.earnRowH;
  });
  y -= s.afterTable;

  y = sectionTitle(page, fonts, record('DEDUCTIONS'), y);
  ['Particulars', 'This Month', 'YTD (FY)'].forEach((heading, i) =>
    drawText(
      page,
      fonts,
      record(heading),
      i === 0 ? M + 5 : (i === 1 ? M + 390 : PAGE_W - M) - 5,
      y,
      { size: 7, bold: true, color: MUTED, align: i === 0 ? 'left' : 'right' },
    ),
  );
  y -= s.tableHeadGap;
  deductionRows.forEach((row, index) => {
    const bold = index === deductionRows.length - 1;
    drawText(page, fonts, record(row[0]), M + 5, y, { size: s.bodySize, bold });
    drawText(page, fonts, record(money(row[1])), M + 385, y, {
      size: s.bodySize,
      bold,
      align: 'right',
    });
    drawText(page, fonts, record(money(row[2])), PAGE_W - M - 5, y, {
      size: s.bodySize,
      bold,
      align: 'right',
    });
    y -= s.dedRowH;
    // LOP math context only as footnote under Loss of Pay when lopDays > 0.
    if (index === 0 && lopFootnoteText) {
      drawText(page, fonts, record(lopFootnoteText), M + 8, y + 2, {
        size: s.footnoteSize,
        color: MUTED,
      });
      y -= s.lopFootnoteH;
    }
  });
  y -= s.afterTable;

  const tailBlockH = s.netH + s.afterNet + s.verifyBlockH + s.footerBlockH;
  const minY = AUTHORISED_PAGE.marginBottom + tailBlockH;
  if (layout.requiresSecondPage || y < minY) {
    // Break after deductions — never mid-table; keep net + signature + verify together.
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - AUTHORISED_PAGE.marginTop;
  }

  // Net / payment panel — no flex-push spacer below.
  const netH = s.netH;
  page.drawRectangle({
    x: M,
    y: y - netH,
    width: CONTENT_W,
    height: netH,
    color: rgb(0.93, 0.97, 0.95),
    borderColor: ACCENT,
    borderWidth: 0.8,
  });
  drawText(page, fonts, record('NET SALARY'), M + 10, y - 14, {
    size: 7.5,
    bold: true,
    color: ACCENT,
  });
  drawText(page, fonts, record(computed.netPayWords), M + 10, y - 28, {
    size: 7.4,
    maxWidth: 190,
  });
  drawText(page, fonts, record('Payment Status: Paid'), M + 215, y - 14, { size: 8, bold: true });
  drawText(page, fonts, record(`Actual Credit: ${formatDate(input.actualCreditDate)}`), M + 215, y - 27, {
    size: 7.3,
  });
  drawText(page, fonts, record(`Payment Mode: ${input.paymentMode}`), M + 215, y - 40, { size: 7.3 });
  drawText(page, fonts, record(`Confirmed Paid: ${money(input.confirmedPaidAmount)}`), PAGE_W - M - 10, y - 14, {
    size: 7.3,
    align: 'right',
  });
  drawText(page, fonts, record(`Outstanding: ${money(input.outstandingAmount)}`), PAGE_W - M - 10, y - 27, {
    size: 7.3,
    align: 'right',
  });
  drawText(page, fonts, record(money(input.netSalary)), PAGE_W - M - 10, y - 46, {
    size: 13,
    bold: true,
    align: 'right',
    color: ACCENT,
  });
  y -= netH + s.afterNet;

  // Verification (left) + signatory (right) — payslip number sits with Verification ID.
  const bottomTop = y;
  drawText(page, fonts, record('VERIFY DOCUMENT'), M, bottomTop, { size: 8.5, bold: true });
  page.drawImage(qr, { x: M, y: bottomTop - 62, width: 50, height: 50 });
  drawText(
    page,
    fonts,
    record(`Payslip No: ${input.documentNumber} · Rev ${input.revisionNumber}`),
    M + 60,
    bottomTop - 14,
    { size: 7 },
  );
  drawText(page, fonts, record(`Verification ID: ${input.verificationId}`), M + 60, bottomTop - 28, {
    size: 7,
  });
  drawText(
    page,
    fonts,
    record(`Verify: ${shortVerificationDisplay(input.verificationUrl)}`),
    M + 60,
    bottomTop - 42,
    { size: 6.8, color: MUTED },
  );

  const signX = M + 285;
  drawText(page, fonts, record(`For ${input.legalCompanyName}`), signX, bottomTop, {
    size: 8,
    bold: true,
    maxWidth: 240,
  });
  let embeddedSignature = false;
  let embeddedSeal = false;
  let assetsBottom = bottomTop - 14;
  if (input.assets?.signature) {
    const signature = await embedAsset(pdf, input.assets.signature);
    const sigFit = fit(signature, 105, 40);
    const sigY = bottomTop - 12 - sigFit.height;
    page.drawImage(signature, { x: signX, y: sigY, ...sigFit });
    embeddedSignature = true;
    assetsBottom = sigY;
    if (input.assets.seal) {
      const seal = await embedAsset(pdf, input.assets.seal);
      const sealFit = fit(seal, 52, 52);
      const sealY = sigY - sealFit.height + sigFit.height * 0.12;
      page.drawImage(seal, {
        x: signX + sigFit.width - sigFit.width * 0.12,
        y: sealY,
        ...sealFit,
      });
      embeddedSeal = true;
      assetsBottom = Math.min(assetsBottom, sealY);
    }
  }
  // Text immediately below assets — no dead reserved gap.
  const signTextY = assetsBottom - 12;
  drawText(page, fonts, record(input.signatoryName), signX, signTextY, { size: 9, bold: true });
  drawText(
    page,
    fonts,
    record(`${input.signatoryDesignation} / Authorised Signatory`),
    signX,
    signTextY - 12,
    { size: 7.3, color: MUTED },
  );
  drawText(
    page,
    fonts,
    record(`Place: Kochi  ·  Issue Date: ${formatDate(input.issueDate)}`),
    signX,
    signTextY - 24,
    { size: 7.3, color: MUTED },
  );

  // Footer flows after content (no mt-auto / page-bottom pin that creates white space).
  const footerTop = Math.min(signTextY - 36, bottomTop - s.verifyBlockH + 8);
  const footerY = Math.max(footerTop, AUTHORISED_PAGE.marginBottom + 14);
  page.drawLine({
    start: { x: M, y: footerY + 18 },
    end: { x: PAGE_W - M, y: footerY + 18 },
    color: LINE,
    thickness: 0.6,
  });
  drawText(
    page,
    fonts,
    record('This authorised salary slip may be verified through the QR code and verification ID.'),
    M,
    footerY + 8,
    { size: s.footnoteSize, color: MUTED },
  );
  drawText(
    page,
    fonts,
    record(`For employer verification, contact ${input.payrollEmail} or ${input.verificationPhone}.`),
    M,
    footerY - 2,
    { size: s.footnoteSize, color: MUTED },
  );
  if (input.snapshot.ptFootnote) {
    drawText(page, fonts, record(input.snapshot.ptFootnote), M, footerY - 12, {
      size: s.footnoteSize - 0.3,
      color: MUTED,
      maxWidth: CONTENT_W,
    });
  }

  const pageCount = pdf.getPageCount();
  const bytes = await pdf.save({ useObjectStreams: true });
  return {
    bytes,
    extractedText: extracted.join('\n'),
    embedded: { signature: embeddedSignature, seal: embeddedSeal },
    geometry: {
      headerDividerY: headerBottom,
      titleTopY: titleTop,
      titleBottomY: titleTop - s.titleBlockH + 4,
    },
    layoutTier: layout.tier,
    contentHeight: layout.contentHeight,
    pageCount,
  };
}
