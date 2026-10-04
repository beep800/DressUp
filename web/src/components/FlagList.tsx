import { STATUS_META, formatRate, thresholdText, type IndicatorResult } from '../lib/concern';
import { fmtInt } from '../lib/format';
import { ToneIcon } from './Icons';

/** Why a region is flagged: one line per indicator past its flag level. */
export function FlagList({ flagged, detailed = false }: { flagged: IndicatorResult[]; detailed?: boolean }) {
  return (
    <ul className={`flag-list${detailed ? ' flag-list-detailed' : ''}`}>
      {flagged.map((r) => {
        const meta = STATUS_META[r.status];
        return (
          <li key={r.def.id} className="flag">
            <ToneIcon tone={meta.tone} className={`flag-icon tone-${meta.tone}`} />
            <div className="flag-body">
              <div className="flag-head">
                <span className="flag-label">{r.def.label}</span>
                <span className="flag-value">{formatRate(r.def, r.rate)}</span>
              </div>
              <div className="flag-meta">
                {meta.label} · {thresholdText(r.def)}
                {detailed && ` · ${fmtInt(r.numerator)} of ${fmtInt(r.denominator)} ${r.def.of}`}
              </div>
              <p className="flag-why">{r.def.why}</p>
              {detailed && <p className="flag-basis">{r.def.basis}</p>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
