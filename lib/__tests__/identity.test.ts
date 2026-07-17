import { describe, expect, it } from 'vitest';
import {
  bankLast4FromAccount,
  formatBankAccountDisplay,
  isFullPan,
  maskPan,
  normalizeBankAccountNumber,
} from '../identity';

describe('identity helpers', () => {
  it('masks a full PAN to ABXXXXXX4F form', () => {
    expect(maskPan('RFWPS4835H')).toBe('RFXXXXXX5H');
    expect(isFullPan('RFWPS4835H')).toBe(true);
  });

  it('passes through an already-masked PAN', () => {
    expect(maskPan('ABXXXXXX1F')).toBe('ABXXXXXX1F');
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
});
