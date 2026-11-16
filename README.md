# Magmafy Applicants

Private dashboard for reviewing media buyer applicants. Static site (HTML/CSS/JS), no build step.
It reads the Google Sheet filled by the recruiting form (`Magmafy-Recruting-form`) and ranks every applicant.

## Files
- `index.html`, `app.js`: the dashboard (table, filters, detail drawer, status and notes)
- `scoring.js`: the scoring rules (pure functions, easy to tune)
- `demo-data.js`: fake applicants for the "بيانات تجريبية" button
- `apps-script/Code.gs`: Google Apps Script backend (receives form posts, serves rows to the dashboard)

## Setup (once)
1. Open https://script.google.com, create a project, paste `apps-script/Code.gs`.
2. Run the `setup` function and approve permissions. It creates the sheet "Magmafy Applicants" and a secret token (see Executions / Logs).
3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the `/exec` URL.
4. Put the URL in `SHEET_ENDPOINT` inside the form repo's `index.html`.
5. Open this dashboard, press "ربط الشيت", paste the URL and the token. They are saved in your browser only.

## Scoring (100 points)
Experience 20, platforms 10, monthly spend 15, furniture/e-commerce niche 10, Gulf market 10,
results backed by numbers 15, tracking knowledge 10, diagnosis of a performance drop 10.
Bands: 75+ excellent, 55-74 good, 35-54 average, below 35 weak.
The score reads keywords, numbers and answer length. It is a first filter: it can be gamed by keyword lists,
so the dashboard also flags short answers full of jargon, copied answers, and results without numbers.
Always open the results link and judge the real work.

## Documents check
Flags a missing or malformed CV link, a missing results link, an invalid phone, a missing start date or rate,
and warns about unknown link hosts, identical CV/results links, and Drive sharing permissions.
It cannot open the links for you, so the "افتح" button lets you check each one.

## Privacy
This dashboard shows personal data of applicants. Keep this repo and its deployment private, or protect the
page (for example with Cloudflare Access or basic auth), and never commit the sheet token. The token is only
typed in the browser and never stored in this repo. Statuses and notes you write are saved in your browser only.
