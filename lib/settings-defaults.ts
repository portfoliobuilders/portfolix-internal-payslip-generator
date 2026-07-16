import type { EntityCode, EntityInfo, Settings } from '@/lib/types';

const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];

/** Obvious placeholder — misspelled hardcoded contacts must never ship. */
export const SETTINGS_PLACEHOLDER = 'SET-IN-SETTINGS';

const EMPTY_SIGNATORY: Pick<
  EntityInfo,
  | 'cin'
  | 'registeredAddress'
  | 'phone'
  | 'payrollEmail'
  | 'signatoryName'
  | 'signatoryDesignation'
  | 'signatureAssetPath'
  | 'sealAssetPath'
> = {
  cin: SETTINGS_PLACEHOLDER,
  registeredAddress: SETTINGS_PLACEHOLDER,
  phone: SETTINGS_PLACEHOLDER,
  payrollEmail: SETTINGS_PLACEHOLDER,
  signatoryName: SETTINGS_PLACEHOLDER,
  signatoryDesignation: SETTINGS_PLACEHOLDER,
  signatureAssetPath: null,
  sealAssetPath: null,
};

/** Default payroll settings and entity branding used on first run. */
export const SEED_SETTINGS: Settings = {
  paydayDayOfMonth: 5,
  payrollContact: 'payroll@portfolix.tech',
  authorizedSignatoryName: 'Authorized Signatory',
  authorizedSignatoryTitle: 'HR & Payroll',
  bankVerificationEnabledByDefault: false,
  entities: {
    PX: {
      // Legal registered name must be confirmed in companies.legal_name — do not ship a guess.
      name: SETTINGS_PLACEHOLDER,
      legalLine: '',
      addressLines: [SETTINGS_PLACEHOLDER],
      contact: SETTINGS_PLACEHOLDER,
      logoDataUrl: null,
      ...EMPTY_SIGNATORY,
    },
    PB: {
      name: 'Portfolio Builders',
      legalLine: SETTINGS_PLACEHOLDER,
      addressLines: [SETTINGS_PLACEHOLDER],
      contact: SETTINGS_PLACEHOLDER,
      logoDataUrl: null,
      ...EMPTY_SIGNATORY,
    },
    PT: {
      name: 'Portfolix.tech',
      legalLine: SETTINGS_PLACEHOLDER,
      addressLines: [SETTINGS_PLACEHOLDER],
      contact: SETTINGS_PLACEHOLDER,
      logoDataUrl: null,
      ...EMPTY_SIGNATORY,
    },
    PH: {
      name: 'Portfolix Hub',
      legalLine: SETTINGS_PLACEHOLDER,
      addressLines: [SETTINGS_PLACEHOLDER],
      contact: SETTINGS_PLACEHOLDER,
      logoDataUrl: null,
      ...EMPTY_SIGNATORY,
    },
  },
};

function normalizePtMonths(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [...SEED_SETTINGS.ptDeductionMonths];
  const months = raw
    .map((m) => (typeof m === 'number' ? m : Number(m)))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  return months.length > 0 ? [...new Set(months)].sort((a, b) => a - b) : [...SEED_SETTINGS.ptDeductionMonths];
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
        cin: patch.cin?.trim() || merged[code].cin,
        registeredAddress: patch.registeredAddress?.trim() || merged[code].registeredAddress,
        phone: patch.phone?.trim() || contactPhone?.trim() || merged[code].phone,
        payrollEmail: patch.payrollEmail?.trim() || merged[code].payrollEmail,
        signatoryName: patch.signatoryName?.trim() || merged[code].signatoryName,
        signatoryDesignation:
          patch.signatoryDesignation?.trim() || merged[code].signatoryDesignation,
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
    payrollContact: stored.payrollContact ?? SEED_SETTINGS.payrollContact,
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
 * Returns a human-readable reason listing missing company/signatory fields,
 * or null when the entity is complete enough to generate a bank copy.
 */
export function signatoryIncompleteReason(entity: EntityInfo): string | null {
  const missing: string[] = [];
  if (isSettingsPlaceholder(entity.name)) missing.push('legal name');
  if (isSettingsPlaceholder(entity.cin)) missing.push('CIN');
  if (isSettingsPlaceholder(entity.registeredAddress)) missing.push('registered address');
  if (isSettingsPlaceholder(entity.phone)) missing.push('phone');
  if (isSettingsPlaceholder(entity.payrollEmail)) missing.push('payroll email');
  if (isSettingsPlaceholder(entity.signatoryName)) missing.push('signatory name');
  if (isSettingsPlaceholder(entity.signatoryDesignation)) missing.push('signatory designation');
  if (!entity.signatureAssetPath?.trim()) missing.push('signature image');
  if (!entity.sealAssetPath?.trim()) missing.push('company seal image');
  if (missing.length === 0) return null;
  return `Complete Company & Signatory settings first (${missing.join(', ')}).`;
}
