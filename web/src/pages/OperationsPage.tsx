import { useMemo } from 'react';
import { DataTable, type Column } from '../components/DataTable';
import { StackedBar } from '../components/StackedBar';
import { StatTile } from '../components/StatTile';
import { TrendChart } from '../components/TrendChart';
import { useReadyDashboard } from '../data/DataContext';
import { addOperations, emptyOperations, type OperationsTotals } from '../lib/aggregate';
import { fmtDay, fmtInt, fmtPct, fmtSection, ratio } from '../lib/format';
import type { DocumentDayRow } from '../lib/types';

// document_submissions.status values grouped by what has to happen next.
// Statuses not listed here are counted under "Other".
const STATUS_GROUPS = [
  { key: 'done', label: 'Registered', statuses: ['REGISTERED', 'SYNCED'], color: 'var(--series-1)' },
  {
    key: 'review',
    label: 'Needs a person',
    statuses: ['NEEDS_REVIEW', 'MANUAL_REVIEW_REQUIRED', 'DUPLICATE_SUSPECTED'],
    color: 'var(--series-2)',
  },
  { key: 'ocr', label: 'Waiting for OCR', statuses: ['PENDING_AI', 'PROCESSING_FAILED'], color: 'var(--series-3)' },
  { key: 'device', label: 'Not synced yet', statuses: ['CAPTURED', 'SYNC_FAILED'], color: 'var(--series-4)' },
  {
    key: 'matching',
    label: 'Read, not yet registered',
    statuses: ['AI_PROCESSED', 'VALIDATED', 'PATIENT_MATCHED'],
    color: 'var(--series-5)',
  },
  { key: 'superseded', label: 'Superseded', statuses: ['SUPERSEDED'], color: 'var(--series-6)' },
];

const WAITING_GROUPS = new Set(['review', 'ocr', 'device', 'matching']);

interface DocTotals {
  documents: number;
  verified: number;
  statusCounts: Map<string, number>;
  aiConfidenceSum: number;
  aiConfidenceN: number;
  fields: number;
  illegible: number;
  needsReview: number;
  unknown: number;
  notProvided: number;
  confirmed: number;
  manual: number;
}

const emptyDoc = (): DocTotals => ({
  documents: 0, verified: 0, statusCounts: new Map(), aiConfidenceSum: 0, aiConfidenceN: 0, fields: 0,
  illegible: 0, needsReview: 0, unknown: 0, notProvided: 0, confirmed: 0, manual: 0,
});

function addDoc(t: DocTotals, r: DocumentDayRow): DocTotals {
  t.documents += Number(r.documents);
  t.verified += Number(r.verified);
  for (const [status, n] of Object.entries(r.status_counts ?? {})) {
    t.statusCounts.set(status, (t.statusCounts.get(status) ?? 0) + Number(n));
  }
  t.aiConfidenceSum += Number(r.ai_confidence_sum);
  t.aiConfidenceN += Number(r.ai_confidence_n);
  t.fields += Number(r.fields);
  t.illegible += Number(r.fields_illegible);
  t.needsReview += Number(r.fields_needs_review);
  t.unknown += Number(r.fields_unknown);
  t.notProvided += Number(r.fields_not_provided);
  t.confirmed += Number(r.fields_confirmed);
  t.manual += Number(r.fields_manual);
  return t;
}

function groupStatuses(counts: Map<string, number>) {
  const known = new Set(STATUS_GROUPS.flatMap((g) => g.statuses));
  const groups = STATUS_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    color: g.color,
    value: g.statuses.reduce((n, s) => n + (counts.get(s) ?? 0), 0),
  }));
  const other = [...counts.entries()].filter(([s]) => !known.has(s)).reduce((n, [, v]) => n + v, 0);
  if (other > 0) groups.push({ key: 'other', label: 'Other', color: 'var(--neutral-fill)', value: other });
  return groups;
}

/** Share of reviewed fields a midwife had to change: how often the OCR value was wrong. */
const correctionRate = (t: DocTotals) => ratio(t.manual, t.manual + t.confirmed);

interface MidwifeTotals extends OperationsTotals {
  id: string;
}

const MIDWIFE_COLUMNS: Column<MidwifeTotals>[] = [
  { key: 'id', label: 'Midwife', sortValue: (r) => r.id, render: (r) => <span className="mono">{r.id}</span> },
  { key: 'registered', label: 'Women registered', numeric: true, sortValue: (r) => r.patients_registered, render: (r) => fmtInt(r.patients_registered) },
  { key: 'documents', label: 'Forms', numeric: true, sortValue: (r) => r.documents_captured, render: (r) => fmtInt(r.documents_captured) },
  {
    key: 'verified',
    label: 'Verified',
    numeric: true,
    sortValue: (r) => ratio(r.documents_verified, r.documents_captured),
    render: (r) => fmtPct(ratio(r.documents_verified, r.documents_captured), 0),
  },
  { key: 'waiting', label: 'Waiting', numeric: true, sortValue: (r) => r.documents_waiting, render: (r) => fmtInt(r.documents_waiting) },
  { key: 'sync', label: 'Sync failed', numeric: true, sortValue: (r) => r.documents_sync_failed, render: (r) => fmtInt(r.documents_sync_failed) },
  {
    key: 'processing',
    label: 'OCR failed',
    numeric: true,
    sortValue: (r) => r.documents_processing_failed,
    render: (r) => fmtInt(r.documents_processing_failed),
  },
];

interface SectionRow extends DocTotals {
  section: string;
}

const SECTION_COLUMNS: Column<SectionRow>[] = [
  { key: 'section', label: 'Form section', sortValue: (r) => fmtSection(r.section) },
  { key: 'documents', label: 'Forms', numeric: true, sortValue: (r) => r.documents, render: (r) => fmtInt(r.documents) },
  {
    key: 'confidence',
    label: 'OCR confidence',
    numeric: true,
    sortValue: (r) => ratio(r.aiConfidenceSum, r.aiConfidenceN),
    render: (r) => fmtPct(ratio(r.aiConfidenceSum, r.aiConfidenceN)),
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
    label: 'Fields needing review',
    numeric: true,
    sortValue: (r) => ratio(r.needsReview, r.fields),
    render: (r) => fmtPct(ratio(r.needsReview, r.fields)),
  },
  {
    key: 'missing',
    label: 'Not provided or unknown',
    numeric: true,
    sortValue: (r) => ratio(r.notProvided + r.unknown, r.fields),
    render: (r) => fmtPct(ratio(r.notProvided + r.unknown, r.fields)),
  },
  {
    key: 'corrected',
    label: 'Corrected by midwife',
    numeric: true,
    sortValue: (r) => correctionRate(r),
    render: (r) => fmtPct(correctionRate(r)),
  },
];

export function OperationsPage() {
  const { data } = useReadyDashboard();

  const totals = useMemo(() => data.documentDays.reduce(addDoc, emptyDoc()), [data.documentDays]);

  const daily = useMemo(() => {
    const byDay = new Map<string, DocTotals>();
    for (const r of data.documentDays) {
      const day = r.capture_date.slice(0, 10);
      byDay.set(day, addDoc(byDay.get(day) ?? emptyDoc(), r));
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, t]) => ({
        day,
        documents: t.documents,
        illegible: ratio(t.illegible, t.fields) ?? 0,
        review: ratio(t.needsReview, t.fields) ?? 0,
      }));
  }, [data.documentDays]);

  const sections = useMemo<SectionRow[]>(() => {
    const bySection = new Map<string, DocTotals>();
    for (const r of data.documentDays) {
      bySection.set(r.document_section, addDoc(bySection.get(r.document_section) ?? emptyDoc(), r));
    }
    return [...bySection.entries()].map(([section, t]) => ({ section, ...t }));
  }, [data.documentDays]);

  // Totals per midwife across every area they work in.
  const midwives = useMemo<MidwifeTotals[]>(() => {
    const byId = new Map<string, OperationsTotals>();
    for (const r of data.midwifeMonths) byId.set(r.midwife_id, addOperations(byId.get(r.midwife_id) ?? emptyOperations(), r));
    return [...byId.entries()].map(([id, t]) => ({ id, ...t }));
  }, [data.midwifeMonths]);

  const statusGroups = groupStatuses(totals.statusCounts);
  const waiting = statusGroups.filter((g) => WAITING_GROUPS.has(g.key)).reduce((n, g) => n + g.value, 0);
  const range =
    daily.length > 0 ? `${fmtDay(daily[0].day)} – ${fmtDay(daily[daily.length - 1].day)}` : 'No forms captured yet';

  return (
    <div className="page">
      <header className="region-header">
        <div>
          <p className="eyebrow">Paper-to-digital pipeline</p>
          <h1>Data capture</h1>
          <p className="muted">Forms photographed by midwives, synced over poor connections and read by OCR. {range}.</p>
        </div>
      </header>

      <div className="kpi-row">
        <StatTile label="Forms captured" value={fmtInt(totals.documents)} />
        <StatTile
          label="Waiting in the pipeline"
          value={fmtInt(waiting)}
          note={`${fmtInt(totals.statusCounts.get('SYNC_FAILED') ?? 0)} failed to sync`}
        />
        <StatTile label="Verified by midwife" value={fmtPct(ratio(totals.verified, totals.documents), 0)} />
        <StatTile label="Average OCR confidence" value={fmtPct(ratio(totals.aiConfidenceSum, totals.aiConfidenceN))} />
        <StatTile label="Illegible fields" value={fmtPct(ratio(totals.illegible, totals.fields))} note={`${fmtInt(totals.illegible)} ${totals.illegible === 1 ? 'field' : 'fields'}`} />
        <StatTile
          label="Corrected by midwife"
          value={fmtPct(correctionRate(totals))}
          note="Share of reviewed fields the midwife changed"
        />
      </div>

      <section className="panel" aria-labelledby="status-title">
        <h2 id="status-title">Where every form is now</h2>
        <StackedBar unit="forms" segments={statusGroups} />
      </section>

      <div className="chart-grid">
        <section className="panel" aria-labelledby="daily-title">
          <h2 id="daily-title">Forms captured per day</h2>
          <TrendChart
            kind="bar"
            data={daily}
            xKey="day"
            xFormat={fmtDay}
            series={[{ key: 'documents', label: 'Forms', color: 'var(--series-1)' }]}
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
              { key: 'review', label: 'Needs review', color: 'var(--series-1)' },
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
          Lowest verification first. Low verification and frequent sync failures point to where training or
          equipment is needed.
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
