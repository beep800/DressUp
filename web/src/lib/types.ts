// Row shapes of the analytics objects the dashboard reads (see sql/analytics_schema.sql
// and sql/002_dashboard_access.sql). Column names match the database exactly.

export interface RegionGeo {
  region: string;
  country_name: string;
  latitude: number;
  longitude: number;
}

export const HEALTH_COUNT_KEYS = [
  'pregnancies',
  'age_recorded',
  'adolescent_pregnancies',
  'advanced_maternal_age_pregnancies',
  'intent_recorded',
  'unintended_pregnancies',
  'consanguinity_recorded',
  'consanguineous_marriages',
  'socioeconomic_recorded',
  'socioeconomically_vulnerable',
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
  'deliveries',
  'preterm_deliveries',
  'cesarean_deliveries',
  'deliveries_without_prior_cesarean',
  'primary_cesareans',
  'deliveries_after_prior_cesarean',
  'repeat_cesareans',
  'deliveries_after_prior_stillbirth',
  'cesareans_after_prior_stillbirth',
  'stillbirths_after_prior_stillbirth',
  'newborns',
  'live_births',
  'stillbirths',
  'live_births_weighed',
  'low_birth_weight',
  'very_low_birth_weight',
  'sga_assessable',
  'small_for_gestational_age',
  'breastfeeding_recorded',
  'breastfed_within_1h',
  'newborns_referred',
] as const;

export type HealthCountKey = (typeof HEALTH_COUNT_KEYS)[number];
export type HealthCounts = Record<HealthCountKey, number>;

/** analytics.mv_regional_health_indicators: one row per enrolment facility. */
export interface FacilityHealthRow extends HealthCounts {
  facility_id: number;
  facility_code: string;
  region: string;
  district: string;
  median_enrollment_ga_weeks: number | null;
}

export const DELIVERY_COUNT_KEYS = [
  'deliveries',
  'cesareans',
  'emergency_cesareans',
  'preterm_deliveries',
  'maternal_referrals',
  'deliveries_with_any_referral',
  'live_births',
  'stillbirths',
] as const;

export type DeliveryCountKey = (typeof DELIVERY_COUNT_KEYS)[number];
export type DeliveryCounts = Record<DeliveryCountKey, number>;

export type EmoncLevel = 'NONE' | 'BASIC' | 'COMPREHENSIVE';
export type PlaceOfDelivery = 'FACILITY' | 'HOME' | 'IN_TRANSIT' | 'OTHER';

/** analytics.mv_facility_delivery_outcomes: one row per facility and place of delivery. */
export interface FacilityDeliveryRow extends DeliveryCounts {
  facility_id: number;
  facility_code: string;
  facility_name: string;
  region: string;
  district: string;
  facility_level: string;
  emonc_level: EmoncLevel;
  travel_time_to_referral_min: number | null;
  place_of_delivery: PlaceOfDelivery;
}

/** analytics.mv_midwife_monthly_performance: one row per midwife and month. */
export interface MidwifeMonthRow {
  midwife_id: number;
  midwife_code: string;
  home_facility_code: string | null;
  region: string | null;
  district: string | null;
  report_month: string;
  pregnancies_enrolled: number;
  deliveries_recorded: number;
  documents_captured: number;
  documents_verified: number;
  documents_open: number;
  documents_sync_failed: number;
  sync_failures: number;
  median_sync_delay_hours: number | null;
  median_ai_delay_hours: number | null;
}

/** analytics.mv_ocr_extraction_quality: one row per capture day and form section. */
export interface OcrDayRow {
  capture_date: string;
  document_section: string;
  submissions: number;
  status_captured: number;
  status_sync_failed: number;
  status_pending_ai: number;
  status_needs_review: number;
  status_registered: number;
  status_rejected: number;
  sync_failures: number;
  median_sync_delay_hours: number | null;
  avg_document_confidence: number | null;
  document_confidence_n: number;
  fields: number;
  illegible_fields: number;
  needs_review_fields: number;
  auto_accepted_fields: number;
  auto_accepted_reviewed: number;
  auto_accepted_corrected: number;
  avg_field_confidence: number | null;
  field_confidence_n: number;
}

export interface DashboardData {
  source: 'supabase' | 'endpoint' | 'demo';
  loadedAt: Date;
  regions: RegionGeo[];
  facilityHealth: FacilityHealthRow[];
  facilityDeliveries: FacilityDeliveryRow[];
  midwifeMonths: MidwifeMonthRow[];
  ocrDays: OcrDayRow[];
}
