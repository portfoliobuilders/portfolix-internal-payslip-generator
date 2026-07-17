'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getSupabaseEnv, MISSING_CREDENTIALS_MESSAGE } from '@/utils/supabase/config';

export type AuthActionResult =
  | { ok: true }
  | { ok: false; error: string };

export async function signInWithPassword(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  if (!getSupabaseEnv()) {
    return { ok: false, error: MISSING_CREDENTIALS_MESSAGE };
  }

  const email = input.email.trim().toLowerCase();
  const password = input.password;
  if (!email || !password) {
    return { ok: false, error: 'Email and password are required.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
