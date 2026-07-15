'use client';

import { useRouter } from 'next/navigation';
import RosterView from '@/components/RosterView';
import { usePayrollContext } from '@/components/PayrollDataProvider';

export default function RosterPage() {
  const router = useRouter();
  const { employees, loading, refresh } = usePayrollContext();

  return (
    <RosterView
      employees={employees}
      loading={loading}
      onRefresh={refresh}
      // RosterView sets the preselected employee in useUIStore before calling
      // this, then we navigate; GeneratorView reads that on mount.
      onGenerateFor={() => router.push('/generator')}
    />
  );
}
