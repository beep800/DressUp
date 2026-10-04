import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

interface AuthState {
  email: string | null;
  signOut: (() => void) | null;
}

const AuthContext = createContext<AuthState>({ email: null, signOut: null });
export const useAuth = () => useContext(AuthContext);

/**
 * With Supabase configured, the dashboard is only shown to signed-in users: the
 * analytics views are granted to the `authenticated` role, never to `anon`.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!supabase) {
    return <AuthContext.Provider value={{ email: null, signOut: null }}>{children}</AuthContext.Provider>;
  }
  if (session === undefined) {
    return (
      <div className="center-screen">
        <p className="muted">Checking your sign-in…</p>
      </div>
    );
  }
  if (session === null) return <SignIn />;

  const client = supabase;
  return (
    <AuthContext.Provider value={{ email: session.user.email ?? null, signOut: () => void client.auth.signOut() }}>
      {children}
    </AuthContext.Provider>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (signInError) setError(`Sign-in failed: ${signInError.message}. Check your email and password, or ask an administrator to invite you.`);
  }

  return (
    <div className="center-screen">
      <form className="signin" onSubmit={onSubmit}>
        <div>
          <p className="eyebrow">Midwife census</p>
          <h1>Maternal Health Atlas</h1>
          <p className="muted">Sign in with the account your ministry administrator created for you.</p>
        </div>
        <label htmlFor="signin-email">
          Email
          <input
            id="signin-email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label htmlFor="signin-password">
          Password
          <input
            id="signin-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
