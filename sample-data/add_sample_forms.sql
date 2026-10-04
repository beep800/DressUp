-- =============================================================================
-- Maternal Health Atlas: paper forms and OCR results for the sample women
-- =============================================================================
-- Run after add_sample_women.sql. Adds the forms each sample woman would have had
-- photographed (document_submissions) and what the OCR read from them (fields),
-- for the dashboard's data capture page and its women-registered-per-month chart.
--
-- Forms are only given finished statuses (REGISTERED, SYNCED, SUPERSEDED), so a
-- capture bot that picks up new or unreviewed forms has nothing to act on. If
-- your bot reacts to every new row in document_submissions (for example through
-- a Supabase database webhook), switch it off before running this file.
--
-- Women who already have forms are skipped, so running this twice adds nothing.
-- remove_sample_data.sql deletes these rows too.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE sample_forms ON COMMIT DROP AS
SELECT
  s.*,
  date_trunc('day', localtimestamp)
    - make_interval(days => CASE WHEN s.delivered THEN 130 + (s.i * 37) % 170 ELSE 15 + (s.i * 11) % 60 END)
    + make_interval(hours => 9 + s.i % 8) AS registered_at
FROM (
  SELECT
    p.id AS patient_id,
    p.original_id,
    p.midwife_code,
    (substring(p.patient_hash FROM '(\d+)$'))::integer - 1 AS i,
    cp.gestational_age_at_enrollment AS ga,
    d.id IS NOT NULL AS delivered,
    -- How well capture goes in each town.
    CASE split_part(p.address, ',', 1)
      WHEN 'Kédougou' THEN 72 WHEN 'Tambacounda' THEN 88 WHEN 'Ziguinchor' THEN 90 ELSE 96 END AS verified_pct,
    CASE split_part(p.address, ',', 1)
      WHEN 'Kédougou' THEN 0.90 WHEN 'Tambacounda' THEN 0.94 WHEN 'Ziguinchor' THEN 0.95 ELSE 0.97 END AS confidence_base,
    CASE split_part(p.address, ',', 1)
      WHEN 'Kédougou' THEN 7 WHEN 'Tambacounda' THEN 4 ELSE 2 END AS illegible_pct,
    CASE split_part(p.address, ',', 1)
      WHEN 'Kédougou' THEN 9 WHEN 'Tambacounda' THEN 5 ELSE 3 END AS corrected_pct
  FROM public.patient_identification p
  JOIN public.current_pregnancy cp ON cp.original_id = p.original_id
  LEFT JOIN public.delivery d ON d.original_id = p.original_id
  WHERE p.patient_hash LIKE 'demo-%'
    AND NOT EXISTS (SELECT 1 FROM public.document_submissions ds WHERE ds.patient_ref = p.id)
) s;

-- One form per section: identification and pregnancy at registration; delivery and
-- postpartum when the woman has delivered (never later than a few days ago).
INSERT INTO public.document_submissions
  (document_section, status, created_at, ai_confidence_score, verified_by_midwife, midwife_id, original_id, patient_ref)
SELECT
  sec.section,
  CASE WHEN (f.i * 3 + sec.k) % 29 = 0 THEN 'SUPERSEDED'
       WHEN (f.i + sec.k) % 11 = 0 THEN 'SYNCED'
       ELSE 'REGISTERED' END,
  CASE sec.k
    WHEN 0 THEN f.registered_at
    WHEN 1 THEN f.registered_at + interval '1 day'
    ELSE least(
      f.registered_at + make_interval(days => ((40 - f.ga) * 7)::integer),
      date_trunc('day', localtimestamp) - interval '5 days' + interval '10 hours'
    ) + make_interval(days => (sec.k - 2) * 2)
  END,
  round(f.confidence_base - ((f.i * 13 + sec.k * 7) % 12) * 0.01, 3),
  (f.i * 7 + sec.k * 3) % 100 < f.verified_pct,
  f.midwife_code,
  f.original_id,
  f.patient_id
FROM sample_forms f
CROSS JOIN (VALUES
  ('patient_identification', 0),
  ('current_pregnancy', 1),
  ('delivery', 2),
  ('postpartum_newborn', 3)
) AS sec (section, k)
WHERE sec.k < 2 OR f.delivered;

-- What the OCR read from each form: one row per field, with the value the census
-- tables hold. A few fields per form are illegible or left blank, more in Kédougou;
-- some values were confirmed or corrected by the midwife.
INSERT INTO public.fields (record_id, field_name, value, status, confidence, source)
SELECT
  r.record_id,
  r.field_name,
  CASE WHEN r.status = 'KNOWN' THEN r.value END,
  r.status,
  CASE r.status
    WHEN 'KNOWN' THEN round(0.83 + (r.roll2 % 17) * 0.01, 2)
    WHEN 'ILLEGIBLE' THEN round(0.20 + (r.roll2 % 25) * 0.01, 2)
    ELSE round(0.55 + (r.roll2 % 30) * 0.01, 2)
  END,
  CASE WHEN r.status <> 'KNOWN' THEN 'ai'
       WHEN r.roll2 < r.corrected_pct THEN 'manual'
       WHEN r.roll2 < r.corrected_pct + 20 THEN 'confirmed'
       ELSE 'ai' END
FROM (
  SELECT
    v.*,
    CASE WHEN v.value IS NULL OR v.value = 'null'::jsonb THEN 'NOT_PROVIDED'
         WHEN v.roll < v.illegible_pct THEN 'ILLEGIBLE'
         WHEN v.roll < v.illegible_pct + 4 THEN 'NOT_PROVIDED'
         ELSE 'KNOWN' END AS status
  FROM (
    SELECT
      ds.id AS record_id,
      fl.field_name,
      f.illegible_pct,
      f.corrected_pct,
      (f.i * 31 + fl.n * 17 + sec_k * 7) % 100 AS roll,
      (f.i * 17 + fl.n * 29 + sec_k * 13) % 100 AS roll2,
      CASE fl.field_name
        WHEN 'age_years' THEN to_jsonb(p.age_years)
        WHEN 'education_level' THEN to_jsonb(p.education_level)
        WHEN 'profession' THEN to_jsonb(p.profession)
        WHEN 'husband_profession' THEN to_jsonb(p.husband_profession)
        WHEN 'consanguinity' THEN to_jsonb(p.consanguinity)
        WHEN 'desired_pregnancy' THEN to_jsonb(p.desired_pregnancy)
        WHEN 'address' THEN to_jsonb(p.address)
        WHEN 'bmi_pregestational' THEN to_jsonb(cp.bmi_pregestational)
        WHEN 'mean_systolic_bp' THEN to_jsonb(cp.mean_systolic_bp)
        WHEN 'mean_diastolic_bp' THEN to_jsonb(cp.mean_diastolic_bp)
        WHEN 'hemoglobin' THEN to_jsonb(cp.hemoglobin)
        WHEN 'proteinuria' THEN to_jsonb(cp.proteinuria)
        WHEN 'hiv_test_result' THEN to_jsonb(cp.hiv_test_result)
        WHEN 'syphilis_test_result' THEN to_jsonb(cp.syphilis_test_result)
        WHEN 'hepatitis_c_test_result' THEN to_jsonb(cp.hepatitis_c_test_result)
        WHEN 'gestational_age_at_enrollment' THEN to_jsonb(cp.gestational_age_at_enrollment)
        WHEN 'gestational_dm' THEN to_jsonb(cp.gestational_dm)
        WHEN 'gestational_age_at_birth' THEN to_jsonb(d.gestational_age_at_birth)
        WHEN 'preterm_birth' THEN to_jsonb(d.preterm_birth)
        WHEN 'type_of_delivery' THEN to_jsonb(d.type_of_delivery)
        WHEN 'newborn_sex' THEN to_jsonb(d.newborn_sex)
        WHEN 'child_birth_weight' THEN to_jsonb(d.child_birth_weight)
        WHEN 'head_circumference' THEN to_jsonb(d.head_circumference)
        WHEN 'breastfeeding_initiated' THEN to_jsonb(pn.breastfeeding_initiated)
        WHEN 'referral_to_higher_care' THEN to_jsonb(pn.referral_to_higher_care)
      END AS value
    FROM public.document_submissions ds
    JOIN sample_forms f ON f.patient_id = ds.patient_ref
    JOIN public.patient_identification p ON p.id = ds.patient_ref
    JOIN public.current_pregnancy cp ON cp.original_id = p.original_id
    LEFT JOIN public.delivery d ON d.original_id = p.original_id
    LEFT JOIN public.postpartum_newborn pn ON pn.original_id = p.original_id
    CROSS JOIN LATERAL (SELECT CASE ds.document_section
      WHEN 'patient_identification' THEN 0 WHEN 'current_pregnancy' THEN 1 WHEN 'delivery' THEN 2 ELSE 3 END AS sec_k) k
    CROSS JOIN LATERAL unnest(CASE ds.document_section
      WHEN 'patient_identification' THEN ARRAY['age_years', 'education_level', 'profession', 'husband_profession',
                                               'consanguinity', 'desired_pregnancy', 'address']
      WHEN 'current_pregnancy' THEN ARRAY['bmi_pregestational', 'mean_systolic_bp', 'mean_diastolic_bp', 'hemoglobin',
                                          'proteinuria', 'hiv_test_result', 'syphilis_test_result',
                                          'hepatitis_c_test_result', 'gestational_age_at_enrollment', 'gestational_dm']
      WHEN 'delivery' THEN ARRAY['gestational_age_at_birth', 'preterm_birth', 'type_of_delivery', 'newborn_sex',
                                 'child_birth_weight', 'head_circumference']
      ELSE ARRAY['breastfeeding_initiated', 'referral_to_higher_care']
    END) WITH ORDINALITY AS fl (field_name, n)
  ) v
) r;

SELECT
  (SELECT count(*) FROM sample_forms) AS women_given_forms,
  (SELECT count(*) FROM public.document_submissions ds JOIN sample_forms f ON f.patient_id = ds.patient_ref) AS forms_added;

COMMIT;
