-- =============================================================================
-- Maternal Health Atlas: remove the sample data
-- =============================================================================
-- Deletes every sample woman added by add_sample_women.sql (patient_hash starting
-- with 'demo-') and everything linked to her: forms, OCR fields, family and
-- obstetric history, pregnancy, delivery and postpartum records. Real records are
-- not touched. The counts printed at the end should all be 0.
-- =============================================================================

BEGIN;

CREATE TEMP TABLE sample_ids ON COMMIT DROP AS
SELECT id, original_id
FROM public.patient_identification
WHERE patient_hash LIKE 'demo-%';

DELETE FROM public.fields
WHERE record_id IN (SELECT ds.id FROM public.document_submissions ds WHERE ds.patient_ref IN (SELECT id FROM sample_ids));

DELETE FROM public.document_submissions WHERE patient_ref IN (SELECT id FROM sample_ids);
DELETE FROM public.postpartum_newborn WHERE original_id IN (SELECT original_id FROM sample_ids);
DELETE FROM public.delivery WHERE original_id IN (SELECT original_id FROM sample_ids);
DELETE FROM public.current_pregnancy WHERE original_id IN (SELECT original_id FROM sample_ids);
DELETE FROM public.obstetric_history WHERE original_id IN (SELECT original_id FROM sample_ids);
DELETE FROM public.medical_family_history WHERE original_id IN (SELECT original_id FROM sample_ids);
DELETE FROM public.patient_identification WHERE id IN (SELECT id FROM sample_ids);

SELECT
  (SELECT count(*) FROM public.patient_identification WHERE patient_hash LIKE 'demo-%') AS sample_women_left,
  (SELECT count(*) FROM public.document_submissions WHERE midwife_id LIKE 'demo_mw_%') AS sample_forms_left;

COMMIT;
