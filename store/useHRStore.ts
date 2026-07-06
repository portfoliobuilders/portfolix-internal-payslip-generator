'use client';

/**
 * Zustand persistent store — the single source of truth for settings,
 * employees, and immutable slip history. Persists to localStorage under
 * `portfolix-slipgen-v1`. Salary data never leaves the browser.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Employee,
  EntityCode,
  EntityInfo,
  FlexLogEntry,
  Settings,
  SlipSnapshot,
} from '@/lib/types';

export const STORAGE_KEY = 'portfolix-slipgen-v1';
export const SCHEMA_VERSION = 1;

export const SEED_SETTINGS: Settings = {
  paydayDayOfMonth: 5,
  payrollContact: 'payroll@portfolix.tech',
  entities: {
    PX: {
      name: 'Portfolix Enterprise Pvt Ltd',
      legalLine: '',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
    },
    PB: {
      name: 'Portfolio Builders',
      legalLine: 'A unit of Portfolix Enterprise Pvt Ltd',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
    },
    PT: {
      name: 'Portfolix.tech',
      legalLine: 'A unit of Portfolix Enterprise Pvt Ltd',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
    },
    PH: {
      name: 'Portfolix Hub',
      legalLine: 'A unit of Portfolix Enterprise Pvt Ltd',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
    },
  },
};

interface BackupFile {
  app: 'portfolix-slipgen';
  version: number;
  exportedAt: string;
  settings: Settings;
  employees: Employee[];
  slipHistory: SlipSnapshot[];
}

interface HRState {
  settings: Settings;
  employees: Employee[];
  slipHistory: SlipSnapshot[];

  addEmployee: (employee: Omit<Employee, 'id' | 'flexLog'>) => void;
  updateEmployee: (id: string, patch: Partial<Omit<Employee, 'id' | 'flexLog'>>) => void;
  deleteEmployee: (id: string) => void;
  adjustFlexBank: (id: string, deltaMinutes: number, reason: string) => void;

  /**
   * Appends an immutable FINAL snapshot, commits the employee's new
   * flexBankBalance, and makes this month's deferredClosing the
   * authoritative source of next month's opening. If a FINAL already
   * exists for the same employee + month it is superseded (the caller
   * is responsible for confirming with the user first).
   */
  finalizeSlip: (snapshot: SlipSnapshot, newFlexBalance: number) => void;
  /** Records a DRAFT snapshot in history (no side effects on the employee). */
  recordDraftSlip: (snapshot: SlipSnapshot) => void;

  exportBackup: () => string;
  importBackup: (json: string) => { ok: true } | { ok: false; error: string };

  updateSettings: (patch: Partial<Settings>) => void;
  updateEntity: (code: EntityCode, patch: Partial<EntityInfo>) => void;
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];

/** Structural validation for imported backups. Returns an error string or null. */
function validateBackup(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return 'Backup is not a JSON object.';
  const b = data as Partial<BackupFile>;
  if (b.app !== 'portfolix-slipgen') return 'Not a Portfolix SlipGen backup file.';
  if (typeof b.version !== 'number') return 'Backup is missing a schema version.';
  if (b.version > SCHEMA_VERSION)
    return `Backup schema v${b.version} is newer than this app (v${SCHEMA_VERSION}).`;
  if (typeof b.settings !== 'object' || b.settings === null)
    return 'Backup is missing settings.';
  const s = b.settings as Partial<Settings>;
  if (typeof s.paydayDayOfMonth !== 'number' || typeof s.payrollContact !== 'string')
    return 'Backup settings are malformed.';
  if (typeof s.entities !== 'object' || s.entities === null)
    return 'Backup settings are missing entities.';
  for (const code of ENTITY_CODES) {
    const e = (s.entities as Record<string, unknown>)[code];
    if (typeof e !== 'object' || e === null) return `Backup is missing entity ${code}.`;
  }
  if (!Array.isArray(b.employees)) return 'Backup employees list is malformed.';
  for (const emp of b.employees) {
    if (
      typeof emp !== 'object' ||
      emp === null ||
      typeof emp.id !== 'string' ||
      typeof emp.fullName !== 'string' ||
      typeof emp.baseSalary !== 'number' ||
      !ENTITY_CODES.includes(emp.entityCode) ||
      typeof emp.flexBankBalance !== 'number' ||
      !Array.isArray(emp.flexLog)
    ) {
      return 'One or more employee records are malformed.';
    }
  }
  if (!Array.isArray(b.slipHistory)) return 'Backup slip history is malformed.';
  for (const slip of b.slipHistory) {
    if (
      typeof slip !== 'object' ||
      slip === null ||
      typeof slip.id !== 'string' ||
      typeof slip.employeeId !== 'string' ||
      typeof slip.monthYear !== 'string' ||
      (slip.status !== 'draft' && slip.status !== 'final') ||
      typeof slip.computed !== 'object' ||
      slip.computed === null
    ) {
      return 'One or more slip snapshots are malformed.';
    }
  }
  return null;
}

export const useHRStore = create<HRState>()(
  persist(
    (set, get) => ({
      settings: SEED_SETTINGS,
      employees: [],
      slipHistory: [],

      addEmployee: (employee) =>
        set((state) => ({
          employees: [
            ...state.employees,
            { ...employee, id: generateId(), flexLog: [] },
          ],
        })),

      updateEmployee: (id, patch) =>
        set((state) => ({
          employees: state.employees.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),

      deleteEmployee: (id) =>
        set((state) => ({
          employees: state.employees.filter((e) => e.id !== id),
        })),

      adjustFlexBank: (id, deltaMinutes, reason) =>
        set((state) => ({
          employees: state.employees.map((e) => {
            if (e.id !== id) return e;
            const entry: FlexLogEntry = {
              date: new Date().toISOString(),
              delta: deltaMinutes,
              reason,
            };
            return {
              ...e,
              flexBankBalance: e.flexBankBalance + deltaMinutes,
              flexLog: [...e.flexLog, entry],
            };
          }),
        })),

      finalizeSlip: (snapshot, newFlexBalance) =>
        set((state) => ({
          slipHistory: [...state.slipHistory, { ...snapshot, status: 'final' }],
          employees: state.employees.map((e) => {
            if (e.id !== snapshot.employeeId) return e;
            const entry: FlexLogEntry = {
              date: new Date().toISOString(),
              delta: newFlexBalance - e.flexBankBalance,
              reason: `Payroll finalized for ${snapshot.monthYear}`,
            };
            return {
              ...e,
              flexBankBalance: newFlexBalance,
              flexLog:
                newFlexBalance === e.flexBankBalance ? e.flexLog : [...e.flexLog, entry],
            };
          }),
        })),

      recordDraftSlip: (snapshot) =>
        set((state) => ({
          slipHistory: [...state.slipHistory, { ...snapshot, status: 'draft' }],
        })),

      exportBackup: () => {
        const { settings, employees, slipHistory } = get();
        const backup: BackupFile = {
          app: 'portfolix-slipgen',
          version: SCHEMA_VERSION,
          exportedAt: new Date().toISOString(),
          settings,
          employees,
          slipHistory,
        };
        return JSON.stringify(backup, null, 2);
      },

      importBackup: (json) => {
        let data: unknown;
        try {
          data = JSON.parse(json);
        } catch {
          return { ok: false, error: 'File is not valid JSON.' };
        }
        const error = validateBackup(data);
        if (error) return { ok: false, error };
        const backup = data as BackupFile;
        set({
          settings: backup.settings,
          employees: backup.employees,
          slipHistory: backup.slipHistory,
        });
        return { ok: true };
      },

      updateSettings: (patch) =>
        set((state) => ({ settings: { ...state.settings, ...patch } })),

      updateEntity: (code, patch) =>
        set((state) => ({
          settings: {
            ...state.settings,
            entities: {
              ...state.settings.entities,
              [code]: { ...state.settings.entities[code], ...patch },
            },
          },
        })),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persistedState, version) => {
        // Migration stub: transform older persisted shapes here as the
        // schema evolves (e.g. if (version === 1) { ...add new fields }).
        void version;
        return persistedState as HRState;
      },
    },
  ),
);

/**
 * Most recent FINAL slip for an employee strictly BEFORE the given month —
 * the authoritative source of the deferred-opening chain (rule 7).
 */
export function findPreviousFinalSlip(
  slipHistory: SlipSnapshot[],
  employeeId: string,
  monthYear: string,
): SlipSnapshot | null {
  const candidates = slipHistory
    .filter(
      (s) => s.employeeId === employeeId && s.status === 'final' && s.monthYear < monthYear,
    )
    .sort((a, b) =>
      a.monthYear === b.monthYear
        ? a.generatedAt.localeCompare(b.generatedAt)
        : a.monthYear.localeCompare(b.monthYear),
    );
  return candidates.length > 0 ? candidates[candidates.length - 1] ?? null : null;
}

/** Existing FINAL slip for the same employee + month (supersede check). */
export function findFinalSlipForMonth(
  slipHistory: SlipSnapshot[],
  employeeId: string,
  monthYear: string,
): SlipSnapshot | null {
  const finals = slipHistory
    .filter((s) => s.employeeId === employeeId && s.status === 'final' && s.monthYear === monthYear)
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  return finals.length > 0 ? finals[finals.length - 1] ?? null : null;
}
