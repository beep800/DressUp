import type {
  DashboardData,
  EmoncLevel,
  FacilityDeliveryRow,
  FacilityHealthRow,
  MidwifeMonthRow,
  OcrDayRow,
  RegionGeo,
} from './types';

// Generated sample data so the dashboard can run without a database. Region names
// are placeholders and every number is synthetic; the UI labels this mode clearly.

type RateKey =
  | 'adolescent' | 'advanced' | 'unintended' | 'consanguinity' | 'vulnerable'
  | 'firstTri' | 'hypertension' | 'severeHtn' | 'preeclampsia' | 'anaemia' | 'severeAnaemia'
  | 'gdm' | 'hiv' | 'syphilis' | 'hepc' | 'preterm' | 'lbw' | 'vlbw' | 'sga' | 'stillbirth'
  | 'breastfeeding' | 'cesarean' | 'referral' | 'newbornReferral' | 'verified' | 'syncTrouble';

const BASE: Record<RateKey, number> = {
  adolescent: 0.11, advanced: 0.12, unintended: 0.28, consanguinity: 0.18, vulnerable: 0.3,
  firstTri: 0.6, hypertension: 0.065, severeHtn: 0.018, preeclampsia: 0.028, anaemia: 0.15,
  severeAnaemia: 0.02, gdm: 0.05, hiv: 0.005, syphilis: 0.005, hepc: 0.004, preterm: 0.08,
  lbw: 0.11, vlbw: 0.012, sga: 0.13, stillbirth: 0.009, breastfeeding: 0.64, cesarean: 0.08,
  referral: 0.09, newbornReferral: 0.05, verified: 0.86, syncTrouble: 1,
};

interface DemoRegion extends RegionGeo {
  risk: Partial<Record<RateKey, number>>;
}

const DEMO_REGIONS: DemoRegion[] = [
  { region: 'Region NGA-1', country_name: 'Nigeria', latitude: 11.8, longitude: 13.2,
    risk: { adolescent: 2.2, anaemia: 2.0, lbw: 1.5, firstTri: 0.6, cesarean: 0.35, referral: 1.9, syncTrouble: 2.4, verified: 0.8 } },
  { region: 'Region NGA-2', country_name: 'Nigeria', latitude: 7.6, longitude: 4.4, risk: { hypertension: 1.2 } },
  { region: 'Region NGA-3', country_name: 'Nigeria', latitude: 5.3, longitude: 6.9, risk: { hiv: 2.6, syphilis: 2.2 } },
  { region: 'Region ETH-1', country_name: 'Ethiopia', latitude: 13.4, longitude: 39.4,
    risk: { firstTri: 0.5, breastfeeding: 0.72, stillbirth: 1.7, syncTrouble: 1.8 } },
  { region: 'Region ETH-2', country_name: 'Ethiopia', latitude: 7.2, longitude: 38.2, risk: {} },
  { region: 'Region ETH-3', country_name: 'Ethiopia', latitude: 9.4, longitude: 41.9, risk: { anaemia: 1.5, adolescent: 1.45 } },
  { region: 'Region COD-1', country_name: 'DR Congo', latitude: -1.9, longitude: 29.1,
    risk: { referral: 2.5, stillbirth: 2.3, preterm: 1.5, cesarean: 0.4, syncTrouble: 2.8, verified: 0.75 } },
  { region: 'Region COD-2', country_name: 'DR Congo', latitude: -5.9, longitude: 23.4, risk: { anaemia: 1.4, lbw: 1.25 } },
  { region: 'Region AFG-1', country_name: 'Afghanistan', latitude: 31.6, longitude: 65.7,
    risk: { firstTri: 0.42, adolescent: 1.6, breastfeeding: 0.8, cesarean: 0.3, syncTrouble: 2.0 } },
  { region: 'Region AFG-2', country_name: 'Afghanistan', latitude: 34.6, longitude: 69.0, risk: { hypertension: 1.15 } },
  { region: 'Region BGD-1', country_name: 'Bangladesh', latitude: 24.6, longitude: 91.4,
    risk: { lbw: 1.9, preterm: 1.35, cesarean: 2.6 } },
  { region: 'Region BGD-2', country_name: 'Bangladesh', latitude: 23.6, longitude: 89.6, risk: {} },
  { region: 'Region HTI-1', country_name: 'Haiti', latitude: 18.9, longitude: -72.4,
    risk: { hypertension: 1.8, preeclampsia: 2.3, syphilis: 1.7 } },
];

const SECTIONS: { section: string; fieldsPerForm: number; legibility: number }[] = [
  { section: 'PATIENT_IDENTIFICATION', fieldsPerForm: 12, legibility: 1 },
  { section: 'CURRENT_PREGNANCY', fieldsPerForm: 22, legibility: 1.2 },
  { section: 'DELIVERY', fieldsPerForm: 16, legibility: 1.7 },
  { section: 'POSTPARTUM_NEWBORN', fieldsPerForm: 11, legibility: 1.3 },
];

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function generateDemoData(): DashboardData {
  const rnd = seededRandom(20261004);
  const between = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  const take = (n: number, rate: number) => Math.max(0, Math.min(n, Math.round(n * rate)));

  const facilityHealth: FacilityHealthRow[] = [];
  const facilityDeliveries: FacilityDeliveryRow[] = [];
  const midwifeMonths: MidwifeMonthRow[] = [];

  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) =>
    isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1))),
  );

  let facilityId = 1;
  let midwifeId = 1;

  for (const r of DEMO_REGIONS) {
    const rate = (key: RateKey) => Math.min(0.98, BASE[key] * (r.risk[key] ?? 1) * between(0.85, 1.15));
    const code = r.region.replace('Region ', '');
    const facilityCount = 3 + Math.floor(rnd() * 4);

    for (let f = 1; f <= facilityCount; f++) {
      const id = facilityId++;
      const facilityCode = `${code}-${String(f).padStart(2, '0')}`;
      const district = `District ${String.fromCharCode(64 + Math.ceil(f / 2))}`;
      const pregnancies = 70 + Math.floor(rnd() * 520);

      const ageRecorded = take(pregnancies, 0.96);
      const gaRecorded = take(pregnancies, 0.93);
      const firstTri = take(gaRecorded, rate('firstTri'));
      const bpRecorded = take(pregnancies, 0.9);
      const hypertension = take(bpRecorded, rate('hypertension'));
      const hbRecorded = take(pregnancies, 0.82);
      const modSevAnaemia = take(hbRecorded, rate('anaemia'));
      const deliveries = take(pregnancies, between(0.7, 0.85));
      const afterPriorCs = take(deliveries, 0.06);
      const cesareans = take(deliveries, rate('cesarean'));
      const repeatCs = Math.min(cesareans, take(afterPriorCs, 0.7));
      const afterPriorStillbirth = take(deliveries, 0.04);
      const newborns = deliveries + take(deliveries, 0.02);
      const stillbirths = take(newborns, rate('stillbirth'));
      const liveBirths = newborns - stillbirths;
      const weighed = take(liveBirths, 0.9);
      const lbw = take(weighed, rate('lbw'));
      const sgaAssessable = take(weighed, 0.8);
      const bfRecorded = take(liveBirths, 0.88);

      facilityHealth.push({
        facility_id: id,
        facility_code: facilityCode,
        region: r.region,
        district,
        median_enrollment_ga_weeks: Math.round((8 + (1 - rate('firstTri')) * 16 + between(0, 2)) * 10) / 10,
        pregnancies,
        age_recorded: ageRecorded,
        adolescent_pregnancies: take(ageRecorded, rate('adolescent')),
        advanced_maternal_age_pregnancies: take(ageRecorded, rate('advanced')),
        intent_recorded: take(pregnancies, 0.9),
        unintended_pregnancies: take(take(pregnancies, 0.9), rate('unintended')),
        consanguinity_recorded: take(pregnancies, 0.85),
        consanguineous_marriages: take(take(pregnancies, 0.85), rate('consanguinity')),
        socioeconomic_recorded: take(pregnancies, 0.92),
        socioeconomically_vulnerable: take(take(pregnancies, 0.92), rate('vulnerable')),
        enrollment_ga_recorded: gaRecorded,
        enrolled_first_trimester: firstTri,
        enrolled_before_12_weeks: take(firstTri, 0.74),
        bp_recorded: bpRecorded,
        hypertension,
        severe_hypertension: Math.min(hypertension, take(bpRecorded, rate('severeHtn'))),
        preeclampsia_signs: Math.min(hypertension, take(bpRecorded, rate('preeclampsia'))),
        hemoglobin_recorded: hbRecorded,
        severe_anemia: Math.min(modSevAnaemia, take(hbRecorded, rate('severeAnaemia'))),
        moderate_or_severe_anemia: modSevAnaemia,
        gdm_recorded: take(pregnancies, 0.6),
        gestational_diabetes: take(take(pregnancies, 0.6), rate('gdm')),
        hiv_tested: take(pregnancies, 0.86),
        hiv_positive: take(take(pregnancies, 0.86), rate('hiv')),
        syphilis_tested: take(pregnancies, 0.8),
        syphilis_positive: take(take(pregnancies, 0.8), rate('syphilis')),
        hepatitis_c_tested: take(pregnancies, 0.4),
        hepatitis_c_positive: take(take(pregnancies, 0.4), rate('hepc')),
        deliveries,
        preterm_deliveries: take(deliveries, rate('preterm')),
        cesarean_deliveries: cesareans,
        deliveries_without_prior_cesarean: deliveries - afterPriorCs,
        primary_cesareans: cesareans - repeatCs,
        deliveries_after_prior_cesarean: afterPriorCs,
        repeat_cesareans: repeatCs,
        deliveries_after_prior_stillbirth: afterPriorStillbirth,
        cesareans_after_prior_stillbirth: take(afterPriorStillbirth, 0.2),
        stillbirths_after_prior_stillbirth: take(afterPriorStillbirth, 0.03),
        newborns,
        live_births: liveBirths,
        stillbirths,
        live_births_weighed: weighed,
        low_birth_weight: lbw,
        very_low_birth_weight: Math.min(lbw, take(weighed, rate('vlbw'))),
        sga_assessable: sgaAssessable,
        small_for_gestational_age: take(sgaAssessable, rate('sga')),
        breastfeeding_recorded: bfRecorded,
        breastfed_within_1h: take(bfRecorded, rate('breastfeeding')),
        newborns_referred: take(liveBirths, rate('newbornReferral')),
      });

      // Deliveries split between the facility itself and home births in its catchment.
      const emonc: EmoncLevel = f === 1 ? 'COMPREHENSIVE' : f <= 3 ? 'BASIC' : 'NONE';
      const facilityName = f === 1 ? `${code} District Hospital` : `${code} Health Centre ${f - 1}`;
      const atFacility = take(deliveries, emonc === 'NONE' ? 0.45 : 0.75);
      const places: [FacilityDeliveryRow['place_of_delivery'], number][] = [
        ['FACILITY', atFacility],
        ['HOME', deliveries - atFacility],
      ];
      for (const [place, count] of places) {
        if (count === 0) continue;
        const referralRate = rate('referral') * (emonc === 'COMPREHENSIVE' ? 0.5 : emonc === 'NONE' ? 1.6 : 1);
        const anyReferral = take(count, referralRate);
        const births = count + take(count, 0.02);
        const placeStillbirths = take(births, rate('stillbirth'));
        const placeCesareans = place === 'FACILITY' && emonc === 'COMPREHENSIVE' ? take(count, rate('cesarean') * 2.2) : 0;
        facilityDeliveries.push({
          facility_id: id,
          facility_code: facilityCode,
          facility_name: facilityName,
          region: r.region,
          district,
          facility_level: f === 1 ? 'DISTRICT_HOSPITAL' : 'HEALTH_CENTER',
          emonc_level: emonc,
          travel_time_to_referral_min: f === 1 ? 0 : Math.round(between(25, 240) * (r.risk.referral ?? 1)),
          place_of_delivery: place,
          deliveries: count,
          cesareans: placeCesareans,
          emergency_cesareans: take(placeCesareans, 0.65),
          preterm_deliveries: take(count, rate('preterm')),
          maternal_referrals: take(anyReferral, 0.6),
          deliveries_with_any_referral: anyReferral,
          live_births: births - placeStillbirths,
          stillbirths: placeStillbirths,
        });
      }

      // Two midwives per facility, twelve months each.
      for (let m = 0; m < 2; m++) {
        const id2 = midwifeId++;
        const midwifeCode = `MW-${code}-${String(f).padStart(2, '0')}${m === 0 ? 'A' : 'B'}`;
        const trouble = r.risk.syncTrouble ?? 1;
        months.forEach((month, i) => {
          const ramp = 0.75 + (i / months.length) * 0.4;
          const enrolled = Math.round((pregnancies / 24) * ramp * between(0.7, 1.3));
          const delivered = Math.round((deliveries / 24) * ramp * between(0.7, 1.3));
          const documents = (enrolled + delivered) * 3 + Math.floor(rnd() * 4);
          const recentBacklog = i >= months.length - 2 ? 2.5 : 1;
          const syncFailed = take(documents, 0.015 * trouble * recentBacklog * between(0.5, 1.5));
          midwifeMonths.push({
            midwife_id: id2,
            midwife_code: midwifeCode,
            home_facility_code: facilityCode,
            region: r.region,
            district,
            report_month: month,
            pregnancies_enrolled: enrolled,
            deliveries_recorded: delivered,
            documents_captured: documents,
            documents_verified: take(documents, Math.min(1, rate('verified') / (i >= months.length - 1 ? 1.6 : 1))),
            documents_open: take(documents, 0.03 * recentBacklog * trouble),
            documents_sync_failed: syncFailed,
            sync_failures: syncFailed * 2 + Math.floor(rnd() * 3 * trouble),
            median_sync_delay_hours: Math.round(between(2, 18) * trouble * 10) / 10,
            median_ai_delay_hours: Math.round(between(0.2, 2.5) * 10) / 10,
          });
        });
      }
    }
  }

  // Ninety days of OCR results per form section; recent days still have work in the pipeline.
  const ocrDays: OcrDayRow[] = [];
  for (let d = 89; d >= 0; d--) {
    const date = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d)));
    for (const s of SECTIONS) {
      const submissions = 45 + Math.floor(rnd() * 80);
      const pending = d < 3 ? 0.35 - d * 0.1 : 0.01;
      const captured = take(submissions, pending * 0.4);
      const syncFailed = take(submissions, 0.02 + pending * 0.2);
      const pendingAi = take(submissions, pending * 0.3);
      const needsReview = take(submissions, 0.04 + pending * 0.6);
      const rejected = take(submissions, 0.01);
      const registered = Math.max(0, submissions - captured - syncFailed - pendingAi - needsReview - rejected);
      const processed = submissions - captured - syncFailed;
      const fields = processed * s.fieldsPerForm;
      const illegible = take(fields, 0.022 * s.legibility * between(0.7, 1.3));
      const needsReviewFields = take(fields, 0.06 * s.legibility * between(0.7, 1.3));
      const autoAccepted = fields - illegible - needsReviewFields;
      const reviewed = take(autoAccepted, 0.22);
      ocrDays.push({
        capture_date: date,
        document_section: s.section,
        submissions,
        status_captured: captured,
        status_sync_failed: syncFailed,
        status_pending_ai: pendingAi,
        status_needs_review: needsReview,
        status_registered: registered,
        status_rejected: rejected,
        sync_failures: syncFailed * 2 + Math.floor(rnd() * 4),
        median_sync_delay_hours: Math.round(between(3, 20) * 10) / 10,
        avg_document_confidence: Math.round(between(0.8, 0.93) / s.legibility ** 0.1 * 1000) / 1000,
        document_confidence_n: processed,
        fields,
        illegible_fields: illegible,
        needs_review_fields: needsReviewFields,
        auto_accepted_fields: autoAccepted,
        auto_accepted_reviewed: reviewed,
        auto_accepted_corrected: take(reviewed, 0.025 * s.legibility),
        avg_field_confidence: Math.round(between(0.84, 0.94) / s.legibility ** 0.08 * 1000) / 1000,
        field_confidence_n: fields,
      });
    }
  }

  return {
    source: 'demo',
    loadedAt: new Date(),
    regions: DEMO_REGIONS.map(({ risk: _risk, ...geo }) => geo),
    facilityHealth,
    facilityDeliveries,
    midwifeMonths,
    ocrDays,
  };
}
