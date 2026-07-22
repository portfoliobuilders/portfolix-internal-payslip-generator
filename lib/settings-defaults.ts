import {
  COMPANY_ENTITIES,
  LEGAL_COMPANY_NAME_CANONICAL,
  PAYROLL_CONTACT,
} from '@/lib/constants/company';
import {
  KERALA_PT_SLABS_SEED,
  validatePtSlabs,
  type PtCollectionMode,
  type PtSlab,
} from '@/lib/payroll-calc';
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
    // Parent legal entity always uses the registered spelling — never alternate.
    name: code === 'PX' ? LEGAL_COMPANY_NAME_CANONICAL : company.displayName,
    legalLine: code === 'PX' ? '' : company.legalLine,
    addressLines,
    contact: PAYROLL_CONTACT,
    logoDataUrl: null,
    cin: SETTINGS_PLACEHOLDER,
    registeredAddress: addressLines.join(', '),
    phone: PAYROLL_CONTACT,
    payrollEmail: 'payroll@portfolixentreprise.com',
    signatoryName: SETTINGS_PLACEHOLDER,
    signatoryDesignation: SETTINGS_PLACEHOLDER,
    signatureAssetPath: null,
    sealAssetPath: null,
    authorisationMode: 'SIGNATURE_AND_SEAL',
    authorityEffectiveFrom: null,
    authorityEffectiveTo: null,
    signatoryActive: true,
  };
}

/** Default payroll settings and entity branding used on first run. */
export const SEED_SETTINGS: Settings = {
  paydayDayOfMonth: 5,
  payrollContact: 'payroll@portfolixentreprise.com',
  reviewDeadlineTime: '6:00 PM',
  ptDeductionMonths: [8, 2],
  // Founder decision: monthly accrual is the default collection mode.
  ptCollectionMode: 'monthly_accrual',
  ptSlabs: KERALA_PT_SLABS_SEED.map((s) => ({ ...s })),
  defaultPtHalfYearly: 0,
  authorizedSignatoryName: SETTINGS_PLACEHOLDER,
  authorizedSignatoryTitle: SETTINGS_PLACEHOLDER,
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

function normalizePtCollectionMode(raw: unknown): PtCollectionMode {
  return raw === 'half_yearly_lump' ? 'half_yearly_lump' : 'monthly_accrual';
}

function normalizePtSlabs(raw: unknown): PtSlab[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return KERALA_PT_SLABS_SEED.map((s) => ({ ...s }));
  }
  const slabs: PtSlab[] = raw.map((row) => {
    const r = row as Partial<PtSlab>;
    return {
      minGross: Number(r.minGross) || 0,
      maxGross: r.maxGross == null ? null : Number(r.maxGross),
      tax: Number(r.tax) || 0,
    };
  });
  // Cap enforcement happens on save; merge still returns stored rows so the
  // UI can show validation errors. If invalid, fall back to seed only when empty.
  return slabs.length > 0 ? slabs : KERALA_PT_SLABS_SEED.map((s) => ({ ...s }));
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
        authorisationMode: patch.authorisationMode ?? merged[code].authorisationMode,
        authorityEffectiveFrom:
          patch.authorityEffectiveFrom === undefined
            ? merged[code].authorityEffectiveFrom
            : patch.authorityEffectiveFrom,
        authorityEffectiveTo:
          patch.authorityEffectiveTo === undefined
            ? merged[code].authorityEffectiveTo
            : patch.authorityEffectiveTo,
        signatoryActive:
          patch.signatoryActive === undefined
            ? merged[code].signatoryActive
            : patch.signatoryActive,
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
    ptCollectionMode: normalizePtCollectionMode(stored.ptCollectionMode),
    ptSlabs: normalizePtSlabs(stored.ptSlabs),
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

/** Reject settings whose PT slabs breach Article 276 caps. */
export function assertPtSlabsAllowed(slabs: readonly PtSlab[]): void {
  const err = validatePtSlabs(slabs);
  if (err) throw new Error(err);
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
export function signatoryIncompleteReason(
  entity: EntityInfo,
  issueDate?: string | null,
): string | null {
  if (entity.signatoryActive === false) {
    return 'Authorised salary slip cannot be issued because the authorised signatory configuration is incomplete.';
  }

  const mode = entity.authorisationMode ?? 'SIGNATURE_AND_SEAL';
  const missing: string[] = [];
  if (isSettingsPlaceholder(entity.name)) missing.push('legal name');
  if (isSettingsPlaceholder(entity.cin)) missing.push('CIN');
  if (isSettingsPlaceholder(entity.registeredAddress)) missing.push('registered address');
  if (isSettingsPlaceholder(entity.phone)) missing.push('phone');
  if (isSettingsPlaceholder(entity.payrollEmail)) missing.push('payroll email');
  if (isSettingsPlaceholder(entity.signatoryName)) missing.push('signatory name');
  if (isSettingsPlaceholder(entity.signatoryDesignation)) missing.push('signatory designation');

  if (mode === 'SIGNATURE_AND_SEAL') {
    if (!entity.signatureAssetPath?.trim()) missing.push('signature image');
    if (!entity.sealAssetPath?.trim()) missing.push('company seal image');
  }

  if (missing.length > 0) {
    return 'Authorised salary slip cannot be issued because the authorised signatory configuration is incomplete.';
  }

  const day = (issueDate ?? new Date().toISOString().slice(0, 10)).slice(0, 10);
  const from = entity.authorityEffectiveFrom?.trim() || null;
  const to = entity.authorityEffectiveTo?.trim() || null;
  if (from && day < from) {
    return 'Authorised salary slip cannot be issued because the authorised signatory configuration is incomplete.';
  }
  if (to && day > to) {
    return 'Authorised salary slip cannot be issued because the authorised signatory configuration is incomplete.';
  }

  if (mode === 'CRYPTOGRAPHIC_DIGITAL_SIGNATURE') {
    return 'Cryptographic digital signature mode is not configured for issuance yet.';
  }

  return null;
}
