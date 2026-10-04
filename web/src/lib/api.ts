import { generateDemoData } from './demoData';
import { ANALYTICS_SCHEMA, supabase } from './supabase';
import type {
  DashboardData,
  FacilityDeliveryRow,
  FacilityHealthRow,
  MidwifeMonthRow,
  OcrDayRow,
  RegionGeo,
} from './types';

/**
 * An n8n webhook (or any endpoint) that returns every dashboard view in one JSON
 * object. When set it takes precedence over a direct Supabase connection.
 */
export const DATA_URL = (import.meta.env.VITE_DATA_URL as string | undefined) || undefined;

export type DataMode = 'endpoint' | 'supabase' | 'demo';
export const DATA_MODE: DataMode = DATA_URL ? 'endpoint' : supabase ? 'supabase' : 'demo';

const PAYLOAD_KEYS = ['regions', 'facilityHealth', 'facilityDeliveries', 'midwifeMonths', 'ocrDays'] as const;

async function loadFromEndpoint(url: string): Promise<DashboardData> {
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error(`Could not reach the data endpoint at ${url}.`);
  }
  if (!response.ok) {
    throw new Error(`The data endpoint at ${url} answered ${response.status} ${response.statusText}.`);
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error(`The data endpoint at ${url} did not return JSON.`);
  }
  // n8n may wrap the object in an array, or under the query's column name.
  const first: unknown = Array.isArray(raw) ? raw[0] : raw;
  const body = (first && typeof first === 'object' && 'payload' in first ? first.payload : first) as
    | Record<string, unknown>
    | undefined;
  const missing = PAYLOAD_KEYS.filter((key) => !Array.isArray(body?.[key]));
  if (!body || missing.length > 0) {
    throw new Error(`The data endpoint's response is missing ${missing.join(', ')}.`);
  }

  return {
    source: 'endpoint',
    loadedAt: new Date(),
    regions: body.regions as RegionGeo[],
    facilityHealth: body.facilityHealth as FacilityHealthRow[],
    facilityDeliveries: body.facilityDeliveries as FacilityDeliveryRow[],
    midwifeMonths: body.midwifeMonths as MidwifeMonthRow[],
    ocrDays: body.ocrDays as OcrDayRow[],
  };
}

const PAGE_SIZE = 1000;

/**
 * Reads every row of a view. Supabase caps each response (1,000 rows by default),
 * so this pages through, advancing by however many rows actually came back.
 */
async function fetchAll<T>(table: string, orderBy: string[]): Promise<T[]> {
  if (!supabase) throw new Error('Supabase is not configured.');
  const rows: T[] = [];
  for (;;) {
    let query = supabase.schema(ANALYTICS_SCHEMA).from(table).select('*');
    for (const column of orderBy) query = query.order(column, { ascending: true });
    const { data, error } = await query.range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw new Error(`Could not read analytics.${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
  }
  return rows;
}

export async function loadDashboardData(): Promise<DashboardData> {
  if (DATA_URL) return loadFromEndpoint(DATA_URL);
  if (!supabase) return generateDemoData();

  const [regions, facilityHealth, facilityDeliveries, midwifeMonths, ocrDays] = await Promise.all([
    fetchAll<RegionGeo>('ref_region', ['region']),
    fetchAll<FacilityHealthRow>('mv_regional_health_indicators', ['facility_id']),
    fetchAll<FacilityDeliveryRow>('mv_facility_delivery_outcomes', ['facility_id', 'place_of_delivery']),
    fetchAll<MidwifeMonthRow>('mv_midwife_monthly_performance', ['midwife_id', 'report_month']),
    fetchAll<OcrDayRow>('mv_ocr_extraction_quality', ['capture_date', 'document_section']),
  ]);

  return {
    source: 'supabase',
    loadedAt: new Date(),
    regions,
    facilityHealth,
    facilityDeliveries,
    midwifeMonths,
    ocrDays,
  };
}
