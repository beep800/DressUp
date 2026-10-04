import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useDashboard } from '../data/DataContext';
import { DATA_MODE } from '../lib/api';
import { useAuth } from './AuthGate';

const ERROR_HINTS = {
  endpoint: (
    <>
      Check that n8n is running, that the Maternal Health Atlas workflow is active, and that its Postgres credential
      can reach Supabase. The workflow's Executions tab shows the error from the last request.
    </>
  ),
  supabase: (
    <>
      Check that the <code>analytics</code> schema is listed under Exposed schemas in the Supabase API settings, that{' '}
      <code>sql/002_dashboard_access.sql</code> has been run, and that the materialized views have been refreshed.
    </>
  ),
  demo: null,
};

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
            <span className="source-chip" title="Generated sample data. Point .env at your n8n workflow or Supabase project to load the census.">
              Demo data
            </span>
          )}
          {data && data.source !== 'demo' && (
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
              {ERROR_HINTS[DATA_MODE] && <p className="muted">{ERROR_HINTS[DATA_MODE]}</p>}
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
