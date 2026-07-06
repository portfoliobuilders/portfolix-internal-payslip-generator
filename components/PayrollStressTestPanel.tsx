'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FlaskConical } from 'lucide-react';
import {
  STRESS_SCENARIOS,
  logStressTestsToConsole,
  runAllStressTests,
} from '@/lib/payroll-stress-test';

export default function PayrollStressTestPanel() {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const runs = runAllStressTests();
  const passCount = runs.filter((r) => r.allPass).length;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('audit') === '1' || params.get('stress') === '1') {
      setOpen(true);
      logStressTestsToConsole();
    }
  }, []);

  return (
    <div className="rounded-lg border border-dashed border-hairline bg-surface/50">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) logStressTestsToConsole();
        }}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-muted hover:text-ink"
      >
        <FlaskConical size={16} />
        Payroll stress test (auditor)
        <span
          className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            passCount === runs.length
              ? 'bg-emerald-tint text-emerald-600'
              : 'bg-amber-tint text-amber-600'
          }`}
        >
          {passCount}/{runs.length} pass
        </span>
        <span className="ml-auto">{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-hairline px-4 pb-4 pt-3">
          <p className="text-[11px] text-muted">
            Simulates edge cases against <code className="text-ink">lib/payroll-calc.ts</code> (fixed
            divisor 25). Results are also logged to the browser console. Append{' '}
            <code className="text-ink">?audit=1</code> to the URL to auto-open.
          </p>
          <button
            type="button"
            onClick={() => logStressTestsToConsole()}
            className="rounded-md border border-hairline bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface"
          >
            Re-run &amp; log to console
          </button>

          {runs.map(({ scenario, result, expectations, allPass }) => {
            const expanded = expandedId === scenario.id;
            return (
              <div key={scenario.id} className="rounded-md border border-hairline bg-paper">
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : scenario.id)}
                  className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
                >
                  <span
                    className={`mt-0.5 shrink-0 text-xs font-bold ${allPass ? 'text-emerald-600' : 'text-amber-600'}`}
                  >
                    {allPass ? 'PASS' : 'FAIL'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{scenario.title}</p>
                    <p className="text-[11px] text-muted">{scenario.description}</p>
                  </div>
                </button>
                {expanded && (
                  <div className="border-t border-hairline px-3 py-2">
                    <table className="w-full text-[11px]">
                      <thead>
                        <tr className="text-left text-muted">
                          <th className="pb-1 font-semibold">Check</th>
                          <th className="amount pb-1 text-right font-semibold">Expected</th>
                          <th className="amount pb-1 text-right font-semibold">Actual</th>
                          <th className="pb-1 text-right font-semibold">OK</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expectations.map((e) => (
                          <tr key={e.label} className="border-t border-hairline/60">
                            <td className="py-1 pr-2">{e.label}</td>
                            <td className="amount py-1 text-right tabular-nums">{e.expected}</td>
                            <td className="amount py-1 text-right tabular-nums">{e.actual}</td>
                            <td className={`py-1 text-right font-semibold ${e.pass ? 'text-emerald-600' : 'text-amber-600'}`}>
                              {e.pass ? '✓' : '✗'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="mt-2 text-[10px] text-muted">
                      newFlexBalance={result.newFlexBalance} · deferredClosing=
                      {result.deferredClosing} · netPay={result.netPay}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
