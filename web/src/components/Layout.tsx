import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useDashboard } from '../data/DataContext';

export function Layout({ children }: { children: ReactNode }) {
  const { status, error, data, reload } = useDashboard();

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
            <span className="source-chip" title="Generated sample data. Set VITE_DATA_URL in .env to load the census through n8n.">
              Demo data
            </span>
          )}
          {data && data.source !== 'demo' && (
            <span className="source-chip source-live">
              Updated {data.loadedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
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
                Check that n8n is running, that the Maternal Health Atlas workflow is active, and that its Postgres
                credential can reach your database. The workflow's Executions tab in n8n shows the error from the last
                request.
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
