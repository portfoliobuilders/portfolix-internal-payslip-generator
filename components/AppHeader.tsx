'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cloud, FileClock, FilePlus2, LogOut, Settings, Users } from 'lucide-react';
import { signOut } from '@/app/actions/auth';
import EntityLogo from '@/components/EntityLogo';
import { useHRStore } from '@/store/useHRStore';

const NAV_ITEMS = [
  { href: '/employee-roster', label: 'Employee Roster', icon: Users },
  { href: '/generator', label: 'Generator', icon: FilePlus2 },
  { href: '/history', label: 'History', icon: FileClock },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function AppHeader() {
  const pathname = usePathname();
  const pxEntity = useHRStore((s) => s.settings.entities.PX);
  const [mounted, setMounted] = useState(false);
  const [signingOut, startSignOut] = useTransition();

  useEffect(() => setMounted(true), []);

  if (pathname === '/login' || pathname.startsWith('/verify/') || pathname.startsWith('/auth/')) {
    return null;
  }

  return (
    <header className="no-print sticky top-0 z-40 border-b border-hairline bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-2.5 px-4 py-3 sm:px-6 md:flex-row md:items-center md:gap-6 lg:px-8">
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex h-9 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink p-1">
            {mounted ? (
              <EntityLogo entity={pxEntity} code="PX" className="max-h-full max-w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/logos/portfolix-entreprise.png"
                alt="Portfolix Entreprise Pvt Ltd"
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>
          <div className="min-w-0 leading-tight">
            <p className="text-sm font-semibold tracking-tight">Portfolix SlipGen</p>
            <p className="text-[11px] text-muted">Internal Salary Slip Generator</p>
          </div>
        </div>

        {/* Icon-only tabs on mobile so all four fit at ~360px; labels from sm+. */}
        <nav className="no-scrollbar -mx-4 flex items-center gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6 md:mx-0 md:overflow-visible md:px-0">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                title={label}
                aria-label={label}
                className={`flex min-h-[44px] flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 sm:flex-none md:min-h-0 ${
                  isActive ? 'bg-ink text-paper' : 'text-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <Icon size={18} strokeWidth={2} className="sm:h-[15px] sm:w-[15px]" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-3">
          <div className="hidden items-center gap-1.5 text-[11px] text-muted lg:flex">
            <Cloud size={14} className="text-emerald-brand" />
            Supabase-backed · Employees &amp; slips synced to cloud
          </div>
          <button
            type="button"
            title="Sign out"
            aria-label="Sign out"
            disabled={signingOut}
            onClick={() => startSignOut(() => signOut())}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-surface hover:text-ink md:min-h-0"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
