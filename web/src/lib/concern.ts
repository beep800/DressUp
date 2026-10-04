import type { HealthCounts } from './types';

// Rules that decide when a region is an area of concern. Each indicator is a rate
// with an explicit numerator and denominator counted from the census tables. Flag levels
// cite their source in `basis`; "programme default" levels are starting points for
// the ministry to tune here.

export type Domain = 'Demographics & history' | 'Maternal health' | 'Newborn outcomes' | 'Care & referral';
export const DOMAINS: Domain[] = ['Demographics & history', 'Maternal health', 'Newborn outcomes', 'Care & referral'];

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
  /** What the denominator counts, e.g. "births weighed". */
  of: string;
  rule: Rule;
  ratio: (h: HealthCounts) => [numerator: number, denominator: number];
  why: string;
  basis: string;
}

/** Rates on fewer records than this are shown but never flagged. */
export const MIN_DENOMINATOR = 30;

export const INDICATORS: IndicatorDef[] = [
  // Demographics & history
  {
    id: 'adolescent',
    label: 'Adolescent pregnancies',
    domain: 'Demographics & history',
    unit: 'percent',
    of: 'women with age recorded',
    rule: { kind: 'above', concern: 0.15, severe: 0.25 },
    ratio: (h) => [h.adolescent_pregnancies, h.age_recorded],
    why: 'Mothers under 18 face higher risks of eclampsia, obstructed labour and low birth weight babies.',
    basis: 'Programme default.',
  },
  {
    id: 'advanced_age',
    label: 'Mothers aged 35 or over',
    domain: 'Demographics & history',
    unit: 'percent',
    of: 'women with age recorded',
    rule: { kind: 'context' },
    ratio: (h) => [h.advanced_maternal_age_pregnancies, h.age_recorded],
    why: 'Advanced maternal age raises the risk of hypertension, gestational diabetes and stillbirth.',
    basis: 'Shown for context.',
  },
  {
    id: 'unintended',
    label: 'Unintended pregnancies',
    domain: 'Demographics & history',
    unit: 'percent',
    of: 'women asked whether the pregnancy was wanted',
    rule: { kind: 'context' },
    ratio: (h) => [h.unintended_pregnancies, h.intent_recorded],
    why: 'Guides where family planning services are most needed.',
    basis: 'Shown for context.',
  },
  {
    id: 'consanguinity',
    label: 'Consanguineous marriages',
    domain: 'Demographics & history',
    unit: 'percent',
    of: 'women with consanguinity recorded',
    rule: { kind: 'context' },
    ratio: (h) => [h.consanguineous_marriages, h.consanguinity_recorded],
    why: 'Raises the risk of recessive genetic conditions; guides genetic counselling.',
    basis: 'Shown for context.',
  },
  {
    id: 'family_hypertension',
    label: 'Family history of hypertension',
    domain: 'Demographics & history',
    unit: 'percent',
    of: 'women with family history recorded',
    rule: { kind: 'context' },
    ratio: (h) => [h.family_hypertension, h.family_hypertension_recorded],
    why: 'A family history raises the risk of hypertension and pre-eclampsia in pregnancy.',
    basis: 'Shown for context.',
  },
  {
    id: 'family_diabetes',
    label: 'Family history of diabetes',
    domain: 'Demographics & history',
    unit: 'percent',
    of: 'women with family history recorded',
    rule: { kind: 'context' },
    ratio: (h) => [h.family_diabetes, h.family_diabetes_recorded],
    why: 'A family history raises the risk of gestational diabetes.',
    basis: 'Shown for context.',
  },
  {
    id: 'prior_cesarean',
    label: 'Previous caesarean',
    domain: 'Demographics & history',
    unit: 'percent',
    of: 'women with obstetric history recorded',
    rule: { kind: 'context' },
    ratio: (h) => [h.prior_cesarean, h.prior_cesarean_recorded],
    why: 'A scarred uterus needs a facility that can perform a repeat caesarean.',
    basis: 'Shown for context.',
  },
  {
    id: 'prior_iufd',
    label: 'Previous stillbirth',
    domain: 'Demographics & history',
    unit: 'percent',
    of: 'women with obstetric history recorded',
    rule: { kind: 'context' },
    ratio: (h) => [h.prior_iufd, h.prior_iufd_recorded],
    why: 'A previous intrauterine fetal death raises the risk of losing this pregnancy too.',
    basis: 'Shown for context.',
  },

  // Maternal health
  {
    id: 'hypertension',
    label: 'Hypertension',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women with blood pressure recorded',
    rule: { kind: 'above', concern: 0.1, severe: 0.15 },
    ratio: (h) => [h.hypertension, h.bp_recorded],
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
    ratio: (h) => [h.preeclampsia_signs, h.bp_recorded],
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
    ratio: (h) => [h.moderate_or_severe_anemia, h.hemoglobin_recorded],
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
    ratio: (h) => [h.severe_anemia, h.hemoglobin_recorded],
    why: 'Severe anaemia usually needs transfusion capacity close to where the woman gives birth.',
    basis: 'Shown for context.',
  },
  {
    id: 'gdm',
    label: 'Gestational diabetes',
    domain: 'Maternal health',
    unit: 'percent',
    of: 'women with a result recorded',
    rule: { kind: 'context' },
    ratio: (h) => [h.gestational_diabetes, h.gdm_recorded],
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
    ratio: (h) => [h.hiv_positive, h.hiv_tested],
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
    ratio: (h) => [h.syphilis_positive, h.syphilis_tested],
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
    ratio: (h) => [h.hepatitis_c_positive, h.hepatitis_c_tested],
    why: 'Guides follow-up testing of exposed infants.',
    basis: 'Shown for context.',
  },

  // Newborn outcomes
  {
    id: 'preterm',
    label: 'Preterm births',
    domain: 'Newborn outcomes',
    unit: 'percent',
    of: 'deliveries with gestational age or term recorded',
    rule: { kind: 'above', concern: 0.1, severe: 0.15 },
    ratio: (h) => [h.preterm_births, h.preterm_recorded],
    why: 'Prematurity is the leading cause of newborn death; preterm babies need warmth, feeding support and often referral.',
    basis: 'About 1 in 10 babies worldwide is born before 37 weeks.',
  },
  {
    id: 'lbw',
    label: 'Low birth weight',
    domain: 'Newborn outcomes',
    unit: 'percent',
    of: 'babies weighed',
    rule: { kind: 'above', concern: 0.15, severe: 0.2 },
    ratio: (h) => [h.low_birth_weight, h.birth_weight_recorded],
    why: 'Babies under 2,500 g reflect maternal undernutrition, infection and growth restriction, and die more often.',
    basis: 'Global prevalence is about 15%.',
  },
  {
    id: 'vlbw',
    label: 'Very low birth weight',
    domain: 'Newborn outcomes',
    unit: 'percent',
    of: 'babies weighed',
    rule: { kind: 'context' },
    ratio: (h) => [h.very_low_birth_weight, h.birth_weight_recorded],
    why: 'Babies under 1,500 g almost always need care beyond a health post.',
    basis: 'Shown for context.',
  },
  {
    id: 'breastfeeding',
    label: 'Breastfeeding started',
    domain: 'Newborn outcomes',
    unit: 'percent',
    of: 'births with feeding recorded',
    rule: { kind: 'below', concern: 0.5, severe: 0.3 },
    ratio: (h) => [h.breastfeeding_initiated, h.breastfeeding_recorded],
    why: 'Early breastfeeding cuts newborn infection and death; low rates suggest gaps in care right after birth.',
    basis: 'Programme default. WHO targets 70% starting within the first hour by 2030.',
  },

  // Care & referral
  {
    id: 'first_trimester',
    label: 'Enrolled in first trimester',
    domain: 'Care & referral',
    unit: 'percent',
    of: 'women with gestational age at enrolment',
    rule: { kind: 'below', concern: 0.5, severe: 0.3 },
    ratio: (h) => [h.enrolled_first_trimester, h.enrollment_ga_recorded],
    why: 'A late first visit leaves less time to screen and treat anaemia, hypertension and infections.',
    basis: 'WHO recommends the first antenatal contact before 12 weeks; flag levels are programme defaults.',
  },
  {
    id: 'cesarean',
    label: 'Caesarean births',
    domain: 'Care & referral',
    unit: 'percent',
    of: 'deliveries with the type recorded',
    rule: { kind: 'outside', low: 0.05, high: 0.15, severeLow: 0.02, severeHigh: 0.25 },
    ratio: (h) => [h.cesareans, h.delivery_type_recorded],
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
    ratio: (h) => [h.primary_cesareans, h.deliveries_without_prior_cesarean],
    why: 'First caesareans drive future repeat caesareans; track against the overall rate.',
    basis: 'Shown for context.',
  },
  {
    id: 'referral',
    label: 'Referred to higher care',
    domain: 'Care & referral',
    unit: 'percent',
    of: 'births with postpartum care recorded',
    rule: { kind: 'above', concern: 0.15, severe: 0.25 },
    ratio: (h) => [h.referred_to_higher_care, h.referral_recorded],
    why: 'Frequent referral after birth points to clinics without the equipment or skills for emergency obstetric care.',
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

export function evaluateIndicator(def: IndicatorDef, counts: HealthCounts): IndicatorResult {
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

export function assess(counts: HealthCounts): Assessment {
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
