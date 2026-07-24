import AppHeader from '@/components/AppHeader';
import AppSettingsProvider from '@/components/AppSettingsProvider';

/** Employer app shell — never wraps the public /verify routes. */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppSettingsProvider>
      <AppHeader />
      <main className="no-print mx-auto min-w-0 max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </AppSettingsProvider>
  );
}
