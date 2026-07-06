'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  fetchEmployees,
  fetchPayrollHistory,
} from '@/app/actions/payroll';
import type { Employee, SlipSnapshot } from '@/lib/types';

interface PayrollDataState {
  employees: Employee[];
  slipHistory: SlipSnapshot[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setEmployees: React.Dispatch<React.SetStateAction<Employee[]>>;
  setSlipHistory: React.Dispatch<React.SetStateAction<SlipSnapshot[]>>;
}

export function usePayrollData(): PayrollDataState {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [slipHistory, setSlipHistory] = useState<SlipSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    const [employeesResult, historyResult] = await Promise.all([
      fetchEmployees(),
      fetchPayrollHistory(),
    ]);

    if (!employeesResult.ok) {
      setError(employeesResult.error);
      setLoading(false);
      return;
    }
    if (!historyResult.ok) {
      setError(historyResult.error);
      setLoading(false);
      return;
    }

    setEmployees(employeesResult.data);
    setSlipHistory(historyResult.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    employees,
    slipHistory,
    loading,
    error,
    refresh,
    setEmployees,
    setSlipHistory,
  };
}
