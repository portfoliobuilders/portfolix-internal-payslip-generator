'use client';

import { useState } from 'react';
import { formatDistanceToNow, parseISO, isValid } from 'date-fns';
import { formatDateTime } from '@/lib/format';
import type { VerificationHitSummary } from '@/app/actions/verification-hits';
import type { DocumentLifecycleStatus } from '@/lib/salary-payment-types';

interface AuthorisedDocVerificationIndicatorProps {
  status?: DocumentLifecycleStatus;
  summary?: VerificationHitSummary | null;
}

function relativeHit(iso: string | null): string {
  if (!iso) return '—';
  const d = parseISO(iso);
  if (!isValid(d)) return '—';
  return formatDistanceToNow(d, { addSuffix: true });
}

/**
 * Employer-only chip accessory: verification hit count + expandable list.
 * Must never appear on the public verify page.
 */
export default function AuthorisedDocVerificationIndicator({
  status,
  summary,
}: AuthorisedDocVerificationIndicatorProps) {
  const [open, setOpen] = useState(false);

  if (!status || !status.startsWith('AUTHORISED')) {
    return <span className="text-[11px] text-muted">—</span>;
  }

  const label =
    status === 'AUTHORISED_BLOCKED'
      ? 'Blocked'
      : status === 'AUTHORISED_ELIGIBLE'
        ? 'Eligible'
        : status === 'AUTHORISED_ISSUED'
          ? 'Issued'
          : status.replace(/_/g, ' ');

  const count = summary?.count ?? 0;
  const showHits = count > 0;

  return (
    <div className="space-y-1">
      <span className="rounded border border-hairline bg-surface px-1.5 py-0.5 text-[10px] font-medium">
        {label}
      </span>
      {showHits && (
        <div>
          <button
            type="button"
            className="block text-left text-[10px] leading-snug text-muted underline-offset-2 hover:text-ink hover:underline"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            verified {count}×, last {relativeHit(summary?.lastHitAt ?? null)}
          </button>
          {open && summary && (
            <ul className="mt-1 max-h-36 overflow-y-auto rounded border border-hairline bg-paper px-2 py-1.5 text-[10px] text-ink">
              {summary.hits.map((hit) => (
                <li
                  key={hit.id}
                  className="flex flex-col gap-0.5 border-b border-hairline py-1 last:border-b-0"
                >
                  <span className="font-medium">{formatDateTime(hit.hitAt)}</span>
                  <span className="text-muted">{hit.coarseUserAgent}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
