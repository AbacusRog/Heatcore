import { useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabase';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(/invalid login/i.test(err.message) ? 'Email or password is not right.' : err.message);
    setBusy(false);
  }

  return (
    <div className="min-h-dvh">
      <main
        className="mx-auto flex max-w-[420px] flex-col gap-6 px-4"
        style={{
          paddingTop: 'calc(56px + env(safe-area-inset-top))',
          paddingBottom: 'calc(32px + env(safe-area-inset-bottom))',
        }}
      >
        <header className="flex flex-col gap-1">
          <h1 className="m-0 text-[1.7rem] font-bold leading-tight tracking-tight">Job Margin Checker</h1>
          <p className="m-0 text-[0.95rem] text-muted">Sign in to see your jobs on any device.</p>
        </header>

        <form onSubmit={submit} className="card flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="lbl">
              Email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="lbl">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="m-0 rounded-lg bg-negSoft px-3 py-2.5 text-[0.9rem] text-neg">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </main>
    </div>
  );
}
