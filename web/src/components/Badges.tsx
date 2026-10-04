import { LEVEL_META, STATUS_META, type ConcernLevel, type IndicatorStatus } from '../lib/concern';
import { ToneIcon } from './Icons';

export function ConcernBadge({ level, size = 'md' }: { level: ConcernLevel; size?: 'sm' | 'md' | 'lg' }) {
  const meta = LEVEL_META[level];
  return (
    <span className={`badge badge-${size} tone-${meta.tone}`}>
      <ToneIcon tone={meta.tone} />
      {meta.label}
    </span>
  );
}

export function StatusChip({ status }: { status: IndicatorStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`badge badge-sm tone-${meta.tone}`}>
      <ToneIcon tone={meta.tone} />
      {meta.label}
    </span>
  );
}
