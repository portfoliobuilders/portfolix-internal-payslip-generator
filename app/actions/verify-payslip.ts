'use server';

/**
 * Legacy path — re-exports the hardened public verification action.
 * Do not add fields here; keep /verify/payslip privacy contract in verification.ts.
 */

export {
  fetchPublicPayslipVerification,
  type PublicPayslipVerification,
  type VerificationResult,
} from '@/app/actions/verification';
