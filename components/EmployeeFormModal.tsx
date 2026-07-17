'use client';

import { useState } from 'react';
import type {
  AgreementType,
  DocumentsStatus,
  Employee,
  EmploymentStatus,
  EngagementType,
  EntityCode,
  PaymentMode,
  PaymentType,
  WorkMode,
} from '@/lib/types';
import { upsertEmployee } from '@/app/actions/payroll';
import { useHRStore } from '@/store/useHRStore';
import { Field, Modal, btnPrimary, btnSecondary, inputAmountCls, inputCls } from './ui';
import { compensationLabelForPaymentType, defaultPaymentTypeForEngagement } from '@/lib/workforce';

const ENTITY_CODES: EntityCode[] = ['PX', 'PB', 'PT', 'PH'];
const PAYMENT_MODES: PaymentMode[] = ['Bank Transfer', 'UPI', 'Cheque', 'Cash'];
const ENGAGEMENT_TYPES: EngagementType[] = ['regular_employee', 'probation_employee', 'notice_period_employee', 'intern', 'trainee', 'apprentice', 'contract_employee', 'freelancer', 'consultant'];
const EMPLOYMENT_STATUSES: EmploymentStatus[] = ['active', 'probation', 'notice_period', 'completed', 'resigned', 'terminated', 'offboarded', 'inactive'];
const PAYMENT_TYPES: PaymentType[] = ['salary', 'stipend', 'professional_fee', 'consultancy_fee', 'contract_remuneration', 'honorarium'];
const WORK_MODES: WorkMode[] = ['office', 'remote', 'hybrid'];
const AGREEMENT_TYPES: AgreementType[] = ['offer_letter', 'internship_offer', 'freelancer_agreement', 'consultancy_agreement', 'contract_agreement', 'apprenticeship_contract'];
const DOCUMENT_STATUSES: DocumentsStatus[] = ['pending', 'partially_collected', 'completed'];

type Draft = {
  fullName: string;
  empId: string;
  entityCode: EntityCode;
  department: string;
  designation: string;
  joiningDate: string;
  employeeAddress: string;
  baseSalary: string;
  compensationAmount: string;
  engagementType: EngagementType;
  employmentStatus: EmploymentStatus;
  paymentType: PaymentType;
  paymentMode: PaymentMode;
  internshipStartDate: string;
  internshipEndDate: string;
  probationStartDate: string;
  probationEndDate: string;
  noticeStartDate: string;
  noticeEndDate: string;
  contractStartDate: string;
  contractEndDate: string;
  offboardingDate: string;
  reportingManager: string;
  workMode: WorkMode;
  agreementType: AgreementType;
  documentsStatus: DocumentsStatus;
  notes: string;
  bankName: string;
  ifsc: string;
  bankDetailsVerified: boolean;
  bankLast4: string;
  panMasked: string;
  flexBankBalance: string;
  tdsMonthly: string;
  ptHalfYearly: string;
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
    compensationAmount: e ? String(e.compensationAmount) : '',
    engagementType: e?.engagementType ?? 'regular_employee',
    employmentStatus: e?.employmentStatus ?? 'active',
    paymentType: e?.paymentType ?? 'salary',
    paymentMode: e?.paymentMode ?? 'Bank Transfer',
    internshipStartDate: e?.internshipStartDate ?? '',
    internshipEndDate: e?.internshipEndDate ?? '',
    probationStartDate: e?.probationStartDate ?? '',
    probationEndDate: e?.probationEndDate ?? '',
    noticeStartDate: e?.noticeStartDate ?? '',
    noticeEndDate: e?.noticeEndDate ?? '',
    contractStartDate: e?.contractStartDate ?? '',
    contractEndDate: e?.contractEndDate ?? '',
    offboardingDate: e?.offboardingDate ?? '',
    reportingManager: e?.reportingManager ?? '',
    workMode: e?.workMode ?? 'office',
    agreementType: e?.agreementType ?? 'offer_letter',
    documentsStatus: e?.documentsStatus ?? 'pending',
    notes: e?.notes ?? '',
    bankName: e?.bankName ?? '',
    ifsc: e?.ifsc ?? '',
    bankDetailsVerified: e?.bankDetailsVerified === true,
    bankLast4: e?.bankLast4 ?? '',
    panMasked: e?.panMasked ?? '',
    flexBankBalance: e ? String(e.flexBankBalance) : '0',
    tdsMonthly: e ? String(e.tdsMonthly) : '0',
    ptHalfYearly: e ? String(e.ptHalfYearly) : '0',
  };
}

function validate(d: Draft): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!d.fullName.trim()) errors.fullName = 'Name is required.';
  if (!d.empId.trim()) errors.empId = 'Employee ID is required.';
  else if (!d.empId.trim().toUpperCase().startsWith(d.entityCode))
    errors.empId = `Must be prefixed by the entity code (e.g. ${d.entityCode}-2024-042).`;
  if (!d.joiningDate) errors.joiningDate = 'Joining date is required.';
  const compensation = Number(d.compensationAmount);
  if (!d.compensationAmount || !Number.isFinite(compensation) || compensation <= 0)
    errors.compensationAmount = 'Compensation amount must be above zero.';
  const salary = Number(d.baseSalary);
  if (!d.baseSalary || !Number.isFinite(salary) || salary <= 0) errors.baseSalary = 'Enter a valid amount.';
  if (d.employmentStatus === 'notice_period' && !d.noticeStartDate) {
    errors.noticeStartDate = 'Notice start date is required for notice period status.';
  }
  if ((d.employmentStatus === 'offboarded' || d.employmentStatus === 'completed') && !d.offboardingDate && !d.noticeEndDate && !d.contractEndDate && !d.internshipEndDate) {
    errors.offboardingDate = 'Offboarding/end date is required for offboarded/completed status.';
  }
  if (d.bankLast4 && !/^\d{4}$/.test(d.bankLast4))
    errors.bankLast4 = 'Exactly 4 digits — never store the full account number.';
  if (d.panMasked && /^[A-Z]{5}\d{4}[A-Z]$/i.test(d.panMasked.trim()))
    errors.panMasked = 'This looks like a FULL PAN. Store a masked form only, e.g. ABXXXXXX1F.';
  const flex = Number(d.flexBankBalance);
  if (!Number.isFinite(flex) || flex < 0) errors.flexBankBalance = 'Minutes must be 0 or more.';
  const tds = Number(d.tdsMonthly);
  if (!Number.isFinite(tds) || tds < 0) errors.tdsMonthly = 'TDS must be 0 or more.';
  const pt = Number(d.ptHalfYearly);
  if (!Number.isFinite(pt) || pt < 0) errors.ptHalfYearly = 'PT must be 0 or more.';
  return errors;
}

export default function EmployeeFormModal({
  employee,
  onClose,
  onSaved,
  onSaveStart,
  onSaveFailed,
}: {
  /** null → add mode. */
  employee: Employee | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onSaveStart?: () => void;
  onSaveFailed?: (message: string) => void;
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
    onSaveStart?.();

    const payload = {
      ...(employee ? { id: employee.id, flexLog: employee.flexLog } : { flexLog: [] as Employee['flexLog'] }),
      fullName: draft.fullName.trim(),
      empId: draft.empId.trim().replace(/\s+/g, '').toUpperCase(),
      entityCode: draft.entityCode,
      department: draft.department.trim(),
      designation: draft.designation.trim(),
      joiningDate: draft.joiningDate,
      employeeAddress: draft.employeeAddress.trim(),
      baseSalary: Number(draft.baseSalary),
      compensationAmount: Number(draft.compensationAmount),
      engagementType: draft.engagementType,
      employmentStatus: draft.employmentStatus,
      paymentType: draft.paymentType,
      paymentMode: draft.paymentMode,
      internshipStartDate: draft.internshipStartDate || null,
      internshipEndDate: draft.internshipEndDate || null,
      probationStartDate: draft.probationStartDate || null,
      probationEndDate: draft.probationEndDate || null,
      noticeStartDate: draft.noticeStartDate || null,
      noticeEndDate: draft.noticeEndDate || null,
      contractStartDate: draft.contractStartDate || null,
      contractEndDate: draft.contractEndDate || null,
      offboardingDate: draft.offboardingDate || null,
      reportingManager: draft.reportingManager.trim(),
      workMode: draft.workMode,
      agreementType: draft.agreementType,
      documentsStatus: draft.documentsStatus,
      notes: draft.notes.trim(),
      bankName: draft.bankName.trim(),
      ifsc: draft.ifsc.trim().toUpperCase() || null,
      bankDetailsVerified: draft.bankDetailsVerified,
      bankLast4: draft.bankLast4.trim(),
      panMasked: draft.panMasked.trim().toUpperCase(),
      flexBankBalance: Number(draft.flexBankBalance),
      tdsMonthly: Number(draft.tdsMonthly) || 0,
      ptHalfYearly: Number(draft.ptHalfYearly) || 0,
    };

    const result = await upsertEmployee(payload);
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error);
      onSaveFailed?.(result.error);
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="sm:col-span-2">
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
        <Field label={`Compensation amount (${compensationLabelForPaymentType(draft.paymentType)}, ₹)`} error={err('compensationAmount')}>
          <input type="number" min={0} step="0.01" className={inputAmountCls} value={draft.compensationAmount} onChange={(e) => set('compensationAmount', e.target.value)} placeholder="25000" />
        </Field>
        <Field label="Engagement type">
          <select className={inputCls} value={draft.engagementType} onChange={(e) => {
            const engagementType = e.target.value as EngagementType;
            set('engagementType', engagementType);
            set('paymentType', defaultPaymentTypeForEngagement(engagementType));
          }}>
            {ENGAGEMENT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Employment status">
          <select className={inputCls} value={draft.employmentStatus} onChange={(e) => set('employmentStatus', e.target.value as EmploymentStatus)}>
            {EMPLOYMENT_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Payment type">
          <select className={inputCls} value={draft.paymentType} onChange={(e) => set('paymentType', e.target.value as PaymentType)}>
            {PAYMENT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Payment mode">
          <select className={inputCls} value={draft.paymentMode} onChange={(e) => set('paymentMode', e.target.value as PaymentMode)}>
            {PAYMENT_MODES.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </Field>
        <Field label="Bank name">
          <input className={inputCls} value={draft.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="Verified salary-credit bank" />
        </Field>
        <Field label="IFSC (optional, verified only)">
          <input className={inputCls} maxLength={11} value={draft.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} placeholder="ABCD0123456" />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={draft.bankDetailsVerified} onChange={(e) => set('bankDetailsVerified', e.target.checked)} />
          HR has verified the salary-credit bank details
        </label>
        <Field label="Bank a/c — last 4 digits only" error={err('bankLast4')}>
          <input className={inputCls} maxLength={4} value={draft.bankLast4} onChange={(e) => set('bankLast4', e.target.value.replace(/\D/g, ''))} placeholder="4821" />
        </Field>
        <Field label="PAN (masked)" error={err('panMasked')} hint="e.g. ABXXXXXX1F — never the full number">
          <input className={inputCls} maxLength={10} value={draft.panMasked} onChange={(e) => set('panMasked', e.target.value)} placeholder="ABXXXXXX1F" />
        </Field>
        <Field label="Reporting manager">
          <input className={inputCls} value={draft.reportingManager} onChange={(e) => set('reportingManager', e.target.value)} />
        </Field>
        <Field label="Work mode">
          <select className={inputCls} value={draft.workMode} onChange={(e) => set('workMode', e.target.value as WorkMode)}>
            {WORK_MODES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Agreement type">
          <select className={inputCls} value={draft.agreementType} onChange={(e) => set('agreementType', e.target.value as AgreementType)}>
            {AGREEMENT_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Documents status">
          <select className={inputCls} value={draft.documentsStatus} onChange={(e) => set('documentsStatus', e.target.value as DocumentsStatus)}>
            {DOCUMENT_STATUSES.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </Field>
        <Field label="Internship start date"><input type="date" className={inputCls} value={draft.internshipStartDate} onChange={(e) => set('internshipStartDate', e.target.value)} /></Field>
        <Field label="Internship end date"><input type="date" className={inputCls} value={draft.internshipEndDate} onChange={(e) => set('internshipEndDate', e.target.value)} /></Field>
        <Field label="Probation start date"><input type="date" className={inputCls} value={draft.probationStartDate} onChange={(e) => set('probationStartDate', e.target.value)} /></Field>
        <Field label="Probation end date"><input type="date" className={inputCls} value={draft.probationEndDate} onChange={(e) => set('probationEndDate', e.target.value)} /></Field>
        <Field label="Notice start date" error={err('noticeStartDate')}><input type="date" className={inputCls} value={draft.noticeStartDate} onChange={(e) => set('noticeStartDate', e.target.value)} /></Field>
        <Field label="Notice end date"><input type="date" className={inputCls} value={draft.noticeEndDate} onChange={(e) => set('noticeEndDate', e.target.value)} /></Field>
        <Field label="Contract start date"><input type="date" className={inputCls} value={draft.contractStartDate} onChange={(e) => set('contractStartDate', e.target.value)} /></Field>
        <Field label="Contract end date"><input type="date" className={inputCls} value={draft.contractEndDate} onChange={(e) => set('contractEndDate', e.target.value)} /></Field>
        <Field label="Offboarding date" error={err('offboardingDate')}><input type="date" className={inputCls} value={draft.offboardingDate} onChange={(e) => set('offboardingDate', e.target.value)} /></Field>
        <div className="col-span-2"><Field label="Notes"><textarea className={`${inputCls} resize-none`} rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} /></Field></div>
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
