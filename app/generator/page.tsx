'use client';

import GeneratorView from '@/components/GeneratorView';
import { usePayrollContext } from '@/components/PayrollDataProvider';

export default function GeneratorPage() {
  const { employees, slipHistory, loading, refresh } = usePayrollContext();

  return (
    <GeneratorView
      employees={employees}
      slipHistory={slipHistory}
      loading={loading}
      onRefresh={refresh}
    />
  );
}
