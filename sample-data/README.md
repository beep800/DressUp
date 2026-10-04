# Sample data

120 made-up women for demonstrating the dashboard, in four towns in Senegal. Each
script runs as a whole in the Supabase SQL editor.

| File | What it does |
|---|---|
| `add_sample_women.sql` | Adds the women and their family history, obstetric history, pregnancy, delivery and postpartum records. |
| `add_sample_forms.sql` | Optional. Adds the photographed forms and OCR field results for the data capture page and the women-registered-per-month chart. |
| `remove_sample_data.sql` | Deletes every sample row and nothing else. |

Every sample woman has a `patient_hash` starting with `demo-` and "DEMO DATA" in
`other_information`, and the sample midwives' codes start with `demo_mw_`.

What the dashboard shows once the addresses are placed:

| Town | Women | Shows |
|---|---|---|
| Dakar | 34 | No flags |
| Tambacounda | 34 | Elevated: hypertension and signs of pre-eclampsia |
| Kédougou | 34 | High concern: late enrolment, anaemia, adolescent pregnancies, preterm and low birth weight, no caesareans, frequent referral, HIV and syphilis |
| Ziguinchor | 18 | Too few records to assess |

The addresses are town names ("Kédougou, Sénégal"), so the **Geocode addresses** step
in n8n must accept Senegal: its `COUNTRY_CODES` setting must be empty (`''`) or
include `sn`.

The forms script gives forms finished statuses only (REGISTERED, SYNCED, SUPERSEDED),
so a capture bot that processes new or unreviewed forms has nothing to act on. If
your bot reacts to every new row in `document_submissions`, switch it off before
running that script, or skip it.
