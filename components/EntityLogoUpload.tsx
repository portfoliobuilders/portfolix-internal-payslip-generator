'use client';

import { useRef, useState } from 'react';
import type { EntityCode } from '@/lib/types';
import { updateCompanySettings, uploadCompanyLogo } from '@/app/actions/settings';
import { useHRStore } from '@/store/useHRStore';
import { Field } from '@/components/ui';
import EntityLogo from '@/components/EntityLogo';

interface EntityLogoUploadProps {
  code: EntityCode;
}

export default function EntityLogoUpload({ code }: EntityLogoUploadProps) {
  const settings = useHRStore((s) => s.settings);
  const entity = useHRStore((s) => s.settings.entities[code]);
  const updateEntity = useHRStore((s) => s.updateEntity);
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const result = await uploadCompanyLogo(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      updateEntity(code, { logoDataUrl: result.data });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <Field label="Logo" hint="Shown on salary slips and in the app header." error={error}>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex h-16 w-40 items-center justify-center overflow-hidden rounded-md border border-hairline bg-ink p-2">
          <EntityLogo entity={entity} code={code} className="max-h-full max-w-full" />
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-hairline bg-paper px-3.5 py-2 text-sm font-medium text-ink transition duration-150 hover:border-muted/30 hover:bg-surface active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:opacity-50 disabled:active:scale-100 sm:min-h-0"
          >
            {busy ? 'Uploading...' : entity.logoDataUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {entity.logoDataUrl && (
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const result = await updateCompanySettings({
                    payday_day: settings.paydayDayOfMonth,
                    payroll_contact: settings.payrollContact,
                    display_name: settings.entities.PX.name,
                    legal_line: settings.entities.PX.legalLine,
                    address: settings.entities.PX.addressLines.join('\n'),
                    logo_url: null,
                  });
                  if (!result.ok) {
                    setError(result.error);
                    return;
                  }
                  updateEntity(code, { logoDataUrl: null });
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not remove logo.');
                } finally {
                  setBusy(false);
                }
              }}
              className="rounded text-left text-[11px] font-medium text-muted transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
            >
              Remove custom logo (use default)
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}
