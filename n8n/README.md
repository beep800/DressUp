# Serving the dashboard through n8n

```
Your census database ──► n8n workflow ──► http://localhost:5678/webhook/maternal-health-atlas
                                                    ▲
Browser ──► http://localhost:5173 (Vite) ── /n8n/… proxy
```

The workflow runs one read-only query, `dashboard_query.sql`, against the tables you
already have. It returns totals per midwife, never individual patient rows. Nothing
is created or changed in the database. The web app runs on your machine and fetches
those totals through Vite's proxy, so the browser never sees a database password.

Everything is computed live on each page load, so the dashboard always shows the
current state of the tables.

This setup is meant for one machine. n8n and Vite listen on localhost only; don't
expose port 5678 to a network, because the webhook has no login of its own.

## 1. Start n8n

If you already run n8n (for example for the WhatsApp/Telegram capture bot), use that
instance and skip to step 2. Otherwise, with Docker:

```bash
docker run -it --rm --name n8n \
  -p 127.0.0.1:5678:5678 \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

Or without Docker: `npx n8n`. Open http://localhost:5678.

## 2. Import the workflow

1. **Create workflow** → **⋯** menu → **Import from file** → choose
   `n8n/maternal-health-atlas.workflow.json`.
2. Open **Read census tables** and pick a Postgres credential that can read your
   census tables. If n8n already has one for this database, reuse it. Otherwise
   create one from Supabase → **Connect** → **Session pooler** (host, port 5432,
   database `postgres`, user `postgres.<project-ref>`, your database password, SSL on).
3. Save, then activate the workflow with the toggle at the top (labelled Publish in newer
   n8n versions).

Check it:

```bash
curl -s http://localhost:5678/webhook/maternal-health-atlas | head -c 300
```

You should see JSON starting with `{"midwifeHealth":[`.

## 3. Check how your forms code answers

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
SELECT 'type_of_delivery' AS col, type_of_delivery::text AS code, count(*) FROM delivery GROUP BY 2
UNION ALL SELECT 'hiv_test_result', hiv_test_result::text, count(*) FROM current_pregnancy GROUP BY 2
UNION ALL SELECT 'syphilis_test_result', syphilis_test_result::text, count(*) FROM current_pregnancy GROUP BY 2
UNION ALL SELECT 'desired_pregnancy', desired_pregnancy::text, count(*) FROM patient_identification GROUP BY 2
ORDER BY 1, 2;
```

Readings outside a plausible range (age 10–60, blood pressure, haemoglobin 2–20 g/dL,
birth weight 300–6,500 g and so on) are treated as missing, since they are usually OCR
misreads. Haemoglobin values that look like g/L (for example 105) are converted to g/dL.

## 4. Run the web app

```bash
cd web
cp .env.example .env
```

In `.env`, set:

```
VITE_DATA_URL=/n8n/webhook/maternal-health-atlas
```

Then:

```bash
npm install
npm run dev
```

Open http://localhost:5173. The top bar shows "Updated" with the time of the last
load instead of "Demo data". Reload the page to fetch fresh numbers.

To serve the production build instead: `npm run build && npm run preview`, then open
http://localhost:4173. If n8n runs somewhere other than `localhost:5678`, set
`N8N_URL` in `.env`.

## 5. Put regions on the map

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

## When something fails

- **The dashboard could not reach the workflow:** n8n isn't running, or `N8N_URL` is wrong.
- **It answered 404:** the workflow isn't active, or the webhook path was changed.
- **It answered 500:** open the workflow's **Executions** tab in n8n for the database error.
- **A rate looks impossible** (a caesarean rate of 90%, say): check the codes in step 3.
