'use client';

import { useState } from 'react';
import { FilePlus2, Pencil, Timer, Trash2, UserPlus } from 'lucide-react';
import { deleteEmployee } from '@/app/actions/payroll';
import type { Employee } from '@/lib/types';
import { formatINR, formatMinutes } from '@/lib/format';
import { useHRStore } from '@/store/useHRStore';
import { useUIStore } from '@/store/useUIStore';
import EmployeeFormModal from './EmployeeFormModal';
import FlexAdjustModal from './FlexAdjustModal';
import { Modal, btnPrimary, btnSecondary } from './ui';

interface RosterViewProps {
  employees: Employee[];
  loading: boolean;
  onRefresh: () => Promise<void>;
  onGenerateFor: () => void;
}

export default function RosterView({
  employees,
  loading,
  onRefresh,
  onGenerateFor,
}: RosterViewProps) {
  const entities = useHRStore((s) => s.settings.entities);
  const setGeneratorEmployeeId = useUIStore((s) => s.setGeneratorEmployeeId);

  const [formTarget, setFormTarget] = useState<Employee | null | 'new'>(null);
  const [flexTarget, setFlexTarget] = useState<Employee | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    const result = await deleteEmployee(deleteTarget.id);
    setDeleting(false);
    if (!result.ok) {
      setActionError(result.error);
      return;
    }
    setDeleteTarget(null);
    await onRefresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-hairline bg-paper">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <div>
            <h1 className="text-sm font-semibold">Employee Roster</h1>
            <p className="text-[12px] text-muted">
              {loading
                ? 'Loading employees…'
                : `${employees.length} employee${employees.length === 1 ? '' : 's'} across Portfolix entities`}
            </p>
          </div>
          <button className={btnPrimary} onClick={() => setFormTarget('new')} disabled={loading}>
            <UserPlus size={14} /> Add employee
          </button>
        </div>

        {actionError && (
          <p className="border-b border-hairline px-4 py-2 text-[12px] font-medium text-amber-brand">
            {actionError}
          </p>
        )}

        {loading ? (
          <p className="px-4 py-14 text-center text-sm text-muted">Loading roster from Supabase…</p>
        ) : employees.length === 0 ? (
          <p className="px-4 py-14 text-center text-sm text-muted">
            No employees yet. Add your first employee to start generating slips.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-semibold">Employee</th>
                <th className="px-4 py-2 font-semibold">Entity</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 text-right font-semibold">Base salary</th>
                <th className="px-4 py-2 text-right font-semibold">Flex bank</th>
                <th className="px-4 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-surface/60">
                  <td className="px-4 py-2.5">
                    <p className="font-medium">{e.fullName}</p>
                    <p className="text-[12px] text-muted">{e.empId}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="rounded bg-surface px-1.5 py-0.5 text-[11px] font-semibold">
                      {e.entityCode}
                    </span>{' '}
                    <span className="text-[12px] text-muted">{entities[e.entityCode].name}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <p>{e.designation || '—'}</p>
                    <p className="text-[12px] text-muted">{e.department}</p>
                  </td>
                  <td className="amount px-4 py-2.5 text-right font-medium">
                    {formatINR(e.baseSalary)}
                  </td>
                  <td className="amount px-4 py-2.5 text-right">
                    {formatMinutes(e.flexBankBalance)}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button
                        title="Generate slip"
                        className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink"
                        onClick={() => {
                          setGeneratorEmployeeId(e.id);
                          onGenerateFor();
                        }}
                      >
                        <FilePlus2 size={15} />
                      </button>
                      <button
                        title="Adjust flex bank"
                        className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink"
                        onClick={() => setFlexTarget(e)}
                      >
                        <Timer size={15} />
                      </button>
                      <button
                        title="Edit"
                        className="rounded p-1.5 text-muted hover:bg-surface hover:text-ink"
                        onClick={() => setFormTarget(e)}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        title="Delete"
                        className="rounded p-1.5 text-muted hover:bg-surface hover:text-amber-brand"
                        onClick={() => setDeleteTarget(e)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formTarget !== null && (
        <EmployeeFormModal
          employee={formTarget === 'new' ? null : formTarget}
          onClose={() => setFormTarget(null)}
          onSaved={onRefresh}
        />
      )}
      {flexTarget && (
        <FlexAdjustModal employee={flexTarget} onClose={() => setFlexTarget(null)} onSaved={onRefresh} />
      )}
      {deleteTarget && (
        <Modal title="Delete employee?" onClose={() => setDeleteTarget(null)}>
          <p className="text-sm">
            Remove <strong>{deleteTarget.fullName}</strong> ({deleteTarget.empId}) from the roster?
            Past slips in History are kept, but you will no longer be able to generate new slips for
            them.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button className={btnSecondary} onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </button>
            <button className={btnPrimary} onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
