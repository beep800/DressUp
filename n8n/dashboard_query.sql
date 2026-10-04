-- Maternal Health Atlas: dashboard data computed live from the census tables.
-- Read-only. Returns one row with one JSON column, `payload`.
-- This is the query inside the "Read census tables" node of the n8n workflow.
WITH settings AS (
  -- How the forms code their answers. Change these if yours differ.
  SELECT
    2 AS cesarean_code,       -- delivery.type_of_delivery value that means caesarean
    1 AS test_positive_code,  -- *_test_result value that means positive
    0 AS test_negative_code   -- *_test_result value that means negative; anything else counts as not tested
),

-- One row per woman. OCR readings outside a plausible range are treated as missing.
patients AS (
  SELECT
    coalesce(nullif(trim(p.midwife_code), ''), 'Unassigned') AS midwife_code,
    CASE WHEN p.age_years BETWEEN 10 AND 60 THEN p.age_years END AS age,
    p.desired_pregnancy,
    p.consanguinity,
    mh.hypertension_history,
    mh.diabetes_mellitus,
    oh.previous_cesarean,
    oh.intrauterine_fetal_deaths,
    CASE WHEN cp.gestational_age_at_enrollment BETWEEN 0 AND 45 THEN cp.gestational_age_at_enrollment END AS ga_enrol,
    CASE WHEN cp.mean_systolic_bp BETWEEN 50 AND 260 THEN cp.mean_systolic_bp END AS sbp,
    CASE WHEN cp.mean_diastolic_bp BETWEEN 30 AND 160 THEN cp.mean_diastolic_bp END AS dbp,
    cp.proteinuria,
    -- Haemoglobin in g/dL; readings that look like g/L are converted.
    CASE WHEN cp.hemoglobin BETWEEN 2 AND 20 THEN cp.hemoglobin
         WHEN cp.hemoglobin > 20 AND cp.hemoglobin <= 200 THEN cp.hemoglobin / 10 END AS hb,
    cp.gestational_dm,
    cp.hiv_test_result AS hiv,
    cp.syphilis_test_result AS syphilis,
    cp.hepatitis_c_test_result AS hep_c,
    d.id IS NOT NULL AS delivered,
    CASE WHEN d.gestational_age_at_birth BETWEEN 20 AND 45 THEN d.gestational_age_at_birth END AS ga_birth,
    d.preterm_birth,
    d.type_of_delivery,
    CASE WHEN d.child_birth_weight BETWEEN 300 AND 6500 THEN d.child_birth_weight END AS weight_g,
    CASE WHEN d.head_circumference BETWEEN 18 AND 45 THEN d.head_circumference END AS head_cm,
    pn.breastfeeding_initiated,
    pn.referral_to_higher_care
  FROM public.patient_identification p
  LEFT JOIN public.current_pregnancy      cp ON cp.original_id = p.original_id
  LEFT JOIN public.obstetric_history      oh ON oh.original_id = p.original_id
  LEFT JOIN public.medical_family_history mh ON mh.original_id = p.original_id
  LEFT JOIN public.delivery               d  ON d.original_id  = p.original_id
  LEFT JOIN public.postpartum_newborn     pn ON pn.original_id = p.original_id
),

flags AS (
  SELECT
    pt.*,
    (pt.sbp >= 140 OR pt.dbp >= 90) AS htn,
    -- Gestational age at birth decides when recorded; otherwise the form's preterm box.
    CASE WHEN pt.ga_birth IS NOT NULL THEN pt.ga_birth < 37
         WHEN pt.preterm_birth IS NOT NULL THEN pt.preterm_birth = 1 END AS preterm,
    pt.type_of_delivery = s.cesarean_code AS cesarean,
    s.test_positive_code AS pos,
    s.test_negative_code AS neg
  FROM patients pt
  CROSS JOIN settings s
),

health AS (
  SELECT
    midwife_code,
    count(*) AS pregnancies,

    count(age) AS age_recorded,
    count(*) FILTER (WHERE age < 18) AS adolescent_pregnancies,
    count(*) FILTER (WHERE age >= 35) AS advanced_maternal_age_pregnancies,
    count(desired_pregnancy) AS intent_recorded,
    count(*) FILTER (WHERE desired_pregnancy = 0) AS unintended_pregnancies,
    count(consanguinity) AS consanguinity_recorded,
    count(*) FILTER (WHERE consanguinity > 0) AS consanguineous_marriages,

    count(hypertension_history) AS family_hypertension_recorded,
    count(*) FILTER (WHERE hypertension_history > 0) AS family_hypertension,
    count(diabetes_mellitus) AS family_diabetes_recorded,
    count(*) FILTER (WHERE diabetes_mellitus > 0) AS family_diabetes,
    count(previous_cesarean) AS prior_cesarean_recorded,
    count(*) FILTER (WHERE previous_cesarean > 0) AS prior_cesarean,
    count(intrauterine_fetal_deaths) AS prior_iufd_recorded,
    count(*) FILTER (WHERE intrauterine_fetal_deaths > 0) AS prior_iufd,

    count(ga_enrol) AS enrollment_ga_recorded,
    count(*) FILTER (WHERE ga_enrol < 14) AS enrolled_first_trimester,
    count(*) FILTER (WHERE ga_enrol < 12) AS enrolled_before_12_weeks,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY ga_enrol) AS median_enrollment_ga_weeks,

    count(*) FILTER (WHERE sbp IS NOT NULL OR dbp IS NOT NULL) AS bp_recorded,
    count(*) FILTER (WHERE htn) AS hypertension,
    count(*) FILTER (WHERE sbp >= 160 OR dbp >= 110) AS severe_hypertension,
    count(*) FILTER (WHERE htn AND proteinuria > 0) AS preeclampsia_signs,
    count(hb) AS hemoglobin_recorded,
    count(*) FILTER (WHERE hb < 7) AS severe_anemia,
    count(*) FILTER (WHERE hb < 10) AS moderate_or_severe_anemia,
    count(gestational_dm) AS gdm_recorded,
    count(*) FILTER (WHERE gestational_dm > 0) AS gestational_diabetes,
    count(*) FILTER (WHERE hiv IN (pos, neg)) AS hiv_tested,
    count(*) FILTER (WHERE hiv = pos) AS hiv_positive,
    count(*) FILTER (WHERE syphilis IN (pos, neg)) AS syphilis_tested,
    count(*) FILTER (WHERE syphilis = pos) AS syphilis_positive,
    count(*) FILTER (WHERE hep_c IN (pos, neg)) AS hepatitis_c_tested,
    count(*) FILTER (WHERE hep_c = pos) AS hepatitis_c_positive,

    count(*) FILTER (WHERE delivered) AS deliveries,
    count(preterm) AS preterm_recorded,
    count(*) FILTER (WHERE preterm) AS preterm_births,
    count(type_of_delivery) AS delivery_type_recorded,
    count(*) FILTER (WHERE cesarean) AS cesareans,
    count(*) FILTER (WHERE type_of_delivery IS NOT NULL AND previous_cesarean = 0) AS deliveries_without_prior_cesarean,
    count(*) FILTER (WHERE cesarean AND previous_cesarean = 0) AS primary_cesareans,
    count(*) FILTER (WHERE type_of_delivery IS NOT NULL AND previous_cesarean > 0) AS deliveries_after_prior_cesarean,
    count(*) FILTER (WHERE cesarean AND previous_cesarean > 0) AS repeat_cesareans,

    -- This delivery compared between women with and without a previous stillbirth
    count(*) FILTER (WHERE type_of_delivery IS NOT NULL AND intrauterine_fetal_deaths > 0) AS type_recorded_after_iufd,
    count(*) FILTER (WHERE cesarean AND intrauterine_fetal_deaths > 0) AS cesareans_after_iufd,
    count(*) FILTER (WHERE preterm IS NOT NULL AND intrauterine_fetal_deaths > 0) AS preterm_recorded_after_iufd,
    count(*) FILTER (WHERE preterm AND intrauterine_fetal_deaths > 0) AS preterm_after_iufd,
    count(*) FILTER (WHERE type_of_delivery IS NOT NULL AND intrauterine_fetal_deaths = 0) AS type_recorded_no_iufd,
    count(*) FILTER (WHERE cesarean AND intrauterine_fetal_deaths = 0) AS cesareans_no_iufd,
    count(*) FILTER (WHERE preterm IS NOT NULL AND intrauterine_fetal_deaths = 0) AS preterm_recorded_no_iufd,
    count(*) FILTER (WHERE preterm AND intrauterine_fetal_deaths = 0) AS preterm_no_iufd,

    count(weight_g) AS birth_weight_recorded,
    coalesce(sum(weight_g), 0) AS birth_weight_sum_g,
    count(*) FILTER (WHERE weight_g < 2500) AS low_birth_weight,
    count(*) FILTER (WHERE weight_g < 1500) AS very_low_birth_weight,
    count(head_cm) AS head_circumference_recorded,
    coalesce(sum(head_cm), 0) AS head_circumference_sum_cm,

    count(breastfeeding_initiated) AS breastfeeding_recorded,
    count(*) FILTER (WHERE breastfeeding_initiated > 0) AS breastfeeding_initiated,
    count(referral_to_higher_care) AS referral_recorded,
    count(*) FILTER (WHERE referral_to_higher_care > 0) AS referred_to_higher_care
  FROM flags
  GROUP BY midwife_code
),

-- How many of each midwife's patients gave each answer.
socioeconomic AS (
  SELECT
    coalesce(nullif(trim(p.midwife_code), ''), 'Unassigned') AS midwife_code,
    a.attribute,
    lower(trim(a.value)) AS value,
    count(*) AS patients
  FROM public.patient_identification p
  CROSS JOIN LATERAL (VALUES
    ('education_level', p.education_level),
    ('profession', p.profession),
    ('husband_profession', p.husband_profession)
  ) AS a (attribute, value)
  WHERE nullif(trim(a.value), '') IS NOT NULL
  GROUP BY 1, 2, 3
),

-- Forms from the last 24 months.
docs AS (
  SELECT
    ds.id,
    coalesce(nullif(trim(ds.midwife_id), ''), 'Unassigned') AS midwife_id,
    coalesce(nullif(trim(ds.document_section), ''), 'UNKNOWN') AS section,
    coalesce(ds.status, 'UNKNOWN') AS status,
    ds.verified_by_midwife,
    -- Confidence as a fraction; scores recorded out of 100 are converted.
    CASE WHEN ds.ai_confidence_score > 1 THEN ds.ai_confidence_score / 100 ELSE ds.ai_confidence_score END AS ai_confidence,
    ds.created_at::date AS capture_date,
    date_trunc('month', ds.created_at)::date AS month
  FROM public.document_submissions ds
  WHERE ds.created_at >= date_trunc('month', current_date) - interval '23 months'
),

-- The month each woman's first form was captured, and by whom.
first_forms AS (
  SELECT DISTINCT ON (woman)
    woman,
    coalesce(nullif(trim(midwife_id), ''), 'Unassigned') AS midwife_id,
    date_trunc('month', created_at)::date AS month
  FROM (
    SELECT coalesce(p.original_id, ds.original_id) AS woman, ds.midwife_id, ds.created_at
    FROM public.document_submissions ds
    LEFT JOIN public.patient_identification p ON p.id = ds.patient_ref
  ) linked
  WHERE woman IS NOT NULL AND created_at IS NOT NULL
  ORDER BY woman, created_at
),

midwife_months AS (
  SELECT
    d.midwife_id,
    d.month,
    count(*) AS documents_captured,
    count(*) FILTER (WHERE d.verified_by_midwife) AS documents_verified,
    count(*) FILTER (WHERE d.status IN ('CAPTURED', 'SYNC_FAILED', 'PENDING_AI', 'PROCESSING_FAILED',
                                        'NEEDS_REVIEW', 'MANUAL_REVIEW_REQUIRED', 'DUPLICATE_SUSPECTED',
                                        'AI_PROCESSED', 'VALIDATED', 'PATIENT_MATCHED')) AS documents_waiting,
    count(*) FILTER (WHERE d.status = 'SYNC_FAILED') AS documents_sync_failed,
    count(*) FILTER (WHERE d.status = 'PROCESSING_FAILED') AS documents_processing_failed,
    coalesce(max(r.registered), 0) AS patients_registered
  FROM docs d
  LEFT JOIN (
    SELECT midwife_id, month, count(*) AS registered FROM first_forms GROUP BY 1, 2
  ) r ON r.midwife_id = d.midwife_id AND r.month = d.month
  GROUP BY d.midwife_id, d.month
),

-- OCR field results per form, for the last 180 days.
field_stats AS (
  SELECT
    f.record_id,
    count(*) AS fields,
    count(*) FILTER (WHERE f.status = 'KNOWN') AS fields_known,
    count(*) FILTER (WHERE f.status = 'UNKNOWN') AS fields_unknown,
    count(*) FILTER (WHERE f.status = 'NOT_PROVIDED') AS fields_not_provided,
    count(*) FILTER (WHERE f.status = 'ILLEGIBLE') AS fields_illegible,
    count(*) FILTER (WHERE f.status = 'NOT_APPLICABLE') AS fields_not_applicable,
    count(*) FILTER (WHERE f.status = 'NEEDS_REVIEW') AS fields_needs_review,
    count(*) FILTER (WHERE f.source = 'ai') AS fields_ai,
    count(*) FILTER (WHERE f.source = 'confirmed') AS fields_confirmed,
    count(*) FILTER (WHERE f.source = 'manual') AS fields_manual,
    coalesce(sum(f.confidence), 0) AS confidence_sum,
    count(f.confidence) AS confidence_n
  FROM public.fields f
  JOIN docs d ON d.id = f.record_id AND d.capture_date >= current_date - 179
  GROUP BY f.record_id
),

day_status AS (
  SELECT capture_date, section, status, count(*) AS n
  FROM docs
  WHERE capture_date >= current_date - 179
  GROUP BY 1, 2, 3
),

document_days AS (
  SELECT
    d.capture_date,
    d.section AS document_section,
    count(*) AS documents,
    count(*) FILTER (WHERE d.verified_by_midwife) AS verified,
    (SELECT jsonb_object_agg(s.status, s.n)
       FROM day_status s
      WHERE s.capture_date = d.capture_date AND s.section = d.section) AS status_counts,
    coalesce(sum(d.ai_confidence), 0) AS ai_confidence_sum,
    count(d.ai_confidence) AS ai_confidence_n,
    coalesce(sum(fs.fields), 0) AS fields,
    coalesce(sum(fs.fields_known), 0) AS fields_known,
    coalesce(sum(fs.fields_unknown), 0) AS fields_unknown,
    coalesce(sum(fs.fields_not_provided), 0) AS fields_not_provided,
    coalesce(sum(fs.fields_illegible), 0) AS fields_illegible,
    coalesce(sum(fs.fields_not_applicable), 0) AS fields_not_applicable,
    coalesce(sum(fs.fields_needs_review), 0) AS fields_needs_review,
    coalesce(sum(fs.fields_ai), 0) AS fields_ai,
    coalesce(sum(fs.fields_confirmed), 0) AS fields_confirmed,
    coalesce(sum(fs.fields_manual), 0) AS fields_manual,
    coalesce(sum(fs.confidence_sum), 0) AS field_confidence_sum,
    coalesce(sum(fs.confidence_n), 0) AS field_confidence_n
  FROM docs d
  LEFT JOIN field_stats fs ON fs.record_id = d.id
  WHERE d.capture_date >= current_date - 179
  GROUP BY d.capture_date, d.section
)

SELECT json_build_object(
  'midwifeHealth', (SELECT coalesce(json_agg(h ORDER BY h.midwife_code), '[]'::json) FROM health h),
  'socioeconomic', (SELECT coalesce(json_agg(s ORDER BY s.midwife_code, s.attribute, s.patients DESC), '[]'::json) FROM socioeconomic s),
  'midwifeMonths', (SELECT coalesce(json_agg(m ORDER BY m.midwife_id, m.month), '[]'::json) FROM midwife_months m),
  'documentDays',  (SELECT coalesce(json_agg(dd ORDER BY dd.capture_date, dd.document_section), '[]'::json) FROM document_days dd)
) AS payload;
