import { useState, type FormEvent, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useDashboard } from '../data/DataContext';

function PasswordGate({ rejected, onSubmit }: { rejected: boolean; onSubmit: (password: string) => void }) {
  const [password, setPassword] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (password) onSubmit(password);
  };
  return (
    <form className="panel gate" onSubmit={submit}>
      <div>
        <p className="eyebrow">Midwife census</p>
        <h1>Maternal Health Atlas</h1>
      </div>
      <p className="muted">This dashboard shows patient health data. Enter the password you were given to open it.</p>
      <label htmlFor="site-password">
        Password
        <input
          id="site-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {rejected && (
        <p className="form-error" role="alert">
          That password didn't work. Check it with the person who shared this page.
        </p>
      )}
      <button className="btn btn-primary" type="submit">
        Open dashboard
      </button>
    </form>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { status, error, data, reload, unlock, passwordRejected } = useDashboard();

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
        {status === 'locked' && (
          <div className="center-screen">
            <PasswordGate rejected={passwordRejected} onSubmit={unlock} />
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
