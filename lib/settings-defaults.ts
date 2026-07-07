import type { EntityCode, EntityInfo, Settings } from '@/lib/types';

const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];

/** Default payroll settings and entity branding used on first run. */
export const SEED_SETTINGS: Settings = {
  paydayDayOfMonth: 5,
  payrollContact: 'payroll@portfolix.tech',
  entities: {
    PX: {
      name: 'Portfolix Enterprise Pvt Ltd',
      legalLine: '',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
      logoDataUrl: null,
    },
    PB: {
      name: 'Portfolio Builders',
      legalLine: 'A unit of Portfolix Enterprise Pvt Ltd',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
      logoDataUrl: null,
    },
    PT: {
      name: 'Portfolix.tech',
      legalLine: 'A unit of Portfolix Enterprise Pvt Ltd',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
      logoDataUrl: null,
    },
    PH: {
      name: 'Portfolix Hub',
      legalLine: 'A unit of Portfolix Enterprise Pvt Ltd',
      addressLines: ['Portfolix House, 2nd Floor', 'Sector 62, Noida, UP 201309, India'],
      contact: 'payroll@portfolix.tech',
      logoDataUrl: null,
    },
  },
};

function mergeEntityBranding(
  stored: Partial<Record<EntityCode, Partial<EntityInfo>>> | null | undefined,
  defaults: Record<EntityCode, EntityInfo>,
): Record<EntityCode, EntityInfo> {
  const merged = { ...defaults };
  if (!stored) return merged;

  for (const code of ENTITY_CODES) {
    const patch = stored[code];
    if (patch) {
      merged[code] = { ...merged[code], ...patch };
    }
  }
  return merged;
}

/** Merges stored DB values over SEED_SETTINGS so missing keys keep their defaults. */
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  if (!stored) return SEED_SETTINGS;

  return {
    paydayDayOfMonth: stored.paydayDayOfMonth ?? SEED_SETTINGS.paydayDayOfMonth,
    payrollContact: stored.payrollContact ?? SEED_SETTINGS.payrollContact,
    entities: mergeEntityBranding(stored.entities, SEED_SETTINGS.entities),
  };
}
