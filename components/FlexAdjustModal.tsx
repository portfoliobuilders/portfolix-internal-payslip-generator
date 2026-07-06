'use client';

import { useState } from 'react';
import type { Employee } from '@/lib/types';
import { formatDate, formatMinutes } from '@/lib/format';
import { useHRStore } from '@/store/useHRStore';
import { Field, Modal, btnPrimary, btnSecondary, inputAmountCls, inputCls } from './ui';

export default function FlexAdjustModal({
  employee,
  onClose,
}: {
  employee: Employee;
  onClose: () => void;
}) {
  const adjustFlexBank = useHRStore((s) => s.adjustFlexBank);
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);

  const deltaNum = Number(delta);
  const deltaError =
    !delta || !Number.isFinite(deltaNum) || deltaNum === 0
      ? 'Enter a non-zero number of minutes (negative to deduct).'
      : employee.flexBankBalance + deltaNum < 0
        ? `Balance cannot go below zero (current: ${formatMinutes(employee.flexBankBalance)}).`
        : null;
  const reasonError = reason.trim().length < 3 ? 'A reason is required for the audit log.' : null;

  function handleApply() {
    setTouched(true);
    if (deltaError || reasonError) return;
    adjustFlexBank(employee.id, deltaNum, reason.trim());
    onClose();
  }

  const recentLog = [...employee.flexLog].reverse().slice(0, 5);

  return (
    <Modal title={`Flex-bank — ${employee.fullName}`} onClose={onClose}>
      <p className="mb-4 text-sm text-muted">
        Current balance:{' '}
        <strong className="amount text-ink">{formatMinutes(employee.flexBankBalance)}</strong>{' '}
        ({employee.flexBankBalance} min)
      </p>
      <div className="space-y-4">
        <Field
          label="Adjustment (minutes)"
          error={touched ? deltaError : null}
          hint="Positive adds, negative deducts."
        >
          <input
            type="number"
            className={inputAmountCls}
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="+60"
          />
        </Field>
        <Field label="Reason (required, logged)" error={touched ? reasonError : null}>
          <input
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Worked Saturday support shift on 14 Jun"
          />
        </Field>
      </div>

      {recentLog.length > 0 && (
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Recent log
          </p>
          <ul className="divide-y divide-hairline rounded-md border border-hairline">
            {recentLog.map((entry, i) => (
              <li key={i} className="flex items-baseline gap-2 px-3 py-1.5 text-[12px]">
                <span className="whitespace-nowrap text-muted">{formatDate(entry.date)}</span>
                <span
                  className={`amount whitespace-nowrap font-semibold ${
                    entry.delta >= 0 ? 'text-emerald-deep' : 'text-amber-brand'
                  }`}
                >
                  {entry.delta >= 0 ? '+' : ''}
                  {entry.delta}m
                </span>
                <span className="truncate text-muted">{entry.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose}>Cancel</button>
        <button className={btnPrimary} onClick={handleApply}>Apply adjustment</button>
      </div>
    </Modal>
  );
}
