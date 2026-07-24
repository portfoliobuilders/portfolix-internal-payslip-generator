'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createSignatorySignedUrl,
  getSignatoryStorageStatus,
  removeSignatoryAsset,
  uploadSignatoryAsset,
} from '@/app/actions/signatory-assets';
import type { EntityCode } from '@/lib/types';
import { useHRStore } from '@/store/useHRStore';
import { Loader2, Trash2, Upload } from 'lucide-react';

type UploadPhase =
  | 'idle'
  | 'uploading'
  | 'uploaded'
  | 'saving'
  | 'saved'
  | 'failed';

interface SignatoryAssetUploadProps {
  code: EntityCode;
  kind: 'signature' | 'seal';
  label: string;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SignatoryAssetUpload({ code, kind, label }: SignatoryAssetUploadProps) {
  const entity = useHRStore((s) => s.settings.entities[code]);
  const setSettings = useHRStore((s) => s.setSettings);
  const settings = useHRStore((s) => s.settings);
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<UploadPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ mimeType: string; sizeBytes: number } | null>(null);
  const [storageConfigured, setStorageConfigured] = useState(true);
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const path = kind === 'signature' ? entity.signatureAssetPath : entity.sealAssetPath;
  const busy = phase === 'uploading' || phase === 'saving';

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const status = await getSignatoryStorageStatus();
      if (cancelled) return;
      setStorageConfigured(status.configured);
      setStorageMessage(status.message);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setPreviewUrl(null);
    setError(null);
    if (!path || !storageConfigured) return;

    void (async () => {
      const result = await createSignatorySignedUrl(path);
      if (cancelled) return;
      if (result.ok && result.data.signedUrl) {
        setPreviewUrl(result.data.signedUrl);
        setPhase('saved');
      } else {
        setError(
          result.ok
            ? `${kind === 'signature' ? 'Signature' : 'Seal'} preview could not be loaded.`
            : result.error,
        );
        setPhase('failed');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path, storageConfigured, kind]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (phase === 'uploaded' || phase === 'uploading' || phase === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [phase]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!storageConfigured) {
      setError(storageMessage ?? 'Server key not configured.');
      setPhase('failed');
      return;
    }
    setPhase('uploading');
    setError(null);
    try {
      const fd = new FormData();
      fd.set('file', file);
      setPhase('saving');
      const result = await uploadSignatoryAsset(code, kind, fd);
      if (!result.ok) {
        setError(result.error);
        setPhase('failed');
        return;
      }
      setPhase('uploaded');
      setMeta({ mimeType: result.data.mimeType, sizeBytes: result.data.sizeBytes });
      setLastUpdated(new Date().toISOString());
      setPreviewUrl(result.data.signedUrl);

      const { fetchSettings } = await import('@/app/actions/settings');
      const refreshed = await fetchSettings();
      if (refreshed.ok) {
        setSettings(refreshed.data);
        setPhase('saved');
      } else {
        setError(
          'File uploaded but settings reload failed — refresh the page before leaving.',
        );
        setPhase('uploaded');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
      setPhase('failed');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function onRemove() {
    if (!storageConfigured) {
      setError(storageMessage ?? 'Server key not configured.');
      return;
    }
    setPhase('saving');
    setError(null);
    try {
      const result = await removeSignatoryAsset(code, kind);
      if (!result.ok) {
        setError(result.error);
        setPhase('failed');
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
      setMeta(null);
      setPhase('idle');
      setLastUpdated(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
      setPhase('failed');
    }
  }

  const statusLabel =
    phase === 'uploading'
      ? 'Uploading…'
      : phase === 'saving'
        ? 'Saving settings…'
        : phase === 'uploaded'
          ? 'Uploaded — confirm settings saved'
          : phase === 'saved'
            ? 'Saved'
            : phase === 'failed'
              ? 'Failed'
              : path
                ? 'Stored'
                : 'Not set';

  return (
    <div className="rounded-md border border-hairline bg-surface/40 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      {!storageConfigured && (
        <p className="mb-2 rounded border border-amber-edge bg-amber-tint px-2 py-1.5 text-[11px] font-medium text-amber-brand">
          Server key not configured — set <span className="amount">SUPABASE_SECRET_KEY</span> on the
          host. Uploads and bank-copy signatures are disabled (fail closed).
        </p>
      )}
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
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md border border-hairline bg-paper px-3 text-[12px] font-medium text-ink hover:bg-surface disabled:opacity-50"
            disabled={busy || !storageConfigured}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {path ? 'Replace' : 'Upload'}
          </button>
          {path && (
            <button
              type="button"
              className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md border border-hairline bg-paper px-3 text-[12px] font-medium text-amber-brand hover:bg-amber-tint disabled:opacity-50"
              disabled={busy || !storageConfigured}
              onClick={() => void onRemove()}
            >
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted">
        Transparent PNG preferred · JPEG allowed · max 2 MB · max 3000×3000 · private storage
        (no public URL)
      </p>
      <p className="mt-1 text-[10px] text-muted">
        Status: <span className="font-medium text-ink">{statusLabel}</span>
        {meta && (
          <>
            {' · '}
            {meta.mimeType} · {formatBytes(meta.sizeBytes)}
          </>
        )}
        {path && (
          <>
            {' · '}
            path set
          </>
        )}
        {lastUpdated && (
          <>
            {' · '}
            updated {new Date(lastUpdated).toLocaleString()}
          </>
        )}
      </p>
      {error && <p className="mt-1 text-[11px] font-medium text-amber-brand">{error}</p>}
    </div>
  );
}
