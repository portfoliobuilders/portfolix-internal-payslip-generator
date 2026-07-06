import { describe, expect, it } from 'vitest';
import {
  FIXED_DIVISOR,
  MINUTES_PER_DAY,
  computeDeferral,
  computeFlexBank,
  computePayroll,
  floorToHalfDay,
  roundMoney,
  validateVariablePaid,
} from '../payroll-calc';
import { amountInWords, integerInWords } from '../amount-in-words';

const BASE_INPUT = {
  baseSalary: 20000,
  flexBankBalance: 0,
  flexMinutesEarned: 0,
  totalLateMinutes: 0,
  absentDays: 0,
  halfDays: 0,
  fixedAllowance: 0,
  otherDeductions: 0,
  variableEarned: 0,
  variablePaid: 0,
  deferredOpening: 0,
  committedPayoutDate: null,
};

describe('the 25-day constant', () => {
  it('is exactly 25', () => {
    expect(FIXED_DIVISOR).toBe(25);
  });

  it('perDayRate = baseSalary / 25', () => {
    expect(computePayroll(BASE_INPUT).perDayRate).toBe(800);
    expect(computePayroll({ ...BASE_INPUT, baseSalary: 50000 }).perDayRate).toBe(2000);
  });
});

describe('flex-bank order of operations', () => {
  it('flexAvailable = balance + earned', () => {
    const r = computeFlexBank({ flexBankBalance: 100, flexMinutesEarned: 50, totalLateMinutes: 0 });
    expect(r.flexAvailable).toBe(150);
  });

  it('flex fully absorbs lateness', () => {
    const r = computeFlexBank({ flexBankBalance: 200, flexMinutesEarned: 100, totalLateMinutes: 250 });
    expect(r.unpaidLateMinutes).toBe(0);
    expect(r.lopFromLateness).toBe(0);
    expect(r.newFlexBalance).toBe(50);
  });

  it('unpaid lateness converts to LOP floored to 0.5 day (favors employee)', () => {
    // 500 unpaid minutes = 1.0417 days → 1.0 LOP
    const r = computeFlexBank({ flexBankBalance: 0, flexMinutesEarned: 0, totalLateMinutes: 500 });
    expect(r.unpaidLateMinutes).toBe(500);
    expect(r.lopFromLateness).toBe(1);
    expect(r.newFlexBalance).toBe(0);
  });

  it('239 unpaid minutes (0.498 days) charges zero LOP', () => {
    const r = computeFlexBank({ flexBankBalance: 0, flexMinutesEarned: 0, totalLateMinutes: 239 });
    expect(r.lopFromLateness).toBe(0);
  });

  it('240 unpaid minutes charges exactly 0.5 LOP', () => {
    const r = computeFlexBank({ flexBankBalance: 0, flexMinutesEarned: 0, totalLateMinutes: 240 });
    expect(r.lopFromLateness).toBe(0.5);
  });

  it('never lets the flex balance go negative', () => {
    const r = computeFlexBank({ flexBankBalance: 60, flexMinutesEarned: 0, totalLateMinutes: 600 });
    expect(r.newFlexBalance).toBe(0);
  });

  it('flexOffsetMinutes reports what the bank absorbed', () => {
    const r = computeFlexBank({ flexBankBalance: 100, flexMinutesEarned: 0, totalLateMinutes: 300 });
    expect(r.flexOffsetMinutes).toBe(100);
    expect(r.unpaidLateMinutes).toBe(200);
  });
});

describe('floorToHalfDay', () => {
  it.each([
    [0, 0],
    [0.4, 0],
    [0.5, 0.5],
    [0.9, 0.5],
    [1.0, 1.0],
    [1.49, 1.0],
    [1.5, 1.5],
  ])('floors %f to %f', (input, expected) => {
    expect(floorToHalfDay(input)).toBe(expected);
  });
});

describe('LOP composition (rule 4)', () => {
  it('lopDays = absent + 0.5×half + lateness LOP', () => {
    const r = computePayroll({
      ...BASE_INPUT,
      absentDays: 1,
      halfDays: 1,
      totalLateMinutes: 240, // 0.5 LOP
    });
    expect(r.lopDays).toBe(2);
    expect(r.lopDeduction).toBe(1600); // 2 × 800
  });
});

describe('net pay (rule 5)', () => {
  it('net = (base + allowance) − (lop×rate + other) + variablePaid', () => {
    const r = computePayroll({
      ...BASE_INPUT,
      baseSalary: 20000,
      fixedAllowance: 2000,
      absentDays: 1.5,
      otherDeductions: 300,
      variableEarned: 5000,
      variablePaid: 4000,
    });
    // (20000 + 2000) − (1.5×800 + 300) + 4000 = 22000 − 1500 + 4000 = 24500
    expect(r.netPay).toBe(24500);
    expect(r.totalDeductions).toBe(1500);
    expect(r.grossFixed).toBe(22000);
  });

  it('rounds exactly once at the end', () => {
    // baseSalary 10000 → rate 400; 1/3-ish LOP via odd salary
    const r = computePayroll({ ...BASE_INPUT, baseSalary: 10001, absentDays: 1 });
    // rate exact = 400.04; net = 10001 − 400.04 = 9600.96
    expect(r.netPay).toBe(9600.96);
    expect(r.perDayRate).toBe(400.04);
  });
});

describe('deferral (rule 6)', () => {
  it('deferredClosing = max(opening + earned − paid, 0)', () => {
    expect(computeDeferral({ deferredOpening: 1000, variableEarned: 5000, variablePaid: 4000 }).deferredClosing).toBe(2000);
    expect(computeDeferral({ deferredOpening: 0, variableEarned: 1000, variablePaid: 1000 }).deferredClosing).toBe(0);
    expect(computeDeferral({ deferredOpening: 0, variableEarned: 0, variablePaid: 0 }).deferredClosing).toBe(0);
  });

  it('variablePaid may draw down the opening balance', () => {
    expect(validateVariablePaid({ deferredOpening: 2000, variableEarned: 1000, variablePaid: 3000 })).toBeNull();
  });

  it('variablePaid above earned + opening is a violation', () => {
    expect(validateVariablePaid({ deferredOpening: 2000, variableEarned: 1000, variablePaid: 3001 })).toMatch(/cannot exceed/);
  });
});

describe('full-scenario integration', () => {
  it('matches a hand-computed slip', () => {
    const r = computePayroll({
      baseSalary: 25000,
      flexBankBalance: 120,
      flexMinutesEarned: 60,
      totalLateMinutes: 450, // available 180 → unpaid 270 → 0.5 LOP
      absentDays: 2,
      halfDays: 1,
      fixedAllowance: 3000,
      otherDeductions: 500,
      variableEarned: 6000,
      variablePaid: 5000,
      deferredOpening: 1500,
      committedPayoutDate: '2026-08-05',
    });
    expect(r.perDayRate).toBe(1000);
    expect(r.lopFromLateness).toBe(0.5);
    expect(r.lopDays).toBe(3); // 2 + 0.5 + 0.5
    expect(r.lopDeduction).toBe(3000);
    expect(r.totalDeductions).toBe(3500);
    expect(r.grossFixed).toBe(28000);
    expect(r.deferredClosing).toBe(2500); // 1500 + 6000 − 5000
    expect(r.netPay).toBe(29500); // 28000 − 3500 + 5000
    expect(r.newFlexBalance).toBe(0);
    expect(r.netPayWords).toBe('Rupees Twenty Nine Thousand Five Hundred Only');
  });
});

describe('amount in words (Indian system)', () => {
  it.each([
    [0, 'Rupees Zero Only'],
    [1, 'Rupees One Only'],
    [19, 'Rupees Nineteen Only'],
    [42, 'Rupees Forty Two Only'],
    [100, 'Rupees One Hundred Only'],
    [999, 'Rupees Nine Hundred Ninety Nine Only'],
    [1000, 'Rupees One Thousand Only'],
    [100000, 'Rupees One Lakh Only'],
    [105350.5, 'Rupees One Lakh Five Thousand Three Hundred Fifty and Paise Fifty Only'],
    [10000000, 'Rupees One Crore Only'],
    [12345678.9, 'Rupees One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight and Paise Ninety Only'],
    [0.05, 'Rupees Zero and Paise Five Only'],
  ])('formats %s', (amount, expected) => {
    expect(amountInWords(amount)).toBe(expected);
  });

  it('handles crore counts above 99', () => {
    expect(integerInWords(1230000000)).toBe('One Hundred Twenty Three Crore');
  });
});

describe('roundMoney', () => {
  it('rounds classic float traps correctly', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(2.675)).toBe(2.68);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});
