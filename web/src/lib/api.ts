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

// The hosted version (api/dashboard.js) can require a site password. It is kept for
// this browser tab only and sent with each request.
const PASSWORD_KEY = 'maternal-health-atlas-password';

export function savePassword(password: string) {
  try {
    sessionStorage.setItem(PASSWORD_KEY, password);
  } catch {
    // Storage can be blocked; the password is then asked for again on reload.
  }
}

function savedPassword(): string | null {
  try {
    return sessionStorage.getItem(PASSWORD_KEY);
  } catch {
    return null;
  }
}

/** The server asked for the site password, or rejected the one saved. */
export class PasswordRequiredError extends Error {
  constructor(readonly rejected: boolean) {
    super(rejected ? 'That password was not accepted.' : 'This dashboard is password protected.');
  }
}

async function fetchJson(url: string, what: string): Promise<unknown> {
  const password = savedPassword();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (password) headers['X-Site-Password'] = password;

  let response: Response;
  try {
    response = await fetch(url, { headers, cache: 'no-store' });
  } catch {
    throw new Error(`Could not reach ${what} at ${url}.`);
  }
  if (response.status === 401) throw new PasswordRequiredError(password !== null);
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
