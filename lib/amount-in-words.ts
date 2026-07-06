/**
 * Indian-system amount-in-words converter (Crore / Lakh / Thousand).
 * Dependency-free pure module — safe to lift into the Portfolix EMS.
 *
 * amountInWords(105350.5) →
 *   "Rupees One Lakh Five Thousand Three Hundred Fifty and Paise Fifty Only"
 */

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
] as const;

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
] as const;

/** Words for 0–99. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? '';
  const t = TENS[Math.floor(n / 10)] ?? '';
  const o = ONES[n % 10] ?? '';
  return o ? `${t} ${o}` : t;
}

/** Words for 0–999. */
function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${ONES[hundreds]} Hundred`);
  if (rest > 0) parts.push(twoDigits(rest));
  return parts.join(' ');
}

/**
 * Integer → Indian-system words. Supports up to 99,99,99,99,999
 * (Arab not needed for payroll; Crore is repeated for larger values).
 */
export function integerInWords(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n === 0) return 'Zero';
  const abs = Math.abs(Math.trunc(n));

  const crore = Math.floor(abs / 10000000);
  const lakh = Math.floor((abs % 10000000) / 100000);
  const thousand = Math.floor((abs % 100000) / 1000);
  const hundred = abs % 1000;

  const parts: string[] = [];
  if (crore > 0) {
    // Handles values above 99 crore by recursing on the crore count.
    parts.push(`${crore > 99 ? integerInWords(crore) : twoDigits(crore)} Crore`);
  }
  if (lakh > 0) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand > 0) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred > 0) parts.push(threeDigits(hundred));

  const words = parts.join(' ');
  return n < 0 ? `Minus ${words}` : words;
}

/**
 * Money → "Rupees … and Paise … Only".
 * Expects a value already rounded to 2 dp (the engine rounds once).
 */
export function amountInWords(amount: number): string {
  if (!Number.isFinite(amount)) return '';
  const abs = Math.abs(amount);
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);

  const rupeeWords = integerInWords(rupees);
  const prefix = amount < 0 ? 'Minus ' : '';

  if (paise > 0) {
    return `${prefix}Rupees ${rupeeWords} and Paise ${twoDigits(paise)} Only`;
  }
  return `${prefix}Rupees ${rupeeWords} Only`;
}
