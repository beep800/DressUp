import { generateDemoData } from './demoData';
import type {
  DashboardData,
  DocumentDayRow,
  LocationEntry,
  MidwifeHealthRow,
  MidwifeMonthRow,
  SocioeconomicRow,
} from './types';

/** The n8n webhook that returns the dashboard data. Without it the app runs on demo data. */
export const DATA_URL = (import.meta.env.VITE_DATA_URL as string | undefined) || undefined;

export const DATA_MODE: 'n8n' | 'demo' = DATA_URL ? 'n8n' : 'demo';

const PAYLOAD_KEYS = ['midwifeHealth', 'socioeconomic', 'midwifeMonths', 'documentDays'] as const;

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

async function loadFromN8n(url: string): Promise<Omit<DashboardData, 'locations'>> {
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
    midwifeHealth: body.midwifeHealth as MidwifeHealthRow[],
    socioeconomic: body.socioeconomic as SocioeconomicRow[],
    midwifeMonths: body.midwifeMonths as MidwifeMonthRow[],
    documentDays: body.documentDays as DocumentDayRow[],
  };
}

const isLocation = (e: unknown): e is LocationEntry => {
  const l = e as Partial<LocationEntry> | null;
  return (
    !!l &&
    typeof l.region === 'string' &&
    Number.isFinite(Number(l.latitude)) &&
    Number.isFinite(Number(l.longitude)) &&
    Array.isArray(l.midwives)
  );
};

/** Reads web/public/locations.json. A missing or broken file leaves every region off the map. */
async function loadLocations(): Promise<LocationEntry[]> {
  try {
    const body = (await fetchJson('./locations.json', 'The locations file')) as { regions?: unknown[] };
    const entries = Array.isArray(body.regions) ? body.regions : [];
    const valid = entries.filter(isLocation);
    if (valid.length < entries.length) {
      console.warn(`locations.json: ignored ${entries.length - valid.length} entries without region, coordinates or midwives.`);
    }
    return valid.map((l) => ({ ...l, latitude: Number(l.latitude), longitude: Number(l.longitude) }));
  } catch (e) {
    console.warn(e instanceof Error ? e.message : e);
    return [];
  }
}

export async function loadDashboardData(): Promise<DashboardData> {
  if (!DATA_URL) return generateDemoData();
  const [data, locations] = await Promise.all([loadFromN8n(DATA_URL), loadLocations()]);
  return { ...data, locations };
}
