import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requirePayrollAdmin } from '@/lib/auth';
import { createServiceRoleClient } from '@/utils/supabase/service-role';
import { getSupabaseEnv } from '@/utils/supabase/config';
import {
  SCHEMA_CANARY_COLUMNS,
  buildDriftReport,
} from '@/lib/schema-drift';
import { logSupabaseError } from '@/lib/supabase-errors';

export const dynamic = 'force-dynamic';

/**
 * Read-only schema health probe for ops (payroll-admin only).
 * Prefers service role for migration-history comparison; falls back to
 * canary column probes via the anon key. Never auto-applies migrations.
 */
export async function GET() {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) {
    return NextResponse.json(
      { ok: false, error: auth.error, code: auth.code },
      { status: auth.code === 'AUTH_REQUIRED' ? 401 : 503 },
    );
  }

  const admin = createServiceRoleClient();
  const env = getSupabaseEnv();

  let appliedNames: string[] = [];
  if (admin) {
    const { data: rows, error: migError } = await admin
      .schema('supabase_migrations')
      .from('schema_migrations')
      .select('name');

    if (migError) {
      logSupabaseError('health/schema:migrations', migError);
    } else {
      appliedNames = (rows ?? [])
        .map((row) => (row as { name?: string }).name)
        .filter((n): n is string => Boolean(n));
    }
  }

  const probeClient =
    admin ??
    (env ? createClient(env.url, env.key, { auth: { persistSession: false } }) : null);

  if (!probeClient) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and anon/publishable key.',
      },
      { status: 503 },
    );
  }

  const missingCanaries: string[] = [];
  for (const canary of SCHEMA_CANARY_COLUMNS) {
    const { error } = await probeClient.from(canary.table).select(canary.column).limit(0);
    if (
      error &&
      (/does not exist|Could not find the/i.test(error.message) || error.code === '42703')
    ) {
      missingCanaries.push(`${canary.table}.${canary.column} ← ${canary.migrationHint}`);
      logSupabaseError('health/schema:canary', error, canary);
    }
  }

  // Without migration history access, canaries alone determine loud failure.
  if (appliedNames.length === 0 && !admin) {
    const canaryOnlyOk = missingCanaries.length === 0;
    const bannerMessage = canaryOnlyOk
      ? null
      : `Database schema is behind the deployed code — ${missingCanaries.length} pending migration${
          missingCanaries.length === 1 ? '' : 's'
        }: ${missingCanaries.join(', ')}. Run them in the Supabase SQL Editor.`;
    return NextResponse.json(
      {
        ok: canaryOnlyOk,
        pendingMigrations: [],
        missingCanaries,
        appliedCount: 0,
        expectedCount: 0,
        message: bannerMessage,
        mode: 'canary-only',
      },
      { status: canaryOnlyOk ? 200 : 503 },
    );
  }

  const report = buildDriftReport(appliedNames, missingCanaries);
  return NextResponse.json(
    {
      ok: report.ok,
      pendingMigrations: report.pendingMigrations,
      missingCanaries: report.missingCanaries,
      appliedCount: report.appliedCount,
      expectedCount: report.expectedCount,
      message: report.bannerMessage,
      mode: 'migrations+canaries',
    },
    { status: report.ok ? 200 : 503 },
  );
}
