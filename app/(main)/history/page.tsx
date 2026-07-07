'use client';

import { useEffect, useState } from 'react';
import HistoryView from '@/components/HistoryView';
import { usePayrollDataContext } from '@/components/PayrollDataProvider';

export default function HistoryPage() {
  const { slipHistory, loading, error, refresh } = usePayrollDataContext();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <p className="py-20 text-center text-sm text-muted">Loading…</p>;
  }

  return (
    <HistoryView
      slipHistory={slipHistory}
      loading={loading}
      error={error}
      onRefresh={refresh}
    />
  );
}
