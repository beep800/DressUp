import { STATUS_META, formatRate, thresholdText, thresholdValue, type IndicatorResult } from '../lib/concern';
import { fmtInt } from '../lib/format';
import { ToneIcon } from './Icons';

/** Largest value a bar track shows: room for the flag level and the highest rate. */
export function scaleMaxFor(results: IndicatorResult[]): number {
  const def = results[0]?.def;
  if (!def) return 1;
  // Context indicators and "below" rules use the absolute 0–100% scale.
  if (def.rule.kind === 'below' || def.rule.kind === 'context') return def.unit === 'percent' ? 1 : 0.05;
  const flag =
    def.rule.kind === 'above' ? def.rule.severe : def.rule.kind === 'outside' ? def.rule.severeHigh : 0;
  const top = Math.max(flag * 1.15, ...results.map((r) => r.rate ?? 0));
  return top > 0 ? top : 1;
}

/** A rate drawn against its flag level. The fill is colored only when the rate is flagged. */
export function IndicatorBar({
  result,
  scaleMax,
  showCounts = false,
}: {
  result: IndicatorResult;
  scaleMax: number;
  showCounts?: boolean;
}) {
  const { def, rate, status } = result;
  const flag = thresholdValue(def, rate);
  const width = rate === null ? 0 : Math.min(100, (rate / scaleMax) * 100);
  const flagPos = flag === null ? null : Math.min(100, (flag / scaleMax) * 100);
  const assessed = status !== 'insufficient';

  return (
    <div className="ibar">
      <div className="ibar-top">
        <span className="ibar-label">
          {(status === 'severe' || status === 'concern') && (
            <ToneIcon tone={STATUS_META[status].tone} className={`ibar-icon tone-${STATUS_META[status].tone}`} />
          )}
          {def.label}
        </span>
        <span className="ibar-value">{assessed ? formatRate(def, rate) : 'Too few records'}</span>
      </div>
      <div
        className="ibar-track"
        role="img"
        aria-label={`${def.label}: ${assessed ? formatRate(def, rate) : 'too few records'}, ${thresholdText(def)}`}
      >
        {assessed && <div className={`ibar-fill fill-${status}`} style={{ width: `${width}%` }} />}
        {flagPos !== null && <div className="ibar-flag" style={{ left: `${flagPos}%` }} />}
      </div>
      {showCounts && (
        <div className="ibar-note">
          {fmtInt(result.numerator)} of {fmtInt(result.denominator)} {def.of} · {thresholdText(def)}
        </div>
      )}
    </div>
  );
}
