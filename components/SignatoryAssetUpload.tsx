'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createSignatorySignedUrl,
  removeSignatoryAsset,
  uploadSignatoryAsset,
} from '@/app/actions/signatory-assets';
import type { EntityCode } from '@/lib/types';
import { useHRStore } from '@/store/useHRStore';
import { Loader2, Trash2, Upload } from 'lucide-react';

interface SignatoryAssetUploadProps {
  code: EntityCode;
  kind: 'signature' | 'seal';
  label: string;
}

export default function SignatoryAssetUpload({ code, kind, label }: SignatoryAssetUploadProps) {
  const entity = useHRStore((s) => s.settings.entities[code]);
  const setSettings = useHRStore((s) => s.setSettings);
  const settings = useHRStore((s) => s.settings);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const path = kind === 'signature' ? entity.signatureAssetPath : entity.sealAssetPath;

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    if (!path) return;

    void (async () => {
      const result = await createSignatorySignedUrl(path);
      if (cancelled) return;
      if (result.ok) setPreviewUrl(result.data.signedUrl);
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      const result = await uploadSignatoryAsset(code, kind, fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Refresh store from the save that uploadSignatoryAsset already performed.
      const { fetchSettings } = await import('@/app/actions/settings');
      const refreshed = await fetchSettings();
      if (refreshed.ok) setSettings(refreshed.data);
      setPreviewUrl(result.data.signedUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onRemove() {
    setBusy(true);
    setError(null);
    try {
      const result = await removeSignatoryAsset(code, kind);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const patch =
        kind === 'signature'
          ? { signatureAssetPath: null as string | null }
          : { sealAssetPath: null as string | null };
      setSettings({
        ...settings,
        entities: {
          ...settings.entities,
          [code]: { ...settings.entities[code], ...patch },
        },
      });
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-md border border-hairline bg-surface/40 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-28 items-center justify-center overflow-hidden rounded border border-hairline bg-paper">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt={label} className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="px-2 text-center text-[10px] text-muted">No image</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md border border-hairline bg-paper px-3 text-[12px] font-medium text-ink hover:bg-surface disabled:opacity-50"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload
          </button>
          {path && (
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md border border-hairline bg-paper px-3 text-[12px] font-medium text-amber-brand hover:bg-amber-tint disabled:opacity-50"
              disabled={busy}
              onClick={() => void onRemove()}
            >
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted">PNG, JPEG, or WebP · max 1 MB · private storage</p>
      {error && <p className="mt-1 text-[11px] font-medium text-amber-brand">{error}</p>}
    </div>
  );
}
