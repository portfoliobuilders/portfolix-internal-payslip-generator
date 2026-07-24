/**
 * Map PostgREST / Postgres errors to user-facing copy.
 * Always log the raw detail server-side; never surface SQLSTATE / column text to the UI.
 */

type DbErrorLike = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
} | null | undefined;

const SCHEMA_DRIFT_USER_MESSAGE =
  'Database schema is behind the deployed code. Open Settings for pending migrations, then run them in the Supabase SQL Editor.';

export function logSupabaseError(context: string, error: DbErrorLike, extra?: unknown): void {
  console.error(`[supabase:${context}]`, {
    message: error?.message,
    code: error?.code,
    details: error?.details,
    hint: error?.hint,
    extra,
  });
}

function looksLikeSchemaDrift(message: string, code?: string): boolean {
  if (code === '42703' || code === '42P01') return true;
  return /column .+ does not exist|relation .+ does not exist|Could not find the '.+' column/i.test(
    message,
  );
}

function looksLikeRawPostgres(message: string): boolean {
  return (
    /SQLSTATE|ERROR:\s+|PGRST\d+|postgres|violates (check|foreign key|unique)|permission denied for/i.test(
      message,
    ) || /column .+ does not exist|relation .+ does not exist/i.test(message)
  );
}

/** Returns a safe UI string; never echoes raw Postgres / PostgREST diagnostics. */
export function toUserFacingDbError(
  error: DbErrorLike,
  fallback: string,
  context = 'db',
): string {
  const message = (error?.message ?? '').trim();
  const code = error?.code;
  logSupabaseError(context, error);

  if (!message) return fallback;

  // Known business collisions — map before the generic raw-Postgres scrub.
  if (
    code === '23505' ||
    /payroll_issued_documents_document_number_key|duplicate key value.*document_number/i.test(
      message,
    )
  ) {
    if (/document_number/i.test(message) || /payroll_issued_documents_document_number/i.test(message)) {
      return "This month's bank copy already exists — opening it.";
    }
    if (/payroll_slips_one_draft/i.test(message)) {
      return 'A draft for this employee and month already exists; it was replaced.';
    }
    if (/payroll_slips_one_active_final/i.test(message)) {
      return 'An active final already exists for this employee and month. Confirm supersede to replace it.';
    }
    return fallback;
  }

  if (looksLikeSchemaDrift(message, code)) return SCHEMA_DRIFT_USER_MESSAGE;
  if (looksLikeRawPostgres(message)) return fallback;

  // App-authored messages (validation, business rules) may pass through.
  return message;
}

export { SCHEMA_DRIFT_USER_MESSAGE };
