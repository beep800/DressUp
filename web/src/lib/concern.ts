import type { DeliveryCounts, HealthCounts } from './types';

// Rules that decide when a region is an area of concern. Each indicator is a rate
// with an explicit numerator and denominator from the analytics views. Flag levels
// cite their source in `basis`; "programme default" levels are starting points for
// the ministry to tune here.

export interface CountsBundle {
  health: HealthCounts;
  delivery: DeliveryCounts;
}

export type Domain = 'Demographics' | 'Maternal health' | 'Newborn outcomes' | 'Care & referral';
export const DOMAINS: Domain[] = ['Demographics', 'Maternal health', 'Newborn outcomes', 'Care & referral'];

export type Rule =
  | { kind: 'above'; concern: number; severe: number }
  | { kind: 'below'; concern: number; severe: number }
  | { kind: 'outside'; low: number; high: number; severeLow: number; severeHigh: number }
  | { kind: 'context' };

export interface IndicatorDef {
  id: string;
  label: string;
  domain: Domain;
  unit: 'percent' | 'per1000';
  /** What the denominator counts, e.g. "live births weighed". */
  of: string;
  rule: Rule;
  ratio: (c: CountsBundle) => [numerator: number, denominator: number];
  why: string;
  basis: string;
}

/** Rates on fewer records than this are shown but never flagged. */
export const MIN_DENOMINATOR = 30;

export const INDICATORS: IndicatorDef[] = [
  // Demographics
  {
    id: 'adolescent',
    label: 'Adolescent pregnancies',
    domain: 'Demographics',
    unit: 'percent',
    of: 'pregnancies with age recorded',
    rule: { kind: 'above', concern: 0.15, severe: 0.25 },
    ratio: ({ health: h }) => [h.adolescent_pregnancies, h.age_recorded],
    why: 'Mothers under 18 face higher risks of eclampsia, obstructed labour and low birth weight babies.',
    basis: 'Programme default.',
  },
  {
    id: 'advanced_age',
    label: 'Mothers aged 35 or over',
    domain: 'Demographics',
    unit: 'percent',
    of: 'pregnancies with age recorded',
    rule: { kind: 'context' },
    ratio: ({ health: h }) => [h.advanced_maternal_age_pregnancies, h.age_recorded],
    why: 'Advanced maternal age raises the risk of hypertension, gestational diabetes and stillbirth.',
    basis: 'Shown for context.',
  },
  {
    id: 'unintended',
    label: 'Unintended pregnancies',
    domain: 'Demographics',
    unit: 'percent',
    of: 'pregnancies with intent recorded',
    rule: { kind: 'context' },
    ratio: ({ health: h }) => [h.unintended_pregnancies, h.intent_recorded],
    why: 'Guides where family planning services are most needed.',
    basis: 'Shown for context.',
  },
  {
    id: 'consanguinity',
    label: 'Consanguineous marriages',
    domain: 'Demographics',
    unit: 'percent',
    of: 'pregnancies with consanguinity recorded',
    rule: { kind: 'context' },
    ratio: ({ health: h }) => [h.consanguineous_marriages, h.consanguinity_recorded],
    why: 'Raises the risk of recessive genetic conditions; guides genetic counselling.',
    basis: 'Shown for context.',
  },
  {
    id: 'vulnerable',
    label: 'Socioeconomically vulnerable',
    domain: 'Demographics',
    unit: 'percent',
    of: 'pregnancies with education or profession recorded',
    rule: { kind: 'context' },
    ratio: ({ health: h }) => [h.socioeconomically_vulnerable, h.socioeconomic_recorded],
    why: 'Low literacy and unstable household income predict missed visits and late care.',
    basis: 'Score of 2 or more, defined in analytics.v_pregnancy_analytics.',
  },

  // Maternal health
  {
    id: 'hypertension',
    label: 'Hypertension',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women with blood pressure recorded',
    rule: { kind: 'above', concern: 0.1, severe: 0.15 },
    ratio: ({ health: h }) => [h.hypertension, h.bp_recorded],
    why: 'High blood pressure in pregnancy is a leading cause of maternal death, mainly through pre-eclampsia and eclampsia.',
    basis: 'Hypertensive disorders affect about 5–10% of pregnancies worldwide.',
  },
  {
    id: 'preeclampsia',
    label: 'Signs of pre-eclampsia',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women with blood pressure recorded',
    rule: { kind: 'above', concern: 0.05, severe: 0.08 },
    ratio: ({ health: h }) => [h.preeclampsia_signs, h.bp_recorded],
    why: 'Raised blood pressure with protein in the urine needs magnesium sulfate and a planned, timely delivery.',
    basis: 'Pre-eclampsia affects about 2–8% of pregnancies.',
  },
  {
    id: 'anaemia',
    label: 'Moderate or severe anaemia',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women with haemoglobin recorded',
    rule: { kind: 'above', concern: 0.2, severe: 0.4 },
    ratio: ({ health: h }) => [h.moderate_or_severe_anemia, h.hemoglobin_recorded],
    why: 'Anaemia raises the risk of death from postpartum haemorrhage and of preterm and low birth weight babies.',
    basis: "Adapted from WHO's 20% and 40% cut-offs for anaemia as a moderate or severe public health problem.",
  },
  {
    id: 'severe_anaemia',
    label: 'Severe anaemia (Hb < 7 g/dL)',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women with haemoglobin recorded',
    rule: { kind: 'context' },
    ratio: ({ health: h }) => [h.severe_anemia, h.hemoglobin_recorded],
    why: 'Severe anaemia usually needs transfusion capacity close to where the woman gives birth.',
    basis: 'Shown for context.',
  },
  {
    id: 'gdm',
    label: 'Gestational diabetes',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women screened',
    rule: { kind: 'context' },
    ratio: ({ health: h }) => [h.gestational_diabetes, h.gdm_recorded],
    why: 'Raises the risk of large babies, obstructed labour and later type 2 diabetes.',
    basis: 'Shown for context.',
  },
  {
    id: 'hiv',
    label: 'HIV positive',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women tested',
    rule: { kind: 'above', concern: 0.01, severe: 0.05 },
    ratio: ({ health: h }) => [h.hiv_positive, h.hiv_tested],
    why: 'Positive mothers need antiretroviral therapy to prevent transmission to the baby.',
    basis: "Above 1% is UNAIDS' threshold for a generalised epidemic.",
  },
  {
    id: 'syphilis',
    label: 'Syphilis positive',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women tested',
    rule: { kind: 'above', concern: 0.01, severe: 0.03 },
    ratio: ({ health: h }) => [h.syphilis_positive, h.syphilis_tested],
    why: 'Untreated syphilis causes stillbirth and congenital syphilis; one dose of penicillin prevents it.',
    basis: 'Programme default.',
  },
  {
    id: 'hepatitis_c',
    label: 'Hepatitis C positive',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women tested',
    rule: { kind: 'context' },
    ratio: ({ health: h }) => [h.hepatitis_c_positive, h.hepatitis_c_tested],
    why: 'Guides follow-up testing of exposed infants.',
    basis: 'Shown for context.',
  },

  // Newborn outcomes
  {
    id: 'preterm',
    label: 'Preterm births',
    domain: 'Newborn outcomes',
    unit: 'percent',
    of: 'deliveries',
    rule: { kind: 'above', concern: 0.1, severe: 0.15 },
    ratio: ({ health: h }) => [h.preterm_deliveries, h.deliveries],
    why: 'Prematurity is the leading cause of newborn death; preterm babies need warmth, feeding support and often referral.',
    basis: 'About 1 in 10 babies worldwide is born before 37 weeks.',
  },
  {
    id: 'lbw',
    label: 'Low birth weight',
    domain: 'Newborn outcomes',
    unit: 'percent',
    of: 'live births weighed',
    rule: { kind: 'above', concern: 0.15, severe: 0.2 },
    ratio: ({ health: h }) => [h.low_birth_weight, h.live_births_weighed],
    why: 'Babies under 2,500 g reflect maternal undernutrition, infection and growth restriction, and die more often.',
    basis: 'Global prevalence is about 15%.',
  },
  {
    id: 'sga',
    label: 'Small for gestational age',
    domain: 'Newborn outcomes',
    unit: 'percent',
    of: 'live births with weight, sex and gestational age',
    rule: { kind: 'context' },
    ratio: ({ health: h }) => [h.small_for_gestational_age, h.sga_assessable],
    why: 'Below the 10th INTERGROWTH-21st centile: the usual proxy for growth restriction in the womb.',
    basis: 'Shown for context.',
  },
  {
    id: 'stillbirth',
    label: 'Stillbirth rate',
    domain: 'Newborn outcomes',
    unit: 'per1000',
    of: 'births',
    rule: { kind: 'above', concern: 0.012, severe: 0.025 },
    ratio: ({ health: h }) => [h.stillbirths, h.newborns],
    why: 'Stillbirths point to gaps in monitoring during labour and in emergency obstetric care.',
    basis: 'Every Newborn Action Plan target: 12 or fewer per 1,000 births by 2030.',
  },
  {
    id: 'breastfeeding',
    label: 'Breastfed within 1 hour',
    domain: 'Newborn outcomes',
    unit: 'percent',
    of: 'live births with feeding recorded',
    rule: { kind: 'below', concern: 0.5, severe: 0.3 },
    ratio: ({ health: h }) => [h.breastfed_within_1h, h.breastfeeding_recorded],
    why: 'Early breastfeeding cuts newborn infection and death; low rates suggest gaps in care right after birth.',
    basis: 'The global average is under 50%; WHO targets 70% by 2030.',
  },

  // Care & referral
  {
    id: 'first_trimester',
    label: 'Enrolled in first trimester',
    domain: 'Care & referral',
    unit: 'percent',
    of: 'pregnancies with gestational age at enrolment',
    rule: { kind: 'below', concern: 0.5, severe: 0.3 },
    ratio: ({ health: h }) => [h.enrolled_first_trimester, h.enrollment_ga_recorded],
    why: 'A late first visit leaves less time to screen and treat anaemia, hypertension and infections.',
    basis: 'WHO recommends the first antenatal contact before 12 weeks; flag levels are programme defaults.',
  },
  {
    id: 'cesarean',
    label: 'Caesarean births',
    domain: 'Care & referral',
    unit: 'percent',
    of: 'deliveries',
    rule: { kind: 'outside', low: 0.05, high: 0.15, severeLow: 0.02, severeHigh: 0.25 },
    ratio: ({ health: h }) => [h.cesarean_deliveries, h.deliveries],
    why: 'Below 5% suggests women cannot reach surgery when they need it; well above 15% suggests surgery without medical need.',
    basis: 'WHO statement on caesarean section rates (2015).',
  },
  {
    id: 'primary_cesarean',
    label: 'Primary caesareans',
    domain: 'Care & referral',
    unit: 'percent',
    of: 'deliveries with no previous caesarean',
    rule: { kind: 'context' },
    ratio: ({ health: h }) => [h.primary_cesareans, h.deliveries_without_prior_cesarean],
    why: 'First caesareans drive future repeat caesareans; track against the overall rate.',
    basis: 'Shown for context.',
  },
  {
    id: 'referral',
    label: 'Births referred to higher care',
    domain: 'Care & referral',
    unit: 'percent',
    of: 'deliveries at or near facilities in the region',
    rule: { kind: 'above', concern: 0.15, severe: 0.25 },
    ratio: ({ delivery: d }) => [d.deliveries_with_any_referral, d.deliveries],
    why: 'Frequent referral of mother or baby points to facilities without emergency obstetric capability.',
    basis: 'Programme default.',
  },
];

export const INDICATOR_BY_ID = new Map(INDICATORS.map((d) => [d.id, d]));

/** Indicators shown as bars on each region card. */
export const HEADLINE_IDS = ['lbw', 'preterm', 'anaemia', 'first_trimester'] as const;

export type IndicatorStatus = 'severe' | 'concern' | 'ok' | 'context' | 'insufficient';

export interface IndicatorResult {
  def: IndicatorDef;
  numerator: number;
  denominator: number;
  rate: number | null;
  status: IndicatorStatus;
  /** How far past the flag level the rate is (1 = exactly at it). Used for ordering. */
  excess: number;
}

export function evaluateIndicator(def: IndicatorDef, counts: CountsBundle): IndicatorResult {
  const [numerator, denominator] = def.ratio(counts);
  const rate = denominator > 0 ? numerator / denominator : null;
  const base = { def, numerator, denominator, rate, excess: 0 };
  if (rate === null || denominator < MIN_DENOMINATOR) return { ...base, status: 'insufficient' };

  const rule = def.rule;
  switch (rule.kind) {
    case 'context':
      return { ...base, status: 'context' };
    case 'above': {
      const status = rate >= rule.severe ? 'severe' : rate >= rule.concern ? 'concern' : 'ok';
      return { ...base, status, excess: rate / rule.concern };
    }
    case 'below': {
      const status = rate < rule.severe ? 'severe' : rate < rule.concern ? 'concern' : 'ok';
      return { ...base, status, excess: rate > 0 ? rule.concern / rate : Infinity };
    }
    case 'outside': {
      const status =
        rate < rule.severeLow || rate > rule.severeHigh
          ? 'severe'
          : rate < rule.low || rate > rule.high
            ? 'concern'
            : 'ok';
      const excess = rate > rule.high ? rate / rule.high : rate > 0 ? rule.low / rate : Infinity;
      return { ...base, status, excess };
    }
  }
}

export type ConcernLevel = 'high' | 'elevated' | 'clear' | 'no-data';

export interface Assessment {
  level: ConcernLevel;
  score: number;
  severeCount: number;
  concernCount: number;
  results: IndicatorResult[];
  /** Severe flags first, then the rest, each ordered by distance past the flag level. */
  flagged: IndicatorResult[];
}

export function assess(counts: CountsBundle): Assessment {
  const results = INDICATORS.map((def) => evaluateIndicator(def, counts));
  const severe = results.filter((r) => r.status === 'severe');
  const concern = results.filter((r) => r.status === 'concern');
  const byExcess = (a: IndicatorResult, b: IndicatorResult) => b.excess - a.excess;
  const flagged = [...severe.sort(byExcess), ...concern.sort(byExcess)];
  const anyAssessed = results.some((r) => r.status === 'ok' || r.status === 'severe' || r.status === 'concern');

  const level: ConcernLevel =
    severe.length > 0 || concern.length >= 3
      ? 'high'
      : concern.length > 0
        ? 'elevated'
        : anyAssessed
          ? 'clear'
          : 'no-data';

  return {
    level,
    score: severe.length * 3 + concern.length,
    severeCount: severe.length,
    concernCount: concern.length,
    results,
    flagged,
  };
}

export const LEVEL_RANK: Record<ConcernLevel, number> = { 'no-data': 0, clear: 1, elevated: 2, high: 3 };

export type Tone = 'critical' | 'warning' | 'good' | 'neutral';

export const LEVEL_META: Record<ConcernLevel, { label: string; tone: Tone }> = {
  high: { label: 'High concern', tone: 'critical' },
  elevated: { label: 'Elevated', tone: 'warning' },
  clear: { label: 'No flags', tone: 'good' },
  'no-data': { label: 'Too few records', tone: 'neutral' },
};

export const STATUS_META: Record<IndicatorStatus, { label: string; tone: Tone }> = {
  severe: { label: 'Severe', tone: 'critical' },
  concern: { label: 'Flagged', tone: 'warning' },
  ok: { label: 'Within range', tone: 'good' },
  context: { label: 'Context', tone: 'neutral' },
  insufficient: { label: 'Too few records', tone: 'neutral' },
};

export function formatRate(def: IndicatorDef, rate: number | null): string {
  if (rate === null || !Number.isFinite(rate)) return '—';
  return def.unit === 'per1000' ? `${(rate * 1000).toFixed(1)} per 1,000` : `${(rate * 100).toFixed(1)}%`;
}

function formatLevel(def: IndicatorDef, value: number): string {
  return def.unit === 'per1000' ? `${Math.round(value * 1000)} per 1,000` : `${Math.round(value * 100)}%`;
}

/** Plain-language flag level, e.g. "flagged at 15% or more". */
export function thresholdText(def: IndicatorDef): string {
  const r = def.rule;
  switch (r.kind) {
    case 'above':
      return `flagged at ${formatLevel(def, r.concern)} or more`;
    case 'below':
      return `flagged below ${formatLevel(def, r.concern)}`;
    case 'outside':
      return `expected ${formatLevel(def, r.low)}–${formatLevel(def, r.high)}`;
    case 'context':
      return 'not flagged';
  }
}

/** The flag level drawn as a tick on bar charts. */
export function thresholdValue(def: IndicatorDef, rate: number | null): number | null {
  const r = def.rule;
  switch (r.kind) {
    case 'above':
    case 'below':
      return r.concern;
    case 'outside':
      return rate !== null && rate < r.low ? r.low : r.high;
    case 'context':
      return null;
  }
}
