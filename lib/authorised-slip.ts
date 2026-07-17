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
 * Select exactly ONE canonical final per employee-month.
 *
 * Priority (highest first):
 *   1. activeFinal === true (explicit DB flag from active_final column)
 *   2. workflowStatus not 'SUPERSEDED' (non-superseded latest)
 *   3. Latest generatedAt (fallback for pre-flag snapshots)
 *
 * This ensures finalize-then-supersede-twice → YTD counts ONE month, not three.
 */
function selectBestFinal(candidates: SlipSnapshot[]): SlipSnapshot | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  // Prefer explicit activeFinal flag.
  const actives = candidates.filter((s) => s.activeFinal === true);
  if (actives.length === 1) return actives[0];
  if (actives.length > 1) {
    // Multiple actives (should not happen) — latest generatedAt wins.
    return actives.reduce((best, s) => (s.generatedAt > best.generatedAt ? s : best));
  }

  // No activeFinal flag — prefer non-superseded.
  const nonSuperseded = candidates.filter(
    (s) => (s.workflowStatus ?? '').toUpperCase() !== 'SUPERSEDED',
  );
  const pool = nonSuperseded.length > 0 ? nonSuperseded : candidates;
  return pool.reduce((best, s) => (s.generatedAt > best.generatedAt ? s : best));
}

/**
 * Sum this employee's FINAL slip snapshots for the Indian FY up to and
 * including `throughMonthYear`, per Authorised Slip line item.
 * Deterministic; derived from immutable snapshots only.
 * Missing tds/pt on old finals → 0.
 * Exactly ONE final per month (see selectBestFinal).
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
    components: {},
    netPay: 0,
  };

  const relevant = slips.filter(
    (s) =>
      s.status === 'final' &&
      s.employeeId === employeeId &&
      s.monthYear >= start &&
      s.monthYear <= end,
  );

  // Group by month, then select exactly one canonical final per month.
  const byMonth = new Map<string, SlipSnapshot[]>();
  for (const s of relevant) {
    const group = byMonth.get(s.monthYear) ?? [];
    group.push(s);
    byMonth.set(s.monthYear, group);
  }

  let acc = { ...zero, components: {} as Record<string, number> };
  for (const candidates of byMonth.values()) {
    const s = selectBestFinal(candidates);
    if (!s) continue;
    const { tds, pt } = slipStatutoryDeductions(s.computed, s.inputs);
    const basic = s.inputs.baseSalary;
    const fixedAllowance = s.inputs.fixedAllowance;
    const variablePaid = s.computed.variablePaid;
    const lopDeduction = s.computed.lopDeduction;
    const otherDeductions = s.computed.otherDeductions;
    const grossEarnings = basic + fixedAllowance + variablePaid;
    const totalDeductions = lopDeduction + pt + tds + otherDeductions;
    const netPay = grossEarnings - totalDeductions;

    // Per-component YTD: attribute named components or fall back to "Basic".
    const components = { ...acc.components };
    if (s.employee.salaryComponents && s.employee.salaryComponents.length > 0) {
      for (const comp of s.employee.salaryComponents) {
        components[comp.label] = (components[comp.label] ?? 0) + comp.amount;
      }
    } else {
      components['Basic'] = (components['Basic'] ?? 0) + basic;
    }

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
      netPay: (acc.netPay ?? 0) + netPay,
      components,
    };
  }

  const componentYtd: Record<string, number> = {};
  for (const [k, v] of Object.entries(acc.components ?? {})) {
    componentYtd[k] = roundMoney(v);
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
    netPay: roundMoney(acc.netPay ?? 0),
    components: Object.keys(componentYtd).length > 0 ? componentYtd : undefined,
  };
}
