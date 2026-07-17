import {
  COMPANY_ENTITIES,
  PAYROLL_CONTACT,
} from '@/lib/constants/company';
import type { EntityCode, EntityInfo, Settings } from '@/lib/types';

const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];

/** Obvious placeholder for fields that must be confirmed in Settings (CIN, assets). */
export const SETTINGS_PLACEHOLDER = 'SET-IN-SETTINGS';

const ENTITY_COMPANY_MAP: Record<EntityCode, (typeof COMPANY_ENTITIES)[number]> = {
  PX: COMPANY_ENTITIES[0],
  PT: COMPANY_ENTITIES[1],
  PB: COMPANY_ENTITIES[2],
  PH: COMPANY_ENTITIES[3],
};

function addressLinesFrom(address: string): string[] {
  return address
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildEntity(code: EntityCode): EntityInfo {
  const company = ENTITY_COMPANY_MAP[code];
  const addressLines = addressLinesFrom(company.address);
  return {
    name: company.displayName,
    legalLine: code === 'PX' ? '' : company.legalLine,
    addressLines,
    contact: PAYROLL_CONTACT,
    logoDataUrl: null,
    cin: SETTINGS_PLACEHOLDER,
    registeredAddress: addressLines.join(', '),
    phone: PAYROLL_CONTACT,
    payrollEmail: 'payroll@portfolix.tech',
    signatoryName: 'Authorized Signatory',
    signatoryDesignation: 'HR & Payroll',
    signatureAssetPath: null,
    sealAssetPath: null,
  };
}

/** Default payroll settings and entity branding used on first run. */
export const SEED_SETTINGS: Settings = {
  paydayDayOfMonth: 5,
  payrollContact: 'payroll@portfolix.tech',
  reviewDeadlineTime: '6:00 PM',
  ptDeductionMonths: [8, 2],
  defaultPtHalfYearly: 0,
  authorizedSignatoryName: 'Authorized Signatory',
  authorizedSignatoryTitle: 'HR & Payroll',
  bankVerificationEnabledByDefault: false,
  entities: {
    PX: buildEntity('PX'),
    PB: buildEntity('PB'),
    PT: buildEntity('PT'),
    PH: buildEntity('PH'),
  },
};

function normalizePtMonths(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...SEED_SETTINGS.ptDeductionMonths];
  const months = raw
    .map((m) => (typeof m === 'number' ? m : Number(m)))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  return months.length > 0 ? [...new Set(months)].sort((a, b) => a - b) : [...SEED_SETTINGS.ptDeductionMonths];
}

function coalesceText(stored: string | undefined, fallback: string): string {
  const v = (stored ?? '').trim();
  if (v === '' || v === SETTINGS_PLACEHOLDER) return fallback;
  return v;
}

function coalesceAddressLines(stored: string[] | undefined, fallback: string[]): string[] {
  if (!stored || stored.length === 0) return fallback;
  if (stored.length === 1 && isSettingsPlaceholder(stored[0])) return fallback;
  return stored;
}

function mergeEntityBranding(
  stored: Partial<Record<EntityCode, Partial<EntityInfo> & { contactPhone?: string }>> | null | undefined,
  defaults: Record<EntityCode, EntityInfo>,
): Record<EntityCode, EntityInfo> {
  const merged = { ...defaults };
  if (!stored) return merged;

  for (const code of ENTITY_CODES) {
    const patch = stored[code];
    if (patch) {
      const { contactPhone, ...rest } = patch;
      merged[code] = {
        ...merged[code],
        ...rest,
        name: coalesceText(patch.name, merged[code].name),
        legalLine: patch.legalLine === undefined ? merged[code].legalLine : patch.legalLine,
        addressLines: coalesceAddressLines(patch.addressLines, merged[code].addressLines),
        contact: coalesceText(patch.contact, merged[code].contact),
        cin: coalesceText(patch.cin, merged[code].cin),
        registeredAddress: coalesceText(patch.registeredAddress, merged[code].registeredAddress),
        phone: coalesceText(patch.phone ?? contactPhone, merged[code].phone),
        payrollEmail: coalesceText(patch.payrollEmail, merged[code].payrollEmail),
        signatoryName: coalesceText(patch.signatoryName, merged[code].signatoryName),
        signatoryDesignation: coalesceText(
          patch.signatoryDesignation,
          merged[code].signatoryDesignation,
        ),
        signatureAssetPath:
          patch.signatureAssetPath === undefined
            ? merged[code].signatureAssetPath
            : patch.signatureAssetPath,
        sealAssetPath:
          patch.sealAssetPath === undefined ? merged[code].sealAssetPath : patch.sealAssetPath,
      };
    }
  }
  return merged;
}

/** Merges stored DB values over SEED_SETTINGS so missing keys keep their defaults. */
export function mergeSettings(stored: Partial<Settings> | null | undefined): Settings {
  if (!stored) return structuredClone(SEED_SETTINGS);

  return {
    paydayDayOfMonth: stored.paydayDayOfMonth ?? SEED_SETTINGS.paydayDayOfMonth,
    payrollContact: coalesceText(stored.payrollContact, SEED_SETTINGS.payrollContact),
    reviewDeadlineTime: coalesceText(stored.reviewDeadlineTime, SEED_SETTINGS.reviewDeadlineTime),
    ptDeductionMonths: normalizePtMonths(stored.ptDeductionMonths),
    defaultPtHalfYearly: Math.max(
      0,
      Number.isFinite(Number(stored.defaultPtHalfYearly))
        ? Number(stored.defaultPtHalfYearly)
        : SEED_SETTINGS.defaultPtHalfYearly,
    ),
    authorizedSignatoryName:
      stored.authorizedSignatoryName ?? SEED_SETTINGS.authorizedSignatoryName,
    authorizedSignatoryTitle:
      stored.authorizedSignatoryTitle ?? SEED_SETTINGS.authorizedSignatoryTitle,
    bankVerificationEnabledByDefault:
      stored.bankVerificationEnabledByDefault ??
      SEED_SETTINGS.bankVerificationEnabledByDefault,
    entities: mergeEntityBranding(stored.entities, SEED_SETTINGS.entities),
  };
}

/** True when a settings string is blank or still the placeholder. */
export function isSettingsPlaceholder(value: string | null | undefined): boolean {
  const v = (value ?? '').trim();
  return v === '' || v === SETTINGS_PLACEHOLDER;
}

/**
 * Generic signatory names that indicate the settings have not been personalized.
 * Any entity whose signatoryName matches one of these is treated as incomplete.
 */
const GENERIC_SIGNATORY_NAMES = new Set([
  'authorized signatory',
  'authorised signatory',
  'hr & payroll',
  'payroll',
  'admin',
]);

/** True when signatoryName is a known generic placeholder (case-insensitive). */
export function isGenericSignatoryName(name: string | null | undefined): boolean {
  if (!name) return true;
  return GENERIC_SIGNATORY_NAMES.has(name.trim().toLowerCase());
}

/**
 * Returns a human-readable reason listing missing company/signatory fields,
 * or null when the entity is complete enough to generate a bank copy.
 * Fail-closed: missing signatureBytes/sealBytes at build time → reject.
 * Generic seed names (e.g. "Authorized Signatory") are treated as incomplete.
 */
export function signatoryIncompleteReason(entity: EntityInfo): string | null {
  const missing: string[] = [];
  if (isSettingsPlaceholder(entity.name)) missing.push('legal name');
  if (isSettingsPlaceholder(entity.cin)) missing.push('CIN');
  if (isSettingsPlaceholder(entity.registeredAddress)) missing.push('registered address');
  if (isSettingsPlaceholder(entity.phone)) missing.push('phone');
  if (isSettingsPlaceholder(entity.payrollEmail)) missing.push('payroll email');
  if (isSettingsPlaceholder(entity.signatoryName) || isGenericSignatoryName(entity.signatoryName)) {
    missing.push('signatory name (real name required — generic defaults not accepted)');
  }
  if (isSettingsPlaceholder(entity.signatoryDesignation)) missing.push('signatory designation');
  if (!entity.signatureAssetPath?.trim()) missing.push('signature image');
  if (!entity.sealAssetPath?.trim()) missing.push('company seal image');
  if (missing.length === 0) return null;
  return `Complete Company & Signatory settings first (${missing.join(', ')}).`;
}

/**
 * Block bank-copy generation if any rendered entity field is empty or a placeholder.
 * Returns an error string, or null when all fields are acceptable.
 * Checks: name, CIN, registered address, phone, payroll email.
 * Does NOT recheck signatory — use signatoryIncompleteReason for that.
 */
export function assertNoSettingsPlaceholders(entity: EntityInfo): string | null {
  const badFields: string[] = [];
  if (isSettingsPlaceholder(entity.name)) badFields.push('company legal name');
  if (isSettingsPlaceholder(entity.cin)) badFields.push('CIN');
  if (isSettingsPlaceholder(entity.registeredAddress)) badFields.push('registered address');
  if (isSettingsPlaceholder(entity.phone)) badFields.push('phone number');
  if (isSettingsPlaceholder(entity.payrollEmail)) badFields.push('payroll email');
  if (badFields.length === 0) return null;
  return `Bank-copy blocked: company settings contain placeholder values (${badFields.join(', ')}). Update Settings before generating an authorised slip.`;
}
