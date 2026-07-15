/**
 * Authorised Slip helpers — YTD from FINAL snapshots only, never recomputed.
 */

import { parse } from 'date-fns';
import { roundMoney } from './payroll-calc';
import type { AuthorisedSlipYtd, SlipSnapshot } from './types';

/** Indian FY for a slip month: Apr–Mar. Returns { start: 'YYYY-04', end: monthYear }. */
export function indianFyMonthRange(monthYear: string): { start: string; end: string } {
  const d = parse(monthYear, 'yyyy-MM', new Date());
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1–12
  const fyStartYear = month >= 4 ? year : year - 1;
  return { start: `${fyStartYear}-04`, end: monthYear };
}

function slipTds(s: SlipSnapshot): number {
  return s.computed.tdsMonthly ?? s.inputs.tdsMonthly ?? 0;
}

function slipPt(s: SlipSnapshot): number {
  return s.computed.ptThisMonth ?? s.inputs.ptThisMonth ?? 0;
}

/**
 * Sum this employee's FINAL slip snapshots for the Indian FY up to and
 * including `throughMonthYear`, per Authorised Slip line item.
 * Deterministic; derived from immutable snapshots only.
 */
export function computeAuthorisedYtd(
  slips: SlipSnapshot[],
  employeeId: string,
  throughMonthYear: string,
): AuthorisedSlipYtd {
  const { start, end } = indianFyMonthRange(throughMonthYear);

  const zero: AuthorisedSlipYtd = {
    basic: 0,
    fixedAllowance: 0,
    variablePaid: 0,
    grossEarnings: 0,
    lopDeduction: 0,
    professionalTax: 0,
    tds: 0,
    otherDeductions: 0,
    totalDeductions: 0,
  };

  const relevant = slips.filter(
    (s) =>
      s.status === 'final' &&
      s.employeeId === employeeId &&
      s.monthYear >= start &&
      s.monthYear <= end,
  );

  // One FINAL per month — if superseded, use the latest generatedAt.
  const byMonth = new Map<string, SlipSnapshot>();
  for (const s of relevant) {
    const prev = byMonth.get(s.monthYear);
    if (!prev || s.generatedAt > prev.generatedAt) byMonth.set(s.monthYear, s);
  }

  let acc = { ...zero };
  for (const s of byMonth.values()) {
    const basic = s.inputs.baseSalary;
    const fixedAllowance = s.inputs.fixedAllowance;
    const variablePaid = s.computed.variablePaid;
    const lopDeduction = s.computed.lopDeduction;
    const professionalTax = slipPt(s);
    const tds = slipTds(s);
    const otherDeductions = s.computed.otherDeductions;
    const grossEarnings = basic + fixedAllowance + variablePaid;
    const totalDeductions = lopDeduction + professionalTax + tds + otherDeductions;

    acc = {
      basic: acc.basic + basic,
      fixedAllowance: acc.fixedAllowance + fixedAllowance,
      variablePaid: acc.variablePaid + variablePaid,
      grossEarnings: acc.grossEarnings + grossEarnings,
      lopDeduction: acc.lopDeduction + lopDeduction,
      professionalTax: acc.professionalTax + professionalTax,
      tds: acc.tds + tds,
      otherDeductions: acc.otherDeductions + otherDeductions,
      totalDeductions: acc.totalDeductions + totalDeductions,
    };
  }

  return {
    basic: roundMoney(acc.basic),
    fixedAllowance: roundMoney(acc.fixedAllowance),
    variablePaid: roundMoney(acc.variablePaid),
    grossEarnings: roundMoney(acc.grossEarnings),
    lopDeduction: roundMoney(acc.lopDeduction),
    professionalTax: roundMoney(acc.professionalTax),
    tds: roundMoney(acc.tds),
    otherDeductions: roundMoney(acc.otherDeductions),
    totalDeductions: roundMoney(acc.totalDeductions),
  };
}
