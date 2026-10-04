-- =============================================================================
-- Dashboard access for the Maternal Health Atlas web app (run after
-- analytics_schema.sql)
-- =============================================================================
-- Two Supabase settings that SQL cannot change:
--   1. Project Settings -> Data API -> Exposed schemas: add "analytics".
--   2. Authentication -> Sign In / Providers: turn off "Allow new users to sign up",
--      then invite each analyst from Authentication -> Users. Every signed-in user
--      can read the dashboard views, so sign-ups must be closed.
-- =============================================================================

BEGIN;

-- Map position for each value of analytics.dim_facility.region. Regions without
-- a row still appear in the dashboard's lists, just not on the map.
CREATE TABLE analytics.ref_region (
    region       text PRIMARY KEY,
    country_name text NOT NULL,
    latitude     numeric(8,5) NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude    numeric(8,5) NOT NULL CHECK (longitude BETWEEN -180 AND 180)
);

-- The anon key ships inside the web app, so anon gets nothing. Signed-in users
-- can read the aggregate views only; patient-level tables, views and functions
-- stay out of reach of the API.
REVOKE ALL ON ALL TABLES IN SCHEMA analytics FROM anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA analytics FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA analytics TO authenticated;
GRANT SELECT ON
    analytics.ref_region,
    analytics.mv_regional_health_indicators,
    analytics.mv_facility_delivery_outcomes,
    analytics.mv_midwife_monthly_performance,
    analytics.mv_ocr_extraction_quality
TO authenticated;

COMMIT;

-- These grants cover objects that exist now. Re-run the REVOKE lines after adding
-- new tables or functions to the analytics schema.
--
-- The dashboard shows whatever the materialized views held at their last refresh.
-- Refresh after each load, or hourly with pg_cron (Database -> Extensions):
--   SELECT cron.schedule('refresh-analytics', '15 * * * *',
--                        'SELECT analytics.refresh_reporting_views()');
