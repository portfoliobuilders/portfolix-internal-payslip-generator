'use client';

/**
 * Shares a single payroll-data fetch across all route pages.
 *
 * usePayrollData() runs its Supabase fetch once here, in the provider that
 * lives in the persistent app shell. Because the shell layout does NOT remount
 * when navigating between /, /generator, /history and /settings, the data is
 * fetched once and reused — switching tabs stays instant, no re-fetch.
 */

import { createContext, useContext, type ReactNode } from 'react';
import { usePayrollData } from '@/hooks/usePayrollData';

type PayrollData = ReturnType<typeof usePayrollData>;

const PayrollDataContext = createContext<PayrollData | null>(null);

export function PayrollDataProvider({ children }: { children: ReactNode }) {
  const value = usePayrollData();
  return <PayrollDataContext.Provider value={value}>{children}</PayrollDataContext.Provider>;
}

export function usePayrollContext(): PayrollData {
  const ctx = useContext(PayrollDataContext);
  if (!ctx) {
    throw new Error('usePayrollContext must be used within <PayrollDataProvider>.');
  }
  return ctx;
}
