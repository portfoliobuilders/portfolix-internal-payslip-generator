'use server';

/**
 * Read-only schema drift check: repo expected migrations vs live applied set,
 * plus canary column probes. Never auto-applies migrations.
 */

import { createClient as createAnonClient } from '@supabase/supabase-js';
import { requirePayrollAdmin } from '@/lib/auth';
import { createClient } from '@/utils/supabase/server';
import { createServiceRoleClient } from '@/utils/supabase/service-role';
import { getSupabaseEnv } from '@/utils/supabase/config';
import {
  SCHEMA_CANARY_COLUMNS,
  buildDriftReport,
  type SchemaDriftReport,
} from '@/lib/schema-drift';
import { logSupabaseError } from '@/lib/supabase-errors';

export type { SchemaDriftReport };

async function fetchAppliedMigrationNames(): Promise<string[]> {
  const admin = createServiceRoleClient();
  if (admin) {
    const { data, error } = await admin
      .schema('supabase_migrations')
      .from('schema_migrations')
      .select('name');
    if (!error && Array.isArray(data)) {
      return data
        .map((row) => (row as { name?: string }).name)
        .filter((n): n is string => Boolean(n));
    }
    logSupabaseError('schema-drift:schema_migrations', error);
  }
  return [];
}

async function probeMissingCanaries(): Promise<string[]> {
  const env = getSupabaseEnv();
  const supabase = env
    ? createAnonClient(env.url, env.key, { auth: { persistSession: false } })
    : await createClient();
  const missing: string[] = [];

  for (const canary of SCHEMA_CANARY_COLUMNS) {
    const { error } = await supabase.from(canary.table).select(canary.column).limit(0);
    if (error) {
      const msg = error.message ?? '';
      if (/does not exist|Could not find the/i.test(msg) || error.code === '42703') {
        missing.push(`${canary.table}.${canary.column} ← ${canary.migrationHint}`);
        logSupabaseError('schema-drift:canary', error, canary);
      }
    }
  }

  return missing;
}

export async function checkSchemaDrift(): Promise<
  { ok: true; data: SchemaDriftReport } | { ok: false; error: string }
> {
  const auth = await requirePayrollAdmin();
  if (!auth.ok) return auth;

  try {
    const [appliedNames, missingCanaries] = await Promise.all([
      fetchAppliedMigrationNames(),
      probeMissingCanaries(),
    ]);

    const report = buildDriftReport(appliedNames, missingCanaries);

    // No secret key → cannot read schema_migrations; canaries still surface drift.
    if (appliedNames.length === 0 && !createServiceRoleClient()) {
      const canaryOnlyOk = missingCanaries.length === 0;
      return {
        ok: true,
        data: {
          ok: canaryOnlyOk,
          pendingMigrations: [],
          missingCanaries,
          appliedCount: 0,
          expectedCount: 0,
          bannerMessage: canaryOnlyOk
            ? null
            : `Database schema is behind the deployed code — ${missingCanaries.length} pending migration${
                missingCanaries.length === 1 ? '' : 's'
              }: ${missingCanaries.join(', ')}. Run them in the Supabase SQL Editor.`,
        },
      };
    }

    return { ok: true, data: report };
  } catch (err) {
    logSupabaseError('schema-drift', {
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      error: 'Could not verify database schema. Check server logs.',
    };
  }
}
