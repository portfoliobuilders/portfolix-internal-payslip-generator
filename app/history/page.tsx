'use client';

import HistoryView from '@/components/HistoryView';
import { usePayrollData } from '@/hooks/usePayrollData';

export default function HistoryPage() {
  const { slipHistory, loading, error, refresh } = usePayrollData();

  if (error) {
    return (
      <div className="rounded-lg border border-amber-edge bg-amber-tint px-4 py-6 text-center">
        <p className="text-sm font-medium text-amber-brand">Could not load payroll data</p>
        <p className="mt-1 text-[12px] text-muted">{error}</p>
        <button
          className="mt-4 rounded-md bg-ink px-3 py-1.5 text-sm font-medium text-paper"
          onClick={() => void refresh()}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <HistoryView
      slipHistory={slipHistory}
      loading={loading}
      error={null}
      onRefresh={refresh}
    />
  );
}
