-- Maternal Health Atlas: 120 sample women in four towns in Senegal, with their forms.
-- Every sample woman's patient_hash starts with demo- so she can be removed later.
-- Safe to run more than once: it first removes the sample women from any earlier run.

-- 1. Remove sample data from an earlier run. Only rows linked to a demo- patient are touched.
DELETE FROM public.fields
WHERE record_id IN (
  SELECT ds.id FROM public.document_submissions ds
  JOIN public.patient_identification p ON p.id = ds.patient_ref
  WHERE p.patient_hash LIKE 'demo-%'
);
DELETE FROM public.document_submissions
WHERE patient_ref IN (SELECT id FROM public.patient_identification WHERE patient_hash LIKE 'demo-%');
DELETE FROM public.postpartum_newborn
WHERE original_id IN (SELECT original_id FROM public.patient_identification WHERE patient_hash LIKE 'demo-%');
DELETE FROM public.delivery
WHERE original_id IN (SELECT original_id FROM public.patient_identification WHERE patient_hash LIKE 'demo-%');
DELETE FROM public.current_pregnancy
WHERE original_id IN (SELECT original_id FROM public.patient_identification WHERE patient_hash LIKE 'demo-%');
DELETE FROM public.obstetric_history
WHERE original_id IN (SELECT original_id FROM public.patient_identification WHERE patient_hash LIKE 'demo-%');
DELETE FROM public.medical_family_history
WHERE original_id IN (SELECT original_id FROM public.patient_identification WHERE patient_hash LIKE 'demo-%');
DELETE FROM public.patient_identification WHERE patient_hash LIKE 'demo-%';

-- 2. Add the sample women and everything about them in one statement,
--    so either all of it goes in or none of it does.
WITH towns (
  town, address, midwives, n, delivered,
  adolescent, advanced, unintended, consanguinity, first_trimester,
  hypertension, preeclampsia, anaemia, severe_anaemia, hiv, syphilis, gdm,
  prior_cesarean, prior_iufd, family_htn, family_diabetes, no_education,
  preterm, lbw, vlbw, cesarean, breastfed, referred,
  verified_pct, confidence_base, illegible_pct, corrected_pct,
  educations, professions, husband_professions
) AS (
  VALUES
  ('Dakar', 'Dakar, Sénégal', ARRAY['demo_mw_dakar_1', 'demo_mw_dakar_2'], 34, 32,
   2, 5, 6, 4, 25, 2, 1, 5, 0, 0, 0, 3, 4, 1, 8, 5, 4, 2, 3, 0, 4, 29, 2,
   96, 0.97, 2, 3,
   ARRAY['secondaire', 'primaire', 'supérieur', 'secondaire'],
   ARRAY['ménagère', 'commerçante', 'couturière', 'enseignante', 'étudiante', 'coiffeuse'],
   ARRAY['chauffeur', 'commerçant', 'fonctionnaire', 'ouvrier', 'mécanicien']),
  ('Tambacounda', 'Tambacounda, Sénégal', ARRAY['demo_mw_tamba_1', 'demo_mw_tamba_2'], 34, 32,
   4, 3, 9, 7, 19, 4, 2, 6, 1, 0, 0, 2, 2, 2, 9, 3, 12, 3, 4, 0, 2, 25, 4,
   88, 0.94, 4, 5,
   ARRAY['primaire', 'primaire', 'secondaire'],
   ARRAY['ménagère', 'agricultrice', 'commerçante', 'ménagère'],
   ARRAY['agriculteur', 'éleveur', 'commerçant', 'chauffeur']),
  ('Kédougou', 'Kédougou, Sénégal', ARRAY['demo_mw_kedougou_1'], 34, 32,
   9, 2, 12, 9, 9, 3, 1, 15, 3, 1, 1, 1, 0, 4, 6, 2, 21, 5, 7, 1, 0, 21, 9,
   72, 0.90, 7, 9,
   ARRAY['primaire', 'primaire', 'secondaire'],
   ARRAY['agricultrice', 'ménagère', 'orpailleuse', 'agricultrice'],
   ARRAY['orpailleur', 'agriculteur', 'éleveur', 'agriculteur']),
  ('Ziguinchor', 'Ziguinchor, Sénégal', ARRAY['demo_mw_ziguinchor_1'], 18, 16,
   2, 2, 4, 3, 10, 2, 1, 4, 0, 0, 0, 1, 1, 1, 4, 2, 5, 2, 2, 0, 2, 13, 2,
   90, 0.95, 2, 3,
   ARRAY['primaire', 'secondaire', 'secondaire'],
   ARRAY['ménagère', 'agricultrice', 'commerçante', 'mareyeuse'],
   ARRAY['pêcheur', 'agriculteur', 'commerçant'])
),
women AS (
  SELECT t.town, g.i, mod(int4mul(g.i, 5) + 3, t.n) < t.delivered AS is_delivered
  FROM towns t
  CROSS JOIN LATERAL generate_series(0, t.n - 1) AS g (i)
),
ranked AS (
  SELECT w.town, w.i, w.is_delivered,
    CASE WHEN w.is_delivered
      THEN (row_number() OVER (PARTITION BY w.town, w.is_delivered ORDER BY w.i) - 1)::integer END AS j
  FROM women w
),
-- Every value for every woman. Each condition goes to an exact number of women per
-- town: woman i has it when mod(i x m + s, n) is below that number.
gen AS (
  SELECT
    t.town,
    t.address,
    r.i,
    r.is_delivered,
    t.verified_pct,
    t.confidence_base,
    t.illegible_pct,
    t.corrected_pct,
    concat('demo-', lower(translate(t.town, 'é', 'e')), '-', lpad((r.i + 1)::text, 3, '0')) AS patient_hash,
    t.midwives[1 + mod(r.i, array_length(t.midwives, 1))] AS midwife_code,
    date_trunc('day', localtimestamp)
      - make_interval(days => CASE WHEN r.is_delivered THEN 130 + mod(int4mul(r.i, 37), 170) ELSE 15 + mod(int4mul(r.i, 11), 60) END)
      + make_interval(hours => 9 + mod(r.i, 8)) AS registered_at,
    CASE WHEN mod(int4mul(r.i, 13) + 5, t.n) < t.adolescent THEN 15 + mod(r.i, 3)
         WHEN mod(int4mul(r.i, 13) + 5, t.n) < t.adolescent + t.advanced THEN 35 + mod(r.i, 7)
         ELSE 19 + mod(int4mul(r.i, 7), 15) END AS age_years,
    CASE WHEN mod(int4mul(r.i, 49) + 4, t.n) < t.no_education THEN 'aucun'
         ELSE t.educations[1 + mod(int4mul(r.i, 7) + 3, array_length(t.educations, 1))] END AS education_level,
    t.professions[1 + mod(int4mul(r.i, 5) + 1, array_length(t.professions, 1))] AS profession,
    t.husband_professions[1 + mod(int4mul(r.i, 3) + 2, array_length(t.husband_professions, 1))] AS husband_profession,
    CASE WHEN mod(int4mul(r.i, 11) + 3, t.n) < t.consanguinity THEN 1 ELSE 0 END AS consanguinity,
    CASE WHEN mod(int4mul(r.i, 7) + 1, t.n) < t.unintended THEN 0 ELSE 1 END AS desired_pregnancy,
    CASE WHEN mod(int4mul(r.i, 43) + 5, t.n) < t.family_htn THEN 1 ELSE 0 END AS hypertension_history,
    CASE WHEN mod(int4mul(r.i, 47) + 8, t.n) < t.family_diabetes THEN 1 ELSE 0 END AS diabetes_mellitus,
    CASE WHEN mod(int4mul(r.i, 37) + 1, t.n) < t.prior_cesarean THEN 1 ELSE 0 END AS previous_cesarean,
    CASE WHEN mod(int4mul(r.i, 41) + 2, t.n) < t.prior_iufd THEN 1 ELSE 0 END AS intrauterine_fetal_deaths,
    round(19.5 + mod(int4mul(r.i, 11), 110) / 10.0, 1) AS bmi,
    CASE WHEN mod(int4mul(r.i, 19) + 2, t.n) < t.first_trimester THEN 8 + mod(int4mul(r.i, 3), 11) / 2.0
         ELSE 14 + mod(int4mul(r.i, 5), 17) END AS ga_enrollment,
    CASE WHEN mod(int4mul(r.i, 23) + 4, t.n) < t.hypertension THEN 141 + mod(r.i, 15)
         ELSE 108 + mod(int4mul(r.i, 7), 22) END AS systolic,
    CASE WHEN mod(int4mul(r.i, 23) + 4, t.n) < t.hypertension THEN 91 + mod(r.i, 8)
         ELSE 66 + mod(int4mul(r.i, 5), 18) END AS diastolic,
    CASE WHEN mod(int4mul(r.i, 23) + 4, t.n) < t.preeclampsia THEN 1 + mod(r.i, 2) ELSE 0 END AS proteinuria,
    CASE WHEN mod(int4mul(r.i, 29) + 6, t.n) < t.severe_anaemia THEN 6.1 + mod(r.i, 8) / 10.0
         WHEN mod(int4mul(r.i, 29) + 6, t.n) < t.anaemia THEN 7.4 + mod(int4mul(r.i, 3), 25) / 10.0
         ELSE 10.6 + mod(int4mul(r.i, 7), 27) / 10.0 END AS hemoglobin,
    CASE WHEN mod(int4mul(r.i, 31) + 7, t.n) < t.hiv THEN 1 ELSE 0 END AS hiv,
    CASE WHEN mod(int4mul(r.i, 35) + 11, t.n) < t.syphilis THEN 1 ELSE 0 END AS syphilis,
    CASE WHEN mod(r.i, 2) = 0 THEN 0 END AS hepatitis_c,
    CASE WHEN mod(int4mul(r.i, 25) + 3, t.n) < t.gdm THEN 1 ELSE 0 END AS gestational_dm,
    -- Delivery and newborn values (only used for delivered women)
    CASE WHEN mod(int4mul(r.j, 7) + 2, t.delivered) < t.preterm
         THEN 33 + mod(r.j, 4) + mod(r.j, 2) / 2.0
         ELSE 37 + mod(r.j, 5) + mod(r.j / 2, 2) / 2.0 END AS ga_birth,
    CASE WHEN mod(int4mul(r.j, 7) + 2, t.delivered) < t.preterm THEN 1 ELSE 0 END AS preterm_birth,
    CASE WHEN mod(int4mul(r.j, 13) + 4, t.delivered) < t.cesarean THEN 2 ELSE 1 END AS type_of_delivery,
    1 + mod(r.j, 2) AS newborn_sex,
    CASE WHEN mod(int4mul(r.j, 11) + 5, t.delivered) < t.vlbw THEN 1300 + mod(int4mul(r.j, 37), 190)
         WHEN mod(int4mul(r.j, 11) + 5, t.delivered) < t.lbw THEN 1900 + mod(int4mul(r.j, 89), 580)
         ELSE 2650 + mod(int4mul(r.j, 137), 1150) END AS birth_weight,
    CASE WHEN mod(int4mul(r.j, 11) + 5, t.delivered) < t.lbw THEN 30.5 + mod(r.j, 4) / 2.0
         ELSE 33 + mod(int4mul(r.j, 3), 7) / 2.0 END AS head_circumference,
    CASE WHEN mod(int4mul(r.j, 19) + 6, t.delivered) < t.breastfed THEN 1 ELSE 0 END AS breastfeeding,
    CASE WHEN mod(int4mul(r.j, 23) + 1, t.delivered) < t.referred THEN 1 ELSE 0 END AS referral
  FROM ranked r
  JOIN towns t ON t.town = r.town
),
new_patients AS (
  INSERT INTO public.patient_identification
    (age_years, education_level, profession, husband_profession, consanguinity, desired_pregnancy,
     patient_hash, midwife_code, address, other_information)
  SELECT g.age_years, g.education_level, g.profession, g.husband_profession, g.consanguinity, g.desired_pregnancy,
         g.patient_hash, g.midwife_code, g.address, 'DEMO DATA: sample record generated for the dashboard'
  FROM gen g
  ORDER BY g.town, g.i
  RETURNING id, original_id, patient_hash
),
new_family AS (
  INSERT INTO public.medical_family_history (original_id, hypertension_history, diabetes_mellitus)
  SELECT np.original_id, g.hypertension_history, g.diabetes_mellitus
  FROM gen g
  JOIN new_patients np ON np.patient_hash = g.patient_hash
  RETURNING 1
),
new_history AS (
  INSERT INTO public.obstetric_history
    (original_id, gravidity, parity, abortions, living_children, previous_cesarean,
     premature_deliveries, intrauterine_fetal_deaths)
  SELECT
    np.original_id,
    gr.gravidity,
    gr.gravidity - 1 - ab.abortions,
    ab.abortions,
    greatest(gr.gravidity - 1 - ab.abortions - g.intrauterine_fetal_deaths, 0),
    g.previous_cesarean,
    CASE WHEN gr.gravidity - 1 - ab.abortions > 0 AND mod(g.i, 9) = 0 THEN 1 ELSE 0 END,
    g.intrauterine_fetal_deaths
  FROM gen g
  JOIN new_patients np ON np.patient_hash = g.patient_hash
  CROSS JOIN LATERAL (
    SELECT greatest(1 + mod(int4mul(g.i, 7), 5), 1 + g.previous_cesarean + g.intrauterine_fetal_deaths) AS gravidity
  ) gr
  CROSS JOIN LATERAL (
    SELECT CASE WHEN gr.gravidity - 1 - g.previous_cesarean - g.intrauterine_fetal_deaths >= 1 AND mod(g.i, 5) = 0
                THEN 1 ELSE 0 END AS abortions
  ) ab
  RETURNING 1
),
new_pregnancies AS (
  INSERT INTO public.current_pregnancy
    (original_id, bmi_pregestational, mean_systolic_bp, mean_diastolic_bp, hemoglobin, proteinuria,
     hiv_test_result, syphilis_test_result, hepatitis_c_test_result, gestational_age_at_enrollment,
     gestational_dm, record_status)
  SELECT np.original_id, g.bmi, g.systolic, g.diastolic, g.hemoglobin, g.proteinuria,
         g.hiv, g.syphilis, g.hepatitis_c, g.ga_enrollment, g.gestational_dm, 'REGISTERED'
  FROM gen g
  JOIN new_patients np ON np.patient_hash = g.patient_hash
  RETURNING 1
),
new_deliveries AS (
  INSERT INTO public.delivery
    (original_id, gestational_age_at_birth, preterm_birth, type_of_delivery, newborn_sex,
     child_birth_weight, head_circumference)
  SELECT np.original_id, g.ga_birth, g.preterm_birth, g.type_of_delivery, g.newborn_sex,
         g.birth_weight, g.head_circumference
  FROM gen g
  JOIN new_patients np ON np.patient_hash = g.patient_hash
  WHERE g.is_delivered
  RETURNING 1
),
new_postpartum AS (
  INSERT INTO public.postpartum_newborn (original_id, breastfeeding_initiated, referral_to_higher_care)
  SELECT np.original_id, g.breastfeeding, g.referral
  FROM gen g
  JOIN new_patients np ON np.patient_hash = g.patient_hash
  WHERE g.is_delivered
  RETURNING 1
),
-- Photographed forms, with finished statuses only.
new_forms AS (
  INSERT INTO public.document_submissions
    (document_section, status, created_at, ai_confidence_score, verified_by_midwife, midwife_id, original_id, patient_ref)
  SELECT
    sec.section,
    CASE WHEN mod(int4mul(g.i, 3) + sec.k, 29) = 0 THEN 'SUPERSEDED'
         WHEN mod(g.i + sec.k, 11) = 0 THEN 'SYNCED'
         ELSE 'REGISTERED' END,
    CASE sec.k
      WHEN 0 THEN g.registered_at
      WHEN 1 THEN g.registered_at + interval '1 day'
      ELSE least(
        g.registered_at + make_interval(days => (numeric_mul(40 - g.ga_enrollment, 7))::integer),
        date_trunc('day', localtimestamp) - interval '5 days' + interval '10 hours'
      ) + make_interval(days => int4mul(sec.k - 2, 2))
    END,
    round(g.confidence_base - mod(int4mul(g.i, 13) + int4mul(sec.k, 7), 12) / 100.0, 3),
    mod(int4mul(g.i, 7) + int4mul(sec.k, 3), 100) < g.verified_pct,
    g.midwife_code,
    np.original_id,
    np.id
  FROM gen g
  JOIN new_patients np ON np.patient_hash = g.patient_hash
  CROSS JOIN (VALUES
    ('patient_identification', 0),
    ('current_pregnancy', 1),
    ('delivery', 2),
    ('postpartum_newborn', 3)
  ) AS sec (section, k)
  WHERE sec.k < 2 OR g.is_delivered
  RETURNING id, patient_ref, document_section
)
-- What the OCR read from each form.
INSERT INTO public.fields (record_id, field_name, value, status, confidence, source)
SELECT
  f.id,
  fl.field_name,
  CASE WHEN st.status = 'KNOWN' THEN val.value END,
  st.status,
  CASE st.status
    WHEN 'KNOWN' THEN round(0.83 + mod(rl.roll2, 17) / 100.0, 2)
    WHEN 'ILLEGIBLE' THEN round(0.20 + mod(rl.roll2, 25) / 100.0, 2)
    ELSE round(0.55 + mod(rl.roll2, 30) / 100.0, 2)
  END,
  CASE WHEN st.status <> 'KNOWN' THEN 'ai'
       WHEN rl.roll2 < g.corrected_pct THEN 'manual'
       WHEN rl.roll2 < g.corrected_pct + 20 THEN 'confirmed'
       ELSE 'ai' END
FROM new_forms f
JOIN new_patients np ON np.id = f.patient_ref
JOIN gen g ON g.patient_hash = np.patient_hash
CROSS JOIN LATERAL (
  SELECT CASE f.document_section WHEN 'patient_identification' THEN 0 WHEN 'current_pregnancy' THEN 1
                                 WHEN 'delivery' THEN 2 ELSE 3 END AS sec_k
) q
CROSS JOIN LATERAL unnest(CASE f.document_section
  WHEN 'patient_identification' THEN ARRAY['age_years', 'education_level', 'profession', 'husband_profession',
                                           'consanguinity', 'desired_pregnancy', 'address']
  WHEN 'current_pregnancy' THEN ARRAY['bmi_pregestational', 'mean_systolic_bp', 'mean_diastolic_bp', 'hemoglobin',
                                      'proteinuria', 'hiv_test_result', 'syphilis_test_result',
                                      'hepatitis_c_test_result', 'gestational_age_at_enrollment', 'gestational_dm']
  WHEN 'delivery' THEN ARRAY['gestational_age_at_birth', 'preterm_birth', 'type_of_delivery', 'newborn_sex',
                             'child_birth_weight', 'head_circumference']
  ELSE ARRAY['breastfeeding_initiated', 'referral_to_higher_care']
END) WITH ORDINALITY AS fl (field_name, n)
CROSS JOIN LATERAL (
  SELECT
    mod(int4mul(g.i, 31) + int8mul(fl.n, 17) + int4mul(q.sec_k, 7), 100) AS roll,
    mod(int4mul(g.i, 17) + int8mul(fl.n, 29) + int4mul(q.sec_k, 13), 100) AS roll2
) rl
CROSS JOIN LATERAL (
  SELECT CASE fl.field_name
    WHEN 'age_years' THEN to_jsonb(g.age_years)
    WHEN 'education_level' THEN to_jsonb(g.education_level)
    WHEN 'profession' THEN to_jsonb(g.profession)
    WHEN 'husband_profession' THEN to_jsonb(g.husband_profession)
    WHEN 'consanguinity' THEN to_jsonb(g.consanguinity)
    WHEN 'desired_pregnancy' THEN to_jsonb(g.desired_pregnancy)
    WHEN 'address' THEN to_jsonb(g.address)
    WHEN 'bmi_pregestational' THEN to_jsonb(g.bmi)
    WHEN 'mean_systolic_bp' THEN to_jsonb(g.systolic)
    WHEN 'mean_diastolic_bp' THEN to_jsonb(g.diastolic)
    WHEN 'hemoglobin' THEN to_jsonb(g.hemoglobin)
    WHEN 'proteinuria' THEN to_jsonb(g.proteinuria)
    WHEN 'hiv_test_result' THEN to_jsonb(g.hiv)
    WHEN 'syphilis_test_result' THEN to_jsonb(g.syphilis)
    WHEN 'hepatitis_c_test_result' THEN to_jsonb(g.hepatitis_c)
    WHEN 'gestational_age_at_enrollment' THEN to_jsonb(g.ga_enrollment)
    WHEN 'gestational_dm' THEN to_jsonb(g.gestational_dm)
    WHEN 'gestational_age_at_birth' THEN to_jsonb(g.ga_birth)
    WHEN 'preterm_birth' THEN to_jsonb(g.preterm_birth)
    WHEN 'type_of_delivery' THEN to_jsonb(g.type_of_delivery)
    WHEN 'newborn_sex' THEN to_jsonb(g.newborn_sex)
    WHEN 'child_birth_weight' THEN to_jsonb(g.birth_weight)
    WHEN 'head_circumference' THEN to_jsonb(g.head_circumference)
    WHEN 'breastfeeding_initiated' THEN to_jsonb(g.breastfeeding)
    WHEN 'referral_to_higher_care' THEN to_jsonb(g.referral)
  END AS value
) val
CROSS JOIN LATERAL (
  SELECT CASE WHEN val.value IS NULL THEN 'NOT_PROVIDED'
              WHEN rl.roll < g.illegible_pct THEN 'ILLEGIBLE'
              WHEN rl.roll < g.illegible_pct + 4 THEN 'NOT_PROVIDED'
              ELSE 'KNOWN' END AS status
) st;

-- 3. Check: one row per town with the number of sample women added.
SELECT split_part(address, ',', 1) AS town, count(1) AS sample_women
FROM public.patient_identification
WHERE patient_hash LIKE 'demo-%'
GROUP BY 1
ORDER BY 1;
