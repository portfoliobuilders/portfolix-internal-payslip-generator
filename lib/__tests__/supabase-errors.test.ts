/**
 * Safe DB error mapping — unit tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { SCHEMA_DRIFT_USER_MESSAGE, toUserFacingDbError } from '@/lib/supabase-errors';

describe('toUserFacingDbError', () => {
  it('maps document_number unique collisions', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = toUserFacingDbError(
      { code: '23505', message: 'duplicate key value violates unique constraint "payroll_issued_documents_document_number_key"' },
      'fallback',
    );
    expect(msg).toBe("This month's bank copy already exists — opening it.");
    spy.mockRestore();
  });

  it('maps missing-column schema drift', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = toUserFacingDbError(
      { code: '42703', message: 'column employees.compensation_amount does not exist' },
      'fallback',
    );
    expect(msg).toBe(SCHEMA_DRIFT_USER_MESSAGE);
    spy.mockRestore();
  });

  it('scrubs raw postgres noise to fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = toUserFacingDbError(
      { message: 'ERROR: permission denied for table employees' },
      'Could not save employee.',
    );
    expect(msg).toBe('Could not save employee.');
    spy.mockRestore();
  });
});
