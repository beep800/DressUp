import { generateDemoData } from './demoData';
import type {
  AreaRow,
  DashboardData,
  DocumentDayRow,
  GeocodingStatus,
  MidwifeHealthRow,
  MidwifeMonthRow,
  SocioeconomicRow,
} from './types';

/** The n8n webhook that returns the dashboard data. Without it the app runs on demo data. */
export const DATA_URL = (import.meta.env.VITE_DATA_URL as string | undefined) || undefined;

export const DATA_MODE: 'n8n' | 'demo' = DATA_URL ? 'n8n' : 'demo';

const PAYLOAD_KEYS = ['areas', 'midwifeHealth', 'socioeconomic', 'midwifeMonths', 'documentDays'] as const;

async function fetchJson(url: string, what: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    throw new Error(`Could not reach ${what} at ${url}.`);
  }
  if (!response.ok) throw new Error(`${what} at ${url} answered ${response.status} ${response.statusText}.`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${what} at ${url} did not return JSON.`);
  }
}

async function loadFromN8n(url: string): Promise<DashboardData> {
  const raw = await fetchJson(url, 'The n8n workflow');
  // n8n may wrap the object in an array, or under the query's column name.
  const first: unknown = Array.isArray(raw) ? raw[0] : raw;
  const body = (first && typeof first === 'object' && 'payload' in first ? first.payload : first) as
    | Record<string, unknown>
    | undefined;
  const missing = PAYLOAD_KEYS.filter((key) => !Array.isArray(body?.[key]));
  if (!body || missing.length > 0) {
    throw new Error(`The n8n workflow's response is missing ${missing.join(', ')}.`);
  }
  return {
    source: 'n8n',
    loadedAt: new Date(),
    areas: body.areas as AreaRow[],
    geocoding: (body.geocoding as GeocodingStatus | undefined) ?? null,
    midwifeHealth: body.midwifeHealth as MidwifeHealthRow[],
    socioeconomic: body.socioeconomic as SocioeconomicRow[],
    midwifeMonths: body.midwifeMonths as MidwifeMonthRow[],
    documentDays: body.documentDays as DocumentDayRow[],
  };
}

export async function loadDashboardData(): Promise<DashboardData> {
  return DATA_URL ? loadFromN8n(DATA_URL) : generateDemoData();
}
