import { assess, type Assessment } from './concern';
import {
  HEALTH_COUNT_KEYS,
  type AreaRow,
  type DashboardData,
  type HealthCounts,
  type MidwifeHealthRow,
  type MidwifeMonthRow,
  type RegionGeo,
  type SocioeconomicAttribute,
} from './types';

// The workflow returns counts per area and midwife, where an area is the town (or
// county or state) worked out from the women's addresses. Each area is a region on the
// dashboard; its counts are summed across midwives, and rates are only computed after
// summing.

export const emptyHealth = (): HealthCounts =>
  Object.fromEntries(HEALTH_COUNT_KEYS.map((k) => [k, 0])) as HealthCounts;

export function addHealth(into: HealthCounts, row: HealthCounts): HealthCounts {
  for (const k of HEALTH_COUNT_KEYS) into[k] += Number(row[k]) || 0;
  return into;
}

export interface MonthPoint {
  month: string;
  patients_registered: number;
  documents_captured: number;
}

export interface OperationsTotals {
  documents_captured: number;
  documents_verified: number;
  documents_waiting: number;
  documents_sync_failed: number;
  documents_processing_failed: number;
  patients_registered: number;
}

export const emptyOperations = (): OperationsTotals => ({
  documents_captured: 0,
  documents_verified: 0,
  documents_waiting: 0,
  documents_sync_failed: 0,
  documents_processing_failed: 0,
  patients_registered: 0,
});

export function addOperations(into: OperationsTotals, row: MidwifeMonthRow | OperationsTotals): OperationsTotals {
  for (const k of Object.keys(into) as (keyof OperationsTotals)[]) into[k] += Number(row[k]) || 0;
  return into;
}

export function monthlySeries(rows: MidwifeMonthRow[]): MonthPoint[] {
  const byMonth = new Map<string, MonthPoint>();
  for (const r of rows) {
    const month = r.month.slice(0, 10);
    const p = byMonth.get(month) ?? { month, patients_registered: 0, documents_captured: 0 };
    p.patients_registered += Number(r.patients_registered) || 0;
    p.documents_captured += Number(r.documents_captured) || 0;
    byMonth.set(month, p);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type SocioeconomicProfile = Record<SocioeconomicAttribute, { value: string; patients: number }[]>;

export interface RegionSummary {
  region: string;
  geo: RegionGeo | null;
  midwives: MidwifeHealthRow[];
  health: HealthCounts;
  socioeconomic: SocioeconomicProfile;
  midwifeRows: MidwifeMonthRow[];
  monthly: MonthPoint[];
  operations: OperationsTotals;
  assessment: Assessment;
}

export interface NationalTotals {
  health: HealthCounts;
  operations: OperationsTotals;
  midwifeCount: number;
}

/** Region for women whose address is missing or could not be placed on the map. */
export const UNKNOWN_AREA = 'Location unknown';

/** Finds the region name and map position for an area_id. */
export function makeAreaLookup(areas: AreaRow[]) {
  const byId = new Map(areas.map((a) => [Number(a.area_id), a]));
  // Two places with the same name are told apart by their state.
  const nameCount = new Map<string, number>();
  for (const a of areas) nameCount.set(a.name.toLowerCase(), (nameCount.get(a.name.toLowerCase()) ?? 0) + 1);

  return (areaId: number | null): { region: string; geo: RegionGeo | null } => {
    const area = areaId === null ? undefined : byId.get(Number(areaId));
    if (!area) return { region: UNKNOWN_AREA, geo: null };
    const region =
      (nameCount.get(area.name.toLowerCase()) ?? 0) > 1 && area.state ? `${area.name} (${area.state})` : area.name;
    return {
      region,
      geo: {
        region,
        country_name: [area.state, area.country].filter(Boolean).join(', '),
        latitude: Number(area.latitude),
        longitude: Number(area.longitude),
      },
    };
  };
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

export function buildRegionSummaries(data: DashboardData): RegionSummary[] {
  const lookup = makeAreaLookup(data.areas);
  const healthByRegion = groupBy(data.midwifeHealth, (r) => lookup(r.area_id).region);
  const socioByRegion = groupBy(data.socioeconomic, (r) => lookup(r.area_id).region);
  const monthsByRegion = groupBy(data.midwifeMonths, (r) => lookup(r.area_id).region);

  return [...healthByRegion.entries()].map(([region, midwives]) => {
    const health = midwives.reduce(addHealth, emptyHealth());
    const midwifeRows = monthsByRegion.get(region) ?? [];

    const socioeconomic: SocioeconomicProfile = { education_level: [], profession: [], husband_profession: [] };
    for (const [attribute, rows] of groupBy(socioByRegion.get(region) ?? [], (r) => r.attribute)) {
      const totals = new Map<string, number>();
      for (const r of rows) totals.set(r.value, (totals.get(r.value) ?? 0) + (Number(r.patients) || 0));
      if (attribute in socioeconomic) {
        socioeconomic[attribute as SocioeconomicAttribute] = [...totals.entries()]
          .map(([value, patients]) => ({ value, patients }))
          .sort((a, b) => b.patients - a.patients);
      }
    }

    return {
      region,
      geo: lookup(midwives[0].area_id).geo,
      midwives,
      health,
      socioeconomic,
      midwifeRows,
      monthly: monthlySeries(midwifeRows),
      operations: midwifeRows.reduce(addOperations, emptyOperations()),
      assessment: assess(health),
    };
  });
}

export function buildNationalTotals(data: DashboardData, summaries: RegionSummary[]): NationalTotals {
  return {
    health: summaries.reduce((acc, s) => addHealth(acc, s.health), emptyHealth()),
    operations: data.midwifeMonths.reduce(addOperations, emptyOperations()),
    midwifeCount: new Set(data.midwifeHealth.map((r) => r.midwife_code)).size,
  };
}
