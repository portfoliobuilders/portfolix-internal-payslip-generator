'use client';

/**
 * Legacy payroll context + AppShell wrapper. No current route/layout imports
 * this module (pages use AppHeader + local usePayrollData hooks). Kept as
 * unused scaffolding; prefer AppHeader/layout over re-wiring this provider.
 */

import AppShell from '@/components/AppShell';
import { useAppSettings } from '@/hooks/useAppSettings';
import { usePayrollData } from '@/hooks/usePayrollData';
import { createContext, useContext } from 'react';
import type { Employee, SlipSnapshot } from '@/lib/types';

interface PayrollDataContextValue {
  employees: Employee[];
  slipHistory: SlipSnapshot[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setSlipHistory: React.Dispatch<React.SetStateAction<SlipSnapshot[]>>;
}

const PayrollDataContext = createContext<PayrollDataContextValue | null>(null);

export function usePayrollDataContext(): PayrollDataContextValue {
  const ctx = useContext(PayrollDataContext);
  if (!ctx) throw new Error('usePayrollDataContext must be used within PayrollDataProvider');
  return ctx;
}

export default function PayrollDataProvider({ children }: { children: React.ReactNode }) {
  const payrollData = usePayrollData();
  useAppSettings();

  return (
    <PayrollDataContext.Provider value={payrollData}>
      <AppShell>{children}</AppShell>
    </PayrollDataContext.Provider>
  );
}
