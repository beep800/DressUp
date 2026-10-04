import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildNationalTotals, buildRegionSummaries, type NationalTotals, type RegionSummary } from '../lib/aggregate';
import { loadDashboardData } from '../lib/api';
import type { DashboardData } from '../lib/types';

interface DashboardState {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  data: DashboardData | null;
  summaries: RegionSummary[];
  national: NationalTotals | null;
  reload: () => void;
}

const DashboardContext = createContext<DashboardState | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadDashboardData()
      .then((d) => !cancelled && setData(d))
      .catch((e: unknown) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  const value = useMemo<DashboardState>(() => {
    const summaries = data ? buildRegionSummaries(data) : [];
    return {
      status: error ? 'error' : data ? 'ready' : 'loading',
      error,
      data,
      summaries,
      national: data ? buildNationalTotals(summaries) : null,
      reload,
    };
  }, [data, error, reload]);

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
