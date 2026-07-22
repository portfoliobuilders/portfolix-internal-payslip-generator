/**
 * Document lifecycle helpers — active finals only for aggregations.
 * Final/authorised rows are superseded, voided, or revoked — never hard-deleted.
 */

import type { SlipSnapshot, SlipStatus } from '@/lib/types';

export const ACTIVE_FINAL_STATUS: SlipStatus = 'final';
export const HIDDEN_SLIP_STATUSES: ReadonlySet<SlipStatus> = new Set(['superseded', 'voided']);

/** True when this snapshot is the live FINAL for its employee-month. */
export function isActiveFinal(slip: Pick<SlipSnapshot, 'status'>): boolean {
  return slip.status === 'final';
}

/** Drafts are hard-deletable; finals/authorised are not. */
export function isDraft(slip: Pick<SlipSnapshot, 'status'>): boolean {
  return slip.status === 'draft';
}

/** Hidden from default History / YTD / deferred / ledger / exports. */
export function isHiddenFromDefaultViews(slip: Pick<SlipSnapshot, 'status'>): boolean {
  return slip.status === 'superseded' || slip.status === 'voided';
}

/** Visible in the default History grouping (draft + active final). */
export function isDefaultVisibleSlip(slip: Pick<SlipSnapshot, 'status'>): boolean {
  return slip.status === 'draft' || slip.status === 'final';
}

/**
 * Collapse to one active FINAL per employee-month for aggregations.
 * Ignores draft / superseded / voided entirely.
 */
export function activeFinalsOnly(slips: SlipSnapshot[]): SlipSnapshot[] {
  const byKey = new Map<string, SlipSnapshot>();
  for (const s of slips) {
    if (!isActiveFinal(s)) continue;
    const key = `${s.employeeId}::${s.monthYear}`;
    const prev = byKey.get(key);
    if (!prev || s.generatedAt > prev.generatedAt) byKey.set(key, s);
  }
  return [...byKey.values()];
}

export function groupKey(employeeId: string, monthYear: string): string {
  return `${employeeId}::${monthYear}`;
}

export interface EmployeeMonthGroup {
  key: string;
  employeeId: string;
  monthYear: string;
  employee: SlipSnapshot['employee'];
  draft: SlipSnapshot | null;
  activeFinal: SlipSnapshot | null;
  /** Active issued authorised revision lives on the active final's id (looked up separately). */
  trail: SlipSnapshot[];
}

/**
 * Group slips for History: one row per employee-month.
 * Default: draft + active final; trail holds superseded/voided for expand / filter.
 */
export function groupSlipsByEmployeeMonth(
  slips: SlipSnapshot[],
  options?: { includeHidden?: boolean },
): EmployeeMonthGroup[] {
  const includeHidden = options?.includeHidden === true;
  const map = new Map<string, EmployeeMonthGroup>();

  const sorted = [...slips].sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));

  for (const s of sorted) {
    const key = groupKey(s.employeeId, s.monthYear);
    let group = map.get(key);
    if (!group) {
      group = {
        key,
        employeeId: s.employeeId,
        monthYear: s.monthYear,
        employee: s.employee,
        draft: null,
        activeFinal: null,
        trail: [],
      };
      map.set(key, group);
    }

    if (s.status === 'draft') {
      if (!group.draft || s.generatedAt > group.draft.generatedAt) group.draft = s;
    } else if (s.status === 'final') {
      if (!group.activeFinal || s.generatedAt > group.activeFinal.generatedAt) {
        group.activeFinal = s;
      }
    } else if (includeHidden || isHiddenFromDefaultViews(s)) {
      group.trail.push(s);
    }
  }

  // When not showing hidden, still keep trail empty for expand when includeHidden is false
  // but trail is populated only if caller passes includeHidden or we always attach trail.
  // Always attach trail so expand works; filter only controls whether orphan hidden-only
  // months appear as rows.
  if (!includeHidden) {
    return [...map.values()]
      .filter((g) => g.draft || g.activeFinal)
      .sort((a, b) =>
        a.monthYear === b.monthYear
          ? a.employee.fullName.localeCompare(b.employee.fullName)
          : b.monthYear.localeCompare(a.monthYear),
      );
  }

  return [...map.values()].sort((a, b) =>
    a.monthYear === b.monthYear
      ? a.employee.fullName.localeCompare(b.employee.fullName)
      : b.monthYear.localeCompare(a.monthYear),
  );
}

/** Authorised document number scheme — unique per revision (avoids UNIQUE collisions on supersede). */
export function authorisedDocumentNumber(
  monthYear: string,
  empId: string,
  revisionNumber: number,
): string {
  return `PX-AUTH-${monthYear}-${empId}-R${revisionNumber}`;
}

/**
 * Legacy bank-copy number used before revision-aware PX-AUTH ids.
 * Kept for lookup/supersede of historical rows still stored as ASL-*.
 */
export function legacyAuthorisedDocumentNumber(empId: string, monthYear: string): string {
  const safeEmp = empId.replace(/[^A-Za-z0-9-]/g, '').toUpperCase();
  return `ASL-${safeEmp}-${monthYear}`;
}
