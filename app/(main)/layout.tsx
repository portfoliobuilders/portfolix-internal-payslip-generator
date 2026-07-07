import PayrollDataProvider from '@/components/PayrollDataProvider';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <PayrollDataProvider>{children}</PayrollDataProvider>;
}
