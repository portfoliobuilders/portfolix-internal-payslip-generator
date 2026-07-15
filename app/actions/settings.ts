'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { createClient } from '@/utils/supabase/server';

export type SettingsActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface CompanySettingsRecord {
  payday_day: number;
  payroll_contact: string;
  display_name: string;
  legal_line: string;
  address: string;
  logo_url: string | null;
}

const SETTINGS_ROW_ID = 1;
const BRANDING_BUCKET = 'branding';
const BRANDING_PATH = 'company-logo';

function revalidateSettingsViews() {
  revalidatePath('/');
}

export async function fetchCompanySettings(): Promise<SettingsActionResult<CompanySettingsRecord | null>> {
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
  try {
    const supabase = await createClient();
    const payload = {
      id: SETTINGS_ROW_ID,
      payday_day: Math.min(28, Math.max(3, Math.round(Number(data.payday_day) || 5))),
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
