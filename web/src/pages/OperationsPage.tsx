import { useMemo } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { StackedBar } from '../components/StackedBar';
import { StatTile } from '../components/StatTile';
import { TrendChart } from '../components/TrendChart';
import { useReadyDashboard } from '../data/DataContext';
import { fmtDay, fmtHours, fmtInt, fmtPct, fmtSection, ratio } from '../lib/format';
import type { MidwifeMonthRow, OcrDayRow } from '../lib/types';

interface OcrTotals {
  submissions: number;
  captured: number;
  syncFailed: number;
  pendingAi: number;
  needsReview: number;
  registered: number;
  rejected: number;
  syncFailures: number;
  fields: number;
  illegible: number;
  needsReviewFields: number;
  autoAccepted: number;
  autoReviewed: number;
  autoCorrected: number;
  confidenceSum: number;
  confidenceN: number;
}

const emptyOcr = (): OcrTotals => ({
  submissions: 0, captured: 0, syncFailed: 0, pendingAi: 0, needsReview: 0, registered: 0, rejected: 0,
  syncFailures: 0, fields: 0, illegible: 0, needsReviewFields: 0, autoAccepted: 0, autoReviewed: 0,
  autoCorrected: 0, confidenceSum: 0, confidenceN: 0,
});

function addOcr(t: OcrTotals, r: OcrDayRow): OcrTotals {
  t.submissions += Number(r.submissions);
  t.captured += Number(r.status_captured);
  t.syncFailed += Number(r.status_sync_failed);
  t.pendingAi += Number(r.status_pending_ai);
  t.needsReview += Number(r.status_needs_review);
  t.registered += Number(r.status_registered);
  t.rejected += Number(r.status_rejected);
  t.syncFailures += Number(r.sync_failures);
  t.fields += Number(r.fields);
  t.illegible += Number(r.illegible_fields);
  t.needsReviewFields += Number(r.needs_review_fields);
  t.autoAccepted += Number(r.auto_accepted_fields);
  t.autoReviewed += Number(r.auto_accepted_reviewed);
  t.autoCorrected += Number(r.auto_accepted_corrected);
  // The view stores averages with their counts, so weight by the count to combine days.
  if (r.avg_field_confidence !== null) {
    t.confidenceSum += Number(r.avg_field_confidence) * Number(r.field_confidence_n);
    t.confidenceN += Number(r.field_confidence_n);
  }
  return t;
}

interface MidwifeTotals {
  id: number;
  code: string;
  region: string | null;
  facility: string | null;
  documents: number;
  verified: number;
  open: number;
  syncFailures: number;
  pregnancies: number;
  latestDelay: number | null;
}

function buildMidwifeTotals(rows: MidwifeMonthRow[]): MidwifeTotals[] {
  const byId = new Map<number, MidwifeTotals & { latestMonth: string }>();
  for (const r of rows) {
    const t = byId.get(r.midwife_id) ?? {
      id: r.midwife_id,
      code: r.midwife_code,
      region: r.region,
      facility: r.home_facility_code,
      documents: 0,
      verified: 0,
      open: 0,
      syncFailures: 0,
      pregnancies: 0,
      latestDelay: null,
      latestMonth: '',
    };
    t.documents += Number(r.documents_captured);
    t.verified += Number(r.documents_verified);
    t.open += Number(r.documents_open);
    t.syncFailures += Number(r.sync_failures);
    t.pregnancies += Number(r.pregnancies_enrolled);
    if (r.report_month > t.latestMonth) {
      t.latestMonth = r.report_month;
      t.latestDelay = r.median_sync_delay_hours === null ? null : Number(r.median_sync_delay_hours);
    }
    byId.set(r.midwife_id, t);
  }
  return [...byId.values()];
}

const MIDWIFE_COLUMNS: Column<MidwifeTotals>[] = [
  { key: 'code', label: 'Midwife', sortValue: (r) => r.code, render: (r) => <span className="mono">{r.code}</span> },
  { key: 'region', label: 'Region', sortValue: (r) => r.region },
  { key: 'facility', label: 'Home facility', sortValue: (r) => r.facility, render: (r) => <span className="mono">{r.facility ?? '—'}</span> },
  { key: 'pregnancies', label: 'Pregnancies enrolled', numeric: true, sortValue: (r) => r.pregnancies, render: (r) => fmtInt(r.pregnancies) },
  { key: 'documents', label: 'Documents', numeric: true, sortValue: (r) => r.documents, render: (r) => fmtInt(r.documents) },
  {
    key: 'verified',
    label: 'Verified',
    numeric: true,
    sortValue: (r) => ratio(r.verified, r.documents),
    render: (r) => fmtPct(ratio(r.verified, r.documents), 0),
  },
  { key: 'open', label: 'Waiting', numeric: true, sortValue: (r) => r.open, render: (r) => fmtInt(r.open) },
  { key: 'sync', label: 'Sync failures', numeric: true, sortValue: (r) => r.syncFailures, render: (r) => fmtInt(r.syncFailures) },
  {
    key: 'delay',
    label: 'Sync delay (latest month)',
    numeric: true,
    sortValue: (r) => r.latestDelay,
    render: (r) => fmtHours(r.latestDelay),
  },
];

interface SectionRow extends OcrTotals {
  section: string;
}

const SECTION_COLUMNS: Column<SectionRow>[] = [
  { key: 'section', label: 'Form section', sortValue: (r) => fmtSection(r.section) },
  { key: 'submissions', label: 'Submissions', numeric: true, sortValue: (r) => r.submissions, render: (r) => fmtInt(r.submissions) },
  {
    key: 'confidence',
    label: 'Field confidence',
    numeric: true,
    sortValue: (r) => ratio(r.confidenceSum, r.confidenceN),
    render: (r) => fmtPct(ratio(r.confidenceSum, r.confidenceN)),
  },
  {
    key: 'illegible',
    label: 'Illegible fields',
    numeric: true,
    sortValue: (r) => ratio(r.illegible, r.fields),
    render: (r) => fmtPct(ratio(r.illegible, r.fields)),
  },
  {
    key: 'review',
    label: 'Fields sent to review',
    numeric: true,
    sortValue: (r) => ratio(r.needsReviewFields, r.fields),
    render: (r) => fmtPct(ratio(r.needsReviewFields, r.fields)),
  },
  {
    key: 'silent',
    label: 'Auto-accepted but wrong',
    numeric: true,
    sortValue: (r) => ratio(r.autoCorrected, r.autoReviewed),
    render: (r) => fmtPct(ratio(r.autoCorrected, r.autoReviewed)),
  },
];

export function OperationsPage() {
  const { data } = useReadyDashboard();

  const totals = useMemo(() => data.ocrDays.reduce(addOcr, emptyOcr()), [data.ocrDays]);

  const daily = useMemo(() => {
    const byDay = new Map<string, OcrTotals>();
    for (const r of data.ocrDays) {
      const day = r.capture_date.slice(0, 10);
      byDay.set(day, addOcr(byDay.get(day) ?? emptyOcr(), r));
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, t]) => ({
        day,
        submissions: t.submissions,
        illegible: ratio(t.illegible, t.fields) ?? 0,
        review: ratio(t.needsReviewFields, t.fields) ?? 0,
      }));
  }, [data.ocrDays]);

  const sections = useMemo<SectionRow[]>(() => {
    const bySection = new Map<string, OcrTotals>();
    for (const r of data.ocrDays) bySection.set(r.document_section, addOcr(bySection.get(r.document_section) ?? emptyOcr(), r));
    return [...bySection.entries()].map(([section, t]) => ({ section, ...t }));
  }, [data.ocrDays]);

  const midwives = useMemo(() => buildMidwifeTotals(data.midwifeMonths), [data.midwifeMonths]);
  const waiting = totals.captured + totals.syncFailed + totals.pendingAi + totals.needsReview;
  const range =
    daily.length > 0 ? `${fmtDay(daily[0].day)} – ${fmtDay(daily[daily.length - 1].day)}` : 'No submissions yet';

  return (
    <div className="page">
      <header className="region-header">
        <div>
          <p className="eyebrow">Paper-to-digital pipeline</p>
          <h1>Data capture</h1>
          <p className="muted">
            Forms photographed by midwives, synced over poor connections and read by OCR. {range}.
          </p>
        </div>
      </header>

      <div className="kpi-row">
        <StatTile label="Form sections captured" value={fmtInt(totals.submissions)} />
        <StatTile label="Waiting in the pipeline" value={fmtInt(waiting)} note={`${fmtInt(totals.syncFailed)} stuck on sync`} />
        <StatTile label="Average field confidence" value={fmtPct(ratio(totals.confidenceSum, totals.confidenceN))} />
        <StatTile label="Illegible fields" value={fmtPct(ratio(totals.illegible, totals.fields))} note={`${fmtInt(totals.illegible)} fields`} />
        <StatTile
          label="Auto-accepted but wrong"
          value={fmtPct(ratio(totals.autoCorrected, totals.autoReviewed))}
          note="Share later corrected by a midwife"
        />
        <StatTile label="Sync failures" value={fmtInt(totals.syncFailures)} />
      </div>

      <section className="panel" aria-labelledby="status-title">
        <h2 id="status-title">Where every form section is now</h2>
        <StackedBar
          unit="form sections"
          segments={[
            { key: 'registered', label: 'Registered', value: totals.registered, color: 'var(--series-1)' },
            { key: 'review', label: 'Needs review', value: totals.needsReview, color: 'var(--series-2)' },
            { key: 'pending', label: 'Pending OCR', value: totals.pendingAi, color: 'var(--series-3)' },
            { key: 'captured', label: 'On device, not synced', value: totals.captured, color: 'var(--series-4)' },
            { key: 'sync', label: 'Sync failed', value: totals.syncFailed, color: 'var(--series-5)' },
            { key: 'rejected', label: 'Rejected', value: totals.rejected, color: 'var(--series-6)' },
          ]}
        />
      </section>

      <div className="chart-grid">
        <section className="panel" aria-labelledby="daily-title">
          <h2 id="daily-title">Form sections per day</h2>
          <TrendChart
            kind="bar"
            data={daily}
            xKey="day"
            xFormat={fmtDay}
            series={[{ key: 'submissions', label: 'Form sections', color: 'var(--series-1)' }]}
          />
        </section>
        <section className="panel" aria-labelledby="ocr-title">
          <h2 id="ocr-title">Fields the OCR could not settle</h2>
          <TrendChart
            data={daily}
            xKey="day"
            xFormat={fmtDay}
            yFormat={(v) => fmtPct(v, 0)}
            integerAxis={false}
            series={[
              { key: 'review', label: 'Sent to review', color: 'var(--series-1)' },
              { key: 'illegible', label: 'Illegible', color: 'var(--series-2)' },
            ]}
          />
        </section>
      </div>

      <section className="panel" aria-labelledby="sections-title">
        <h2 id="sections-title">OCR quality by form section</h2>
        <DataTable
          rows={sections}
          columns={SECTION_COLUMNS}
          rowKey={(r) => r.section}
          initialSort={{ key: 'illegible', dir: 'desc' }}
          caption="OCR quality by form section"
        />
      </section>

      <section className="panel" aria-labelledby="midwives-title">
        <h2 id="midwives-title">Midwives</h2>
        <p className="muted">
          Totals across every month loaded, lowest verification first. Low verification and frequent sync failures
          point to where training or equipment is needed.
        </p>
        <DataTable
          rows={midwives}
          columns={MIDWIFE_COLUMNS}
          rowKey={(r) => r.id}
          initialSort={{ key: 'verified', dir: 'asc' }}
          caption="Midwife verification and sync reliability"
          limit={15}
        />
      </section>
    </div>
  );
}
