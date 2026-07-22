/**
 * Identity-field helpers for roster + slip display.
 *
 * Full PAN, bank account, IFSC, and bank name may be stored and are rendered
 * ONLY on the Authorised Slip. The internal Final slip derives a masked PAN
 * and masked account at render time. Aadhaar is NEVER collected, stored, or rendered.
 */

/** Full Indian PAN: 5 letters + 4 digits + 1 letter. */
const FULL_PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Masked form: keep first 2 + last 2, X out the middle 6. e.g. ABXXXXXX1F */
const MASKED_PAN_RE = /^[A-Z]{2}X{6}[A-Z0-9]{2}$/i;

/**
 * Legacy typo: 5 X's instead of 6 (e.g. RFXXXXX5H). Repair by inserting the
 * missing X so roster edits are not blocked on corrupted historical masks.
 */
const LEGACY_FIVE_X_MASK_RE = /^([A-Z]{2})X{5}([A-Z0-9]{2})$/;

/** IFSC: 4 letters + 0 + 6 alphanumeric. */
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Exactly 12 digits — Aadhaar-shaped; never accepted in identity fields. */
const AADHAAR_SHAPED_RE = /^\d{12}$/;

export function isFullPan(value: string): boolean {
  return FULL_PAN_RE.test(value.trim().toUpperCase());
}

export function isMaskedPan(value: string): boolean {
  return MASKED_PAN_RE.test(value.trim());
}

/**
 * Accept / repair historical masked PAN values that are not a full PAN and
 * not Aadhaar-shaped. Returns the stored mask (repaired when possible), or null.
 */
export function normalizeLegacyMaskedPan(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned || FULL_PAN_RE.test(cleaned) || AADHAAR_SHAPED_RE.test(cleaned)) {
    return null;
  }
  if (MASKED_PAN_RE.test(cleaned)) return cleaned;
  const fiveX = cleaned.match(LEGACY_FIVE_X_MASK_RE);
  if (fiveX) return `${fiveX[1]}XXXXXX${fiveX[2]}`;
  // Other legacy masks that clearly used X-masking (not a mistyped full PAN).
  if (cleaned.length >= 8 && cleaned.length <= 12 && /X/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

/** Uppercase-normalize and validate full PAN. Returns null when invalid. */
export function normalizePan(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return null;
  if (isMaskedPan(cleaned)) return cleaned.toUpperCase();
  const legacy = normalizeLegacyMaskedPan(cleaned);
  if (legacy) return legacy;
  if (FULL_PAN_RE.test(cleaned)) return cleaned;
  return null;
}

/**
 * Mask a PAN for Final-slip display / legacy fields.
 * Full PAN `ABCDE1234F` → `ABXXXXXX4F`. Already-masked values pass through.
 */
export function maskPan(raw: string): string {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return '';
  if (isMaskedPan(cleaned)) return cleaned;
  if (FULL_PAN_RE.test(cleaned)) {
    return `${cleaned.slice(0, 2)}XXXXXX${cleaned.slice(8, 10)}`;
  }
  return cleaned.slice(0, 10);
}

/** Digits only; Indian accounts are 9–18 digits. */
export function normalizeBankAccountNumber(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 18);
}

export function isValidBankAccount(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 9 && digits.length <= 18;
}

export function normalizeIfsc(raw: string): string | null {
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!cleaned) return null;
  if (!IFSC_RE.test(cleaned)) return null;
  return cleaned;
}

export function isValidIfsc(raw: string): boolean {
  return normalizeIfsc(raw) !== null;
}

export function isValidBankName(raw: string): boolean {
  return raw.trim().length > 0;
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

/** Mask account for Final / internal slips: show last 4 only. */
export function maskBankAccountForInternal(
  bankAccountNumber: string | undefined | null,
  bankLast4: string | undefined | null,
): string {
  const last4 =
    bankLast4FromAccount(bankAccountNumber ?? '') ||
    (bankLast4 ?? '').replace(/\D/g, '').slice(-4);
  if (!last4) return '—';
  return `····${last4}`;
}

/** True when the string is exactly 12 digits (Aadhaar-shaped). */
export function isAadhaarShaped(raw: string): boolean {
  const digits = raw.replace(/\s/g, '');
  return AADHAAR_SHAPED_RE.test(digits);
}

/**
 * Reject Aadhaar-shaped input in identity fields (PAN, account, employee id, etc.).
 * Returns an error message or null when acceptable.
 */
export function rejectAadhaarShaped(raw: string, fieldLabel: string): string | null {
  if (isAadhaarShaped(raw)) {
    return `${fieldLabel}: Aadhaar is never collected, stored, or rendered.`;
  }
  return null;
}

export interface IdentityValidationInput {
  pan?: string;
  bankAccount?: string;
  ifsc?: string;
  bankName?: string;
}

export interface IdentityValidationResult {
  ok: boolean;
  errors: string[];
  pan: string;
  panMasked: string;
  bankAccount: string;
  ifsc: string;
  bankName: string;
}

/** Validate and normalize identity fields for employee save. Empty optional fields are allowed for legacy. */
export function validateIdentityFields(input: IdentityValidationInput): IdentityValidationResult {
  const errors: string[] = [];
  const panRaw = (input.pan ?? '').trim();
  const bankRaw = (input.bankAccount ?? '').trim();
  const ifscRaw = (input.ifsc ?? '').trim();
  const bankNameRaw = (input.bankName ?? '').trim();

  for (const [label, value] of [
    ['PAN', panRaw],
    ['Bank account', bankRaw],
    ['IFSC', ifscRaw],
    ['Bank name', bankNameRaw],
  ] as const) {
    const aadhaarErr = rejectAadhaarShaped(value, label);
    if (aadhaarErr) errors.push(aadhaarErr);
  }

  let pan = '';
  let panMasked = '';
  if (panRaw) {
    const cleaned = panRaw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (FULL_PAN_RE.test(cleaned)) {
      pan = cleaned;
      panMasked = maskPan(cleaned);
    } else {
      // Accept legacy masked-only records (including corrupted 5-X masks).
      const legacy = normalizeLegacyMaskedPan(panRaw);
      if (legacy) {
        panMasked = legacy;
      } else {
        errors.push('PAN must match AAAAA9999A (uppercase).');
      }
    }
  }

  let bankAccount = '';
  if (bankRaw) {
    if (!isValidBankAccount(bankRaw)) {
      errors.push('Bank account must be 9–18 digits.');
    } else {
      bankAccount = normalizeBankAccountNumber(bankRaw);
    }
  }

  let ifsc = '';
  if (ifscRaw) {
    const normalized = normalizeIfsc(ifscRaw);
    if (!normalized) {
      errors.push('IFSC must match AAAA0XXXXXX (11 characters).');
    } else {
      ifsc = normalized;
    }
  }

  let bankName = '';
  if (bankNameRaw) {
    if (!isValidBankName(bankNameRaw)) {
      errors.push('Bank name is required when provided.');
    } else {
      bankName = bankNameRaw;
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    pan,
    panMasked: panMasked || (pan ? maskPan(pan) : ''),
    bankAccount,
    ifsc,
    bankName,
  };
}
