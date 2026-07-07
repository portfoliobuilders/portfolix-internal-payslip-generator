import type { Metadata } from 'next';
import './globals.css';
import AppShell from '@/components/AppShell';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Portfolix SlipGen — Internal Salary Slip Generator',
  description:
    'Internal salary slip generator for Portfolix Enterprise Pvt Ltd. Employees and payroll history synced to Supabase.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
