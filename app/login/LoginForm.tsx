'use client';

import { FormEvent, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithPassword } from '@/app/actions/auth';

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') || '/employee-roster';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signInWithPassword({ email, password });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.replace(next.startsWith('/') ? next : '/employee-roster');
      router.refresh();
    });
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center">
      <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Payroll admin access is required for all SlipGen routes except public payslip
        verification.
      </p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border border-hairline bg-paper px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ink/20"
          />
        </label>
        {error ? (
          <p className="rounded-md border border-amber-brand/40 bg-amber-brand/10 px-3 py-2 text-sm text-ink">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-ink px-3 py-2.5 text-sm font-medium text-paper disabled:opacity-60"
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
