import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useDashboard } from '../data/DataContext';
import { useAuth } from './AuthGate';

export function Layout({ children }: { children: ReactNode }) {
  const { status, error, data, reload } = useDashboard();
  const { email, signOut } = useAuth();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-name">Maternal Health Atlas</span>
          <span className="brand-sub">Midwife census analytics</span>
        </div>
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            Regions
          </NavLink>
          <NavLink to="/operations">Data capture</NavLink>
        </nav>
        <div className="topbar-end">
          {data?.source === 'demo' && (
            <span className="source-chip" title="Generated sample data. Add your Supabase URL and anon key to .env to load the census.">
              Demo data
            </span>
          )}
          {data?.source === 'supabase' && (
            <span className="source-chip source-live">
              Updated {data.loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          {email && <span className="user-email">{email}</span>}
          {signOut && (
            <button className="btn btn-quiet" type="button" onClick={signOut}>
              Sign out
            </button>
          )}
        </div>
      </header>

      <main className="main">
        {status === 'loading' && (
          <div className="center-screen">
            <p className="muted">Loading census data…</p>
          </div>
        )}
        {status === 'error' && (
          <div className="center-screen">
            <div className="panel error-panel" role="alert">
              <h2>The dashboard could not load its data</h2>
              <p>{error}</p>
              <p className="muted">
                Check that the <code>analytics</code> schema is listed under Exposed schemas in the Supabase API
                settings, that <code>sql/002_dashboard_access.sql</code> has been run, and that the materialized views
                have been refreshed.
              </p>
              <button className="btn btn-primary" type="button" onClick={reload}>
                Try again
              </button>
            </div>
          </div>
        )}
        {status === 'ready' && children}
      </main>
    </div>
  );
}
