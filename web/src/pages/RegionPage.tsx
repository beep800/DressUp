import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ConcernBadge, StatusChip } from '../components/Badges';
import { DataTable, type Column } from '../components/DataTable';
import { FlagList } from '../components/FlagList';
import { IconArrowLeft, ToneIcon } from '../components/Icons';
import { IndicatorBar, scaleMaxFor } from '../components/IndicatorBar';
import { StatTile } from '../components/StatTile';
import { TrendChart } from '../components/TrendChart';
import { useReadyDashboard } from '../data/DataContext';
import { addDelivery, emptyDelivery, type RegionSummary } from '../lib/aggregate';
import {
  DOMAINS,
  INDICATOR_BY_ID,
  STATUS_META,
  evaluateIndicator,
  formatRate,
  type IndicatorResult,
} from '../lib/concern';
import { fmtEmonc, fmtInt, fmtMonth, fmtPct, ratio } from '../lib/format';
import type { EmoncLevel, FacilityHealthRow } from '../lib/types';

interface FacilityRow {
  id: number;
  code: string;
  name: string | null;
  district: string;
  emonc: EmoncLevel | null;
  travelMin: number | null;
  health: FacilityHealthRow;
  deliveriesHere: number;
  results: Map<string, IndicatorResult>;
}

const FACILITY_INDICATORS = ['first_trimester', 'anaemia', 'preterm', 'lbw', 'referral'];

function buildFacilityRows(summary: RegionSummary): FacilityRow[] {
  return summary.facilities.map((h) => {
    const deliveryRows = summary.deliveryRows.filter((d) => d.facility_id === h.facility_id);
    const delivery = deliveryRows.reduce(addDelivery, emptyDelivery());
    const meta = deliveryRows[0];
    const results = new Map(
      FACILITY_INDICATORS.map((id) => [id, evaluateIndicator(INDICATOR_BY_ID.get(id)!, { health: h, delivery })]),
    );
    return {
      id: h.facility_id,
      code: h.facility_code,
      name: meta?.facility_name ?? null,
      district: h.district,
      emonc: meta?.emonc_level ?? null,
      travelMin: meta?.travel_time_to_referral_min ?? null,
      health: h,
      deliveriesHere: deliveryRows.filter((d) => d.place_of_delivery === 'FACILITY').reduce((n, d) => n + d.deliveries, 0),
      results,
    };
  });
}

function RateCell({ result }: { result: IndicatorResult | undefined }) {
  if (!result || result.status === 'insufficient') {
    return (
      <span className="muted" title="Too few records to assess">
        —
      </span>
    );
  }
  const flagged = result.status === 'severe' || result.status === 'concern';
  const tone = STATUS_META[result.status].tone;
  return (
    <span className="rate-cell">
      {flagged && <ToneIcon tone={tone} className={`rate-icon tone-${tone}`} aria-label={STATUS_META[result.status].label} />}
      {formatRate(result.def, result.rate)}
    </span>
  );
}

const rateColumn = (id: string, label: string): Column<FacilityRow> => ({
  key: id,
  label,
  numeric: true,
  sortValue: (r) => {
    const res = r.results.get(id);
    return res && res.status !== 'insufficient' ? res.rate : null;
  },
  render: (r) => <RateCell result={r.results.get(id)} />,
});

const FACILITY_COLUMNS: Column<FacilityRow>[] = [
  {
    key: 'facility',
    label: 'Facility',
    sortValue: (r) => r.name ?? r.code,
    render: (r) => (
      <div className="facility-cell">
        <span>{r.name ?? r.code}</span>
        {r.name && <span className="mono muted">{r.code}</span>}
      </div>
    ),
  },
  { key: 'district', label: 'District', sortValue: (r) => r.district },
  { key: 'emonc', label: 'Emergency obstetric care', sortValue: (r) => r.emonc, render: (r) => fmtEmonc(r.emonc) },
  {
    key: 'travel',
    label: 'Travel to referral',
    numeric: true,
    sortValue: (r) => r.travelMin,
    render: (r) => (r.travelMin === null ? '—' : `${fmtInt(r.travelMin)} min`),
  },
  { key: 'pregnancies', label: 'Pregnancies', numeric: true, sortValue: (r) => r.health.pregnancies, render: (r) => fmtInt(r.health.pregnancies) },
  rateColumn('first_trimester', 'First trimester'),
  {
    key: 'median_ga',
    label: 'Median enrolment',
    numeric: true,
    sortValue: (r) => r.health.median_enrollment_ga_weeks,
    render: (r) =>
      r.health.median_enrollment_ga_weeks === null ? '—' : `${Number(r.health.median_enrollment_ga_weeks).toFixed(1)} wk`,
  },
  rateColumn('anaemia', 'Anaemia'),
  rateColumn('preterm', 'Preterm'),
  rateColumn('lbw', 'Low birth weight'),
  { key: 'deliveries_here', label: 'Births at facility', numeric: true, sortValue: (r) => r.deliveriesHere, render: (r) => fmtInt(r.deliveriesHere) },
  rateColumn('referral', 'Referred'),
];

export function RegionPage() {
  const { regionName = '' } = useParams();
  const { summaries } = useReadyDashboard();
  const summary = summaries.find((s) => s.region === regionName);
  const facilityRows = useMemo(() => (summary ? buildFacilityRows(summary) : []), [summary]);

  if (!summary) {
    return (
      <div className="page">
        <Link to="/" className="text-link back-link">
          <IconArrowLeft /> All regions
        </Link>
        <div className="panel">
          <h1>Region not found</h1>
          <p className="muted">No data is recorded for “{regionName}”. It may have been renamed in dim_facility.</p>
        </div>
      </div>
    );
  }

  const { assessment: a, health, operations } = summary;
  const insufficient = a.results.filter((r) => r.status === 'insufficient').length;
  const monthly = summary.monthly.map((m) => ({ ...m }));

  return (
    <div className="page">
      <Link to="/" className="text-link back-link">
        <IconArrowLeft /> All regions
      </Link>

      <header className="region-header">
        <div>
          <p className="eyebrow">{summary.geo?.country_name ?? 'Region'}</p>
          <h1>{summary.region}</h1>
          <p className="muted">
            {fmtInt(summary.facilities.length)} facilities · {fmtInt(summary.midwifeCount)} midwives reporting
          </p>
        </div>
        <ConcernBadge level={a.level} size="lg" />
      </header>

      <section className="panel" aria-labelledby="why-title">
        <h2 id="why-title">Why this region is flagged</h2>
        {a.flagged.length > 0 ? (
          <FlagList flagged={a.flagged} detailed />
        ) : (
          <p className="muted">
            {a.level === 'no-data'
              ? 'There are not enough records yet to assess this region.'
              : 'No indicator is past its flag level.'}
          </p>
        )}
        {insufficient > 0 && (
          <p className="note">
            {insufficient} indicator{insufficient > 1 ? 's have' : ' has'} fewer than 30 records and{' '}
            {insufficient > 1 ? 'are' : 'is'} not assessed.
          </p>
        )}
      </section>

      <div className="kpi-row">
        <StatTile label="Pregnancies registered" value={fmtInt(health.pregnancies)} />
        <StatTile label="Deliveries recorded" value={fmtInt(health.deliveries)} />
        <StatTile label="Live births" value={fmtInt(health.live_births)} />
        <StatTile label="Stillbirths" value={fmtInt(health.stillbirths)} />
        <StatTile
          label="Records verified by midwife"
          value={fmtPct(ratio(operations.documents_verified, operations.documents_captured), 0)}
          note={`${fmtInt(operations.documents_captured)} documents captured`}
        />
        <StatTile label="Documents waiting" value={fmtInt(operations.documents_open)} note={`${fmtInt(operations.sync_failures)} sync failures`} />
      </div>

      <section aria-labelledby="indicators-title" className="stack">
        <h2 id="indicators-title">Indicators</h2>
        <div className="domain-grid">
          {DOMAINS.map((domain) => {
            const results = a.results.filter((r) => r.def.domain === domain);
            return (
              <div className="panel" key={domain}>
                <h3 className="eyebrow">{domain}</h3>
                <ul className="indicator-list">
                  {results.map((r) => (
                    <li key={r.def.id}>
                      <IndicatorBar result={r} scaleMax={scaleMaxFor([r])} showCounts />
                      <StatusChip status={r.status} />
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {monthly.length > 0 && (
        <section className="panel" aria-labelledby="activity-title">
          <h2 id="activity-title">Monthly activity</h2>
          <p className="muted">Pregnancies enrolled and deliveries recorded by the region's midwives.</p>
          <TrendChart
            data={monthly}
            xKey="month"
            xFormat={fmtMonth}
            series={[
              { key: 'pregnancies_enrolled', label: 'Pregnancies enrolled', color: 'var(--series-1)' },
              { key: 'deliveries_recorded', label: 'Deliveries recorded', color: 'var(--series-2)' },
            ]}
          />
        </section>
      )}

      <section className="panel" aria-labelledby="facilities-title">
        <h2 id="facilities-title">Facilities</h2>
        <p className="muted">
          Rates are flagged with the same rules as the region. Facilities with fewer than 30 records show a dash.
        </p>
        <DataTable
          rows={facilityRows}
          columns={FACILITY_COLUMNS}
          rowKey={(r) => r.id}
          initialSort={{ key: 'pregnancies', dir: 'desc' }}
          caption={`Facilities in ${summary.region}`}
        />
      </section>
    </div>
  );
}
