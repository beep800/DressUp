# Sample data

120 made-up women for demonstrating the dashboard, in four towns in Senegal. Paste a
script into a new query in the Supabase SQL editor and run it.

| File | What it does |
|---|---|
| `add_sample_data.sql` | Adds the women, their family history, obstetric history, pregnancy, delivery and postpartum records, and the photographed forms with their OCR fields. Running it again replaces the sample women instead of adding more. |
| `remove_sample_data.sql` | Deletes every sample row and nothing else. |

Every sample woman has a `patient_hash` starting with `demo-` and "DEMO DATA" in
`other_information`, and the sample midwives' codes start with `demo_mw_`.

What the dashboard shows:

| Town | Women | Shows |
|---|---|---|
| Dakar | 34 | No flags |
| Tambacounda | 34 | Elevated: hypertension and signs of pre-eclampsia |
| Kédougou | 34 | High concern: late enrolment, anaemia, adolescent pregnancies, preterm and low birth weight, no caesareans, frequent referral, HIV and syphilis |
| Ziguinchor | 18 | Too few records to assess |

The addresses are town names ("Kédougou, Sénégal"). The **Geocode addresses** step in
n8n places these four towns from its `KNOWN_PLACES` list, without looking them up
online.

The scripts avoid temporary tables and transactions, because the Supabase SQL editor
does not keep a temporary table from one statement to the next, and avoid `*`, which
can be lost when the text is copied from a chat. The forms get finished statuses only
(REGISTERED, SYNCED, SUPERSEDED), so a capture bot that processes new or unreviewed
forms has nothing to act on. If your bot reacts to every new row in
`document_submissions`, switch it off before running the add script.
