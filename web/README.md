# Maternal Health Atlas

A web dashboard for the midwife census. It reads the aggregate views from
`sql/analytics_schema.sql` in Supabase and shows:

- **Regions:** a world map where each region is coloured by concern level. Select a
  marker to see why the region was flagged, then open its detail page. Beside the map
  are national totals and a card per region with its headline indicators.
- **Region details:** every flagged indicator with its count, flag level and
  rationale; all indicators by domain; monthly activity; a sortable facility table.
- **Data capture:** the paper-to-digital pipeline. Where each form section is, OCR
  confidence, illegible fields, sync failures, and verification by midwife.

It can get its data two ways:

- **Through n8n** (recommended for running on your own machine): an n8n workflow reads
  Supabase and the app fetches one JSON response from it. See `../n8n/README.md`.
- **Directly from Supabase**, with each analyst signing in. See "Connect Supabase" below.

With neither configured it runs on generated demo data, labelled "Demo data" in the
top bar.

## Run it

```bash
cd web
npm install
npm run dev        # http://localhost:5173, demo data
```

To use your data, copy `.env.example` to `.env` and set either `VITE_DATA_URL`
(n8n) or the Supabase URL and anon key, then restart `npm run dev`.

`npm run build` writes a static site to `dist/`. It uses hash routing and relative
paths, so any static host works (Netlify, Vercel, S3, a ministry web server) with no
rewrite rules.

## Connect Supabase

1. Run `sql/analytics_schema.sql`, then `sql/002_dashboard_access.sql`, in the SQL editor.
2. Project Settings → Data API → **Exposed schemas**: add `analytics`.
3. Authentication → Sign In / Providers: turn off **Allow new users to sign up**, then
   invite each analyst from Authentication → Users. The views are granted to every
   signed-in user and never to the public anon key.
4. Add one row to `analytics.ref_region` for each region name used in
   `analytics.dim_facility.region`, with its centre point:

   ```sql
   INSERT INTO analytics.ref_region (region, country_name, latitude, longitude)
   VALUES ('Kano', 'Nigeria', 12.0022, 8.5920);
   ```

   Regions without a row still appear in the lists, just not on the map.
5. Refresh the views after each load: `SELECT analytics.refresh_reporting_views();`
   (`002_dashboard_access.sql` shows how to schedule this with pg_cron).

## How a region gets flagged

The rules are in `src/lib/concern.ts`. Each indicator is a rate built from a
numerator and denominator in the views, for example low birth weight = live births
under 2,500 g ÷ live births weighed. Rates are summed from facility counts first, so
regional figures are exact rather than averages of averages.

- An indicator is **flagged** past its flag level, and **severe** past a second,
  stricter level. Each one cites where its level comes from (WHO, UNAIDS, the Every
  Newborn Action Plan) or says it is a programme default.
- Rates on fewer than 30 records are shown but never flagged (`MIN_DENOMINATOR`).
- A region is **high concern** with any severe indicator or three or more flagged
  ones, and **elevated** with one or two.

Change a level in `concern.ts` and the map, cards, region pages and facility table
all follow.

## Layout

```
src/
  lib/types.ts        row types for each analytics view
  lib/api.ts          loads every view from n8n, or from Supabase (paging past its 1,000-row cap)
  lib/aggregate.ts    sums facility rows into regions and national totals
  lib/concern.ts      indicators, flag levels and region assessment
  lib/demoData.ts     generated sample data for running without a database
  components/         map, popup, sidebar, charts, tables
  pages/              Regions, Region details, Data capture
```
