-- =============================================================================
-- Maternal & Neonatal Census Analytics Schema (PostgreSQL 12+)
-- =============================================================================
-- Design rules
--   * One table per real-world grain: patient -> pregnancy -> delivery -> newborn.
--     A woman can have several pregnancies and a delivery can have several babies,
--     so nothing is joined on patient id alone and aggregates never fan out.
--   * Raw measurements are stored; clinical flags are GENERATED from them, so a
--     flag can never disagree with the value it came from.
--   * "Not tested" is stored explicitly and is never counted as "negative".
--   * Aggregates expose counts and their denominators, not rates, so they can be
--     summed correctly from facility to district to region in the BI tool.
--   * Every fact keeps the source system's key as UNIQUE, so loads can be
--     idempotent upserts (INSERT ... ON CONFLICT DO UPDATE).
--   * CHECK constraints reject physically impossible values. OCR values outside
--     these ranges should be loaded as NULL with the field marked NEEDS_REVIEW.
--
-- Clinical thresholds (WHO unless noted), applied in the generated columns:
--   adolescent age < 18; advanced maternal age >= 35
--   first-trimester enrolment < 14 weeks; WHO ANC first-contact target < 12 weeks
--   hypertension SBP >= 140 or DBP >= 90; severe SBP >= 160 or DBP >= 110
--   anaemia in pregnancy (Hb g/dL): severe < 7.0, moderate 7.0-9.9, mild 10.0-10.9
--   preterm < 37 weeks; low birth weight < 2500 g; very low birth weight < 1500 g
--
-- Upgrading from the previous analytics schema? Drop its objects first:
--   DROP MATERIALIZED VIEW IF EXISTS analytics.mv_regional_health_indicators;
--   DROP MATERIALIZED VIEW IF EXISTS analytics.mv_ocr_extraction_quality;
--   DROP TABLE IF EXISTS analytics.fact_pregnancy_outcomes;
--   DROP TABLE IF EXISTS analytics.dim_midwife_performance;
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE FUNCTION analytics.set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


-- =============================================================================
-- 1. REFERENCE TABLES
-- =============================================================================

-- Socioeconomic policy lives in data, not code: analysts can re-classify an
-- education level or profession without a schema change. Load these from the
-- code lists used on the paper form.
CREATE TABLE analytics.ref_education_level (
    education_level_code text PRIMARY KEY,
    label                text NOT NULL,
    sort_order           smallint NOT NULL,
    is_low_literacy      boolean NOT NULL
);

-- Used for both the woman's and her husband's profession.
CREATE TABLE analytics.ref_profession (
    profession_code   text PRIMARY KEY,
    label             text NOT NULL,
    has_stable_income boolean NOT NULL
);

-- 10th birth-weight centile by sex and completed gestational week, used to flag
-- small-for-gestational-age (the standard proxy for growth restriction). Load it
-- from the INTERGROWTH-21st newborn size standard; SGA stays NULL until loaded.
CREATE TABLE analytics.ref_birth_weight_centile (
    newborn_sex        text NOT NULL CHECK (newborn_sex IN ('MALE', 'FEMALE')),
    gestational_week   smallint NOT NULL CHECK (gestational_week BETWEEN 22 AND 44),
    p10_birth_weight_g integer NOT NULL CHECK (p10_birth_weight_g > 0),
    PRIMARY KEY (newborn_sex, gestational_week)
);


-- =============================================================================
-- 2. DIMENSIONS
-- =============================================================================

CREATE TABLE analytics.dim_facility (
    facility_id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    facility_code   text NOT NULL UNIQUE,
    facility_name   text NOT NULL,
    region          text NOT NULL,
    district        text NOT NULL,
    facility_level  text NOT NULL
        CHECK (facility_level IN ('COMMUNITY', 'HEALTH_POST', 'HEALTH_CENTER',
                                  'DISTRICT_HOSPITAL', 'REFERRAL_HOSPITAL')),
    -- Emergency obstetric & newborn care capability (WHO signal functions):
    -- BASIC cannot perform cesareans or transfuse blood; COMPREHENSIVE can.
    emonc_level     text NOT NULL DEFAULT 'NONE'
        CHECK (emonc_level IN ('NONE', 'BASIC', 'COMPREHENSIVE')),
    travel_time_to_referral_min integer CHECK (travel_time_to_referral_min >= 0),
    has_reliable_connectivity   boolean,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE analytics.dim_midwife (
    midwife_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    midwife_code     text NOT NULL UNIQUE,
    home_facility_id bigint REFERENCES analytics.dim_facility,
    is_active        boolean NOT NULL DEFAULT true,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

-- No names or contact details: analytics only needs a stable pseudonymous key.
CREATE TABLE analytics.dim_patient (
    patient_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    patient_original_id integer NOT NULL UNIQUE,
    created_at          timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- 3. CLINICAL FACTS
-- =============================================================================

-- One row per pregnancy episode.
CREATE TABLE analytics.fact_pregnancy (
    pregnancy_id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Source key for idempotent loads. If the source has no pregnancy id, build
    -- one from the patient id and the enrolment date.
    source_pregnancy_ref text NOT NULL UNIQUE,
    patient_id           bigint NOT NULL REFERENCES analytics.dim_patient,
    midwife_id           bigint NOT NULL REFERENCES analytics.dim_midwife,
    facility_id          bigint NOT NULL REFERENCES analytics.dim_facility, -- where enrolled
    enrollment_date      date NOT NULL,

    -- Demographics & socioeconomics, as reported at enrolment
    maternal_age_years      smallint CHECK (maternal_age_years BETWEEN 10 AND 60),
    education_level_code    text REFERENCES analytics.ref_education_level,
    profession_code         text REFERENCES analytics.ref_profession,
    husband_profession_code text REFERENCES analytics.ref_profession,
    desired_pregnancy       boolean,
    consanguineous_marriage boolean,

    -- Obstetric history
    previous_cesarean_count            smallint CHECK (previous_cesarean_count >= 0),
    previous_intrauterine_fetal_deaths smallint CHECK (previous_intrauterine_fetal_deaths >= 0),

    -- Antenatal care & morbidity
    gestational_age_at_enrollment_weeks numeric(3,1)
        CHECK (gestational_age_at_enrollment_weeks BETWEEN 0 AND 45),
    mean_systolic_bp       smallint CHECK (mean_systolic_bp BETWEEN 50 AND 260),
    mean_diastolic_bp      smallint CHECK (mean_diastolic_bp BETWEEN 30 AND 160),
    max_proteinuria        text
        CHECK (max_proteinuria IN ('NEGATIVE', 'TRACE', '1+', '2+', '3+', '4+')),
    lowest_hemoglobin_g_dl numeric(3,1) CHECK (lowest_hemoglobin_g_dl BETWEEN 2 AND 20),
    gestational_dm         boolean,
    hiv_status             text CHECK (hiv_status IN ('POSITIVE', 'NEGATIVE', 'NOT_TESTED')),
    syphilis_status        text CHECK (syphilis_status IN ('POSITIVE', 'NEGATIVE', 'NOT_TESTED')),
    hepatitis_c_status     text CHECK (hepatitis_c_status IN ('POSITIVE', 'NEGATIVE', 'NOT_TESTED')),

    -- Derived flags (NULL when the underlying value is unknown)
    is_adolescent            boolean GENERATED ALWAYS AS (maternal_age_years < 18) STORED,
    is_advanced_maternal_age boolean GENERATED ALWAYS AS (maternal_age_years >= 35) STORED,
    is_high_risk_age         boolean GENERATED ALWAYS AS
        (maternal_age_years < 18 OR maternal_age_years >= 35) STORED,
    is_unintended_pregnancy  boolean GENERATED ALWAYS AS (NOT desired_pregnancy) STORED,
    enrolled_first_trimester boolean GENERATED ALWAYS AS
        (gestational_age_at_enrollment_weeks < 14) STORED,
    enrolled_before_12_weeks boolean GENERATED ALWAYS AS
        (gestational_age_at_enrollment_weeks < 12) STORED,
    has_hypertension         boolean GENERATED ALWAYS AS
        (mean_systolic_bp >= 140 OR mean_diastolic_bp >= 90) STORED,
    has_severe_hypertension  boolean GENERATED ALWAYS AS
        (mean_systolic_bp >= 160 OR mean_diastolic_bp >= 110) STORED,
    -- Hypertension plus dipstick proteinuria >= 1+: a screening signal, not a diagnosis.
    has_preeclampsia_signs   boolean GENERATED ALWAYS AS (
        (mean_systolic_bp >= 140 OR mean_diastolic_bp >= 90)
        AND max_proteinuria IN ('1+', '2+', '3+', '4+')) STORED,
    anemia_severity          text GENERATED ALWAYS AS (
        CASE WHEN lowest_hemoglobin_g_dl < 7.0  THEN 'SEVERE'
             WHEN lowest_hemoglobin_g_dl < 10.0 THEN 'MODERATE'
             WHEN lowest_hemoglobin_g_dl < 11.0 THEN 'MILD'
             WHEN lowest_hemoglobin_g_dl IS NOT NULL THEN 'NONE'
        END) STORED,
    tested_positive_sti      boolean GENERATED ALWAYS AS
        ('POSITIVE' IN (hiv_status, syphilis_status, hepatitis_c_status)) STORED,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Zero or one row per pregnancy.
CREATE TABLE analytics.fact_delivery (
    delivery_id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pregnancy_id           bigint NOT NULL UNIQUE
                           REFERENCES analytics.fact_pregnancy ON DELETE CASCADE,
    facility_id            bigint REFERENCES analytics.dim_facility, -- NULL unless at a facility
    attended_by_midwife_id bigint REFERENCES analytics.dim_midwife,
    delivery_date          date NOT NULL,
    place_of_delivery      text NOT NULL
        CHECK (place_of_delivery IN ('FACILITY', 'HOME', 'IN_TRANSIT', 'OTHER')),
    gestational_age_at_birth_weeks numeric(3,1)
        CHECK (gestational_age_at_birth_weeks BETWEEN 20 AND 45),
    delivery_method        text
        CHECK (delivery_method IN ('SPONTANEOUS_VAGINAL', 'ASSISTED_VAGINAL',
                                   'ELECTIVE_CESAREAN', 'EMERGENCY_CESAREAN')),
    number_of_babies       smallint NOT NULL DEFAULT 1 CHECK (number_of_babies BETWEEN 1 AND 8),
    mother_referred_to_higher_care boolean,

    is_preterm  boolean GENERATED ALWAYS AS (gestational_age_at_birth_weeks < 37) STORED,
    is_cesarean boolean GENERATED ALWAYS AS
        (delivery_method IN ('ELECTIVE_CESAREAN', 'EMERGENCY_CESAREAN')) STORED,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (place_of_delivery <> 'FACILITY' OR facility_id IS NOT NULL)
);

-- One row per baby, so twins and stillbirths are counted correctly.
CREATE TABLE analytics.fact_newborn (
    newborn_id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    delivery_id             bigint NOT NULL REFERENCES analytics.fact_delivery ON DELETE CASCADE,
    birth_order             smallint NOT NULL DEFAULT 1 CHECK (birth_order >= 1),
    newborn_sex             text CHECK (newborn_sex IN ('MALE', 'FEMALE', 'INDETERMINATE')),
    vital_status            text NOT NULL
        CHECK (vital_status IN ('LIVE_BIRTH', 'FRESH_STILLBIRTH', 'MACERATED_STILLBIRTH')),
    birth_weight_g          integer CHECK (birth_weight_g BETWEEN 300 AND 6500),
    head_circumference_cm   numeric(3,1) CHECK (head_circumference_cm BETWEEN 18 AND 45),
    breastfeeding_within_1h boolean,
    referred_to_higher_care boolean,

    is_low_birth_weight      boolean GENERATED ALWAYS AS (birth_weight_g < 2500) STORED,
    is_very_low_birth_weight boolean GENERATED ALWAYS AS (birth_weight_g < 1500) STORED,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (delivery_id, birth_order)
);


-- =============================================================================
-- 4. PIPELINE FACTS (offline capture, sync and OCR)
-- =============================================================================

-- One row per photographed form section.
-- Status lifecycle: CAPTURED (on device) -> SYNC_FAILED (retrying) -> PENDING_AI
-- (on server, awaiting OCR) -> NEEDS_REVIEW (midwife must check fields)
-- -> REGISTERED (accepted into the clinical tables) | REJECTED.
CREATE TABLE analytics.fact_document_submission (
    submission_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    source_submission_id   text NOT NULL UNIQUE,
    midwife_id             bigint NOT NULL REFERENCES analytics.dim_midwife,
    pregnancy_id           bigint REFERENCES analytics.fact_pregnancy ON DELETE SET NULL, -- NULL until matched
    document_section       text NOT NULL,
    status                 text NOT NULL
        CHECK (status IN ('CAPTURED', 'SYNC_FAILED', 'PENDING_AI',
                          'NEEDS_REVIEW', 'REGISTERED', 'REJECTED')),
    captured_at            timestamptz NOT NULL, -- device clock; may drift
    synced_at              timestamptz,          -- first received by the server
    ai_completed_at        timestamptz,
    verified_at            timestamptz,
    verified_by_midwife_id bigint REFERENCES analytics.dim_midwife,
    sync_failure_count     integer NOT NULL DEFAULT 0 CHECK (sync_failure_count >= 0),
    ai_confidence_score    numeric(4,3) CHECK (ai_confidence_score BETWEEN 0 AND 1),
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    CHECK ((verified_at IS NULL) = (verified_by_midwife_id IS NULL))
);

-- One row per OCR-extracted field. Values are not copied here (they live in the
-- clinical facts); this table only measures transcription quality.
-- extraction_status is what the AI produced; review_outcome is what the midwife
-- did. Auto-accepted fields later CORRECTED measure the silent OCR error rate.
CREATE TABLE analytics.fact_extracted_field (
    field_id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    submission_id     bigint NOT NULL
                      REFERENCES analytics.fact_document_submission ON DELETE CASCADE,
    field_name        text NOT NULL,
    extraction_status text NOT NULL
        CHECK (extraction_status IN ('AUTO_ACCEPTED', 'NEEDS_REVIEW', 'ILLEGIBLE')),
    review_outcome    text CHECK (review_outcome IN ('CONFIRMED', 'CORRECTED')), -- NULL = not reviewed
    confidence        numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (submission_id, field_name)
);


-- =============================================================================
-- 5. TRIGGERS & INDEXES
-- =============================================================================

CREATE TRIGGER trg_dim_facility_updated_at BEFORE UPDATE ON analytics.dim_facility
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();
CREATE TRIGGER trg_dim_midwife_updated_at BEFORE UPDATE ON analytics.dim_midwife
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();
CREATE TRIGGER trg_fact_pregnancy_updated_at BEFORE UPDATE ON analytics.fact_pregnancy
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();
CREATE TRIGGER trg_fact_delivery_updated_at BEFORE UPDATE ON analytics.fact_delivery
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();
CREATE TRIGGER trg_fact_newborn_updated_at BEFORE UPDATE ON analytics.fact_newborn
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();
CREATE TRIGGER trg_fact_document_submission_updated_at BEFORE UPDATE ON analytics.fact_document_submission
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();
CREATE TRIGGER trg_fact_extracted_field_updated_at BEFORE UPDATE ON analytics.fact_extracted_field
    FOR EACH ROW EXECUTE FUNCTION analytics.set_updated_at();

-- PostgreSQL does not index foreign keys automatically. Lookups by delivery_id on
-- fact_newborn and by submission_id on fact_extracted_field are covered by their
-- UNIQUE constraints.
CREATE INDEX idx_pregnancy_patient            ON analytics.fact_pregnancy (patient_id);
CREATE INDEX idx_pregnancy_midwife_enrolled   ON analytics.fact_pregnancy (midwife_id, enrollment_date);
CREATE INDEX idx_pregnancy_facility_enrolled  ON analytics.fact_pregnancy (facility_id, enrollment_date);
CREATE INDEX idx_delivery_facility_date       ON analytics.fact_delivery (facility_id, delivery_date);
CREATE INDEX idx_delivery_attending_midwife   ON analytics.fact_delivery (attended_by_midwife_id);
CREATE INDEX idx_submission_midwife_captured  ON analytics.fact_document_submission (midwife_id, captured_at);
CREATE INDEX idx_submission_pregnancy         ON analytics.fact_document_submission (pregnancy_id);
-- Small partial index over the open backlog only.
CREATE INDEX idx_submission_open_backlog      ON analytics.fact_document_submission (status, captured_at)
    WHERE status IN ('CAPTURED', 'SYNC_FAILED', 'PENDING_AI', 'NEEDS_REVIEW');


-- =============================================================================
-- 6. ANALYTIC VIEWS (always current, one row per pregnancy / per newborn)
-- =============================================================================

-- Denormalised pregnancy view; replaces the old fact_pregnancy_outcomes table.
CREATE VIEW analytics.v_pregnancy_analytics AS
WITH newborn_summary AS (
    SELECT
        delivery_id,
        COUNT(*)                                             AS newborns_recorded,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH')  AS live_births,
        COUNT(*) FILTER (WHERE vital_status <> 'LIVE_BIRTH') AS stillbirths,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH'
                           AND is_low_birth_weight)          AS low_birth_weight_live_births,
        bool_or(referred_to_higher_care)                     AS any_newborn_referred
    FROM analytics.fact_newborn
    GROUP BY delivery_id
)
SELECT
    p.pregnancy_id,
    p.source_pregnancy_ref,
    pt.patient_original_id,
    m.midwife_code,
    p.facility_id                    AS enrollment_facility_id,
    ef.facility_code                 AS enrollment_facility_code,
    ef.region,
    ef.district,
    p.enrollment_date,

    -- Demographics & socioeconomics
    p.maternal_age_years,
    p.is_adolescent,
    p.is_advanced_maternal_age,
    p.is_high_risk_age,
    p.desired_pregnancy,
    p.is_unintended_pregnancy,
    p.consanguineous_marriage,
    p.education_level_code,
    p.profession_code,
    p.husband_profession_code,
    sev.vulnerability_score          AS socioeconomic_vulnerability_score,
    sev.vulnerability_score >= 2     AS has_socioeconomic_vulnerability,

    -- Obstetric history
    p.previous_cesarean_count,
    p.previous_intrauterine_fetal_deaths,

    -- Antenatal care & morbidity
    p.gestational_age_at_enrollment_weeks,
    p.enrolled_first_trimester,
    p.enrolled_before_12_weeks,
    p.mean_systolic_bp,
    p.mean_diastolic_bp,
    p.max_proteinuria,
    p.has_hypertension,
    p.has_severe_hypertension,
    p.has_preeclampsia_signs,
    p.lowest_hemoglobin_g_dl,
    p.anemia_severity,
    p.gestational_dm,
    p.hiv_status,
    p.syphilis_status,
    p.hepatitis_c_status,
    p.tested_positive_sti,

    -- Delivery
    d.delivery_id IS NOT NULL        AS has_delivery_record,
    d.delivery_id,
    d.delivery_date,
    d.place_of_delivery,
    d.facility_id                    AS delivery_facility_id,
    df.facility_code                 AS delivery_facility_code,
    d.gestational_age_at_birth_weeks,
    d.is_preterm,
    d.delivery_method,
    d.is_cesarean,
    d.is_cesarean AND p.previous_cesarean_count = 0 AS is_primary_cesarean,
    d.is_cesarean AND p.previous_cesarean_count > 0 AS is_repeat_cesarean,
    d.number_of_babies,
    d.mother_referred_to_higher_care,

    -- Newborns, pre-aggregated per delivery so this view keeps one row per pregnancy
    COALESCE(n.newborns_recorded, 0)            AS newborns_recorded,
    COALESCE(n.live_births, 0)                  AS live_births,
    COALESCE(n.stillbirths, 0)                  AS stillbirths,
    COALESCE(n.low_birth_weight_live_births, 0) AS low_birth_weight_live_births,
    d.mother_referred_to_higher_care OR n.any_newborn_referred AS any_referral_to_higher_care
FROM analytics.fact_pregnancy p
JOIN analytics.dim_patient  pt ON pt.patient_id  = p.patient_id
JOIN analytics.dim_midwife  m  ON m.midwife_id   = p.midwife_id
JOIN analytics.dim_facility ef ON ef.facility_id = p.facility_id
LEFT JOIN analytics.ref_education_level edu ON edu.education_level_code = p.education_level_code
LEFT JOIN analytics.ref_profession      wp  ON wp.profession_code = p.profession_code
LEFT JOIN analytics.ref_profession      hp  ON hp.profession_code = p.husband_profession_code
-- Socioeconomic vulnerability score (0-3): one point each for low literacy, the
-- woman without stable income, and the husband without stable income. NULL when
-- none of the three is known.
CROSS JOIN LATERAL (
    SELECT CASE
        WHEN edu.is_low_literacy IS NULL
         AND wp.has_stable_income IS NULL
         AND hp.has_stable_income IS NULL THEN NULL
        ELSE COALESCE(edu.is_low_literacy::int, 0)
           + COALESCE((NOT wp.has_stable_income)::int, 0)
           + COALESCE((NOT hp.has_stable_income)::int, 0)
    END AS vulnerability_score
) sev
LEFT JOIN analytics.fact_delivery d  ON d.pregnancy_id = p.pregnancy_id
LEFT JOIN analytics.dim_facility  df ON df.facility_id = d.facility_id
LEFT JOIN newborn_summary         n  ON n.delivery_id  = d.delivery_id;

-- One row per baby, with the maternal risk factors needed for correlation.
CREATE VIEW analytics.v_newborn_analytics AS
SELECT
    n.newborn_id,
    n.delivery_id,
    d.pregnancy_id,
    m.midwife_code,
    p.facility_id                    AS enrollment_facility_id,
    ef.facility_code                 AS enrollment_facility_code,
    ef.region,
    ef.district,
    df.facility_code                 AS delivery_facility_code,
    d.delivery_date,
    d.place_of_delivery,
    d.delivery_method,
    d.gestational_age_at_birth_weeks,
    d.is_preterm,
    d.number_of_babies > 1           AS is_multiple_birth,
    n.birth_order,
    n.newborn_sex,
    n.vital_status,
    n.birth_weight_g,
    n.is_low_birth_weight,
    n.is_very_low_birth_weight,
    -- Below the 10th centile for sex and completed week; NULL when weight, sex,
    -- gestational age or the reference row is missing.
    n.birth_weight_g < c.p10_birth_weight_g AS is_small_for_gestational_age,
    n.head_circumference_cm,
    n.breastfeeding_within_1h,
    n.referred_to_higher_care,

    -- Maternal risk factors
    p.is_high_risk_age,
    p.has_hypertension,
    p.has_preeclampsia_signs,
    p.anemia_severity,
    p.gestational_dm,
    p.tested_positive_sti
FROM analytics.fact_newborn n
JOIN analytics.fact_delivery  d  ON d.delivery_id  = n.delivery_id
JOIN analytics.fact_pregnancy p  ON p.pregnancy_id = d.pregnancy_id
JOIN analytics.dim_midwife    m  ON m.midwife_id   = p.midwife_id
JOIN analytics.dim_facility   ef ON ef.facility_id = p.facility_id
LEFT JOIN analytics.dim_facility df ON df.facility_id = d.facility_id
LEFT JOIN analytics.ref_birth_weight_centile c
       ON c.newborn_sex      = n.newborn_sex
      AND c.gestational_week = floor(d.gestational_age_at_birth_weeks);


-- =============================================================================
-- 7. MATERIALIZED VIEWS FOR BI (refresh with analytics.refresh_reporting_views())
-- =============================================================================
-- All of them hold counts with their denominators. Compute rates in the BI tool
-- as SUM(numerator) / SUM(denominator) so they roll up correctly. Medians are
-- only valid at the grain shown and must not be averaged.

-- Community health indicators by the facility where the woman enrolled.
CREATE MATERIALIZED VIEW analytics.mv_regional_health_indicators AS
WITH pregnancy_counts AS (
    SELECT
        enrollment_facility_id                                   AS facility_id,
        COUNT(*)                                                 AS pregnancies,

        -- Demographics
        COUNT(maternal_age_years)                                AS age_recorded,
        COUNT(*) FILTER (WHERE is_adolescent)                    AS adolescent_pregnancies,
        COUNT(*) FILTER (WHERE is_advanced_maternal_age)         AS advanced_maternal_age_pregnancies,
        COUNT(desired_pregnancy)                                 AS intent_recorded,
        COUNT(*) FILTER (WHERE is_unintended_pregnancy)          AS unintended_pregnancies,
        COUNT(consanguineous_marriage)                           AS consanguinity_recorded,
        COUNT(*) FILTER (WHERE consanguineous_marriage)          AS consanguineous_marriages,
        COUNT(socioeconomic_vulnerability_score)                 AS socioeconomic_recorded,
        COUNT(*) FILTER (WHERE has_socioeconomic_vulnerability)  AS socioeconomically_vulnerable,

        -- Antenatal engagement
        COUNT(gestational_age_at_enrollment_weeks)               AS enrollment_ga_recorded,
        COUNT(*) FILTER (WHERE enrolled_first_trimester)         AS enrolled_first_trimester,
        COUNT(*) FILTER (WHERE enrolled_before_12_weeks)         AS enrolled_before_12_weeks,
        percentile_cont(0.5) WITHIN GROUP
            (ORDER BY gestational_age_at_enrollment_weeks)       AS median_enrollment_ga_weeks,

        -- Morbidity (denominator = women with the measurement or test)
        COUNT(*) FILTER (WHERE mean_systolic_bp IS NOT NULL
                            OR mean_diastolic_bp IS NOT NULL)    AS bp_recorded,
        COUNT(*) FILTER (WHERE has_hypertension)                 AS hypertension,
        COUNT(*) FILTER (WHERE has_severe_hypertension)          AS severe_hypertension,
        COUNT(*) FILTER (WHERE has_preeclampsia_signs)           AS preeclampsia_signs,
        COUNT(lowest_hemoglobin_g_dl)                            AS hemoglobin_recorded,
        COUNT(*) FILTER (WHERE anemia_severity = 'SEVERE')       AS severe_anemia,
        COUNT(*) FILTER (WHERE anemia_severity IN ('MODERATE', 'SEVERE')) AS moderate_or_severe_anemia,
        COUNT(gestational_dm)                                    AS gdm_recorded,
        COUNT(*) FILTER (WHERE gestational_dm)                   AS gestational_diabetes,
        COUNT(*) FILTER (WHERE hiv_status IN ('POSITIVE', 'NEGATIVE'))         AS hiv_tested,
        COUNT(*) FILTER (WHERE hiv_status = 'POSITIVE')                        AS hiv_positive,
        COUNT(*) FILTER (WHERE syphilis_status IN ('POSITIVE', 'NEGATIVE'))    AS syphilis_tested,
        COUNT(*) FILTER (WHERE syphilis_status = 'POSITIVE')                   AS syphilis_positive,
        COUNT(*) FILTER (WHERE hepatitis_c_status IN ('POSITIVE', 'NEGATIVE')) AS hepatitis_c_tested,
        COUNT(*) FILTER (WHERE hepatitis_c_status = 'POSITIVE')                AS hepatitis_c_positive,

        -- Delivery outcomes vs. obstetric history
        COUNT(*) FILTER (WHERE has_delivery_record)              AS deliveries,
        COUNT(*) FILTER (WHERE is_preterm)                       AS preterm_deliveries,
        COUNT(*) FILTER (WHERE is_cesarean)                      AS cesarean_deliveries,
        COUNT(*) FILTER (WHERE has_delivery_record
                           AND previous_cesarean_count = 0)      AS deliveries_without_prior_cesarean,
        COUNT(*) FILTER (WHERE is_primary_cesarean)              AS primary_cesareans,
        COUNT(*) FILTER (WHERE has_delivery_record
                           AND previous_cesarean_count > 0)      AS deliveries_after_prior_cesarean,
        COUNT(*) FILTER (WHERE is_repeat_cesarean)               AS repeat_cesareans,
        COUNT(*) FILTER (WHERE has_delivery_record
                           AND previous_intrauterine_fetal_deaths > 0) AS deliveries_after_prior_stillbirth,
        COUNT(*) FILTER (WHERE is_cesarean
                           AND previous_intrauterine_fetal_deaths > 0) AS cesareans_after_prior_stillbirth,
        COALESCE(SUM(stillbirths) FILTER (WHERE previous_intrauterine_fetal_deaths > 0), 0)
                                                                 AS stillbirths_after_prior_stillbirth
    FROM analytics.v_pregnancy_analytics
    GROUP BY enrollment_facility_id
),
newborn_counts AS (
    SELECT
        enrollment_facility_id                                   AS facility_id,
        COUNT(*)                                                 AS newborns,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH')      AS live_births,
        COUNT(*) FILTER (WHERE vital_status <> 'LIVE_BIRTH')     AS stillbirths,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH'
                           AND birth_weight_g IS NOT NULL)       AS live_births_weighed,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH'
                           AND is_low_birth_weight)              AS low_birth_weight,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH'
                           AND is_very_low_birth_weight)         AS very_low_birth_weight,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH'
                           AND is_small_for_gestational_age IS NOT NULL) AS sga_assessable,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH'
                           AND is_small_for_gestational_age)     AS small_for_gestational_age,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH'
                           AND breastfeeding_within_1h IS NOT NULL) AS breastfeeding_recorded,
        COUNT(*) FILTER (WHERE vital_status = 'LIVE_BIRTH'
                           AND breastfeeding_within_1h)          AS breastfed_within_1h,
        COUNT(*) FILTER (WHERE referred_to_higher_care)          AS newborns_referred
    FROM analytics.v_newborn_analytics
    GROUP BY enrollment_facility_id
)
SELECT
    f.region,
    f.district,
    f.facility_code,
    pc.*,
    COALESCE(nc.newborns, 0)                  AS newborns,
    COALESCE(nc.live_births, 0)               AS live_births,
    COALESCE(nc.stillbirths, 0)               AS stillbirths,
    COALESCE(nc.live_births_weighed, 0)       AS live_births_weighed,
    COALESCE(nc.low_birth_weight, 0)          AS low_birth_weight,
    COALESCE(nc.very_low_birth_weight, 0)     AS very_low_birth_weight,
    COALESCE(nc.sga_assessable, 0)            AS sga_assessable,
    COALESCE(nc.small_for_gestational_age, 0) AS small_for_gestational_age,
    COALESCE(nc.breastfeeding_recorded, 0)    AS breastfeeding_recorded,
    COALESCE(nc.breastfed_within_1h, 0)       AS breastfed_within_1h,
    COALESCE(nc.newborns_referred, 0)         AS newborns_referred
FROM pregnancy_counts pc
JOIN analytics.dim_facility f ON f.facility_id = pc.facility_id
LEFT JOIN newborn_counts nc   ON nc.facility_id = pc.facility_id;

CREATE UNIQUE INDEX idx_mv_regional_health ON analytics.mv_regional_health_indicators (facility_id);

-- Delivery outcomes and referrals by where the birth happened, alongside each
-- facility's EmONC capability, to find sites that refer often because they lack
-- surgical capacity. Home and in-transit births are attributed to the woman's
-- enrolment facility (its catchment), split out by place_of_delivery.
CREATE MATERIALIZED VIEW analytics.mv_facility_delivery_outcomes AS
SELECT
    f.facility_id,
    f.facility_code,
    f.facility_name,
    f.region,
    f.district,
    f.facility_level,
    f.emonc_level,
    f.travel_time_to_referral_min,
    v.place_of_delivery,
    COUNT(*)                                                     AS deliveries,
    COUNT(*) FILTER (WHERE v.is_cesarean)                        AS cesareans,
    COUNT(*) FILTER (WHERE v.delivery_method = 'EMERGENCY_CESAREAN') AS emergency_cesareans,
    COUNT(*) FILTER (WHERE v.is_preterm)                         AS preterm_deliveries,
    COUNT(*) FILTER (WHERE v.mother_referred_to_higher_care)     AS maternal_referrals,
    COUNT(*) FILTER (WHERE v.any_referral_to_higher_care)        AS deliveries_with_any_referral,
    SUM(v.live_births)                                           AS live_births,
    SUM(v.stillbirths)                                           AS stillbirths
FROM analytics.v_pregnancy_analytics v
JOIN analytics.dim_facility f
  ON f.facility_id = COALESCE(v.delivery_facility_id, v.enrollment_facility_id)
WHERE v.has_delivery_record
GROUP BY f.facility_id, v.place_of_delivery;

CREATE UNIQUE INDEX idx_mv_facility_delivery
    ON analytics.mv_facility_delivery_outcomes (facility_id, place_of_delivery);

-- Daily OCR quality and pipeline status by form section. Field counts are
-- pre-aggregated per submission, so each submission is counted once.
-- Dates are bucketed in UTC; change 'UTC' to the country's time zone.
CREATE MATERIALIZED VIEW analytics.mv_ocr_extraction_quality AS
WITH field_summary AS (
    SELECT
        submission_id,
        COUNT(*)                                                     AS fields,
        COUNT(*) FILTER (WHERE extraction_status = 'ILLEGIBLE')      AS illegible_fields,
        COUNT(*) FILTER (WHERE extraction_status = 'NEEDS_REVIEW')   AS needs_review_fields,
        COUNT(*) FILTER (WHERE extraction_status = 'AUTO_ACCEPTED')  AS auto_accepted_fields,
        COUNT(*) FILTER (WHERE extraction_status = 'AUTO_ACCEPTED'
                           AND review_outcome IS NOT NULL)           AS auto_accepted_reviewed,
        COUNT(*) FILTER (WHERE extraction_status = 'AUTO_ACCEPTED'
                           AND review_outcome = 'CORRECTED')         AS auto_accepted_corrected,
        SUM(confidence)                                              AS confidence_sum,
        COUNT(confidence)                                            AS confidence_n
    FROM analytics.fact_extracted_field
    GROUP BY submission_id
)
SELECT
    (s.captured_at AT TIME ZONE 'UTC')::date                     AS capture_date,
    s.document_section,
    COUNT(*)                                                     AS submissions,

    -- Current status distribution
    COUNT(*) FILTER (WHERE s.status = 'CAPTURED')                AS status_captured,
    COUNT(*) FILTER (WHERE s.status = 'SYNC_FAILED')             AS status_sync_failed,
    COUNT(*) FILTER (WHERE s.status = 'PENDING_AI')              AS status_pending_ai,
    COUNT(*) FILTER (WHERE s.status = 'NEEDS_REVIEW')            AS status_needs_review,
    COUNT(*) FILTER (WHERE s.status = 'REGISTERED')              AS status_registered,
    COUNT(*) FILTER (WHERE s.status = 'REJECTED')                AS status_rejected,
    SUM(s.sync_failure_count)                                    AS sync_failures,
    percentile_cont(0.5) WITHIN GROUP
        (ORDER BY EXTRACT(epoch FROM s.synced_at - s.captured_at) / 3600) AS median_sync_delay_hours,

    -- Document-level AI confidence (weight by _n when rolling up)
    AVG(s.ai_confidence_score)                                   AS avg_document_confidence,
    COUNT(s.ai_confidence_score)                                 AS document_confidence_n,

    -- Field-level transcription quality
    COALESCE(SUM(fs.fields), 0)                                  AS fields,
    COALESCE(SUM(fs.illegible_fields), 0)                        AS illegible_fields,
    COALESCE(SUM(fs.needs_review_fields), 0)                     AS needs_review_fields,
    COALESCE(SUM(fs.auto_accepted_fields), 0)                    AS auto_accepted_fields,
    COALESCE(SUM(fs.auto_accepted_reviewed), 0)                  AS auto_accepted_reviewed,
    COALESCE(SUM(fs.auto_accepted_corrected), 0)                 AS auto_accepted_corrected,
    SUM(fs.confidence_sum) / NULLIF(SUM(fs.confidence_n), 0)     AS avg_field_confidence,
    COALESCE(SUM(fs.confidence_n), 0)                            AS field_confidence_n
FROM analytics.fact_document_submission s
LEFT JOIN field_summary fs ON fs.submission_id = s.submission_id
GROUP BY 1, 2;

CREATE UNIQUE INDEX idx_mv_ocr_quality
    ON analytics.mv_ocr_extraction_quality (capture_date, document_section);

-- Monthly workload, verification and sync reliability per midwife; replaces the
-- old dim_midwife_performance table so it can never drift from the facts.
CREATE MATERIALIZED VIEW analytics.mv_midwife_monthly_performance AS
WITH enrollments AS (
    SELECT
        midwife_id,
        date_trunc('month', enrollment_date)::date AS report_month,
        COUNT(*)                                   AS pregnancies_enrolled
    FROM analytics.fact_pregnancy
    GROUP BY 1, 2
),
deliveries AS (
    SELECT
        COALESCE(d.attended_by_midwife_id, p.midwife_id) AS midwife_id,
        date_trunc('month', d.delivery_date)::date       AS report_month,
        COUNT(*)                                         AS deliveries_recorded
    FROM analytics.fact_delivery d
    JOIN analytics.fact_pregnancy p ON p.pregnancy_id = d.pregnancy_id
    GROUP BY 1, 2
),
documents AS (
    SELECT
        midwife_id,
        date_trunc('month', captured_at AT TIME ZONE 'UTC')::date AS report_month,
        COUNT(*)                                                  AS documents_captured,
        COUNT(*) FILTER (WHERE verified_at IS NOT NULL)           AS documents_verified,
        COUNT(*) FILTER (WHERE status IN ('CAPTURED', 'SYNC_FAILED',
                                          'PENDING_AI', 'NEEDS_REVIEW')) AS documents_open,
        COUNT(*) FILTER (WHERE status = 'SYNC_FAILED')            AS documents_sync_failed,
        SUM(sync_failure_count)                                   AS sync_failures,
        percentile_cont(0.5) WITHIN GROUP
            (ORDER BY EXTRACT(epoch FROM synced_at - captured_at) / 3600)     AS median_sync_delay_hours,
        percentile_cont(0.5) WITHIN GROUP
            (ORDER BY EXTRACT(epoch FROM ai_completed_at - synced_at) / 3600) AS median_ai_delay_hours
    FROM analytics.fact_document_submission
    GROUP BY 1, 2
),
midwife_months AS (
    SELECT midwife_id, report_month FROM enrollments
    UNION
    SELECT midwife_id, report_month FROM deliveries
    UNION
    SELECT midwife_id, report_month FROM documents
)
SELECT
    m.midwife_id,
    m.midwife_code,
    hf.facility_code                       AS home_facility_code,
    hf.region,
    hf.district,
    k.report_month,
    COALESCE(e.pregnancies_enrolled, 0)    AS pregnancies_enrolled,
    COALESCE(dl.deliveries_recorded, 0)    AS deliveries_recorded,
    COALESCE(doc.documents_captured, 0)    AS documents_captured,
    COALESCE(doc.documents_verified, 0)    AS documents_verified,
    COALESCE(doc.documents_open, 0)        AS documents_open,
    COALESCE(doc.documents_sync_failed, 0) AS documents_sync_failed,
    COALESCE(doc.sync_failures, 0)         AS sync_failures,
    doc.median_sync_delay_hours,
    doc.median_ai_delay_hours
FROM midwife_months k
JOIN analytics.dim_midwife m        ON m.midwife_id = k.midwife_id
LEFT JOIN analytics.dim_facility hf ON hf.facility_id = m.home_facility_id
LEFT JOIN enrollments e   ON e.midwife_id   = k.midwife_id AND e.report_month   = k.report_month
LEFT JOIN deliveries  dl  ON dl.midwife_id  = k.midwife_id AND dl.report_month  = k.report_month
LEFT JOIN documents   doc ON doc.midwife_id = k.midwife_id AND doc.report_month = k.report_month;

CREATE UNIQUE INDEX idx_mv_midwife_monthly
    ON analytics.mv_midwife_monthly_performance (midwife_id, report_month);


-- =============================================================================
-- 8. PUBLIC RELEASE VIEW (small-cell suppression)
-- =============================================================================
-- Counts from 1 to 4 are blanked so individual women cannot be identified in
-- small catchments. This is primary suppression only: a blanked cell can
-- sometimes be recovered by subtracting from a total, so review cross-tabs
-- before release. Grant external users access to this view, not the tables.
CREATE FUNCTION analytics.suppress_small_count(n numeric, min_cell integer DEFAULT 5)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN n > 0 AND n < min_cell THEN NULL ELSE n END
$$;

CREATE VIEW analytics.v_regional_health_indicators_public AS
SELECT
    region,
    district,
    facility_code,
    analytics.suppress_small_count(pregnancies)                        AS pregnancies,
    analytics.suppress_small_count(age_recorded)                       AS age_recorded,
    analytics.suppress_small_count(adolescent_pregnancies)             AS adolescent_pregnancies,
    analytics.suppress_small_count(advanced_maternal_age_pregnancies)  AS advanced_maternal_age_pregnancies,
    analytics.suppress_small_count(intent_recorded)                    AS intent_recorded,
    analytics.suppress_small_count(unintended_pregnancies)             AS unintended_pregnancies,
    analytics.suppress_small_count(consanguinity_recorded)             AS consanguinity_recorded,
    analytics.suppress_small_count(consanguineous_marriages)           AS consanguineous_marriages,
    analytics.suppress_small_count(socioeconomic_recorded)             AS socioeconomic_recorded,
    analytics.suppress_small_count(socioeconomically_vulnerable)       AS socioeconomically_vulnerable,
    analytics.suppress_small_count(enrollment_ga_recorded)             AS enrollment_ga_recorded,
    analytics.suppress_small_count(enrolled_first_trimester)           AS enrolled_first_trimester,
    analytics.suppress_small_count(enrolled_before_12_weeks)           AS enrolled_before_12_weeks,
    CASE WHEN enrollment_ga_recorded >= 5 THEN median_enrollment_ga_weeks END AS median_enrollment_ga_weeks,
    analytics.suppress_small_count(bp_recorded)                        AS bp_recorded,
    analytics.suppress_small_count(hypertension)                       AS hypertension,
    analytics.suppress_small_count(severe_hypertension)                AS severe_hypertension,
    analytics.suppress_small_count(preeclampsia_signs)                 AS preeclampsia_signs,
    analytics.suppress_small_count(hemoglobin_recorded)                AS hemoglobin_recorded,
    analytics.suppress_small_count(severe_anemia)                      AS severe_anemia,
    analytics.suppress_small_count(moderate_or_severe_anemia)          AS moderate_or_severe_anemia,
    analytics.suppress_small_count(gdm_recorded)                       AS gdm_recorded,
    analytics.suppress_small_count(gestational_diabetes)               AS gestational_diabetes,
    analytics.suppress_small_count(hiv_tested)                         AS hiv_tested,
    analytics.suppress_small_count(hiv_positive)                       AS hiv_positive,
    analytics.suppress_small_count(syphilis_tested)                    AS syphilis_tested,
    analytics.suppress_small_count(syphilis_positive)                  AS syphilis_positive,
    analytics.suppress_small_count(hepatitis_c_tested)                 AS hepatitis_c_tested,
    analytics.suppress_small_count(hepatitis_c_positive)               AS hepatitis_c_positive,
    analytics.suppress_small_count(deliveries)                         AS deliveries,
    analytics.suppress_small_count(preterm_deliveries)                 AS preterm_deliveries,
    analytics.suppress_small_count(cesarean_deliveries)                AS cesarean_deliveries,
    analytics.suppress_small_count(deliveries_without_prior_cesarean)  AS deliveries_without_prior_cesarean,
    analytics.suppress_small_count(primary_cesareans)                  AS primary_cesareans,
    analytics.suppress_small_count(deliveries_after_prior_cesarean)    AS deliveries_after_prior_cesarean,
    analytics.suppress_small_count(repeat_cesareans)                   AS repeat_cesareans,
    analytics.suppress_small_count(deliveries_after_prior_stillbirth)  AS deliveries_after_prior_stillbirth,
    analytics.suppress_small_count(cesareans_after_prior_stillbirth)   AS cesareans_after_prior_stillbirth,
    analytics.suppress_small_count(stillbirths_after_prior_stillbirth) AS stillbirths_after_prior_stillbirth,
    analytics.suppress_small_count(newborns)                           AS newborns,
    analytics.suppress_small_count(live_births)                        AS live_births,
    analytics.suppress_small_count(stillbirths)                        AS stillbirths,
    analytics.suppress_small_count(live_births_weighed)                AS live_births_weighed,
    analytics.suppress_small_count(low_birth_weight)                   AS low_birth_weight,
    analytics.suppress_small_count(very_low_birth_weight)              AS very_low_birth_weight,
    analytics.suppress_small_count(sga_assessable)                     AS sga_assessable,
    analytics.suppress_small_count(small_for_gestational_age)          AS small_for_gestational_age,
    analytics.suppress_small_count(breastfeeding_recorded)             AS breastfeeding_recorded,
    analytics.suppress_small_count(breastfed_within_1h)                AS breastfed_within_1h,
    analytics.suppress_small_count(newborns_referred)                  AS newborns_referred
FROM analytics.mv_regional_health_indicators;


-- =============================================================================
-- 9. REFRESH
-- =============================================================================
-- Refreshes every reporting view without blocking BI readers. Run after each load:
--   SELECT analytics.refresh_reporting_views();
CREATE FUNCTION analytics.refresh_reporting_views() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_regional_health_indicators;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_facility_delivery_outcomes;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_ocr_extraction_quality;
    REFRESH MATERIALIZED VIEW CONCURRENTLY analytics.mv_midwife_monthly_performance;
END;
$$;

COMMIT;
