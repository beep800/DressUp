import { assess, type Assessment } from './concern';
import {
  DELIVERY_COUNT_KEYS,
  HEALTH_COUNT_KEYS,
  type DashboardData,
  type DeliveryCounts,
  type FacilityDeliveryRow,
  type FacilityHealthRow,
  type HealthCounts,
  type MidwifeMonthRow,
  type RegionGeo,
} from './types';

// The views hold counts with their denominators, so regions are built by summing
// facility rows; rates are only computed after summing.

export const emptyHealth = (): HealthCounts =>
  Object.fromEntries(HEALTH_COUNT_KEYS.map((k) => [k, 0])) as HealthCounts;

export const emptyDelivery = (): DeliveryCounts =>
  Object.fromEntries(DELIVERY_COUNT_KEYS.map((k) => [k, 0])) as DeliveryCounts;

export function addHealth(into: HealthCounts, row: HealthCounts): HealthCounts {
  for (const k of HEALTH_COUNT_KEYS) into[k] += Number(row[k]) || 0;
  return into;
}

export function addDelivery(into: DeliveryCounts, row: DeliveryCounts): DeliveryCounts {
  for (const k of DELIVERY_COUNT_KEYS) into[k] += Number(row[k]) || 0;
  return into;
}

export interface MonthPoint {
  month: string;
  pregnancies_enrolled: number;
  deliveries_recorded: number;
  documents_captured: number;
  documents_verified: number;
  sync_failures: number;
}

export interface OperationsTotals {
  documents_captured: number;
  documents_verified: number;
  documents_open: number;
  documents_sync_failed: number;
  sync_failures: number;
}

const emptyOperations = (): OperationsTotals => ({
  documents_captured: 0,
  documents_verified: 0,
  documents_open: 0,
  documents_sync_failed: 0,
  sync_failures: 0,
});

export function addOperations(into: OperationsTotals, row: MidwifeMonthRow): OperationsTotals {
  into.documents_captured += Number(row.documents_captured) || 0;
  into.documents_verified += Number(row.documents_verified) || 0;
  into.documents_open += Number(row.documents_open) || 0;
  into.documents_sync_failed += Number(row.documents_sync_failed) || 0;
  into.sync_failures += Number(row.sync_failures) || 0;
  return into;
}

export function monthlySeries(rows: MidwifeMonthRow[]): MonthPoint[] {
  const byMonth = new Map<string, MonthPoint>();
  for (const r of rows) {
    const month = r.report_month.slice(0, 10);
    const p = byMonth.get(month) ?? {
      month,
      pregnancies_enrolled: 0,
      deliveries_recorded: 0,
      documents_captured: 0,
      documents_verified: 0,
      sync_failures: 0,
    };
    p.pregnancies_enrolled += Number(r.pregnancies_enrolled) || 0;
    p.deliveries_recorded += Number(r.deliveries_recorded) || 0;
    p.documents_captured += Number(r.documents_captured) || 0;
    p.documents_verified += Number(r.documents_verified) || 0;
    p.sync_failures += Number(r.sync_failures) || 0;
    byMonth.set(month, p);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export interface RegionSummary {
  region: string;
  geo: RegionGeo | null;
  facilities: FacilityHealthRow[];
  health: HealthCounts;
  deliveryRows: FacilityDeliveryRow[];
  delivery: DeliveryCounts;
  midwifeRows: MidwifeMonthRow[];
  monthly: MonthPoint[];
  operations: OperationsTotals;
  midwifeCount: number;
  assessment: Assessment;
}

export interface NationalTotals {
  health: HealthCounts;
  delivery: DeliveryCounts;
  operations: OperationsTotals;
  facilityCount: number;
}

function groupBy<T>(rows: T[], key: (row: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    if (k === null) continue;
    const list = groups.get(k);
    if (list) list.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

export function buildRegionSummaries(data: DashboardData): RegionSummary[] {
  const geoByRegion = new Map(data.regions.map((g) => [g.region, g]));
  const healthByRegion = groupBy(data.facilityHealth, (r) => r.region);
  const deliveryByRegion = groupBy(data.facilityDeliveries, (r) => r.region);
  const midwifeByRegion = groupBy(data.midwifeMonths, (r) => r.region);
  const regionNames = new Set([...healthByRegion.keys(), ...deliveryByRegion.keys()]);

  return [...regionNames].map((region) => {
    const facilities = healthByRegion.get(region) ?? [];
    const deliveryRows = deliveryByRegion.get(region) ?? [];
    const midwifeRows = midwifeByRegion.get(region) ?? [];
    const health = facilities.reduce(addHealth, emptyHealth());
    const delivery = deliveryRows.reduce(addDelivery, emptyDelivery());
    const geo = geoByRegion.get(region);
    return {
      region,
      geo: geo
        ? { ...geo, latitude: Number(geo.latitude), longitude: Number(geo.longitude) }
        : null,
      facilities,
      health,
      deliveryRows,
      delivery,
      midwifeRows,
      monthly: monthlySeries(midwifeRows),
      operations: midwifeRows.reduce(addOperations, emptyOperations()),
      midwifeCount: new Set(midwifeRows.map((r) => r.midwife_id)).size,
      assessment: assess({ health, delivery }),
    };
  });
}

export function buildNationalTotals(summaries: RegionSummary[]): NationalTotals {
  return {
    health: summaries.reduce((acc, s) => addHealth(acc, s.health), emptyHealth()),
    delivery: summaries.reduce((acc, s) => addDelivery(acc, s.delivery), emptyDelivery()),
    operations: summaries.reduce(
      (acc, s) => {
        for (const k of Object.keys(acc) as (keyof OperationsTotals)[]) acc[k] += s.operations[k];
        return acc;
      },
      emptyOperations(),
    ),
    facilityCount: summaries.reduce((n, s) => n + s.facilities.length, 0),
  };
}
