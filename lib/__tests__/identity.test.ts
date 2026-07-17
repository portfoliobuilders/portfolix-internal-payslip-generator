import { describe, expect, it } from 'vitest';
import {
  bankLast4FromAccount,
  formatBankAccountDisplay,
  isFullPan,
  isValidBankAccount,
  isValidIfsc,
  maskBankAccountForInternal,
  maskPan,
  normalizeBankAccountNumber,
  normalizeIfsc,
  normalizePan,
  rejectAadhaarShaped,
  validateIdentityFields,
} from '../identity';

describe('identity helpers', () => {
  it('masks a full PAN to ABXXXXXX4F form', () => {
    expect(maskPan('RFWPS4835H')).toBe('RFXXXXXX5H');
    expect(isFullPan('RFWPS4835H')).toBe(true);
  });

  it('passes through an already-masked PAN', () => {
    expect(maskPan('ABXXXXXX1F')).toBe('ABXXXXXX1F');
  });

  it('normalizes full PAN format', () => {
    expect(normalizePan('rfwps4835h')).toBe('RFWPS4835H');
    expect(normalizePan('BAD')).toBeNull();
    expect(normalizePan('123456789012')).toBeNull();
  });

  it('validates IFSC AAAA0XXXXXX', () => {
    expect(normalizeIfsc('hdfc0001234')).toBe('HDFC0001234');
    expect(isValidIfsc('HDFC0001234')).toBe(true);
    expect(isValidIfsc('HDFC1001234')).toBe(false);
    expect(isValidIfsc('HD1C0001234')).toBe(false);
  });

  it('rejects Aadhaar-shaped identity input', () => {
    expect(rejectAadhaarShaped('123456789012', 'PAN')).toMatch(/Aadhaar/);
    expect(rejectAadhaarShaped('RFWPS4835H', 'PAN')).toBeNull();
    const result = validateIdentityFields({ pan: '123456789012' });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => /Aadhaar/i.test(e))).toBe(true);
  });

  it('validates bank account length 9–18 digits', () => {
    expect(isValidBankAccount('12345678')).toBe(false);
    expect(isValidBankAccount('123456789')).toBe(true);
    expect(isValidBankAccount('123456789012345678')).toBe(true);
    expect(isValidBankAccount('1234567890123456789')).toBe(false);
  });

  it('normalizes bank account and derives last 4', () => {
    expect(normalizeBankAccountNumber('12 3456 7890 12')).toBe('123456789012');
    expect(bankLast4FromAccount('123456789012')).toBe('9012');
  });

  it('formats display preferring full account', () => {
    expect(formatBankAccountDisplay('123456789012', '9012')).toBe('123456789012');
    expect(formatBankAccountDisplay('', '9012')).toBe('····9012');
    expect(formatBankAccountDisplay('', '')).toBe('—');
  });

  it('masks bank account for Final / internal slips', () => {
    expect(maskBankAccountForInternal('123456789012', '9012')).toBe('····9012');
    expect(maskBankAccountForInternal('', '9012')).toBe('····9012');
    expect(maskBankAccountForInternal('', '')).toBe('—');
  });

  it('validateIdentityFields normalizes pan + ifsc together', () => {
    const result = validateIdentityFields({
      pan: 'rfwps4835h',
      bankAccount: '50100123456789',
      ifsc: 'hdfc0001234',
      bankName: 'HDFC Bank',
    });
    expect(result.ok).toBe(true);
    expect(result.pan).toBe('RFWPS4835H');
    expect(result.panMasked).toBe('RFXXXXXX5H');
    expect(result.ifsc).toBe('HDFC0001234');
    expect(result.bankAccount).toBe('50100123456789');
  });

  it('accepts and repairs legacy 5-X masked PAN so roster save is not blocked', () => {
    const result = validateIdentityFields({ pan: 'RFXXXXX5H' });
    expect(result.ok).toBe(true);
    expect(result.pan).toBe('');
    expect(result.panMasked).toBe('RFXXXXXX5H');
  });

  it('accepts standard masked PAN without requiring the full value', () => {
    const result = validateIdentityFields({ pan: 'DLXXXXXX9H' });
    expect(result.ok).toBe(true);
    expect(result.pan).toBe('');
    expect(result.panMasked).toBe('DLXXXXXX9H');
  });
});
