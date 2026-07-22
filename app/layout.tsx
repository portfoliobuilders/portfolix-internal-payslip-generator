import type { Metadata, Viewport } from 'next';
import './globals.css';

export const dynamic = 'force-dynamic';

// Without this, phones render at ~980px and no Tailwind breakpoint ever fires.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: 'Portfolix SlipGen — Internal Salary Slip Generator',
  description:
    'Internal salary slip generator for Portfolix Entreprise Pvt Ltd. Employees and payroll history synced to Supabase.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
