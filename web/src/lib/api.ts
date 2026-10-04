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
