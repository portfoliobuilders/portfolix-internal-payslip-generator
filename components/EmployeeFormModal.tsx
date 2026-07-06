'use client';

import { useState } from 'react';
import type { Employee, EntityCode, PaymentMode } from '@/lib/types';
import { upsertEmployee } from '@/app/actions/payroll';
import { useHRStore } from '@/store/useHRStore';
import { Field, Modal, btnPrimary, btnSecondary, inputAmountCls, inputCls } from './ui';

const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];
const PAYMENT_MODES: PaymentMode[] = ['Bank Transfer', 'UPI', 'Cheque', 'Cash'];

type Draft = {
  fullName: string;
  empId: string;
  entityCode: EntityCode;
  department: string;
  designation: string;
  joiningDate: string;
  employeeAddress: string;
  baseSalary: string;
  paymentMode: PaymentMode;
  bankLast4: string;
  panMasked: string;
  flexBankBalance: string;
};

function toDraft(e: Employee | null): Draft {
  return {
    fullName: e?.fullName ?? '',
    empId: e?.empId ?? '',
    entityCode: e?.entityCode ?? 'PX',
    department: e?.department ?? '',
    designation: e?.designation ?? '',
    joiningDate: e?.joiningDate ?? '',
    employeeAddress: e?.employeeAddress ?? '',
    baseSalary: e ? String(e.baseSalary) : '',
    paymentMode: e?.paymentMode ?? 'Bank Transfer',
    bankLast4: e?.bankLast4 ?? '',
    panMasked: e?.panMasked ?? '',
    flexBankBalance: e ? String(e.flexBankBalance) : '0',
  };
}

function validate(d: Draft): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!d.fullName.trim()) errors.fullName = 'Name is required.';
  if (!d.empId.trim()) errors.empId = 'Employee ID is required.';
  else if (!d.empId.trim().toUpperCase().startsWith(d.entityCode))
    errors.empId = `Must be prefixed by the entity code (e.g. ${d.entityCode}-2024-042).`;
  if (!d.joiningDate) errors.joiningDate = 'Joining date is required.';
  const salary = Number(d.baseSalary);
  if (!d.baseSalary || !Number.isFinite(salary) || salary <= 0)
    errors.baseSalary = 'Enter a base salary above zero.';
  if (d.bankLast4 && !/^\d{4}$/.test(d.bankLast4))
    errors.bankLast4 = 'Exactly 4 digits — never store the full account number.';
  if (d.panMasked && /^[A-Z]{5}\d{4}[A-Z]$/i.test(d.panMasked.trim()))
    errors.panMasked = 'This looks like a FULL PAN. Store a masked form only, e.g. ABXXXXXX1F.';
  const flex = Number(d.flexBankBalance);
  if (!Number.isFinite(flex) || flex < 0) errors.flexBankBalance = 'Minutes must be 0 or more.';
  return errors;
}

export default function EmployeeFormModal({
  employee,
  onClose,
  onSaved,
}: {
  /** null → add mode. */
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const entities = useHRStore((s) => s.settings.entities);
  const [draft, setDraft] = useState<Draft>(() => toDraft(employee));
  const [touchedSave, setTouchedSave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors = validate(draft);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  async function handleSave() {
    setTouchedSave(true);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    setSaveError(null);

    const payload = {
      ...(employee ? { id: employee.id, flexLog: employee.flexLog } : { flexLog: [] as Employee['flexLog'] }),
      fullName: draft.fullName.trim(),
      empId: draft.empId.trim().toUpperCase(),
      entityCode: draft.entityCode,
      department: draft.department.trim(),
      designation: draft.designation.trim(),
      joiningDate: draft.joiningDate,
      employeeAddress: draft.employeeAddress.trim(),
      baseSalary: Number(draft.baseSalary),
      paymentMode: draft.paymentMode,
      bankLast4: draft.bankLast4.trim(),
      panMasked: draft.panMasked.trim().toUpperCase(),
      flexBankBalance: Number(draft.flexBankBalance),
    };

    const result = await upsertEmployee(payload);
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error);
      return;
    }

    await onSaved();
    onClose();
  }

  const err = (k: keyof Draft) => (touchedSave ? errors[k] ?? null : null);

  return (
    <Modal title={employee ? `Edit — ${employee.fullName}` : 'Add employee'} onClose={onClose} wide>
      {saveError && (
        <p className="mb-4 rounded-md border border-amber-edge bg-amber-tint px-3 py-2 text-[12px] font-medium text-amber-brand">
          {saveError}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name" error={err('fullName')}>
          <input className={inputCls} value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} placeholder="Asha Verma" />
        </Field>
        <Field label="Entity">
          <select
            className={inputCls}
            value={draft.entityCode}
            onChange={(e) => set('entityCode', e.target.value as EntityCode)}
          >
            {ENTITY_CODES.map((c) => (
              <option key={c} value={c}>
                {c} — {entities[c].name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Employee ID" error={err('empId')} hint={`Format: ${draft.entityCode}-2024-042`}>
          <input className={inputCls} value={draft.empId} onChange={(e) => set('empId', e.target.value)} placeholder={`${draft.entityCode}-2024-042`} />
        </Field>
        <Field label="Joining date" error={err('joiningDate')}>
          <input type="date" className={inputCls} value={draft.joiningDate} onChange={(e) => set('joiningDate', e.target.value)} />
        </Field>
        <Field label="Department">
          <input className={inputCls} value={draft.department} onChange={(e) => set('department', e.target.value)} placeholder="Engineering" />
        </Field>
        <Field label="Designation">
          <input className={inputCls} value={draft.designation} onChange={(e) => set('designation', e.target.value)} placeholder="Frontend Developer" />
        </Field>
        <div className="col-span-2">
          <Field label="Employee address">
            <textarea
              className={`${inputCls} resize-none`}
              rows={2}
              value={draft.employeeAddress}
              onChange={(e) => set('employeeAddress', e.target.value)}
              placeholder="Flat 12B, Green Residency, Noida, UP 201301"
            />
          </Field>
        </div>
        <Field label="Base salary (monthly, ₹)" error={err('baseSalary')}>
          <input type="number" min={0} step="0.01" className={inputAmountCls} value={draft.baseSalary} onChange={(e) => set('baseSalary', e.target.value)} placeholder="25000" />
        </Field>
        <Field label="Payment mode">
          <select className={inputCls} value={draft.paymentMode} onChange={(e) => set('paymentMode', e.target.value as PaymentMode)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Bank a/c — last 4 digits only" error={err('bankLast4')}>
          <input className={inputCls} maxLength={4} value={draft.bankLast4} onChange={(e) => set('bankLast4', e.target.value.replace(/\D/g, ''))} placeholder="4821" />
        </Field>
        <Field label="PAN (masked)" error={err('panMasked')} hint="e.g. ABXXXXXX1F — never the full number">
          <input className={inputCls} maxLength={10} value={draft.panMasked} onChange={(e) => set('panMasked', e.target.value)} placeholder="ABXXXXXX1F" />
        </Field>
        {!employee && (
          <Field label="Opening flex-bank balance (minutes)" error={err('flexBankBalance')}>
            <input type="number" min={0} className={inputAmountCls} value={draft.flexBankBalance} onChange={(e) => set('flexBankBalance', e.target.value)} />
          </Field>
        )}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose} disabled={saving}>Cancel</button>
        <button className={btnPrimary} onClick={() => void handleSave()} disabled={saving}>
          {saving ? 'Saving…' : employee ? 'Save changes' : 'Add employee'}
        </button>
      </div>
    </Modal>
  );
}
