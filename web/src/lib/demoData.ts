import type {
  DashboardData,
  DocumentDayRow,
  LocationEntry,
  MidwifeHealthRow,
  MidwifeMonthRow,
  SocioeconomicRow,
} from './types';

// Generated sample data so the dashboard can run without n8n. Region names and
// midwife codes are placeholders and every number is synthetic; the UI labels this
// mode clearly.

type RateKey =
  | 'adolescent' | 'advanced' | 'unintended' | 'consanguinity' | 'familyHtn' | 'familyDiabetes'
  | 'priorCs' | 'priorIufd' | 'firstTri' | 'hypertension' | 'severeHtn' | 'preeclampsia'
  | 'anaemia' | 'severeAnaemia' | 'gdm' | 'hiv' | 'syphilis' | 'hepc' | 'preterm' | 'lbw'
  | 'vlbw' | 'breastfeeding' | 'cesarean' | 'referral' | 'verified' | 'syncTrouble';

const BASE: Record<RateKey, number> = {
  adolescent: 0.11, advanced: 0.12, unintended: 0.28, consanguinity: 0.18, familyHtn: 0.22,
  familyDiabetes: 0.14, priorCs: 0.07, priorIufd: 0.04, firstTri: 0.6, hypertension: 0.065,
  severeHtn: 0.018, preeclampsia: 0.028, anaemia: 0.15, severeAnaemia: 0.02, gdm: 0.05,
  hiv: 0.005, syphilis: 0.005, hepc: 0.004, preterm: 0.08, lbw: 0.11, vlbw: 0.012,
  breastfeeding: 0.82, cesarean: 0.08, referral: 0.09, verified: 0.86, syncTrouble: 1,
};

interface DemoRegion {
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  risk: Partial<Record<RateKey, number>>;
}

const DEMO_REGIONS: DemoRegion[] = [
  { region: 'Region NGA-1', country: 'Nigeria', latitude: 11.8, longitude: 13.2,
    risk: { adolescent: 2.2, anaemia: 2.0, lbw: 1.5, firstTri: 0.6, cesarean: 0.35, referral: 1.9, syncTrouble: 2.4, verified: 0.8 } },
  { region: 'Region NGA-2', country: 'Nigeria', latitude: 7.6, longitude: 4.4, risk: { hypertension: 1.2 } },
  { region: 'Region NGA-3', country: 'Nigeria', latitude: 5.3, longitude: 6.9, risk: { hiv: 2.6, syphilis: 2.2 } },
  { region: 'Region ETH-1', country: 'Ethiopia', latitude: 13.4, longitude: 39.4,
    risk: { firstTri: 0.5, breastfeeding: 0.55, preterm: 1.3, syncTrouble: 1.8 } },
  { region: 'Region ETH-2', country: 'Ethiopia', latitude: 7.2, longitude: 38.2, risk: {} },
  { region: 'Region ETH-3', country: 'Ethiopia', latitude: 9.4, longitude: 41.9, risk: { anaemia: 1.5, adolescent: 1.45 } },
  { region: 'Region COD-1', country: 'DR Congo', latitude: -1.9, longitude: 29.1,
    risk: { referral: 2.5, preterm: 1.5, cesarean: 0.4, priorIufd: 2, syncTrouble: 2.8, verified: 0.75 } },
  { region: 'Region COD-2', country: 'DR Congo', latitude: -5.9, longitude: 23.4, risk: { anaemia: 1.4, lbw: 1.25 } },
  { region: 'Region AFG-1', country: 'Afghanistan', latitude: 31.6, longitude: 65.7,
    risk: { firstTri: 0.42, adolescent: 1.6, breastfeeding: 0.7, cesarean: 0.3, syncTrouble: 2.0 } },
  { region: 'Region AFG-2', country: 'Afghanistan', latitude: 34.6, longitude: 69.0, risk: { hypertension: 1.15 } },
  { region: 'Region BGD-1', country: 'Bangladesh', latitude: 24.6, longitude: 91.4,
    risk: { lbw: 1.9, preterm: 1.35, cesarean: 2.6 } },
  { region: 'Region BGD-2', country: 'Bangladesh', latitude: 23.6, longitude: 89.6, risk: {} },
  { region: 'Region HTI-1', country: 'Haiti', latitude: 18.9, longitude: -72.4,
    risk: { hypertension: 1.8, preeclampsia: 2.3, syphilis: 1.7 } },
];

const EDUCATION = ['none', 'primary', 'secondary', 'university'];
const PROFESSIONS = ['housewife', 'farmer', 'trader', 'seamstress', 'teacher', 'nurse'];
const HUSBAND_PROFESSIONS = ['farmer', 'day labourer', 'driver', 'trader', 'unemployed', 'civil servant'];

const SECTIONS: { section: string; fieldsPerForm: number; legibility: number }[] = [
  { section: 'PATIENT_IDENTIFICATION', fieldsPerForm: 12, legibility: 1 },
  { section: 'CURRENT_PREGNANCY', fieldsPerForm: 13, legibility: 1.2 },
  { section: 'DELIVERY', fieldsPerForm: 6, legibility: 1.7 },
  { section: 'POSTPARTUM_NEWBORN', fieldsPerForm: 2, legibility: 1.3 },
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

  const locations: LocationEntry[] = [];
  const midwifeHealth: MidwifeHealthRow[] = [];
  const socioeconomic: SocioeconomicRow[] = [];
  const midwifeMonths: MidwifeMonthRow[] = [];

  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) =>
    isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + i, 1))),
  );

  for (const r of DEMO_REGIONS) {
    const rate = (key: RateKey) => Math.min(0.98, BASE[key] * (r.risk[key] ?? 1) * between(0.85, 1.15));
    const code = r.region.replace('Region ', '');
    const midwifeCodes = Array.from({ length: 3 + Math.floor(rnd() * 4) }, (_, i) => `MW-${code}-${i + 1}`);
    locations.push({ region: r.region, country: r.country, latitude: r.latitude, longitude: r.longitude, midwives: midwifeCodes });

    for (const midwife of midwifeCodes) {
      const pregnancies = 60 + Math.floor(rnd() * 360);
      const ageRecorded = take(pregnancies, 0.96);
      const familyRecorded = take(pregnancies, 0.8);
      const historyRecorded = take(pregnancies, 0.85);
      const priorCsRecorded = historyRecorded;
      const priorIufd = take(historyRecorded, rate('priorIufd'));
      const gaRecorded = take(pregnancies, 0.93);
      const firstTri = take(gaRecorded, rate('firstTri'));
      const bpRecorded = take(pregnancies, 0.9);
      const hypertension = take(bpRecorded, rate('hypertension'));
      const hbRecorded = take(pregnancies, 0.82);
      const modSevAnaemia = take(hbRecorded, rate('anaemia'));
      const deliveries = take(pregnancies, between(0.6, 0.8));
      const pretermRecorded = take(deliveries, 0.9);
      const preterm = take(pretermRecorded, rate('preterm'));
      const typeRecorded = take(deliveries, 0.92);
      const cesareans = take(typeRecorded, rate('cesarean'));
      const afterPriorCs = take(typeRecorded, rate('priorCs'));
      const repeatCs = Math.min(cesareans, take(afterPriorCs, 0.7));
      const typeAfterIufd = take(typeRecorded, rate('priorIufd'));
      const pretermAfterIufdRecorded = take(pretermRecorded, rate('priorIufd'));
      const weighed = take(deliveries, 0.9);
      const lbw = take(weighed, rate('lbw'));
      const headRecorded = take(deliveries, 0.75);
      const postpartumRecorded = take(deliveries, 0.85);

      midwifeHealth.push({
        midwife_code: midwife,
        median_enrollment_ga_weeks: Math.round((8 + (1 - rate('firstTri')) * 16 + between(0, 2)) * 10) / 10,
        pregnancies,
        age_recorded: ageRecorded,
        adolescent_pregnancies: take(ageRecorded, rate('adolescent')),
        advanced_maternal_age_pregnancies: take(ageRecorded, rate('advanced')),
        intent_recorded: take(pregnancies, 0.9),
        unintended_pregnancies: take(take(pregnancies, 0.9), rate('unintended')),
        consanguinity_recorded: take(pregnancies, 0.85),
        consanguineous_marriages: take(take(pregnancies, 0.85), rate('consanguinity')),
        family_hypertension_recorded: familyRecorded,
        family_hypertension: take(familyRecorded, rate('familyHtn')),
        family_diabetes_recorded: familyRecorded,
        family_diabetes: take(familyRecorded, rate('familyDiabetes')),
        prior_cesarean_recorded: priorCsRecorded,
        prior_cesarean: take(priorCsRecorded, rate('priorCs')),
        prior_iufd_recorded: historyRecorded,
        prior_iufd: priorIufd,
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
        preterm_recorded: pretermRecorded,
        preterm_births: preterm,
        delivery_type_recorded: typeRecorded,
        cesareans,
        deliveries_without_prior_cesarean: typeRecorded - afterPriorCs,
        primary_cesareans: cesareans - repeatCs,
        deliveries_after_prior_cesarean: afterPriorCs,
        repeat_cesareans: repeatCs,
        type_recorded_after_iufd: typeAfterIufd,
        cesareans_after_iufd: take(typeAfterIufd, rate('cesarean') * 1.8),
        preterm_recorded_after_iufd: pretermAfterIufdRecorded,
        preterm_after_iufd: take(pretermAfterIufdRecorded, rate('preterm') * 1.9),
        type_recorded_no_iufd: typeRecorded - typeAfterIufd,
        cesareans_no_iufd: take(typeRecorded - typeAfterIufd, rate('cesarean')),
        preterm_recorded_no_iufd: pretermRecorded - pretermAfterIufdRecorded,
        preterm_no_iufd: take(pretermRecorded - pretermAfterIufdRecorded, rate('preterm')),
        birth_weight_recorded: weighed,
        birth_weight_sum_g: Math.round(weighed * between(2950, 3250)),
        low_birth_weight: lbw,
        very_low_birth_weight: Math.min(lbw, take(weighed, rate('vlbw'))),
        head_circumference_recorded: headRecorded,
        head_circumference_sum_cm: Math.round(headRecorded * between(33.4, 34.6) * 10) / 10,
        breastfeeding_recorded: postpartumRecorded,
        breastfeeding_initiated: take(postpartumRecorded, rate('breastfeeding')),
        referral_recorded: postpartumRecorded,
        referred_to_higher_care: take(postpartumRecorded, rate('referral')),
      });

      const lowLiteracy = (r.risk.adolescent ?? 1) > 1.3 ? 1.8 : 1;
      const answers: [SocioeconomicRow['attribute'], string[], number[]][] = [
        ['education_level', EDUCATION, [0.25 * lowLiteracy, 0.4, 0.25, 0.1]],
        ['profession', PROFESSIONS, [0.55, 0.15, 0.1, 0.1, 0.05, 0.05]],
        ['husband_profession', HUSBAND_PROFESSIONS, [0.3, 0.25, 0.15, 0.15, 0.08, 0.07]],
      ];
      for (const [attribute, values, weights] of answers) {
        const total = weights.reduce((a, b) => a + b, 0);
        values.forEach((value, i) => {
          const patients = take(take(pregnancies, 0.9), (weights[i] / total) * between(0.8, 1.2));
          if (patients > 0) socioeconomic.push({ midwife_code: midwife, attribute, value, patients });
        });
      }

      const trouble = r.risk.syncTrouble ?? 1;
      months.forEach((month, i) => {
        const ramp = 0.75 + (i / months.length) * 0.4;
        const registered = Math.round((pregnancies / 14) * ramp * between(0.7, 1.3));
        const documents = registered * 4 + Math.floor(rnd() * 6);
        const recent = i >= months.length - 2 ? 2.5 : 1;
        midwifeMonths.push({
          midwife_id: midwife,
          month,
          documents_captured: documents,
          documents_verified: take(documents, Math.min(1, rate('verified') / (i === months.length - 1 ? 1.6 : 1))),
          documents_waiting: take(documents, 0.03 * recent * trouble),
          documents_sync_failed: take(documents, 0.012 * recent * trouble),
          documents_processing_failed: take(documents, 0.006 * between(0.5, 1.5)),
          patients_registered: registered,
        });
      });
    }
  }

  // Ninety days of submissions per form section; recent days still have work in the pipeline.
  const documentDays: DocumentDayRow[] = [];
  for (let d = 89; d >= 0; d--) {
    const date = isoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - d)));
    for (const s of SECTIONS) {
      const documents = 45 + Math.floor(rnd() * 80);
      const pending = d < 3 ? 0.35 - d * 0.1 : 0.01;
      const counts: Record<string, number> = {
        CAPTURED: take(documents, pending * 0.3),
        SYNC_FAILED: take(documents, 0.015 + pending * 0.15),
        PENDING_AI: take(documents, pending * 0.25),
        PROCESSING_FAILED: take(documents, 0.006),
        NEEDS_REVIEW: take(documents, 0.03 + pending * 0.4),
        MANUAL_REVIEW_REQUIRED: take(documents, 0.01),
        DUPLICATE_SUSPECTED: take(documents, 0.008),
        AI_PROCESSED: take(documents, pending * 0.2),
        PATIENT_MATCHED: take(documents, 0.01),
        SUPERSEDED: take(documents, 0.012),
      };
      counts.REGISTERED = Math.max(0, documents - Object.values(counts).reduce((a, b) => a + b, 0));
      const read = documents - counts.CAPTURED - counts.SYNC_FAILED - counts.PENDING_AI;
      const fields = read * s.fieldsPerForm;
      const illegible = take(fields, 0.022 * s.legibility * between(0.7, 1.3));
      const needsReview = take(fields, 0.06 * s.legibility * between(0.7, 1.3));
      const notProvided = take(fields, 0.05);
      const unknown = take(fields, 0.02);
      const reviewed = take(fields, 0.3);
      documentDays.push({
        capture_date: date,
        document_section: s.section,
        documents,
        verified: take(documents, 0.8),
        status_counts: counts,
        ai_confidence_sum: Math.round(read * between(0.8, 0.93) * 1000) / 1000,
        ai_confidence_n: read,
        fields,
        fields_known: fields - illegible - needsReview - notProvided - unknown,
        fields_unknown: unknown,
        fields_not_provided: notProvided,
        fields_illegible: illegible,
        fields_not_applicable: 0,
        fields_needs_review: needsReview,
        fields_ai: fields - reviewed,
        fields_confirmed: take(reviewed, 1 - 0.07 * s.legibility),
        fields_manual: reviewed - take(reviewed, 1 - 0.07 * s.legibility),
        field_confidence_sum: Math.round(fields * between(0.84, 0.94) * 1000) / 1000,
        field_confidence_n: fields,
      });
    }
  }

  return {
    source: 'demo',
    loadedAt: new Date(),
    locations,
    midwifeHealth,
    socioeconomic,
    midwifeMonths,
    documentDays,
  };
}
