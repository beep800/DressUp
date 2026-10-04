-- Removes the 120 sample women (patient_hash starting with demo-) and everything linked
-- to them. Real records are not touched.
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

-- Should show 0.
SELECT count(1) AS sample_women_left FROM public.patient_identification WHERE patient_hash LIKE 'demo-%';
