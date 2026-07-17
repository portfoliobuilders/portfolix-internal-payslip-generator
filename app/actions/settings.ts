'use server';

import { requirePayrollAdmin } from '@/lib/auth';

/**
 * Settings server actions.
 *
 * - company_settings: legacy singleton branding row used by Settings UI
 * - app_settings (id=1, data jsonb): full Settings object including signatory fields
 *
 * Every export is gated by requirePayrollAdmin() (fail closed).
 */

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { mergeSettings, SEED_SETTINGS } from '@/lib/settings-defaults';
import { normalizeAddressText, normalizeLegalName } from '@/lib/company-address';
import type { EntityCode, Settings } from '@/lib/types';
import { createClient } from '@/utils/supabase/server';

export type SettingsActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type ActionResult<T> = SettingsActionResult<T>;

export interface CompanySettingsRecord {
  payday_day: number;
  payroll_contact: string;
  display_name: string;
  legal_line: string;
  address: string;
  logo_url: string | null;
}

const SETTINGS_ROW_ID = 1;
const APP_SETTINGS_ID = 1;
const BRANDING_BUCKET = 'branding';
const BRANDING_PATH = 'company-logo';
const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];

interface AppSettingsRow {
  id: number;
  data: Partial<Settings> | null;
  updated_at: string;
}

function revalidateSettingsViews() {
  revalidatePath('/');
  revalidatePath('/settings');
}

function clampPaydayDay(day: number): number {
  return Math.min(28, Math.max(3, Math.round(day)));
}

function normalizeSettings(settings: Settings): Settings {
  const months = (settings.ptDeductionMonths ?? [])
    .map((m) => Math.round(Number(m)))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);

  const normalizedEntities = { ...settings.entities };
  for (const code of Object.keys(normalizedEntities) as Array<keyof typeof normalizedEntities>) {
    const e = normalizedEntities[code];
    if (e) {
      normalizedEntities[code] = {
        ...e,
        name: normalizeLegalName(e.name),
        registeredAddress: normalizeAddressText(e.registeredAddress),
        addressLines: e.addressLines.map(normalizeAddressText).filter(Boolean),
      };
    }
  }

  return {
    ...settings,
    paydayDayOfMonth: clampPaydayDay(settings.paydayDayOfMonth),
    payrollContact: settings.payrollContact.trim() || SEED_SETTINGS.payrollContact,
    reviewDeadlineTime: settings.reviewDeadlineTime.trim() || '6:00 PM',
    ptDeductionMonths:
      months.length > 0 ? [...new Set(months)].sort((a, b) => a - b) : [8, 2],
    defaultPtHalfYearly: Math.max(0, Number(settings.defaultPtHalfYearly) || 0),
    entities: normalizedEntities,
  };
}

/** Full app settings (jsonb singleton). */
export async function fetchSettings(): Promise<ActionResult<Settings>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('app_settings')
      .select('id,data,updated_at')
      .eq('id', APP_SETTINGS_ID)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };

    if (!data) {
      return saveSettings(SEED_SETTINGS);
    }

    const row = data as AppSettingsRow;
    const merged = mergeSettings(row.data);

    // One-off write-through cleanup: persist normalized name/address if stored
    // jsonb still has live-print defects (duplicate commas / whitespace).
    const needsPersist = ENTITY_CODES.some((code) => {
      const before = row.data?.entities?.[code];
      const after = merged.entities[code];
      if (!before || !after) return false;
      return (
        (before.name ?? '') !== after.name ||
        (before.registeredAddress ?? '') !== after.registeredAddress ||
        JSON.stringify(before.addressLines ?? []) !== JSON.stringify(after.addressLines)
      );
    });
    if (needsPersist) {
      return saveSettings(merged);
    }

    return { ok: true, data: merged };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch settings.',
    };
  }
}

export async function saveSettings(settings: Settings): Promise<ActionResult<Settings>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const supabase = await createClient();
    const normalized = normalizeSettings(settings);
    const payload = {
      id: APP_SETTINGS_ID,
      data: normalized,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('app_settings')
      .upsert(payload, { onConflict: 'id' })
      .select('data')
      .single();

    if (error) return { ok: false, error: error.message };

    const row = data as Pick<AppSettingsRow, 'data'>;
    revalidateSettingsViews();
    return { ok: true, data: mergeSettings(row.data) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to save settings.',
    };
  }
}

export async function fetchCompanySettings(): Promise<SettingsActionResult<CompanySettingsRecord | null>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('company_settings')
      .select('payday_day,payroll_contact,display_name,legal_line,address,logo_url')
      .eq('id', SETTINGS_ROW_ID)
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    return { ok: true, data: (data as CompanySettingsRecord | null) ?? null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to fetch company settings.',
    };
  }
}

export async function updateCompanySettings(
  data: CompanySettingsRecord,
): Promise<SettingsActionResult<CompanySettingsRecord>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const supabase = await createClient();
    const payload = {
      id: SETTINGS_ROW_ID,
      payday_day: clampPaydayDay(Number(data.payday_day) || 5),
      payroll_contact: data.payroll_contact?.trim() ?? '',
      display_name: data.display_name?.trim() ?? '',
      legal_line: data.legal_line?.trim() ?? '',
      address: data.address?.trim() ?? '',
      logo_url: data.logo_url ?? null,
      updated_at: new Date().toISOString(),
    };

    const { data: upserted, error } = await supabase
      .from('company_settings')
      .upsert(payload, { onConflict: 'id' })
      .select('payday_day,payroll_contact,display_name,legal_line,address,logo_url')
      .single();

    if (error) return { ok: false, error: error.message };
    revalidateSettingsViews();
    return { ok: true, data: upserted as CompanySettingsRecord };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to update company settings.',
    };
  }
}

export async function uploadCompanyLogo(formData: FormData): Promise<SettingsActionResult<string>> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;
  try {
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false, error: 'Please choose a valid image file.' };
    }

    const allowedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']);
    if (!allowedTypes.has(file.type)) {
      return { ok: false, error: 'Please upload a PNG, JPEG, WebP, or SVG image.' };
    }

    const extension = file.name.includes('.') ? file.name.split('.').pop() : '';
    const safeExt = extension ? `.${extension.toLowerCase()}` : '';
    const logoPath = `${BRANDING_PATH}${safeExt}`;

    const supabase = await createClient();
    const bytes = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from(BRANDING_BUCKET)
      .upload(logoPath, bytes, {
        upsert: true,
        contentType: file.type,
      });
    if (uploadError) return { ok: false, error: uploadError.message };

    const cacheBust = randomUUID();
    const { data: publicUrlData } = supabase.storage
      .from(BRANDING_BUCKET)
      .getPublicUrl(`${logoPath}?v=${cacheBust}`);
    const logoUrl = publicUrlData.publicUrl;

    const { error: settingsError } = await supabase.from('company_settings').upsert(
      {
        id: SETTINGS_ROW_ID,
        logo_url: logoUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
    if (settingsError) return { ok: false, error: settingsError.message };

    revalidateSettingsViews();
    return { ok: true, data: logoUrl };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed to upload company logo.',
    };
  }
}
