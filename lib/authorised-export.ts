/**
 * Shared AUTHORISED SALARY SLIP export path (client-callable).
 * Delegates PDF build + private asset embedding to a Node server action.
 * Never fabricates payment data. Never embeds browser signed URLs into the PDF.
 */

import { generateAuthorisedSalarySlipPdfAction } from '@/app/actions/authorised-pdf';
import { downloadPdfBytes } from '@/lib/download-pdf';
import type { EntityInfo, SlipSnapshot } from '@/lib/types';

export interface AuthorisedExportResult {
  documentNumber: string;
  publicVerificationId: string;
  verificationUrl: string;
  filename: string;
  sizeBytes: number;
  reusedImmutablePdf: boolean;
  embedded: { signature: boolean; seal: boolean };
}

function verificationBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://portfolix-internal-payslip-generato.vercel.app';
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Gate → issue/reuse verification document → build vector PDF with embedded
 * signature/seal (server-side) → download. Historical reprints return the
 * frozen issued PDF when available.
 */
export async function exportAuthorisedSalarySlipPdf(input: {
  snapshot: SlipSnapshot;
  entity: EntityInfo;
}): Promise<
  | { ok: true; data: AuthorisedExportResult }
  | { ok: false; error: string }
> {
  const generated = await generateAuthorisedSalarySlipPdfAction({
    snapshot: input.snapshot,
    entity: input.entity,
    verificationBaseUrl: verificationBaseUrl(),
  });
  if (!generated.ok) return generated;

  downloadPdfBytes(base64ToUint8Array(generated.data.pdfBase64), generated.data.filename);

  return {
    ok: true,
    data: {
      documentNumber: generated.data.documentNumber,
      publicVerificationId: generated.data.publicVerificationId,
      verificationUrl: generated.data.verificationUrl,
      filename: generated.data.filename,
      sizeBytes: generated.data.sizeBytes,
      reusedImmutablePdf: generated.data.reusedImmutablePdf,
      embedded: generated.data.embedded,
    },
  };
}
