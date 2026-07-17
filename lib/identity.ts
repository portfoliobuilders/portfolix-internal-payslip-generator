/**
 * Identity-field helpers for roster + slip display.
 * PAN is always stored masked. Bank account may be stored in full for bank copies.
 */

/** Full Indian PAN: 5 letters + 4 digits + 1 letter. */
const FULL_PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/i;

/** Masked form: keep first 2 + last 2, X out the middle 6. e.g. ABXXXXXX1F */
const MASKED_PAN_RE = /^[A-Z]{2}X{6}[A-Z0-9]{2}$/i;

export function isFullPan(value: string): boolean {
  return FULL_PAN_RE.test(value.trim());
}

export function isMaskedPan(value: string): boolean {
  return MASKED_PAN_RE.test(value.trim());
}

/**
 * Mask a PAN for storage/display.
 * Full PAN `ABCDE1234F` → `ABXXXXXX4F`. Already-masked values pass through.
 * Other partial strings are uppercased and truncated to 10 chars.
 */
export function maskPan(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  if (isMaskedPan(cleaned)) return cleaned;
  if (isFullPan(cleaned)) {
    return `${cleaned.slice(0, 2)}XXXXXX${cleaned.slice(8, 10)}`;
  }
  return cleaned.slice(0, 10);
}

/** Digits only; Indian accounts are typically 9–18 digits. */
export function normalizeBankAccountNumber(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 18);
}

export function bankLast4FromAccount(accountNumber: string): string {
  const digits = normalizeBankAccountNumber(accountNumber);
  if (digits.length < 4) return digits;
  return digits.slice(-4);
}

/** Display full account when available; otherwise masked last-4 legacy form. */
export function formatBankAccountDisplay(
  bankAccountNumber: string | undefined | null,
  bankLast4: string | undefined | null,
): string {
  const full = (bankAccountNumber ?? '').trim();
  if (full) return full;
  const last4 = (bankLast4 ?? '').trim();
  if (last4) return `····${last4}`;
  return '—';
}
