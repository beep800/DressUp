const intFormat = new Intl.NumberFormat('en-US');
const compactFormat = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtInt = (n: number) => intFormat.format(Math.round(n));

export const fmtCompact = (n: number) => (Math.abs(n) < 10_000 ? fmtInt(n) : compactFormat.format(n));

export const ratio = (numerator: number, denominator: number) => (denominator > 0 ? numerator / denominator : null);

export const fmtPct = (rate: number | null, digits = 1) =>
  rate === null || !Number.isFinite(rate) ? '—' : `${(rate * 100).toFixed(digits)}%`;

export const fmtHours = (hours: number | null) => {
  if (hours === null || !Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  return `${hours.toFixed(hours < 10 ? 1 : 0)} h`;
};

const toUtcDate = (isoDate: string) => new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);

export const fmtMonth = (isoDate: string) =>
  toUtcDate(isoDate).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export const fmtDay = (isoDate: string) =>
  toUtcDate(isoDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export const regionPath = (region: string) => `/region/${encodeURIComponent(region)}`;

const SECTION_LABELS: Record<string, string> = {
  PATIENT_IDENTIFICATION: 'Patient identification',
  CURRENT_PREGNANCY: 'Current pregnancy',
  DELIVERY: 'Delivery',
  POSTPARTUM_NEWBORN: 'Postpartum & newborn',
};

export const fmtSection = (section: string) =>
  SECTION_LABELS[section] ??
  section
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());

const EMONC_LABELS: Record<string, string> = {
  NONE: 'None',
  BASIC: 'Basic',
  COMPREHENSIVE: 'Comprehensive',
};

export const fmtEmonc = (level: string | null | undefined) => (level ? (EMONC_LABELS[level] ?? level) : '—');
