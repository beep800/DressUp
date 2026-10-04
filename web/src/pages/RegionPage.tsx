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
import { addOperations, emptyOperations, type OperationsTotals, type RegionSummary } from '../lib/aggregate';
import {
  DOMAINS,
  INDICATOR_BY_ID,
  MIN_DENOMINATOR,
  STATUS_META,
  evaluateIndicator,
  formatRate,
  type IndicatorResult,
} from '../lib/concern';
import { fmtInt, fmtMonth, fmtPct, ratio } from '../lib/format';
import type { MidwifeHealthRow, SocioeconomicAttribute } from '../lib/types';

interface MidwifeRow {
  code: string;
  health: MidwifeHealthRow;
  operations: OperationsTotals;
  results: Map<string, IndicatorResult>;
}

const MIDWIFE_INDICATORS = ['first_trimester', 'anaemia', 'preterm', 'lbw', 'cesarean', 'referral'];

function buildMidwifeRows(summary: RegionSummary): MidwifeRow[] {
  return summary.midwives.map((h) => {
    const code = h.midwife_code;
    const operations = summary.midwifeRows
      .filter((m) => m.midwife_id.trim().toLowerCase() === code.trim().toLowerCase())
      .reduce(addOperations, emptyOperations());
    const results = new Map(MIDWIFE_INDICATORS.map((id) => [id, evaluateIndicator(INDICATOR_BY_ID.get(id)!, h)]));
    return { code, health: h, operations, results };
  });
}

function RateCell({ result }: { result: IndicatorResult | undefined }) {
  if (!result || result.status === 'insufficient') {
    return (
      <span className="muted" title={`Fewer than ${MIN_DENOMINATOR} records`}>
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

const rateColumn = (id: string, label: string): Column<MidwifeRow> => ({
  key: id,
  label,
  numeric: true,
  sortValue: (r) => {
    const res = r.results.get(id);
    return res && res.status !== 'insufficient' ? res.rate : null;
  },
  render: (r) => <RateCell result={r.results.get(id)} />,
});

const MIDWIFE_COLUMNS: Column<MidwifeRow>[] = [
  { key: 'code', label: 'Midwife', sortValue: (r) => r.code, render: (r) => <span className="mono">{r.code}</span> },
  { key: 'women', label: 'Women', numeric: true, sortValue: (r) => r.health.pregnancies, render: (r) => fmtInt(r.health.pregnancies) },
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
  { key: 'deliveries', label: 'Deliveries', numeric: true, sortValue: (r) => r.health.deliveries, render: (r) => fmtInt(r.health.deliveries) },
  rateColumn('preterm', 'Preterm'),
  rateColumn('lbw', 'Low birth weight'),
  rateColumn('cesarean', 'Caesarean'),
  rateColumn('referral', 'Referred'),
  {
    key: 'verified',
    label: 'Forms verified',
    numeric: true,
    sortValue: (r) => ratio(r.operations.documents_verified, r.operations.documents_captured),
    render: (r) => fmtPct(ratio(r.operations.documents_verified, r.operations.documents_captured), 0),
  },
];

const SOCIO_LABELS: Record<SocioeconomicAttribute, string> = {
  education_level: 'Education',
  profession: "Woman's profession",
  husband_profession: "Husband's profession",
};

const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** The most common answers to one question, as shares of everyone who answered it. */
function ShareList({ answers }: { answers: { value: string; patients: number }[] }) {
  const total = answers.reduce((n, a) => n + a.patients, 0);
  if (total === 0) return <p className="muted small">Not recorded.</p>;
  const top = answers.slice(0, 5);
  const other = total - top.reduce((n, a) => n + a.patients, 0);
  const rows = other > 0 ? [...top, { value: 'other answers', patients: other }] : top;
  return (
    <ul className="share-list">
      {rows.map((a) => (
        <li key={a.value}>
          <div className="share-top">
            <span>{capitalize(a.value)}</span>
            <span className="share-value">{fmtPct(a.patients / total, 0)}</span>
          </div>
          <div className="ibar-track">
            <div className="share-fill" style={{ width: `${(a.patients / total) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function RateWithCount({ n, d }: { n: number; d: number }) {
  if (d === 0) return <span className="muted">—</span>;
  return (
    <span>
      {fmtPct(n / d)} <span className="muted small">({fmtInt(n)} of {fmtInt(d)})</span>
    </span>
  );
}

export function RegionPage() {
  const { regionName = '' } = useParams();
  const { summaries } = useReadyDashboard();
  const summary = summaries.find((s) => s.region === regionName);
  const midwifeRows = useMemo(() => (summary ? buildMidwifeRows(summary) : []), [summary]);

  if (!summary) {
    return (
      <div className="page">
        <Link to="/" className="text-link back-link">
          <IconArrowLeft /> All regions
        </Link>
        <div className="panel">
          <h1>Region not found</h1>
          <p className="muted">
            Nothing is recorded for “{regionName}”. It may have been renamed in <code>locations.json</code>.
          </p>
        </div>
      </div>
    );
  }

  const { assessment: a, health: h, operations } = summary;
  const insufficient = a.results.filter((r) => r.status === 'insufficient').length;
  const monthly = summary.monthly.map((m) => ({ ...m }));
  const meanWeight = ratio(h.birth_weight_sum_g, h.birth_weight_recorded);
  const meanHead = ratio(h.head_circumference_sum_cm, h.head_circumference_recorded);
  const smallGroups = h.type_recorded_after_iufd < MIN_DENOMINATOR || h.preterm_recorded_after_iufd < MIN_DENOMINATOR;

  return (
    <div className="page">
      <Link to="/" className="text-link back-link">
        <IconArrowLeft /> All regions
      </Link>

      <header className="region-header">
        <div>
          <p className="eyebrow">{summary.geo?.country_name ?? 'Not on the map yet'}</p>
          <h1>{summary.region}</h1>
          <p className="muted">
            {fmtInt(summary.midwives.length)} {summary.midwives.length === 1 ? 'midwife' : 'midwives'} ·{' '}
            {fmtInt(h.pregnancies)} women registered
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
            {insufficient} indicator{insufficient > 1 ? 's have' : ' has'} fewer than {MIN_DENOMINATOR} records and{' '}
            {insufficient > 1 ? 'are' : 'is'} not assessed.
          </p>
        )}
      </section>

      <div className="kpi-row">
        <StatTile label="Women registered" value={fmtInt(h.pregnancies)} />
        <StatTile label="Deliveries recorded" value={fmtInt(h.deliveries)} />
        <StatTile
          label="Average birth weight"
          value={meanWeight === null ? '—' : `${fmtInt(meanWeight)} g`}
          note={`${fmtInt(h.birth_weight_recorded)} babies weighed`}
        />
        <StatTile
          label="Average head circumference"
          value={meanHead === null ? '—' : `${meanHead.toFixed(1)} cm`}
          note={`${fmtInt(h.head_circumference_recorded)} babies measured`}
        />
        <StatTile
          label="Forms verified by midwife"
          value={fmtPct(ratio(operations.documents_verified, operations.documents_captured), 0)}
          note={`${fmtInt(operations.documents_captured)} forms captured`}
        />
        <StatTile
          label="Forms waiting"
          value={fmtInt(operations.documents_waiting)}
          note={`${fmtInt(operations.documents_sync_failed)} failed to sync`}
        />
      </div>

      <section aria-labelledby="indicators-title" className="stack">
        <h2 id="indicators-title">Indicators</h2>
        <div className="domain-grid">
          {DOMAINS.map((domain) => (
            <div className="panel" key={domain}>
              <h3 className="eyebrow">{domain}</h3>
              <ul className="indicator-list">
                {a.results
                  .filter((r) => r.def.domain === domain)
                  .map((r) => (
                    <li key={r.def.id}>
                      <IndicatorBar result={r} scaleMax={scaleMaxFor([r])} showCounts />
                      <StatusChip status={r.status} />
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="chart-grid">
        <section className="panel" aria-labelledby="history-title">
          <h2 id="history-title">Previous stillbirth and this delivery</h2>
          <p className="muted">Women who lost an earlier pregnancy in the womb, compared with everyone else.</p>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="th-plain">Women with</th>
                  <th className="th-plain num">Caesarean</th>
                  <th className="th-plain num">Preterm</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>A previous stillbirth</td>
                  <td className="num">
                    <RateWithCount n={h.cesareans_after_iufd} d={h.type_recorded_after_iufd} />
                  </td>
                  <td className="num">
                    <RateWithCount n={h.preterm_after_iufd} d={h.preterm_recorded_after_iufd} />
                  </td>
                </tr>
                <tr>
                  <td>No previous stillbirth</td>
                  <td className="num">
                    <RateWithCount n={h.cesareans_no_iufd} d={h.type_recorded_no_iufd} />
                  </td>
                  <td className="num">
                    <RateWithCount n={h.preterm_no_iufd} d={h.preterm_recorded_no_iufd} />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {smallGroups && (
            <p className="note">Fewer than {MIN_DENOMINATOR} women had a previous stillbirth, so treat these rates with care.</p>
          )}
        </section>

        <section className="panel" aria-labelledby="socio-title">
          <h2 id="socio-title">Socioeconomic profile</h2>
          <p className="muted">Answers as written on the forms, most common first.</p>
          <div className="socio-grid">
            {(Object.keys(SOCIO_LABELS) as SocioeconomicAttribute[]).map((attr) => (
              <div key={attr}>
                <h3 className="eyebrow">{SOCIO_LABELS[attr]}</h3>
                <ShareList answers={summary.socioeconomic[attr]} />
              </div>
            ))}
          </div>
        </section>
      </div>

      {monthly.length > 0 && (
        <section className="panel" aria-labelledby="activity-title">
          <h2 id="activity-title">Women registered per month</h2>
          <p className="muted">Counted from the month of each woman's first captured form.</p>
          <TrendChart
            kind="bar"
            data={monthly}
            xKey="month"
            xFormat={fmtMonth}
            series={[{ key: 'patients_registered', label: 'Women registered', color: 'var(--series-1)' }]}
          />
        </section>
      )}

      <section className="panel" aria-labelledby="midwives-title">
        <h2 id="midwives-title">Midwives</h2>
        <p className="muted">
          Rates use the same flag rules as the region. A dash means fewer than {MIN_DENOMINATOR} records.
        </p>
        <DataTable
          rows={midwifeRows}
          columns={MIDWIFE_COLUMNS}
          rowKey={(r) => r.code}
          initialSort={{ key: 'women', dir: 'desc' }}
          caption={`Midwives in ${summary.region}`}
          limit={20}
        />
      </section>
    </div>
  );
}
