'use client';

import { useEffect, useState } from 'react';
import { FileClock, FilePlus2, Settings, ShieldCheck, Users } from 'lucide-react';
import RosterView from '@/components/RosterView';
import GeneratorView from '@/components/GeneratorView';
import HistoryView from '@/components/HistoryView';
import SettingsView from '@/components/SettingsView';
import EntityLogo from '@/components/EntityLogo';
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
  // Zustand persist rehydrates from localStorage only on the client;
  // render the app after mount so server-exported HTML never mismatches.
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
              <p className="text-[11px] text-muted">Internal Salary Slip Generator</p>
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
            <ShieldCheck size={14} className="text-emerald-brand" />
            Local-only · No network · Data never leaves this browser
          </div>
        </div>
      </header>

      {/* no-print: window.print() renders only the portaled #slip-print-root sheet */}
      <main className="no-print mx-auto max-w-[1400px] px-6 py-6">
        {!mounted ? (
          <p className="py-20 text-center text-sm text-muted">Loading local data…</p>
        ) : tab === 'roster' ? (
          <RosterView onGenerateFor={() => setTab('generator')} />
        ) : tab === 'generator' ? (
          <GeneratorView />
        ) : tab === 'history' ? (
          <HistoryView />
        ) : (
          <SettingsView />
        )}
      </main>
    </div>
  );
}
