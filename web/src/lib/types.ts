// Shapes of the JSON the n8n workflow returns (n8n/maternal-health-atlas.workflow.json).
// Every number is a count computed in SQL from the census tables; rates are worked
// out in the browser so they stay correct when midwives are grouped into regions.

export const HEALTH_COUNT_KEYS = [
  'pregnancies',
  // patient_identification
  'age_recorded',
  'adolescent_pregnancies',
  'advanced_maternal_age_pregnancies',
  'intent_recorded',
  'unintended_pregnancies',
  'consanguinity_recorded',
  'consanguineous_marriages',
  // medical_family_history
  'family_hypertension_recorded',
  'family_hypertension',
  'family_diabetes_recorded',
  'family_diabetes',
  // obstetric_history
  'prior_cesarean_recorded',
  'prior_cesarean',
  'prior_iufd_recorded',
  'prior_iufd',
  // current_pregnancy
  'enrollment_ga_recorded',
  'enrolled_first_trimester',
  'enrolled_before_12_weeks',
  'bp_recorded',
  'hypertension',
  'severe_hypertension',
  'preeclampsia_signs',
  'hemoglobin_recorded',
  'severe_anemia',
  'moderate_or_severe_anemia',
  'gdm_recorded',
  'gestational_diabetes',
  'hiv_tested',
  'hiv_positive',
  'syphilis_tested',
  'syphilis_positive',
  'hepatitis_c_tested',
  'hepatitis_c_positive',
  // delivery
  'deliveries',
  'preterm_recorded',
  'preterm_births',
  'delivery_type_recorded',
  'cesareans',
  'deliveries_without_prior_cesarean',
  'primary_cesareans',
  'deliveries_after_prior_cesarean',
  'repeat_cesareans',
  'type_recorded_after_iufd',
  'cesareans_after_iufd',
  'preterm_recorded_after_iufd',
  'preterm_after_iufd',
  'type_recorded_no_iufd',
  'cesareans_no_iufd',
  'preterm_recorded_no_iufd',
  'preterm_no_iufd',
  'birth_weight_recorded',
  'birth_weight_sum_g',
  'low_birth_weight',
  'very_low_birth_weight',
  'head_circumference_recorded',
  'head_circumference_sum_cm',
  // postpartum_newborn
  'breastfeeding_recorded',
  'breastfeeding_initiated',
  'referral_recorded',
  'referred_to_higher_care',
] as const;

export type HealthCountKey = (typeof HEALTH_COUNT_KEYS)[number];
export type HealthCounts = Record<HealthCountKey, number>;

/**
 * Counts for the women one midwife (patient_identification.midwife_code) registered in
 * one area. area_id is null for women whose address is missing or could not be placed.
 */
export interface MidwifeHealthRow extends HealthCounts {
  area_id: number | null;
  midwife_code: string;
  median_enrollment_ga_weeks: number | null;
}

export type SocioeconomicAttribute = 'education_level' | 'profession' | 'husband_profession';

/** How many women in an area gave each answer (lower-cased, trimmed). */
export interface SocioeconomicRow {
  area_id: number | null;
  attribute: SocioeconomicAttribute;
  value: string;
  patients: number;
}

/** document_submissions per midwife_id, area of the woman they belong to, and month. */
export interface MidwifeMonthRow {
  midwife_id: string;
  area_id: number | null;
  month: string;
  documents_captured: number;
  documents_verified: number;
  documents_waiting: number;
  documents_sync_failed: number;
  documents_processing_failed: number;
  /** Women whose first form was captured this month. */
  patients_registered: number;
}

/** document_submissions and their OCR fields per capture day and form section. */
export interface DocumentDayRow {
  capture_date: string;
  document_section: string;
  documents: number;
  verified: number;
  status_counts: Record<string, number> | null;
  ai_confidence_sum: number;
  ai_confidence_n: number;
  fields: number;
  fields_known: number;
  fields_unknown: number;
  fields_not_provided: number;
  fields_illegible: number;
  fields_not_applicable: number;
  fields_needs_review: number;
  fields_ai: number;
  fields_confirmed: number;
  fields_manual: number;
  field_confidence_sum: number;
  field_confidence_n: number;
}

/** A place women live in, worked out from their addresses by the n8n workflow. */
export interface AreaRow {
  area_id: number;
  name: string;
  state: string;
  country: string;
  /** Average of the women's locations, rounded to about 10 km. */
  latitude: number;
  longitude: number;
}

/** How many addresses the workflow has placed on the map so far. */
export interface GeocodingStatus {
  with_address: number;
  placed: number;
  /** Not looked up yet; a few are looked up on each page load. */
  pending: number;
  not_found: number;
}

export interface RegionGeo {
  region: string;
  country_name: string;
  latitude: number;
  longitude: number;
}

export interface DashboardData {
  source: 'n8n' | 'demo';
  loadedAt: Date;
  areas: AreaRow[];
  geocoding: GeocodingStatus | null;
  midwifeHealth: MidwifeHealthRow[];
  socioeconomic: SocioeconomicRow[];
  midwifeMonths: MidwifeMonthRow[];
  documentDays: DocumentDayRow[];
}
