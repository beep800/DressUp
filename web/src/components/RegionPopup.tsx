import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { RegionSummary } from '../lib/aggregate';
import { fmtInt, fmtPct, ratio, regionPath } from '../lib/format';
import { ConcernBadge } from './Badges';
import { FlagList } from './FlagList';
import { IconArrowRight } from './Icons';

const MAX_REASONS = 3;

export function RegionPopup({
  summary,
  style,
  docked,
  onClose,
}: {
  summary: RegionSummary;
  style?: CSSProperties;
  docked: boolean;
  onClose: () => void;
}) {
  const { assessment: a, health } = summary;
  const reasons = a.flagged.slice(0, MAX_REASONS);

  return (
    <div
      className={`popup${docked ? ' popup-docked' : ''}`}
      style={docked ? undefined : style}
      role="dialog"
      aria-label={`${summary.region} summary`}
    >
      <div className="popup-head">
        <div>
          <h3>{summary.region}</h3>
          {summary.geo && <p className="muted">{summary.geo.country_name}</p>}
        </div>
        <button className="icon-btn" type="button" onClick={onClose} aria-label="Close region summary">
          ×
        </button>
      </div>
      <ConcernBadge level={a.level} />

      {reasons.length > 0 ? (
        <section>
          <h4 className="eyebrow">Why it is flagged</h4>
          <FlagList flagged={reasons} />
          {a.flagged.length > MAX_REASONS && (
            <p className="muted small">
              {a.flagged.length - MAX_REASONS} more flagged indicator{a.flagged.length - MAX_REASONS > 1 ? 's' : ''} on the
              region page.
            </p>
          )}
        </section>
      ) : (
        <p className="muted">
          {a.level === 'no-data'
            ? 'Not enough records yet to assess this region.'
            : 'No indicator is past its flag level.'}
        </p>
      )}

      <dl className="popup-stats">
        <div>
          <dt>Women registered</dt>
          <dd>{fmtInt(health.pregnancies)}</dd>
        </div>
        <div>
          <dt>Deliveries</dt>
          <dd>{fmtInt(health.deliveries)}</dd>
        </div>
        <div>
          <dt>Midwives</dt>
          <dd>{fmtInt(summary.midwives.length)}</dd>
        </div>
        <div>
          <dt>Referred to higher care</dt>
          <dd>{fmtPct(ratio(health.referred_to_higher_care, health.referral_recorded))}</dd>
        </div>
      </dl>

      <Link className="btn btn-primary btn-block" to={regionPath(summary.region)}>
        Open region details <IconArrowRight />
      </Link>
    </div>
  );
}
