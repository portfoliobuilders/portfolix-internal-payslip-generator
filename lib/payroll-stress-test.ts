/**
 * Payroll auditor stress scenarios — exercises lib/payroll-calc.ts (the
 * single source of truth). The Zustand store persists inputs; all math
 * flows through computePayroll().
 */

import { computePayroll, type PayrollInput, type PayrollResult } from './payroll-calc';

export interface StressExpectation {
  label: string;
  actual: number | string;
  expected: number | string;
  pass: boolean;
}

export interface StressScenario {
  id: string;
  title: string;
  description: string;
  input: PayrollInput;
  /** Key fields the auditor expects — compared with tolerance for floats. */
  checks: Array<{
    field: keyof PayrollResult;
    expected: number;
    label?: string;
  }>;
}

export const STRESS_SCENARIOS: StressScenario[] = [
  {
    id: 'flex-insufficient',
    title: 'Flex bank < late minutes',
    description:
      'flex_bank_balance (60 min) + earned (0) is less than late_minutes (600). Unpaid lateness → 1.0 LOP day (480 min floor). Closing flex balance must be 0.',
    input: {
      baseSalary: 25_000,
      flexBankBalance: 60,
      flexMinutesEarned: 0,
      totalLateMinutes: 600,
      absentDays: 0,
      halfDays: 0,
      fixedAllowance: 0,
      otherDeductions: 0,
      variableEarned: 0,
      variablePaid: 0,
      deferredOpening: 0,
      committedPayoutDate: null,
    },
    checks: [
      { field: 'perDayRate', expected: 1000, label: 'perDayRate = base ÷ 25' },
      { field: 'flexAvailable', expected: 60 },
      { field: 'unpaidLateMinutes', expected: 540 },
      { field: 'lopFromLateness', expected: 1 },
      { field: 'lopDays', expected: 1 },
      { field: 'lopDeduction', expected: 1000 },
      { field: 'newFlexBalance', expected: 0 },
    ],
  },
  {
    id: 'deferred-drawdown',
    title: 'Variable paid > earned (deferred drawdown)',
    description:
      'variable_paid (5,000) exceeds variable_earned (2,000) by drawing 3,000 from deferred_opening (4,000). Closing deferred = 1,000.',
    input: {
      baseSalary: 30_000,
      flexBankBalance: 0,
      flexMinutesEarned: 0,
      totalLateMinutes: 0,
      absentDays: 0,
      halfDays: 0,
      fixedAllowance: 0,
      otherDeductions: 0,
      variableEarned: 2000,
      variablePaid: 5000,
      deferredOpening: 4000,
      committedPayoutDate: '2026-08-05',
    },
    checks: [
      { field: 'perDayRate', expected: 1200, label: 'perDayRate = base ÷ 25' },
      { field: 'variableEarned', expected: 2000 },
      { field: 'variablePaid', expected: 5000 },
      { field: 'deferredOpening', expected: 4000 },
      { field: 'deferredClosing', expected: 1000 },
      { field: 'variableDeferred', expected: 0 },
      { field: 'netPay', expected: 35_000 },
    ],
  },
  {
    id: 'combined-edge',
    title: 'Combined flex shortfall + deferred payout',
    description:
      'Partial flex offset (120 min bank, 360 late → 0.5 LOP) plus variable paid drawing deferred balance.',
    input: {
      baseSalary: 20_000,
      flexBankBalance: 120,
      flexMinutesEarned: 0,
      totalLateMinutes: 360,
      absentDays: 0,
      halfDays: 0,
      fixedAllowance: 1000,
      otherDeductions: 0,
      variableEarned: 3000,
      variablePaid: 4500,
      deferredOpening: 2000,
      committedPayoutDate: '2026-08-05',
    },
    checks: [
      { field: 'perDayRate', expected: 800 },
      { field: 'unpaidLateMinutes', expected: 240 },
      { field: 'lopFromLateness', expected: 0.5 },
      { field: 'lopDeduction', expected: 400 },
      { field: 'deferredClosing', expected: 500 },
      { field: 'newFlexBalance', expected: 0 },
      { field: 'netPay', expected: 25_100 },
    ],
  },
];

function approxEqual(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

export function runStressScenario(scenario: StressScenario): {
  result: PayrollResult;
  expectations: StressExpectation[];
  allPass: boolean;
} {
  const result = computePayroll(scenario.input);
  const expectations: StressExpectation[] = scenario.checks.map(({ field, expected, label }) => {
    const actual = result[field];
    const displayActual = typeof actual === 'number' ? actual : String(actual);
    const pass =
      typeof actual === 'number' && typeof expected === 'number'
        ? approxEqual(actual, expected)
        : actual === expected;
    return {
      label: label ?? String(field),
      actual: displayActual,
      expected,
      pass,
    };
  });
  return { result, expectations, allPass: expectations.every((e) => e.pass) };
}

export function runAllStressTests(): Array<{
  scenario: StressScenario;
  result: PayrollResult;
  expectations: StressExpectation[];
  allPass: boolean;
}> {
  return STRESS_SCENARIOS.map((scenario) => ({ scenario, ...runStressScenario(scenario) }));
}

/** Logs results to the browser console for quick auditor verification. */
export function logStressTestsToConsole(): void {
  const runs = runAllStressTests();
  console.group('[Portfolix SlipGen] Payroll stress tests');
  for (const { scenario, expectations, allPass } of runs) {
    console.group(`${allPass ? '✓' : '✗'} ${scenario.title}`);
    console.log(scenario.description);
    console.table(expectations.map((e) => ({ check: e.label, expected: e.expected, actual: e.actual, pass: e.pass })));
    console.groupEnd();
  }
  console.log(`Summary: ${runs.filter((r) => r.allPass).length}/${runs.length} passed`);
  console.groupEnd();
}
