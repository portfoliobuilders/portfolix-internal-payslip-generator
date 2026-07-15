'use client';

import { COMPANY_ENTITIES, PAYROLL_CONTACT } from '@/lib/constants/company';

interface SettingsViewProps {
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
  savedAt: string | null;
  hasUnsavedChanges: boolean;
  onRetry: () => void;
  onSave: () => void;
}

export default function SettingsView({
  loading,
  error,
  saving,
  saveError,
  savedAt,
  hasUnsavedChanges,
  onRetry,
  onSave,
}: SettingsViewProps) {
  const settings = useHRStore((s) => s.settings);
  const updateSettings = useHRStore((s) => s.updateSettings);
  const updateEntity = useHRStore((s) => s.updateEntity);
  const discardSettingsChanges = useHRStore((s) => s.discardSettingsChanges);
function parsePtMonths(raw: string): number[] {
  return raw
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 12);
}

export default function SettingsView() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-ink">Settings</h2>
        <p className="mt-1 text-sm text-muted">
          Company details are configured statically in the codebase.
        </p>
      </div>

      {saveError && (
        <div className="flex items-start gap-2 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          Failed to save settings: {saveError}
        </div>
      )}

      {savedAt && !hasUnsavedChanges && !saveError && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-brand/30 bg-emerald-tint px-3 py-2 text-[12px] font-medium text-emerald-deep">
          <CheckCircle2 size={14} className="shrink-0" />
          Settings saved to Supabase at {formatDate(savedAt)}.
        </div>
      )}

      {hasUnsavedChanges && !saving && (
        <p className="text-[12px] font-medium text-amber-brand">You have unsaved changes.</p>
      )}

      <div className="rounded-lg border border-hairline bg-paper p-5">
        <h3 className="text-sm font-semibold text-ink">Payroll contact</h3>
        <p className="mt-2 text-sm text-muted">{PAYROLL_CONTACT}</p>
      </div>

      <div className="space-y-4">
        {COMPANY_ENTITIES.map((entity) => (
          <div key={entity.id} className="rounded-lg border border-hairline bg-paper p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Display name
                </p>
                <p className="text-sm text-ink">{entity.displayName}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Legal line
                </p>
                <p className="text-sm text-ink">{entity.legalLine}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Address</p>
                <p className="whitespace-pre-line text-sm text-ink">{entity.address}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Logo path
                </p>
                <p className="text-sm text-ink">{entity.logoPath}</p>
              </div>

              <div className="mt-6 border-t border-hairline pt-5">
                <h4 className="mb-3 text-sm font-semibold text-ink">Company &amp; Signatory</h4>
                <p className="mb-4 text-[12px] text-muted">
                  Printed on the Authorised Slip (bank copy). Use SET-IN-SETTINGS until real values
                  are confirmed — never ship guessed emails or CIN numbers.
                </p>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="CIN">
                    <Input
                      value={entity.cin}
                      onChange={(e) => updateEntity(code, { cin: e.target.value })}
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <Field label="Contact phone">
                    <Input
                      value={entity.phone}
                      onChange={(e) => updateEntity(code, { phone: e.target.value })}
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <Field label="Payroll email">
                    <Input
                      value={entity.payrollEmail}
                      onChange={(e) => updateEntity(code, { payrollEmail: e.target.value })}
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Registered address">
                      <Textarea
                        value={entity.registeredAddress}
                        onChange={(e) => updateEntity(code, { registeredAddress: e.target.value })}
                        placeholder="SET-IN-SETTINGS"
                      />
                    </Field>
                  </div>
                  <Field label="Signatory name">
                    <Input
                      value={entity.signatoryName}
                      onChange={(e) => updateEntity(code, { signatoryName: e.target.value })}
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <Field label="Signatory designation">
                    <Input
                      value={entity.signatoryDesignation}
                      onChange={(e) =>
                        updateEntity(code, { signatoryDesignation: e.target.value })
                      }
                      placeholder="SET-IN-SETTINGS"
                    />
                  </Field>
                  <SignatoryAssetUpload code={code} kind="signature" label="Authorised signature" />
                  <SignatoryAssetUpload code={code} kind="seal" label="Company seal" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
