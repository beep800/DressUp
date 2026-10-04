-- =============================================================================
-- Database login for n8n (run after 002_dashboard_access.sql)
-- =============================================================================
-- n8n reads the dashboard views and refreshes them on a schedule. It gets its own
-- role so it can do exactly that and nothing else: no patient-level tables, no
-- writes. Replace the password before running.
-- =============================================================================

BEGIN;

CREATE ROLE n8n_dashboard LOGIN PASSWORD 'replace-with-a-long-random-password';

GRANT USAGE ON SCHEMA analytics TO n8n_dashboard;
GRANT SELECT ON
    analytics.ref_region,
    analytics.mv_regional_health_indicators,
    analytics.mv_facility_delivery_outcomes,
    analytics.mv_midwife_monthly_performance,
    analytics.mv_ocr_extraction_quality
TO n8n_dashboard;

-- Refreshing a materialized view needs its owner's rights. Running the refresh
-- function as its owner lets n8n trigger refreshes without owning the views.
ALTER FUNCTION analytics.refresh_reporting_views()
    SECURITY DEFINER
    SET search_path = analytics, pg_temp;
GRANT EXECUTE ON FUNCTION analytics.refresh_reporting_views() TO n8n_dashboard;

COMMIT;

-- Connect n8n through the Supabase session pooler (Connect button -> Session pooler).
-- The pooler expects the user name with the project ref appended:
--   user: n8n_dashboard.<project-ref>
