# Serving the dashboard through n8n

```
Census database ──► n8n workflow ──► https://<your-name>.app.n8n.cloud/webhook/maternal-health-atlas
                                                     ▲  (needs the dashboard key)
Browser ──► http://localhost:5173 (Vite) ── /n8n/… proxy, adds the key
```

The workflow reads the tables you already have and never writes to them:

1. **Read addresses** reads each woman's `address`.
2. **Geocode addresses** (`geocode_addresses.js`) turns each address into a town on the
   map, using OpenStreetMap's geocoder. Each address is looked up once and remembered.
3. **Read census tables** (`dashboard_query.sql`) counts, for each town and midwife,
   how many women have each measurement recorded and how many cross a clinical
   threshold.
4. The dashboard receives those counts and the towns' positions, never individual
   patient rows or addresses.

Each town becomes a region on the dashboard's map. Everything is computed live on
each page load.

The web app runs on your computer and fetches those totals through Vite's proxy. The
proxy adds a secret key to each request. n8n refuses requests without it, which
matters on n8n Cloud, where the webhook address is reachable from the internet. The
key stays in `web/.env` on your computer and never reaches the browser.

## 1. Import the workflow into n8n

These steps are the same on n8n Cloud and on n8n running on your computer.

1. **Create workflow** → **⋯** menu → **Import from file** → choose
   `n8n/maternal-health-atlas.workflow.json`.
2. Open **Dashboard request**. Under Credential for Header Auth, choose **Create new
   credential**:
   - **Name:** `X-Dashboard-Key`
   - **Value:** a long random string. A password manager's generator works, or run
     `openssl rand -hex 32`. Keep a copy for step 3.

   Save the credential as `Dashboard key`.
3. Open **Read census tables** and choose a Postgres credential for your database.
   To create one, use Supabase → **Connect** → **Session pooler**:

   | Field | Value |
   |---|---|
   | Host | `aws-0-<region>.pooler.supabase.com` (as shown in Supabase) |
   | Port | `5432` |
   | Database | `postgres` |
   | User | `postgres.<project-ref>` |
   | Password | your database password |
   | SSL | Require |

4. Save, then activate the workflow with the toggle at the top (labelled Publish in newer
   n8n versions).

Check it, replacing the address and key with yours:

```bash
curl -s -H "X-Dashboard-Key: <your key>" \
  https://<your-name>.app.n8n.cloud/webhook/maternal-health-atlas | head -c 300
```

You should see JSON starting with `{"midwifeHealth":[`. Without the header, n8n
answers 403.

## 2. Check how your forms code answers

The query assumes these codes. If yours differ, edit the `settings` block at the top
of the query in the **Read census tables** node, and in `dashboard_query.sql` to keep
them in step.

| Column | Assumed coding |
|---|---|
| `delivery.type_of_delivery` | `2` = caesarean |
| `hiv_test_result`, `syphilis_test_result`, `hepatitis_c_test_result` | `1` = positive, `0` = negative, anything else = not tested |
| `desired_pregnancy` | `0` = unintended |
| `consanguinity`, `gestational_dm`, `proteinuria`, `breastfeeding_initiated`, `referral_to_higher_care`, `hypertension_history`, `diabetes_mellitus`, `previous_cesarean`, `intrauterine_fetal_deaths` | above `0` = yes |
| `preterm_birth` | `1` = preterm (used only when gestational age at birth is missing) |

To see which codes your data actually uses, run this in the Supabase SQL editor:

```sql
SELECT 'type_of_delivery' AS col, type_of_delivery::text AS code, count(1) AS n FROM delivery GROUP BY 2
UNION ALL SELECT 'hiv_test_result', hiv_test_result::text, count(1) FROM current_pregnancy GROUP BY 2
UNION ALL SELECT 'syphilis_test_result', syphilis_test_result::text, count(1) FROM current_pregnancy GROUP BY 2
UNION ALL SELECT 'desired_pregnancy', desired_pregnancy::text, count(1) FROM patient_identification GROUP BY 2
ORDER BY 1, 2;
```

Readings outside a plausible range (age 10–60, blood pressure, haemoglobin 2–20 g/dL,
birth weight 300–6,500 g and so on) are treated as missing, since they are usually OCR
misreads. Haemoglobin values that look like g/L (for example 105) are converted to g/dL.

## 3. Run the web app

```bash
cd web
cp .env.example .env
```

In `.env`, set:

```
VITE_DATA_URL=/n8n/webhook/maternal-health-atlas
N8N_URL=https://<your-name>.app.n8n.cloud
N8N_KEY=<the same key as in step 1>
```

`N8N_URL` is the address of your n8n, without `/webhook/...`. Then:

```bash
npm install
npm run dev
```

Open http://localhost:5173. The top bar shows "Updated" with the time of the last
load instead of "Demo data". Reload the page to fetch fresh numbers.

To serve the production build instead: `npm run build && npm run preview`, then open
http://localhost:4173. The proxy and key work there too.

## 4. How addresses become map areas

The **Geocode addresses** node sends each address to OpenStreetMap's free geocoder
(Nominatim) and groups women by the town it returns. Its settings are at the top of
the node's code:

| Setting | What it does |
|---|---|
| `CONTACT_EMAIL` | OpenStreetMap's usage policy asks for a contact address. Put yours here. |
| `COUNTRY_CODES` | Limits matches to your countries, e.g. `'ma'`. Makes short or ambiguous addresses much more reliable. |
| `AREA_LEVEL` | `'town'` (default), `'county'` or `'state'`: how finely women are grouped on the map. |
| `MAX_LOOKUPS_PER_REQUEST` | New addresses looked up per page load, at one per second (default 15). |
| `GEOCODER_URL` | Point this at your own Nominatim server to keep addresses off third-party services. |

What leaves your systems, and what is kept:

- **Sent to OpenStreetMap:** the address text only. No name, ID or health data. If
  your data protection rules don't allow sending patient addresses to an outside
  service, set `GEOCODER_URL` to a Nominatim server you host.
- **Kept in n8n:** the workflow remembers each address's town, county, state, country
  and coordinates rounded to about 1 km, keyed by a hash of the address, never the
  address itself. Successful runs are not saved in n8n's execution history, because
  addresses pass through them.
- **Shown on the dashboard:** one marker per town, placed at the average of its
  women's locations rounded to about 10 km, never anyone's home.

The first page loads place addresses gradually, 15 at a time, and the sidebar says
how many are still waiting. Addresses the geocoder can't find, and women with no
address, are counted under "Location unknown". They are retried after a week, in case
the address was corrected. The workflow only remembers lookups made from its live
webhook, not from manual test runs in the n8n editor.

## While there is little data

A rate is only flagged once it rests on at least 30 records (`MIN_DENOMINATOR` in
`web/src/lib/concern.ts`). Until then regions show "Too few records" and grey map
markers, and their counts are still shown. Flags appear as records come in.

## Changing the workflow

`maternal-health-atlas.workflow.json` is built from `dashboard_query.sql` and
`geocode_addresses.js`. After editing either file, run `python3 n8n/build_workflow.py`
and re-import the workflow. If you edit a node directly in n8n instead, copy the change
back into the file so the two don't drift apart.

## When something fails

- **The dashboard could not reach the workflow:** check `N8N_URL` in `.env`, then
  restart `npm run dev`.
- **It answered 403:** `N8N_KEY` doesn't match the value in the `Dashboard key`
  credential, or `.env` was changed without restarting `npm run dev`.
- **It answered 404:** the workflow isn't active, or the webhook path was changed.
- **It answered 500:** open the workflow's **Executions** tab in n8n for the database error.
- **A rate looks impossible** (a caesarean rate of 90%, say): check the codes in step 2.
- **Everyone is under "Location unknown":** open the **Geocode addresses** node's output
  in the Executions tab, or set `COUNTRY_CODES` so short addresses match your country.
