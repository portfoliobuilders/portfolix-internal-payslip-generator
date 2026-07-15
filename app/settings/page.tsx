import { COMPANY_ENTITIES, PAYROLL_CONTACT } from '@/lib/constants/company';

export default function SettingsPage() {
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-8">
      <div>
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="mt-1 text-sm text-muted">
          Company details are configured statically in the codebase.
        </p>
      </div>

      <section className="rounded-lg border border-hairline bg-paper p-5">
        <h2 className="text-sm font-semibold text-ink">Payroll contact</h2>
        <p className="mt-2 text-sm text-muted">{PAYROLL_CONTACT}</p>
      </section>

      <section className="space-y-4">
        {COMPANY_ENTITIES.map((entity) => (
          <article key={entity.id} className="rounded-lg border border-hairline bg-paper p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Display name
                </p>
                <p className="text-sm text-ink">{entity.displayName}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Legal line
                </p>
                <p className="text-sm text-ink">{entity.legalLine}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Address</p>
                <p className="whitespace-pre-line text-sm text-ink">{entity.address}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Logo path
                </p>
                <p className="text-sm text-ink">{entity.logoPath}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
