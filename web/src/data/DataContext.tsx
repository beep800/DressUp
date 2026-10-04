import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildNationalTotals, buildRegionSummaries, type NationalTotals, type RegionSummary } from '../lib/aggregate';
import { PasswordRequiredError, loadDashboardData, savePassword } from '../lib/api';
import type { DashboardData } from '../lib/types';

interface DashboardState {
  status: 'loading' | 'ready' | 'error' | 'locked';
  error: string | null;
  /** True when the password just entered was not accepted. */
  passwordRejected: boolean;
  data: DashboardData | null;
  summaries: RegionSummary[];
  national: NationalTotals | null;
  reload: () => void;
  unlock: (password: string) => void;
}

const DashboardContext = createContext<DashboardState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<{ rejected: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadDashboardData()
      .then((d) => {
        if (cancelled) return;
        setLocked(null);
        setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        if (e instanceof PasswordRequiredError) setLocked({ rejected: e.rejected });
        else setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const unlock = useCallback((password: string) => {
    savePassword(password);
    setLocked(null);
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<DashboardState>(() => {
    const summaries = data ? buildRegionSummaries(data) : [];
    return {
      status: locked ? 'locked' : error ? 'error' : data ? 'ready' : 'loading',
      error,
      passwordRejected: locked?.rejected ?? false,
      data,
      summaries,
      national: data ? buildNationalTotals(data, summaries) : null,
      reload,
      unlock,
    };
  }, [data, error, locked, reload, unlock]);

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardState {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside DataProvider');
  return ctx;
}

/** For pages that render only once data is ready (Layout guarantees this). */
export function useReadyDashboard() {
  const { data, summaries, national } = useDashboard();
  if (!data || !national) throw new Error('Dashboard data is not loaded yet');
  return { data, summaries, national };
}
