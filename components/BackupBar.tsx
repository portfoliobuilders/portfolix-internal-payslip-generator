'use client';

import { useRef, useState } from 'react';
import { format } from 'date-fns';
import { AlertTriangle, Download, HardDrive, Upload } from 'lucide-react';
import { useHRStore } from '@/store/useHRStore';
import { Modal, btnPrimary, btnSecondary } from './ui';

export default function BackupBar() {
  const exportBackup = useHRStore((s) => s.exportBackup);
  const importBackup = useHRStore((s) => s.importBackup);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pendingJson, setPendingJson] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  function handleExport() {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `portfolix-slipgen-backup-${format(new Date(), 'yyyy-MM-dd-HHmm')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage({ kind: 'ok', text: 'Backup exported.' });
  }

  function handleFileChosen(file: File) {
    const reader = new FileReader();
    reader.onload = () => setPendingJson(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  function confirmImport() {
    if (pendingJson === null) return;
    const result = importBackup(pendingJson);
    setPendingJson(null);
    setMessage(
      result.ok
        ? { kind: 'ok', text: 'Backup imported — roster and history replaced.' }
        : { kind: 'error', text: `Import failed: ${result.error}` },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-paper px-4 py-2.5">
      <HardDrive size={15} className="shrink-0 text-muted" />
      <p className="text-[12px] text-muted">
        Data lives only in this browser. Export a backup after every payroll run.
      </p>
      <div className="ml-auto flex items-center gap-2">
        {message && (
          <span
            className={`text-[12px] font-medium ${
              message.kind === 'ok' ? 'text-emerald-deep' : 'text-amber-brand'
            }`}
          >
            {message.text}
          </span>
        )}
        <button className={btnSecondary} onClick={handleExport}>
          <Download size={14} /> Export JSON
        </button>
        <button className={btnSecondary} onClick={() => fileRef.current?.click()}>
          <Upload size={14} /> Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFileChosen(file);
            e.target.value = '';
          }}
        />
      </div>

      {pendingJson !== null && (
        <Modal title="Import backup — overwrite everything?" onClose={() => setPendingJson(null)}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber-brand" />
            <p className="text-sm text-ink">
              Importing replaces the <strong>entire</strong> current dataset in this browser —
              settings, all employees, and all slip history. This cannot be undone. Consider
              exporting the current data first.
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnSecondary} onClick={() => setPendingJson(null)}>
              Cancel
            </button>
            <button className={btnPrimary} onClick={confirmImport}>
              Overwrite &amp; import
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
