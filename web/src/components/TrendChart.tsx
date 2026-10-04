import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmtInt } from '../lib/format';

export interface Series {
  key: string;
  label: string;
  color: string;
}

interface TipProps {
  active?: boolean;
  label?: string | number;
  payload?: { dataKey?: string | number; value?: number | string }[];
}

const axisTick = { fill: 'var(--muted)', fontSize: 12 };

/** Line or column chart over time on one shared axis, with a legend and a hover readout. */
export function TrendChart({
  data,
  xKey,
  series,
  kind = 'line',
  height = 240,
  xFormat = String,
  yFormat = fmtInt,
  integerAxis = true,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  kind?: 'line' | 'bar';
  height?: number;
  xFormat?: (v: string) => string;
  yFormat?: (v: number) => string;
  /** Turn off for rates, whose ticks fall between 0 and 1. */
  integerAxis?: boolean;
}) {
  const renderTip = ({ active, label, payload }: TipProps) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="chart-tip">
        <div className="chart-tip-title">{xFormat(String(label))}</div>
        {series.map((s) => {
          const item = payload.find((p) => p.dataKey === s.key);
          if (!item || item.value === undefined) return null;
          return (
            <div className="chart-tip-row" key={s.key}>
              <span className="line-key" style={{ background: s.color }} />
              <strong>{yFormat(Number(item.value))}</strong>
              <span>{s.label}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const common = (
    <>
      <CartesianGrid vertical={false} stroke="var(--line)" />
      <XAxis
        dataKey={xKey}
        tickFormatter={(v) => xFormat(String(v))}
        tick={axisTick}
        axisLine={{ stroke: 'var(--line-strong)' }}
        tickLine={false}
        minTickGap={16}
      />
      <YAxis
        tickFormatter={(v) => yFormat(Number(v))}
        tick={axisTick}
        axisLine={false}
        tickLine={false}
        width={52}
        allowDecimals={!integerAxis}
      />
      <Tooltip
        content={(p) => renderTip(p as unknown as TipProps)}
        cursor={kind === 'line' ? { stroke: 'var(--line-strong)', strokeWidth: 1 } : { fill: 'var(--surface-2)' }}
        isAnimationActive={false}
      />
    </>
  );

  return (
    <figure className="chart">
      {series.length > 1 && (
        <ul className="legend" aria-label="Legend">
          {series.map((s) => (
            <li key={s.key}>
              <span className={kind === 'line' ? 'line-key' : 'swatch'} style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'line' ? (
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              {common}
              {series.map((s) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type="linear"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={false}
                  activeDot={{ r: 4, fill: s.color, stroke: 'var(--surface)', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} barCategoryGap={2}>
              {common}
              {series.map((s) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  fill={s.color}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
