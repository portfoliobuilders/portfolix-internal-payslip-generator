'use client';

import HistoryView from '@/components/HistoryView';
import { usePayrollContext } from '@/components/PayrollDataProvider';

export default function HistoryPage() {
  const { slipHistory, loading, refresh } = usePayrollContext();

  return <HistoryView slipHistory={slipHistory} loading={loading} onRefresh={refresh} />;
}
