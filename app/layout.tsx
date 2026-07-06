import type { Metadata } from 'next';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Portfolix SlipGen — Internal Salary Slip Generator',
  description:
    'Internal salary slip generator for Portfolix Enterprise Pvt Ltd. Employees and payroll history synced to Supabase.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
