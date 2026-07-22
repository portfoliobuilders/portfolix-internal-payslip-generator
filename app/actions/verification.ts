'use server';

/**
 * Legacy import path — public verification lives in verify-payslip.ts.
 */
export {
  fetchPublicPayslipVerification,
  type VerifyResult as VerificationResult,
} from '@/app/actions/verify-payslip';
export type { PublicVerificationPayload as PublicPayslipVerification } from '@/lib/verification';
