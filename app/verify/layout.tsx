import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payslip verification — Portfolix Entreprise',
  description: 'Public verification of an authorised salary slip issued by the employer.',
  robots: { index: false, follow: false },
};

/** Public verify shell — no app chrome, no settings hydrate, no third-party scripts. */
export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
