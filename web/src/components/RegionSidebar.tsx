import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { NationalTotals, RegionSummary } from '../lib/aggregate';
import { HEADLINE_IDS, LEVEL_RANK, type IndicatorResult } from '../lib/concern';
import { fmtCompact, fmtInt, fmtPct, ratio, regionPath } from '../lib/format';
import { ConcernBadge } from './Badges';
import { IconArrowRight } from './Icons';
import { IndicatorBar, scaleMaxFor } from './IndicatorBar';
import { StatTile } from './StatTile';

type Filter = 'all' | 'flagged';
type Sort = 'concern' | 'pregnancies' | 'name';

const headline = (s: RegionSummary, id: string) => s.assessment.results.find((r) => r.def.id === id)!;

export function RegionSidebar({
  summaries,
  national,
  selected,
  onSelect,
  demo,
}: {
  summaries: RegionSummary[];
  national: NationalTotals;
  selected: string | null;
  onSelect: (region: string) => void;
  demo: boolean;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('concern');

  const flaggedCount = summaries.filter((s) => s.assessment.level === 'high' || s.assessment.level === 'elevated').length;
  const highCount = summaries.filter((s) => s.assessment.level === 'high').length;
  const unmapped = summaries.filter((s) => !s.geo);

  // One scale per headline indicator, shared by every card, so bars compare across regions.
  const scales = useMemo(() => {
    const out: Record<string, number> = {};
    for (const id of HEADLINE_IDS) out[id] = scaleMaxFor(summaries.map((s) => headline(s, id)));
    return out;
  }, [summaries]);

  const list = useMemo(() => {
    const shown =
      filter === 'flagged'
        ? summaries.filter((s) => s.assessment.level === 'high' || s.assessment.level === 'elevated')
        : summaries;
    return [...shown].sort((a, b) => {
      if (sort === 'name') return a.region.localeCompare(b.region);
      if (sort === 'pregnancies') return b.health.pregnancies - a.health.pregnancies;
      return (
        LEVEL_RANK[b.assessment.level] - LEVEL_RANK[a.assessment.level] ||
        b.assessment.score - a.assessment.score ||
        a.region.localeCompare(b.region)
      );
    });
  }, [summaries, filter, sort]);

  return (
    <aside className="sidebar" aria-label="Regional statistics">
      {demo && (
        <p className="note">
          These are generated demo numbers, not census figures. Set <code>VITE_DATA_URL</code> in{' '}
          <code>.env</code> to load your data through n8n.
        </p>
      )}
      <div className="kpi-grid">
        <StatTile
          label="Regions of concern"
          value={
            <>
              {flaggedCount}
              <span className="stat-of"> of {summaries.length}</span>
            </>
          }
          note={`${highCount} high concern`}
        />
        <StatTile
          label="Women registered"
          value={fmtCompact(national.health.pregnancies)}
          note={`${fmtInt(national.midwifeCount)} midwives`}
        />
        <StatTile label="Deliveries recorded" value={fmtCompact(national.health.deliveries)} />
        <StatTile
          label="Referred to higher care"
          value={fmtPct(ratio(national.health.referred_to_higher_care, national.health.referral_recorded))}
          note={`${fmtInt(national.health.referred_to_higher_care)} births`}
        />
      </div>

      <div className="list-controls">
        <div className="segmented" role="group" aria-label="Show regions">
          <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            All {summaries.length}
          </button>
          <button type="button" aria-pressed={filter === 'flagged'} onClick={() => setFilter('flagged')}>
            Flagged {flaggedCount}
          </button>
        </div>
        <label className="sort-select" htmlFor="region-sort">
          <span className="sr-only">Sort regions by</span>
          <select id="region-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="concern">Most concerning first</option>
            <option value="pregnancies">Most women first</option>
            <option value="name">Name A–Z</option>
          </select>
        </label>
      </div>

      {list.length === 0 ? (
        <p className="muted empty-note">No region is flagged. Every assessed indicator is within its flag level.</p>
      ) : (
        <ul className="region-list">
          {list.map((s) => (
            <li key={s.region}>
              <RegionCard
                summary={s}
                selected={s.region === selected}
                onSelect={onSelect}
                headlines={HEADLINE_IDS.map((id) => headline(s, id))}
                scales={scales}
              />
            </li>
          ))}
        </ul>
      )}

      {unmapped.length > 0 && (
        <p className="note">
          {unmapped.length} {unmapped.length > 1 ? 'areas are' : 'area is'} not on the map yet:{' '}
          {unmapped.map((s) => s.region).join(', ')}. Add the midwife codes to a region in{' '}
          <code>web/public/locations.json</code>.
        </p>
      )}
    </aside>
  );
}

function RegionCard({
  summary,
  selected,
  onSelect,
  headlines,
  scales,
}: {
  summary: RegionSummary;
  selected: boolean;
  onSelect: (region: string) => void;
  headlines: IndicatorResult[];
  scales: Record<string, number>;
}) {
  const ref = useRef<HTMLElement>(null);
  const { assessment: a } = summary;

  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const flagText =
    a.flagged.length === 0 ? 'No flags' : `${a.flagged.length} flag${a.flagged.length > 1 ? 's' : ''}`;

  return (
    <article ref={ref} className={`region-card tone-edge-${a.level}${selected ? ' is-selected' : ''}`}>
      <button
        type="button"
        className="region-card-main"
        aria-pressed={selected}
        onClick={() => onSelect(summary.region)}
      >
        <div className="region-card-head">
          <div>
            <h3>{summary.region}</h3>
            <p className="muted">{summary.geo?.country_name ?? 'No map location'}</p>
          </div>
          <ConcernBadge level={a.level} size="sm" />
        </div>
        <div className="region-card-bars">
          {headlines.map((r) => (
            <IndicatorBar key={r.def.id} result={r} scaleMax={scales[r.def.id]} />
          ))}
        </div>
      </button>
      <div className="region-card-foot">
        <span>
          {flagText} · {fmtInt(summary.health.pregnancies)} women
        </span>
        <Link to={regionPath(summary.region)} className="text-link">
          Details <IconArrowRight />
        </Link>
      </div>
    </article>
  );
}
