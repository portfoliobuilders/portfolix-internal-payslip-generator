'use client';

import { useRef, useState } from 'react';
import type { EntityCode } from '@/lib/types';
import { useHRStore } from '@/store/useHRStore';
import { Field } from '@/components/ui';
import EntityLogo from '@/components/EntityLogo';
import { readImageFileAsDataUrl } from '@/lib/logos';

interface EntityLogoUploadProps {
  code: EntityCode;
}

export default function EntityLogoUpload({ code }: EntityLogoUploadProps) {
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
      const dataUrl = await readImageFileAsDataUrl(file);
      updateEntity(code, { logoDataUrl: dataUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <Field
      label="Logo"
      hint="Shown on salary slips and in the app header (PX). Saved in this browser and included in JSON backups."
      error={error}
    >
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
            className="inline-flex items-center rounded-md border border-hairline bg-paper px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-50"
          >
            {busy ? 'Uploading…' : entity.logoDataUrl ? 'Replace logo' : 'Upload logo'}
          </button>
          {entity.logoDataUrl && (
            <button
              type="button"
              onClick={() => {
                updateEntity(code, { logoDataUrl: null });
                setError(null);
              }}
              className="text-left text-[11px] font-medium text-muted hover:text-ink"
            >
              Remove custom logo (use default)
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}
