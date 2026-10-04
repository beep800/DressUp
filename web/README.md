# Maternal Health Atlas

A web dashboard for the midwife census. It reads your existing census tables
(`patient_identification`, `current_pregnancy`, `obstetric_history`,
`medical_family_history`, `delivery`, `postpartum_newborn`, `document_submissions`,
`fields`) through an n8n workflow, and shows:

- **Regions:** a world map with one marker per town, worked out from the women's
  addresses and coloured by concern level. Select a marker to see why the area was
  flagged, then open its detail page. Beside the map are overall totals and a card per
  area with its headline indicators.
- **Region details:** every flagged indicator with its count, flag level and
  rationale; all indicators by domain; caesarean and preterm rates for women with and
  without a previous stillbirth; education and profession answers; women registered
  per month; a sortable table of midwives.
- **Data capture:** the paper-to-digital pipeline. Where each form is, OCR confidence,
  illegible fields, how often midwives correct the OCR, sync failures, and
  verification by midwife.

Nothing is added to the database. Without n8n configured the app runs on generated
demo data, labelled "Demo data" in the top bar.

## Run it

```bash
cd web
npm install
npm run dev        # http://localhost:5173, demo data
```

To use your data, follow `../n8n/README.md`: import the workflow into n8n and set
`VITE_DATA_URL`, `N8N_URL` and `N8N_KEY` in `.env`.

`npm run build` writes a static site to `dist/`, and `npm run preview` serves it on
http://localhost:4173 with the same n8n proxy.

## Where the numbers come from

The n8n workflow places each woman's address in a town
(`../n8n/geocode_addresses.js`). It then counts, for each town and midwife, how many
women have each measurement recorded and how many of those cross a clinical
threshold, for example women with haemoglobin recorded and women under 10 g/dL
(`../n8n/dashboard_query.sql`). It sends counts and town positions only. The app sums
each town's counts across midwives and only then works out rates, so figures are exact
rather than averages of averages.

Not available from the current tables, so not shown: stillbirths in this delivery
(no outcome column), whether breastfeeding started within the first hour (the form
records only whether it started), and small-for-gestational-age (needs newborn sex
coding and a growth reference).

## How a region gets flagged

The rules are in `src/lib/concern.ts`.

- An indicator is **flagged** past its flag level, and **severe** past a second,
  stricter level. Each one cites where its level comes from (WHO, UNAIDS) or says it
  is a programme default.
- Rates on fewer than 30 records are shown but never flagged (`MIN_DENOMINATOR`).
- A region is **high concern** with any severe indicator or three or more flagged
  ones, and **elevated** with one or two.

Change a level in `concern.ts` and the map, cards, region pages and midwife tables
all follow.

## Layout

```
src/
  lib/types.ts         shape of the JSON the n8n workflow returns
  lib/api.ts           fetches the workflow's JSON
  lib/aggregate.ts     sums counts into areas and overall totals
  lib/concern.ts       indicators, flag levels and region assessment
  lib/demoData.ts      generated sample data for running without n8n
  components/          map, popup, sidebar, charts, tables
  pages/               Regions, Region details, Data capture
```
