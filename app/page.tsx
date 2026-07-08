'use client';

import { useEffect, useState } from 'react';
import { Cloud, FileClock, FilePlus2, Settings, Users } from 'lucide-react';
import { fetchSettings } from '@/app/actions/settings';
import RosterView from '@/components/RosterView';
import GeneratorView from '@/components/GeneratorView';
import HistoryView from '@/components/HistoryView';
import SettingsView from '@/components/SettingsView';
import EntityLogo from '@/components/EntityLogo';
import { usePayrollData } from '@/hooks/usePayrollData';
import { useHRStore } from '@/store/useHRStore';

type Tab = 'roster' | 'generator' | 'history' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'roster', label: 'Employee Roster', icon: Users },
  { id: 'generator', label: 'Generator', icon: FilePlus2 },
  { id: 'history', label: 'History', icon: FileClock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>('roster');
  const pxEntity = useHRStore((s) => s.settings.entities.PX);
  const setSettings = useHRStore((s) => s.setSettings);
  const { employees, slipHistory, loading, error, refresh } = usePayrollData();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    void fetchSettings().then((result) => {
      if (result.ok) {
        setSettings(result.data);
      } else {
        console.error('[settings] fetch failed:', result.error);
      }
    });
  }, [setSettings]);

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 border-b border-hairline bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-2.5 px-4 py-3 sm:px-6 md:flex-row md:items-center md:gap-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink p-1">
              {mounted ? (
                <EntityLogo entity={pxEntity} code="PX" className="max-h-full max-w-full" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/logos/portfolix-enterprise.svg"
                  alt="Portfolix Enterprise Pvt Ltd"
                  className="max-h-full max-w-full object-contain"
                />
              )}
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Portfolix SlipGen</p>
              <p className="text-[11px] text-muted">Internal Salary Slip Generator</p>
            </div>
          </div>

          <nav className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:overflow-visible md:px-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 ${
                  tab === id
                    ? 'bg-ink text-paper'
                    : 'text-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <Icon size={15} strokeWidth={2} />
                {label}
              </button>
            ))}
          </nav>

          <div className="ml-auto hidden items-center gap-1.5 text-[11px] text-muted md:flex">
            <Cloud size={14} className="text-emerald-brand" />
            <span className="hidden lg:inline">Supabase-backed · Employees, slips &amp; settings synced to cloud</span>
            <span className="lg:hidden">Supabase-backed</span>
          </div>
        </div>
      </header>

      <main className="no-print mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {!mounted ? (
          <p className="py-20 text-center text-sm text-muted">Loading…</p>
        ) : error ? (
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
        ) : tab === 'roster' ? (
          <RosterView
            employees={employees}
            loading={loading}
            onRefresh={refresh}
            onGenerateFor={() => setTab('generator')}
          />
        ) : tab === 'generator' ? (
          <GeneratorView
            employees={employees}
            slipHistory={slipHistory}
            loading={loading}
            onRefresh={refresh}
          />
        ) : tab === 'history' ? (
          <HistoryView slipHistory={slipHistory} loading={loading} />
        ) : (
          <SettingsView />
        )}
      </main>
    </div>
  );
}
