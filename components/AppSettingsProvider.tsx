'use client';

import { useAppSettings } from '@/hooks/useAppSettings';

/** Hydrates payroll settings from Supabase on every route. */
export default function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  useAppSettings();
  return <>{children}</>;
}
