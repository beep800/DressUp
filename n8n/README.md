# Serving the dashboard through n8n

```
Census database ──► n8n workflow ──► https://<your-name>.app.n8n.cloud/webhook/maternal-health-atlas
                                                     ▲  (needs the dashboard key)
Browser ──► http://localhost:5173 (Vite) ── /n8n/… proxy, adds the key
```

The workflow runs one read-only query, `dashboard_query.sql`, against the tables you
already have. It returns totals per midwife, never individual patient rows. Nothing
is created or changed in the database. Everything is computed live on each page load.

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

## 4. Optional: put regions on the map

Skip this while you have only one or two midwives. Each midwife then appears in the
sidebar as their own area, and every page works; only the map stays empty.

Your tables link each woman to a `midwife_code` but not to a place, so regions come
from `web/public/locations.json`. List each region with its centre point and the
midwife codes that work there:

```json
{
  "regions": [
    {
      "region": "Marrakech-Safi",
      "country": "Morocco",
      "latitude": 31.63,
      "longitude": -7.99,
      "midwives": ["MW01", "MW02", "midwife_001"]
    }
  ]
}
```

Include both the `patient_identification.midwife_code` and the
`document_submissions.midwife_id` of each midwife if they differ. Codes are matched
without regard to case. Midwives not listed appear in the sidebar as their own area,
off the map. Edit the file and reload the page; no rebuild is needed while
`npm run dev` is running.

## While there is little data

A rate is only flagged once it rests on at least 30 records (`MIN_DENOMINATOR` in
`web/src/lib/concern.ts`). Until then regions show "Too few records" and grey map
markers, and their counts are still shown. Flags appear as records come in.

## When something fails

- **The dashboard could not reach the workflow:** check `N8N_URL` in `.env`, then
  restart `npm run dev`.
- **It answered 403:** `N8N_KEY` doesn't match the value in the `Dashboard key`
  credential, or `.env` was changed without restarting `npm run dev`.
- **It answered 404:** the workflow isn't active, or the webhook path was changed.
- **It answered 500:** open the workflow's **Executions** tab in n8n for the database error.
- **A rate looks impossible** (a caesarean rate of 90%, say): check the codes in step 2.
