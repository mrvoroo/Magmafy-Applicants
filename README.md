# Magmafy Applicants

Private dashboard for reviewing media buyer applicants. Static site (HTML/CSS/JS), no build step.
Data lives in a Google Sheet behind a Google Apps Script web app. **All access control is enforced by that
script, not by this page.**

## Files
- `index.html`, `app.js`, `config.js`: the dashboard (login, table, filters, detail drawer, close/open applications)
- `scoring.js`: scoring rules (pure functions, easy to tune). `demo-data.js`: fake applicants
- `apps-script/Code.gs`: the backend. `apps-script/test.js` and `e2e.js`: offline security and UI tests

## Security model
- Only the emails in the script property `ADMINS` can log in. They are **not** stored in this repo.
- Login: 8-digit one-time code sent by email (valid 10 minutes, single use, stored only as a salted hash),
  then a random 384-bit session token (stored only as a hash, valid 8 hours, max 3 per person).
- Limits: 5 wrong guesses burn the code and lock that email for 15 minutes; 5 codes per email per hour;
  40 code requests per hour in total. The answer to "send me a code" is identical for every email, so nobody can probe who is an admin.
- Exact email match only: `name+tag@gmail.com`, dots, extra addresses or line breaks never match. Mail is sent only to the address from the `ADMINS` list.
- Every private action (read applicants, save notes, close/open applications) re-checks the session on the server.
- The old static token is deleted by `setup`. `doGet` returns nothing private.
- Dashboard: strict Content-Security-Policy, no referrer, anti-framing, all applicant text rendered as text (never HTML),
  session token kept in the tab's `sessionStorage` only (nothing in `localStorage`), auto logout after 30 idle minutes.
- Spreadsheet formula injection is neutralised and every field has a size limit.
- Notes and statuses are saved in the sheet (tab `Reviews`) so both reviewers see the same thing.

Run the tests: `node apps-script/test.js` (79 checks) and `NODE_PATH=<jsdom> node apps-script/e2e.js`.

## Setup / update the backend
1. script.google.com > your project > replace `Code.gs` with `apps-script/Code.gs`.
2. Project Settings > Script properties > add `ADMINS` = `email1,email2` (only these two).
3. Run `authorize` (approve the new "send email" permission), then run `setup`.
4. Deploy > Manage deployments > pencil > Version: New version > Deploy. Keep the same `/exec` URL.
5. Put the URL in `config.js` (`endpoint`) here, and in `SHEET_ENDPOINT` in the form repo.

Emergency: run `revokeAllSessions` to log everyone out, or `lockdown` to remove `ADMINS` as well.

## Close applications
The button "قفل باب التقديم" in the dashboard sets a flag on the server. The form then shows a message that
applications are closed, and the server rejects any submission, even from a page that was already open.
The same button reopens applications.

## What the code cannot protect
Anyone who can open the Google account that owns the sheet and script (or who you share the sheet with) can
read the data directly. Keep that account on 2-step verification, do not share the sheet, and keep this repo private.
