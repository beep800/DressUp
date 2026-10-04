import { useState } from 'react';
import { fmtInt, fmtPct } from '../lib/format';

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Part-to-whole bar. Hover or focus a segment to read it; the legend lists every count. */
export function StackedBar({ segments, unit }: { segments: Segment[]; unit: string }) {
  const [active, setActive] = useState<string | null>(null);
  const total = segments.reduce((n, s) => n + s.value, 0);
  const current = segments.find((s) => s.key === active);

  return (
    <div className="stacked">
      <div className="stacked-readout" aria-live="polite">
        {current ? (
          <>
            <strong>{fmtInt(current.value)}</strong> {current.label.toLowerCase()} · {fmtPct(current.value / total)}
          </>
        ) : (
          <>
            <strong>{fmtInt(total)}</strong> {unit}
          </>
        )}
      </div>
      <div className="stacked-bar">
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <div
              key={s.key}
              className={`stacked-seg${active === s.key ? ' is-active' : ''}`}
              style={{ flexGrow: s.value, background: s.color }}
              tabIndex={0}
              aria-label={`${s.label}: ${fmtInt(s.value)}, ${fmtPct(s.value / total)}`}
              onPointerEnter={() => setActive(s.key)}
              onPointerLeave={() => setActive(null)}
              onFocus={() => setActive(s.key)}
              onBlur={() => setActive(null)}
            />
          ))}
      </div>
      <ul className="legend legend-grid">
        {segments.map((s) => (
          <li key={s.key}>
            <span className="swatch" style={{ background: s.color }} />
            <span>{s.label}</span>
            <strong>{fmtInt(s.value)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
