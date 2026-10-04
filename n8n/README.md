# Serving the dashboard through n8n

```
Supabase Postgres ──► n8n workflow ──► http://localhost:5678/webhook/maternal-health-atlas
                                                  ▲
Browser ──► http://localhost:5173 (Vite) ── /n8n/… proxy
```

n8n holds the database login and returns every dashboard view as one JSON response.
The web app runs on your machine and fetches that response through Vite's proxy, so
the browser never sees a Supabase key. The same workflow also refreshes the views
every hour.

This setup is meant for one machine. n8n and Vite listen on localhost only; don't
expose port 5678 to a network, because the webhook has no login of its own.

## 1. Prepare the database

In the Supabase SQL editor, run in order (skip any you've already run):

1. `sql/analytics_schema.sql`
2. `sql/002_dashboard_access.sql`
3. `sql/003_n8n_reader.sql`. Replace the password first.

Then add a row to `analytics.ref_region` for each region so it appears on the map
(see `web/README.md`).

## 2. Start n8n

With Docker:

```bash
docker run -it --rm --name n8n \
  -p 127.0.0.1:5678:5678 \
  -v n8n_data:/home/node/.n8n \
  docker.n8n.io/n8nio/n8n
```

Or without Docker: `npx n8n`. Open http://localhost:5678 and create the owner account.

## 3. Import the workflow

1. In n8n: **Create workflow** → **⋯** menu → **Import from file** → choose
   `n8n/maternal-health-atlas.workflow.json`.
2. Open **Read dashboard views**, then under Credential choose **Create new credential**
   (Postgres) and fill it in from Supabase → **Connect** → **Session pooler**:

   | Field | Value |
   |---|---|
   | Host | `aws-0-<region>.pooler.supabase.com` |
   | Port | `5432` |
   | Database | `postgres` |
   | User | `n8n_dashboard.<project-ref>` |
   | Password | the one you set in `003_n8n_reader.sql` |
   | SSL | Require |

   Name it `Supabase (n8n_dashboard)`, then select the same credential on
   **Refresh dashboard views**.
3. Save, then activate the workflow with the toggle at the top (labelled Publish in newer
   n8n versions). The webhook only answers on its production URL while the workflow is active.

Check it:

```bash
curl -s http://localhost:5678/webhook/maternal-health-atlas | head -c 300
```

You should see JSON starting with `{"regions":[`.

## 4. Run the web app

```bash
cd web
cp .env.example .env
```

In `.env`, set:

```
VITE_DATA_URL=/n8n/webhook/maternal-health-atlas
```

Leave the two `VITE_SUPABASE_*` lines empty. Then:

```bash
npm install
npm run dev
```

Open http://localhost:5173. The top bar shows "Updated" and the time of the last
load instead of "Demo data". Reload the page to fetch fresh numbers.

To serve the production build instead: `npm run build && npm run preview`, then open
http://localhost:4173. The proxy works there too.

If n8n runs somewhere other than `localhost:5678`, set `N8N_URL` in `.env`.

## What the workflow does

| Branch | Nodes | Purpose |
|---|---|---|
| Dashboard request | Webhook → Postgres → Respond to Webhook | One SQL query builds the JSON the app needs from the five views. Midwife data is limited to 24 months and OCR data to 180 days to keep the response small; change the `WHERE` lines to widen it. |
| Every hour | Schedule → Postgres | Calls `analytics.refresh_reporting_views()` so the views pick up new records. |

## When something fails

- **The dashboard says it could not reach the endpoint:** n8n isn't running, or `N8N_URL` is wrong.
- **It answered 404:** the workflow isn't active, or the webhook path was changed.
- **It answered 500:** open the workflow's **Executions** tab in n8n. "password authentication
  failed" means the user must include `.<project-ref>`. "permission denied" means
  `003_n8n_reader.sql` hasn't been run.
- **Empty map and lists:** the views haven't been refreshed yet. Run **Refresh dashboard
  views** once by hand in n8n.
