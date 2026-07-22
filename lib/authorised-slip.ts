/**
 * Authorised Slip helpers — YTD from FINAL snapshots only, never recomputed.
 */

import { parse } from 'date-fns';
import { roundMoney, slipStatutoryDeductions } from './payroll-calc';
import type { AuthorisedSlipYtd, SlipSnapshot } from './types';

/** Indian FY for a slip month: Apr–Mar. Returns { start: 'YYYY-04', end: monthYear }. */
export function indianFyMonthRange(monthYear: string): { start: string; end: string } {
  const d = parse(monthYear, 'yyyy-MM', new Date());
  const year = d.getFullYear();
  const month = d.getMonth() + 1; // 1–12
  const fyStartYear = month >= 4 ? year : year - 1;
  return { start: `${fyStartYear}-04`, end: monthYear };
}

/**
 * Sum this employee's ACTIVE FINAL slip snapshots for the Indian FY up to and
 * including `throughMonthYear`, per Authorised Slip line item.
 * Deterministic; derived from immutable snapshots only.
 * Superseded / voided / draft contribute nothing. Missing tds/pt on old finals → 0.
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

  // Active finals only (status === 'final'). One per month via generatedAt tie-break.
  const byMonth = new Map<string, SlipSnapshot>();
  for (const s of slips) {
    if (s.status !== 'final') continue;
    if (s.employeeId !== employeeId) continue;
    if (s.monthYear < start || s.monthYear > end) continue;
    const prev = byMonth.get(s.monthYear);
    if (!prev || s.generatedAt > prev.generatedAt) byMonth.set(s.monthYear, s);
  }

  let acc = { ...zero };
  for (const s of byMonth.values()) {
    const { tds, pt } = slipStatutoryDeductions(s.computed, s.inputs);
    const basic = s.inputs.baseSalary;
    const fixedAllowance = s.inputs.fixedAllowance;
    const variablePaid = s.computed.variablePaid;
    const lopDeduction = s.computed.lopDeduction;
    const otherDeductions = s.computed.otherDeductions;
    const grossEarnings = basic + fixedAllowance + variablePaid;
    const totalDeductions = lopDeduction + pt + tds + otherDeductions;

    acc = {
      basic: acc.basic + basic,
      fixedAllowance: acc.fixedAllowance + fixedAllowance,
      variablePaid: acc.variablePaid + variablePaid,
      grossEarnings: acc.grossEarnings + grossEarnings,
      lopDeduction: acc.lopDeduction + lopDeduction,
      professionalTax: acc.professionalTax + pt,
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
