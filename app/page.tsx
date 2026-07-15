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

          {/* Icon-only tabs on mobile so all four always fit at 360px; labels from sm+. */}
          <nav className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:overflow-visible md:px-0">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                title={label}
                aria-label={label}
                className={`flex min-h-[44px] flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 sm:flex-none md:min-h-0 ${
                  tab === id
                    ? 'bg-ink text-paper'
                    : 'text-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <Icon size={18} strokeWidth={2} className="sm:h-[15px] sm:w-[15px]" />
                <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </nav>

          <div className="ml-auto hidden shrink-0 items-center gap-1.5 text-[11px] text-muted lg:flex">
            <Cloud size={14} className="text-emerald-brand" />
            Supabase-backed · Employees, slips &amp; settings synced to cloud
          </div>
        </div>
      </header>

      <main className="no-print mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {!mounted ? (
          <p className="py-20 text-center text-sm text-muted">Loading…</p>
        ) : error ? (
          <div className="rounded-lg border border-amber-edge bg-amber-tint px-4 py-6 text-center shadow-card">
            <p className="text-sm font-medium text-amber-brand">Could not load payroll data</p>
            <p className="mt-1 text-[12px] text-muted">{error}</p>
            <button
              className="mt-4 inline-flex items-center justify-center rounded-md bg-ink px-3.5 py-2 text-sm font-medium text-paper shadow-sm transition duration-150 hover:bg-ink/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-tint"
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
