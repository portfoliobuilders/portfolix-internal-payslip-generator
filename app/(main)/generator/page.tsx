'use client';

import { useEffect, useState } from 'react';
import GeneratorView from '@/components/GeneratorView';
import { usePayrollDataContext } from '@/components/PayrollDataProvider';

export default function GeneratorPage() {
  const { employees, slipHistory, loading, error, refresh } = usePayrollDataContext();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <p className="py-20 text-center text-sm text-muted">Loading…</p>;
  }

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
    <GeneratorView
      employees={employees}
      slipHistory={slipHistory}
      loading={loading}
      onRefresh={refresh}
    />
  );
}
