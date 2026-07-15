'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Cloud, FileClock, FilePlus2, Settings, Users } from 'lucide-react';
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

  useEffect(() => setMounted(true), []);

  return (
    <header className="no-print sticky top-0 z-40 border-b border-hairline bg-paper">
      <div className="mx-auto flex max-w-[1400px] items-center gap-6 px-6 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-24 items-center justify-center overflow-hidden rounded-md bg-ink p-1">
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
          <div className="leading-tight">
            <p className="text-sm font-semibold tracking-tight">Portfolix SlipGen</p>
            <p className="text-[11px] text-muted">Internal Salary Slip Generator</p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-ink text-paper' : 'text-muted hover:bg-surface hover:text-ink'
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
          Supabase-backed · Employees &amp; slips synced to cloud
        </div>
      </div>
    </header>
  );
}
