const MISSING_CREDENTIALS_MESSAGE =
  'Supabase credentials missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).';

export type SupabaseEnv = {
  url: string;
  key: string;
};

export function getSupabaseEnv(): SupabaseEnv | null {
  console.log('[Supabase Config Check]:', {
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    hasPublishableKey: !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    nodeEnv: process.env.NODE_ENV,
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    return null;
  }

  return { url, key };
}

export function logMissingSupabaseCredentials(context: string): void {
  console.error(`[supabase:${context}] ${MISSING_CREDENTIALS_MESSAGE}`);
}

export { MISSING_CREDENTIALS_MESSAGE };
