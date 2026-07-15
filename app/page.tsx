import { redirect } from 'next/navigation';

import { useEffect, useState } from 'react';
import { Cloud, FileClock, FilePlus2, Settings, Users } from 'lucide-react';
import RosterView from '@/components/RosterView';
import GeneratorView from '@/components/GeneratorView';
import HistoryView from '@/components/HistoryView';
import SettingsView from '@/components/SettingsView';
import EntityLogo from '@/components/EntityLogo';
import { usePayrollData } from '@/hooks/usePayrollData';
import { useHRStore } from '@/store/useHRStore';

type Tab = 'roster' | 'generator' | 'history' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'roster', label: 'Workforce Roster', icon: Users },
  { id: 'generator', label: 'Generator', icon: FilePlus2 },
  { id: 'history', label: 'History', icon: FileClock },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>('roster');
  const pxEntity = useHRStore((s) => s.settings.entities.PX);
  const { employees, slipHistory, loading, error, refresh } = usePayrollData();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen">
      <header className="no-print sticky top-0 z-40 border-b border-hairline bg-paper">
        <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-24 items-center justify-center overflow-hidden rounded-md bg-ink p-1">
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
              <p className="text-[11px] text-muted">Internal Workforce Payment Statement Generator</p>
            </div>
          </div>

          <nav className="flex items-center gap-1">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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

          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
            <Cloud size={14} className="text-emerald-brand" />
            Supabase-backed · Employees &amp; slips synced to cloud
          </div>
        </div>
      </header>

      <main className="no-print mx-auto max-w-[1400px] px-6 py-6">
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
