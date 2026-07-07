'use client';

/**
 * Persistent app shell shared by every route.
 *
 * Holds the header (logo + nav) and the single PayrollDataProvider so data is
 * fetched once and kept across navigation. Nav items are real <Link>s, so the
 * URL changes per section (/, /generator, /history, /settings), back/forward
 * work, and a refresh keeps you on the current page. Active state is derived
 * from the current pathname.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cloud, FileClock, FilePlus2, Settings, Users } from 'lucide-react';
import { fetchSettings } from '@/app/actions/settings';
import EntityLogo from '@/components/EntityLogo';
import { PayrollDataProvider, usePayrollContext } from '@/components/PayrollDataProvider';
import { useHRStore } from '@/store/useHRStore';

const NAV: { href: string; label: string; icon: typeof Users }[] = [
  { href: '/', label: 'Employee Roster', icon: Users },
  { href: '/generator', label: 'Generator', icon: FilePlus2 },
  { href: '/history', label: 'History', icon: FileClock },
  { href: '/settings', label: 'Settings', icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <PayrollDataProvider>
      <ShellInner>{children}</ShellInner>
    </PayrollDataProvider>
  );
}

function ShellInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const pxEntity = useHRStore((s) => s.settings.entities.PX);
  const setSettings = useHRStore((s) => s.setSettings);
  const { error, refresh } = usePayrollContext();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Load persisted settings (payroll calendar + entity branding + logos) once.
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
            {NAV.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active ? 'bg-ink text-paper' : 'text-muted hover:bg-surface hover:text-ink'
                  }`}
                >
                  <Icon size={15} strokeWidth={2} />
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">
            <Cloud size={14} className="text-emerald-brand" />
            Supabase-backed · Employees, slips &amp; settings synced to cloud
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
        ) : (
          children
        )}
      </main>
    </div>
  );
}
