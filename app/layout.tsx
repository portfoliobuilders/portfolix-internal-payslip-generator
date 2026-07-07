import type { Metadata } from 'next';
import './globals.css';
import AppHeader from '@/components/AppHeader';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Portfolix SlipGen — Internal Salary Slip Generator',
  description:
    'Internal salary slip generator for Portfolix Enterprise Pvt Ltd. Employees and payroll history synced to Supabase.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AppHeader />
        <main className="no-print mx-auto max-w-[1400px] px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
