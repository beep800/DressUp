-- =============================================================================
-- Maternal Health Atlas: 120 made-up women for demonstrating the dashboard
-- =============================================================================
-- Adds 120 sample women in four towns in Senegal to the census tables:
-- patient_identification, medical_family_history, obstetric_history,
-- current_pregnancy, delivery and postpartum_newborn.
--
-- Every sample woman is marked: patient_hash starts with 'demo-' and
-- other_information says DEMO DATA. remove_sample_data.sql deletes exactly
-- those rows and everything linked to them. Running this file twice fails on the
-- unique patient_hash, so nothing is added twice.
--
-- The numbers are fixed, not random, so the dashboard shows a predictable mix:
--   Dakar        34 women   no flags
--   Tambacounda  34 women   elevated (hypertension, signs of pre-eclampsia)
--   Kédougou     34 women   high concern (late enrolment, anaemia, adolescent
--                           pregnancies, preterm and low birth weight, no
--                           caesareans, frequent referral)
--   Ziguinchor   18 women   too few records to assess
-- Codes match the dashboard's assumptions: type_of_delivery 1 = vaginal,
-- 2 = caesarean; test results 0 = negative, 1 = positive; yes/no columns 0/1.
-- =============================================================================

BEGIN;

-- One row per sample woman, with every value worked out up front.
-- Each condition is given to an exact number of women per town: woman i (0..n-1)
-- has it when (i * m + s) % n < count, where m shares no factor with n. That picks
-- exactly `count` women, spread through the list rather than bunched together.
CREATE TEMP TABLE sample_women ON COMMIT DROP AS
WITH towns (
  town, address, midwives, n, delivered,
  adolescent, advanced, unintended, consanguinity, first_trimester,
  hypertension, preeclampsia, anaemia, severe_anaemia, hiv, syphilis, gdm,
  prior_cesarean, prior_iufd, family_htn, family_diabetes, no_education,
  preterm, lbw, vlbw, cesarean, breastfed, referred,
  educations, professions, husband_professions
) AS (
  VALUES
  ('Dakar', 'Dakar, Sénégal', ARRAY['demo_mw_dakar_1', 'demo_mw_dakar_2'], 34, 32,
   2, 5, 6, 4, 25,
   2, 1, 5, 0, 0, 0, 3,
   4, 1, 8, 5, 4,
   2, 3, 0, 4, 29, 2,
   ARRAY['secondaire', 'primaire', 'supérieur', 'secondaire'],
   ARRAY['ménagère', 'commerçante', 'couturière', 'enseignante', 'étudiante', 'coiffeuse'],
   ARRAY['chauffeur', 'commerçant', 'fonctionnaire', 'ouvrier', 'mécanicien']),
  ('Tambacounda', 'Tambacounda, Sénégal', ARRAY['demo_mw_tamba_1', 'demo_mw_tamba_2'], 34, 32,
   4, 3, 9, 7, 19,
   4, 2, 6, 1, 0, 0, 2,
   2, 2, 9, 3, 12,
   3, 4, 0, 2, 25, 4,
   ARRAY['primaire', 'primaire', 'secondaire'],
   ARRAY['ménagère', 'agricultrice', 'commerçante', 'ménagère'],
   ARRAY['agriculteur', 'éleveur', 'commerçant', 'chauffeur']),
  ('Kédougou', 'Kédougou, Sénégal', ARRAY['demo_mw_kedougou_1'], 34, 32,
   9, 2, 12, 9, 9,
   3, 1, 15, 3, 1, 1, 1,
   0, 4, 6, 2, 21,
   5, 7, 1, 0, 21, 9,
   ARRAY['primaire', 'primaire', 'secondaire'],
   ARRAY['agricultrice', 'ménagère', 'orpailleuse', 'agricultrice'],
   ARRAY['orpailleur', 'agriculteur', 'éleveur', 'agriculteur']),
  ('Ziguinchor', 'Ziguinchor, Sénégal', ARRAY['demo_mw_ziguinchor_1'], 18, 16,
   2, 2, 4, 3, 10,
   2, 1, 4, 0, 0, 0, 1,
   1, 1, 4, 2, 5,
   2, 2, 0, 2, 13, 2,
   ARRAY['primaire', 'secondaire', 'secondaire'],
   ARRAY['ménagère', 'agricultrice', 'commerçante', 'mareyeuse'],
   ARRAY['pêcheur', 'agriculteur', 'commerçant'])
),
women AS (
  SELECT t.*, g.i,
    (g.i * 5 + 3) % t.n < t.delivered AS is_delivered,
    (g.i * 13 + 5) % t.n AS age_rank,
    (g.i * 23 + 4) % t.n AS bp_rank,
    (g.i * 29 + 6) % t.n AS hb_rank
  FROM towns t
  CROSS JOIN LATERAL generate_series(0, t.n - 1) AS g (i)
),
ranked AS (
  -- j numbers the delivered women 0..delivered-1, for the newborn counts.
  SELECT w.*,
    CASE WHEN w.is_delivered
      THEN row_number() OVER (PARTITION BY w.town, w.is_delivered ORDER BY w.i) - 1 END AS j
  FROM women w
)
SELECT
  r.town,
  r.address,
  r.i,
  r.j,
  r.is_delivered,
  'demo-' || lower(translate(r.town, 'é', 'e')) || '-' || lpad((r.i + 1)::text, 3, '0') AS patient_hash,
  r.midwives[1 + r.i % array_length(r.midwives, 1)] AS midwife_code,
  NULL::integer AS patient_id,
  NULL::integer AS original_id,

  -- patient_identification
  CASE WHEN r.age_rank < r.adolescent THEN 15 + r.i % 3
       WHEN r.age_rank < r.adolescent + r.advanced THEN 35 + r.i % 7
       ELSE 19 + (r.i * 7) % 15 END AS age_years,
  CASE WHEN (r.i * 49 + 4) % r.n < r.no_education THEN 'aucun'
       ELSE r.educations[1 + (r.i * 7 + 3) % array_length(r.educations, 1)] END AS education_level,
  r.professions[1 + (r.i * 5 + 1) % array_length(r.professions, 1)] AS profession,
  r.husband_professions[1 + (r.i * 3 + 2) % array_length(r.husband_professions, 1)] AS husband_profession,
  CASE WHEN (r.i * 11 + 3) % r.n < r.consanguinity THEN 1 ELSE 0 END AS consanguinity,
  CASE WHEN (r.i * 7 + 1) % r.n < r.unintended THEN 0 ELSE 1 END AS desired_pregnancy,

  -- medical_family_history
  CASE WHEN (r.i * 43 + 5) % r.n < r.family_htn THEN 1 ELSE 0 END AS hypertension_history,
  CASE WHEN (r.i * 47 + 8) % r.n < r.family_diabetes THEN 1 ELSE 0 END AS diabetes_mellitus,

  -- obstetric_history
  CASE WHEN (r.i * 37 + 1) % r.n < r.prior_cesarean THEN 1 ELSE 0 END AS previous_cesarean,
  CASE WHEN (r.i * 41 + 2) % r.n < r.prior_iufd THEN 1 ELSE 0 END AS intrauterine_fetal_deaths,

  -- current_pregnancy
  round(19.5 + ((r.i * 11) % 110) * 0.1, 1) AS bmi,
  CASE WHEN (r.i * 19 + 2) % r.n < r.first_trimester THEN 8 + ((r.i * 3) % 11) * 0.5
       ELSE 14 + (r.i * 5) % 17 END AS ga_enrollment,
  CASE WHEN r.bp_rank < r.hypertension THEN 141 + r.i % 15 ELSE 108 + (r.i * 7) % 22 END AS systolic,
  CASE WHEN r.bp_rank < r.hypertension THEN 91 + r.i % 8 ELSE 66 + (r.i * 5) % 18 END AS diastolic,
  CASE WHEN r.bp_rank < r.preeclampsia THEN 1 + r.i % 2 ELSE 0 END AS proteinuria,
  CASE WHEN r.hb_rank < r.severe_anaemia THEN 6.1 + (r.i % 8) * 0.1
       WHEN r.hb_rank < r.anaemia THEN 7.4 + ((r.i * 3) % 25) * 0.1
       ELSE 10.6 + ((r.i * 7) % 27) * 0.1 END AS hemoglobin,
  CASE WHEN (r.i * 31 + 7) % r.n < r.hiv THEN 1 ELSE 0 END AS hiv,
  CASE WHEN (r.i * 35 + 11) % r.n < r.syphilis THEN 1 ELSE 0 END AS syphilis,
  CASE WHEN r.i % 2 = 0 THEN 0 END AS hepatitis_c,
  CASE WHEN (r.i * 25 + 3) % r.n < r.gdm THEN 1 ELSE 0 END AS gestational_dm,

  -- delivery and postpartum_newborn (delivered women only)
  CASE WHEN r.is_delivered THEN (r.j * 7 + 2) % r.delivered < r.preterm END AS is_preterm,
  CASE WHEN r.is_delivered THEN (r.j * 11 + 5) % r.delivered END AS weight_rank,
  CASE WHEN r.is_delivered THEN r.vlbw END AS vlbw_count,
  CASE WHEN r.is_delivered THEN r.lbw END AS lbw_count,
  CASE WHEN r.is_delivered THEN (r.j * 13 + 4) % r.delivered < r.cesarean END AS is_cesarean,
  CASE WHEN r.is_delivered THEN (r.j * 19 + 6) % r.delivered < r.breastfed END AS is_breastfed,
  CASE WHEN r.is_delivered THEN (r.j * 23 + 1) % r.delivered < r.referred END AS is_referred
FROM ranked r;

-- patient_identification
INSERT INTO public.patient_identification
  (age_years, education_level, profession, husband_profession, consanguinity, desired_pregnancy,
   patient_hash, midwife_code, address, other_information)
SELECT age_years, education_level, profession, husband_profession, consanguinity, desired_pregnancy,
       patient_hash, midwife_code, address, 'DEMO DATA: sample record generated for the dashboard'
FROM sample_women
ORDER BY town, i;

UPDATE sample_women s
SET patient_id = p.id, original_id = p.original_id
FROM public.patient_identification p
WHERE p.patient_hash = s.patient_hash;

-- medical_family_history
INSERT INTO public.medical_family_history (original_id, hypertension_history, diabetes_mellitus)
SELECT original_id, hypertension_history, diabetes_mellitus
FROM sample_women;

-- obstetric_history: gravidity counts this pregnancy; women with an earlier
-- caesarean or stillbirth have had at least one earlier birth.
INSERT INTO public.obstetric_history
  (original_id, gravidity, parity, abortions, living_children, previous_cesarean,
   premature_deliveries, intrauterine_fetal_deaths)
SELECT
  original_id,
  gravidity,
  gravidity - 1 - abortions,
  abortions,
  greatest(gravidity - 1 - abortions - intrauterine_fetal_deaths, 0),
  previous_cesarean,
  CASE WHEN gravidity - 1 - abortions > 0 AND i % 9 = 0 THEN 1 ELSE 0 END,
  intrauterine_fetal_deaths
FROM (
  SELECT g.*,
    -- A miscarriage only where there are births to spare beyond the caesarean or stillbirth.
    CASE WHEN g.gravidity - 1 - g.earlier >= 1 AND g.i % 5 = 0 THEN 1 ELSE 0 END AS abortions
  FROM (
    SELECT s.*,
      s.previous_cesarean + s.intrauterine_fetal_deaths AS earlier,
      greatest(1 + (s.i * 7) % 5, 1 + s.previous_cesarean + s.intrauterine_fetal_deaths) AS gravidity
    FROM sample_women s
  ) g
) h;

-- current_pregnancy
INSERT INTO public.current_pregnancy
  (original_id, bmi_pregestational, mean_systolic_bp, mean_diastolic_bp, hemoglobin, proteinuria,
   hiv_test_result, syphilis_test_result, hepatitis_c_test_result, gestational_age_at_enrollment,
   gestational_dm, record_status)
SELECT original_id, bmi, systolic, diastolic, hemoglobin, proteinuria,
       hiv, syphilis, hepatitis_c, ga_enrollment, gestational_dm, 'REGISTERED'
FROM sample_women;

-- delivery
INSERT INTO public.delivery
  (original_id, gestational_age_at_birth, preterm_birth, type_of_delivery, newborn_sex,
   child_birth_weight, head_circumference)
SELECT
  original_id,
  CASE WHEN is_preterm THEN 33 + j % 4 + (j % 2) * 0.5 ELSE 37 + j % 5 + ((j / 2) % 2) * 0.5 END,
  CASE WHEN is_preterm THEN 1 ELSE 0 END,
  CASE WHEN is_cesarean THEN 2 ELSE 1 END,
  1 + j % 2,
  CASE WHEN weight_rank < vlbw_count THEN 1300 + (j * 37) % 190
       WHEN weight_rank < lbw_count THEN 1900 + (j * 89) % 580
       ELSE 2650 + (j * 137) % 1150 END,
  CASE WHEN weight_rank < lbw_count THEN 30.5 + (j % 4) * 0.5 ELSE 33 + ((j * 3) % 7) * 0.5 END
FROM sample_women
WHERE is_delivered;

-- postpartum_newborn
INSERT INTO public.postpartum_newborn (original_id, breastfeeding_initiated, referral_to_higher_care)
SELECT original_id,
       CASE WHEN is_breastfed THEN 1 ELSE 0 END,
       CASE WHEN is_referred THEN 1 ELSE 0 END
FROM sample_women
WHERE is_delivered;

SELECT town, count(*) AS women, count(*) FILTER (WHERE is_delivered) AS delivered
FROM sample_women
GROUP BY town
ORDER BY town;

COMMIT;
