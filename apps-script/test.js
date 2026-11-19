// Offline security tests for Code.gs. Run: node apps-script/test.js
// Simulates Google's services (properties, mail, sheets, locks) and attacks the web app logic.
const vm = require('vm'), fs = require('fs'), crypto = require('crypto'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');

function makeEnv(adminsProp) {
  const store = new Map(); if (adminsProp != null) store.set('ADMINS', adminsProp);
  const mails = []; let sleeps = 0; const cache = new Map();
  const sheets = {}; // name -> 2D array
  const mkSheet = (name) => {
    sheets[name] = sheets[name] || [];
    const data = sheets[name];
    return {
      getLastRow: () => data.length, appendRow: (r) => { data.push(r.slice()); },
      setFrozenRows() {}, deleteRow: (r) => { data.splice(r - 1, 1); },
      getRange(r, c, nr = 1, nc = 1) {
        return {
          getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) row.push((data[r - 1 + i] || [])[c - 1 + j] ?? ''); o.push(row); } return o; },
          setValues: (v) => { v.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; }); }); },
          setFontWeight() {}
        };
      },
      getDataRange: () => ({ getValues: () => data.map((r) => r.slice()) })
    };
  };
  const ssObj = { getUrl: () => 'u', getId: () => 'sid', getSheetByName: (n) => (sheets[n] ? mkSheet(n) : null), insertSheet: (n) => mkSheet(n) };
  const ctx = {
    console, Date, JSON, Math, parseInt, String, Object, Array, RegExp, Error,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
      computeDigest: (a, s) => Array.from(crypto.createHash('sha256').update(String(s)).digest()).map((b) => (b > 127 ? b - 256 : b)),
      getUuid: () => crypto.randomUUID(), sleep: () => { sleeps++; }
    },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (store.has(k) ? store.get(k) : null), setProperty: (k, v) => store.set(k, String(v)),
      deleteProperty: (k) => store.delete(k), getProperties: () => Object.fromEntries(store)
    }) },
    CacheService: { getScriptCache: () => ({ get: (k) => (cache.has(k) ? cache.get(k) : null), put: (k, v) => cache.set(k, v) }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: (m) => mails.push(m), getRemainingDailyQuota: () => 100 },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return s; } }) },
    SpreadsheetApp: { create: () => { mkSheet('Applicants'); return ssObj; }, openById: () => ssObj },
    Session: { getEffectiveUser: () => ({ getEmail: () => 'magmafyogp@gmail.com' }) },
    Logger: { log() {} }
  };
  vm.createContext(ctx); vm.runInContext(src, ctx);
  store.set('SHEET_ID', 'sid'); mkSheet('Applicants').appendRow(['id', 'submittedAt', 'name', 'phone']);
  sheets.Applicants.push(['a1', 'x', 'Ali', '+20100']);
  const post = (o, raw) => JSON.parse(ctx.doPost({ postData: { contents: raw != null ? raw : JSON.stringify(o) } }).getContent());
  const get = (q) => JSON.parse(ctx.doGet({ parameter: q }).getContent());
  return { ctx, store, mails, cache, post, get, sheets, sleeps: () => sleeps, run: (f) => ctx[f]() };
}

module.exports = { makeEnv };
if (require.main !== module) return;

let pass = 0, fail = 0;
const ok = (c, name) => { if (c) pass++; else { fail++; console.log('FAIL:', name); } };
const A = 'mrvoroo@gmail.com', B = 'abdallahmahmood777@gmail.com';
const codeFrom = (env, i = env.mails.length - 1) => env.mails[i].body.match(/\d{8}/)[0];
const login = (env, email = A) => { env.post({ action: 'requestCode', email }); const r = env.post({ action: 'verifyCode', email, code: codeFrom(env) }); return r; };

// 1. no admins configured: nobody gets in
{ const e = makeEnv(null); e.post({ action: 'requestCode', email: A }); ok(e.mails.length === 0, 'no ADMINS => no mail'); }

// 2. non-admin never gets mail and gets the same answer as an admin
{ const e = makeEnv(A + ',' + B);
  const r1 = e.post({ action: 'requestCode', email: 'attacker@evil.com' }); const r2 = e.post({ action: 'requestCode', email: A });
  ok(JSON.stringify(r1) === JSON.stringify(r2), 'same response admin/non-admin'); ok(e.mails.length === 1 && e.mails[0].to === A, 'mail only to admin'); }

// 3. address tricks do not match the allowlist
{ const e = makeEnv(A + ',' + B);
  ['mrvoroo+x@gmail.com', 'MRVOROO@gmail.com.evil.com', 'mr.voroo@gmail.com', A + ',attacker@evil.com', A + '\nBcc: a@b.com', ' ' + A + ' x', 'a@b.com;' + A, '', null, 123, [A], { a: 1 }].forEach((x) => e.post({ action: 'requestCode', email: x }));
  const sent = e.mails.map((m) => m.to);
  ok(sent.every((t) => t === A), 'tricks only ever mail the exact admin address: ' + sent.join('|'));
  ok(e.mails.every((m) => !/Bcc|\n.*@/.test(String(m.to))), 'no header injection in recipient'); }

// 4. case-insensitive match for the real admin, mail goes to the canonical address
{ const e = makeEnv(A + ',' + B); e.post({ action: 'requestCode', email: B.toUpperCase() }); ok(e.mails.length === 1 && e.mails[0].to === B, 'uppercase admin ok'); }

// 5. correct login works, token is hex 96, data readable
{ const e = makeEnv(A + ',' + B); const r = login(e); ok(r.ok && /^[0-9a-f]{96}$/.test(r.token), 'login ok');
  const d = e.post({ action: 'getApplicants', token: r.token }); ok(d.ok && d.rows.length === 1 && d.open === true, 'data readable with session');
  ok(!JSON.stringify(e.store.get('sess:' + [...e.store.keys()].find((k) => k.startsWith('sess:')).slice(5))).includes(r.token), 'token not stored in clear'); }

// 6. code is single use
{ const e = makeEnv(A + ',' + B); e.post({ action: 'requestCode', email: A }); const c = codeFrom(e);
  ok(e.post({ action: 'verifyCode', email: A, code: c }).ok, 'first use ok'); ok(!e.post({ action: 'verifyCode', email: A, code: c }).ok, 'second use rejected'); }

// 7. code cannot be used for another email
{ const e = makeEnv(A + ',' + B); e.post({ action: 'requestCode', email: A }); const c = codeFrom(e);
  ok(!e.post({ action: 'verifyCode', email: B, code: c }).ok, 'code for A rejected for B'); }

// 8. brute force: 5 wrong guesses burn the code, even the right code then fails, and requesting a new code is blocked while locked
{ const e = makeEnv(A + ',' + B); e.post({ action: 'requestCode', email: A }); const c = codeFrom(e);
  let wrong = '00000000'; if (wrong === c) wrong = '11111111';
  for (let i = 0; i < 5; i++) ok(!e.post({ action: 'verifyCode', email: A, code: wrong }).ok, 'wrong rejected ' + i);
  ok(!e.post({ action: 'verifyCode', email: A, code: c }).ok, 'right code rejected after lockout');
  const n = e.mails.length; e.post({ action: 'requestCode', email: A }); ok(e.mails.length === n, 'no new code while locked'); }

// 9. expiry
{ const e = makeEnv(A + ',' + B); e.post({ action: 'requestCode', email: A }); const c = codeFrom(e);
  const real = Date.now; Date.now = () => real() + 11 * 60 * 1000; ok(!e.post({ action: 'verifyCode', email: A, code: c }).ok, 'expired code rejected'); Date.now = real; }

// 10. rate limit: only 5 codes/hour per email
{ const e = makeEnv(A + ',' + B); for (let i = 0; i < 12; i++) e.post({ action: 'requestCode', email: A }); ok(e.mails.length === 5, 'max 5 mails/hour: ' + e.mails.length); }

// 11. global limit
{ const e = makeEnv(A + ',' + B); for (let i = 0; i < 60; i++) e.post({ action: 'requestCode', email: 'x' + i + '@evil.com' }); e.post({ action: 'requestCode', email: A }); ok(e.mails.length === 0, 'global limit blocks after flood'); }

// 12. every private action without / with bad token fails
{ const e = makeEnv(A + ',' + B); login(e);
  ['', null, 'abc', 'f'.repeat(96), '0'.repeat(96), 'a'.repeat(300), { x: 1 }, [1]].forEach((t) => {
    ['getApplicants', 'saveReview', 'saveInterview', 'saveContract', 'getContract', 'setOpen'].forEach((a) => { const r = e.post({ action: a, token: t, id: 'a1', status: 'مقبول', open: false }); ok(!r.ok && r.error === 'auth' && !r.rows, a + ' blocked for token ' + JSON.stringify(t)); }); });
  ok(e.get({ action: 'status' }).open === true, 'bad calls did not close applications'); }

// 13. old static-token style GET gets nothing
{ const e = makeEnv(A + ',' + B); ['', 'token=abc'].forEach((q) => { const r = e.get({ token: q }); ok(!r.rows && !r.ok, 'GET returns no data'); });
  ok(!e.get({ action: 'getApplicants', token: 'x' }).rows, 'GET cannot read applicants'); ok(!e.get({}).rows, 'GET empty'); }

// 14. session ends on logout; admin removed => session dead; sessions limit
{ const e = makeEnv(A + ',' + B); const s = login(e); e.post({ action: 'logout', token: s.token }); ok(!e.post({ action: 'getApplicants', token: s.token }).ok, 'logout kills token');
  const s2 = login(e); e.store.set('ADMINS', B); ok(!e.post({ action: 'getApplicants', token: s2.token }).ok, 'removed admin loses access');
  const e3 = makeEnv(A + ',' + B); const toks = []; for (let i = 0; i < 5; i++) { const r = login(e3); toks.push(r.token); }
  ok(!e3.post({ action: 'getApplicants', token: toks[0] }).ok && e3.post({ action: 'getApplicants', token: toks[4] }).ok, 'only newest sessions survive'); }
{ const e = makeEnv(A + ',' + B); const s = login(e); const real = Date.now; Date.now = () => real() + 9 * 3600 * 1000; ok(!e.post({ action: 'getApplicants', token: s.token }).ok, 'session expires after 8h'); Date.now = real; }

// 15. close / open applications, enforced on the server
{ const e = makeEnv(A + ',' + B); const s = login(e);
  const sub = { action: 'submit', name: 'N', phone: '+20123456789' };
  ok(e.post(sub).ok, 'submit works while open');
  ok(e.post({ action: 'setOpen', token: s.token, open: false }).open === false, 'admin closes');
  ok(e.get({ action: 'status' }).open === false, 'status says closed');
  const before = e.sheets.Applicants.length; const r = e.post(sub); ok(!r.ok && r.error === 'closed' && e.sheets.Applicants.length === before, 'submit rejected when closed');
  ok(!e.post({ name: 'N', phone: '+20123456789' }).ok, 'old pages without action also rejected when closed');
  ok(e.post({ action: 'setOpen', token: s.token, open: true }).open === true && e.post(sub).ok, 'admin reopens'); }

// 16. malformed bodies never crash or leak
{ const e = makeEnv(A + ',' + B); ['', 'not json', '[]', 'null', '{"action":"nope"}', '{"action":{"a":1}}', 'x'.repeat(70000)].forEach((b) => { const r = e.post(null, b); ok(r.ok === false && !r.rows && Object.keys(r).length <= 2, 'malformed handled: ' + b.slice(0, 20)); }); }

// 17. formula injection and oversize in submissions
{ const e = makeEnv(A + ',' + B); e.post({ action: 'submit', name: '=HYPERLINK("http://evil")', phone: '+20100', niche: '@SUM(1)', more: 'x'.repeat(9000) });
  const row = e.sheets.Applicants[e.sheets.Applicants.length - 1]; ok(row[2].startsWith("'") && row[3].startsWith("'") && row[8].startsWith("'"), 'formulas neutralised'); ok(row[17].length <= 4000, 'field capped'); }

// 18. honeypot
{ const e = makeEnv(A + ',' + B); const n = e.sheets.Applicants.length; e.post({ action: 'submit', name: 'bot', phone: '+20100', website: 'http://spam' }); ok(e.sheets.Applicants.length === n, 'honeypot drops bot'); }

// 19. reviews: invalid status becomes default, bad id rejected, formula-safe
{ const e = makeEnv(A + ',' + B); const s = login(e);
  ok(e.post({ action: 'saveReview', token: s.token, id: 'a1', status: 'HACK', note: '=1+1' }).ok, 'review saved');
  ok(!e.post({ action: 'saveReview', token: s.token, id: '../../x', status: 'مقبول' }).ok, 'bad id rejected');
  const d = e.post({ action: 'getApplicants', token: s.token }); ok(d.reviews.a1.status === 'جديد' && d.reviews.a1.note.startsWith("'"), 'status whitelisted, note neutralised'); }

// 20. setup removes the legacy token
{ const e = makeEnv(A + ',' + B); e.store.set('TOKEN', 'oldsecret'); e.run('setup'); ok(!e.store.has('TOKEN'), 'legacy token deleted'); }

// 21. lockdown
{ const e = makeEnv(A + ',' + B); const s = login(e); e.run('lockdown'); ok(!e.post({ action: 'getApplicants', token: s.token }).ok, 'lockdown kills sessions'); e.post({ action: 'requestCode', email: A }); ok(e.mails.length === 1, 'lockdown stops new codes'); }

// 22. nothing sensitive in responses
{ const e = makeEnv(A + ',' + B); e.post({ action: 'requestCode', email: A }); const c = codeFrom(e); const r = JSON.stringify(e.post({ action: 'verifyCode', email: A, code: '12345678' }));
  ok(!r.includes(c) && !r.includes('salt'), 'no secrets in failure response'); const req = JSON.stringify(e.post({ action: 'requestCode', email: A })); ok(!/\d{8}/.test(req), 'code never in request response'); }

// 23. applicant confirmation email
{ const e = makeEnv(A + ',' + B);
  const sub = { action: 'submit', name: 'Sara <b>Ali</b>', phone: '+20123456789', email: 'Sara@Example.com' };
  ok(e.post(sub).ok, 'submit with email ok');
  ok(e.mails.length === 1 && e.mails[0].to === 'sara@example.com', 'confirmation sent to the applicant');
  const m = e.mails[0];
  ok(m.htmlBody.includes('logo-email.png') && m.htmlBody.includes('Magmafy') && m.htmlBody.includes('dir="rtl"'), 'template has logo, brand and RTL');
  ok(m.htmlBody.includes('هنتواصل معاك في أقرب وقت') && m.body.includes('هنتواصل معاك في أقرب وقت'), 'promise text in html and plain');
  ok(!m.htmlBody.includes('<b>Ali') && m.htmlBody.includes('&lt;') === false, 'applicant name is sanitized in the template');
  ok(!/966590873178|wa\.me/.test(m.htmlBody + m.body), 'no phone number in the email');
  const last = e.sheets.Applicants[e.sheets.Applicants.length - 1];
  ok(last[18] === 'sara@example.com' || last[18] === 'Sara@Example.com', 'email stored in the email column');
  ok(e.post(sub).ok && e.mails.length === 1, 'same address gets only one confirmation (no mail-bombing)'); }

// 24. bad or missing email: submission still stored, no mail
{ const e = makeEnv(A + ',' + B); const n = e.sheets.Applicants.length;
  ['not-an-email', 'a@b', 'x@y.com\nBcc: z@z.com', '', null, 5].forEach((x, i) => e.post({ action: 'submit', name: 'N' + i, phone: '+20100', email: x }));
  ok(e.sheets.Applicants.length === n + 6 && e.mails.length === 0, 'invalid emails: rows stored, nothing mailed'); }

// 25. mail caps protect admin login codes
{ const e = makeEnv(A + ',' + B); e.store.set('MAX_APPS', '500');
  for (let i = 0; i < 80; i++) e.post({ action: 'submit', name: 'N' + i, phone: '+20100', email: 'u' + i + '@example.com' });
  ok(e.mails.length === 40, 'at most 40 confirmation emails per day: ' + e.mails.length);
  const e2 = makeEnv(A + ',' + B); e2.ctx.MailApp.getRemainingDailyQuota = () => 15;
  e2.post({ action: 'submit', name: 'N', phone: '+20100', email: 'a@example.com' }); ok(e2.mails.length === 0, 'no confirmation when mail quota is low');
  e2.post({ action: 'requestCode', email: A }); ok(e2.mails.length === 1, 'admin login code still goes out'); }

// 26. a mail failure never breaks the submission; header migration adds email
{ const e = makeEnv(A + ',' + B); e.ctx.MailApp.sendEmail = () => { throw new Error('quota'); };
  ok(e.post({ action: 'submit', name: 'N', phone: '+20100', email: 'a@example.com' }).ok, 'submit ok even if mail fails');
  const e2 = makeEnv(A + ',' + B); e2.sheets.Applicants[0] = ['id', 'submittedAt', 'name', 'phone', 'country', 'years', 'platforms', 'spend', 'niche', 'gulf', 'result', 'tracking', 'drop', 'cv', 'work', 'avail', 'rate', 'more'];
  e2.run('setup'); ok(e2.sheets.Applicants[0][18] === 'email', 'setup adds the email header to an existing sheet'); }

// 27. batch limit: form closes by itself, stale pages are refused, reopen starts a new batch
{ const e = makeEnv(A + ',' + B); e.store.set('MAX_APPS', '3'); // sheet already has 1 applicant
  ok(e.post({ action: 'submit', name: 'a', phone: '+20100' }).ok && e.get({ action: 'status' }).open === true, '2nd applicant ok, still open');
  ok(e.post({ action: 'submit', name: 'b', phone: '+20100' }).ok, '3rd applicant ok');
  ok(e.get({ action: 'status' }).open === false, 'form closes itself when the limit is reached');
  const n = e.sheets.Applicants.length; const r = e.post({ action: 'submit', name: 'c', phone: '+20100' });
  ok(!r.ok && r.error === 'closed' && e.sheets.Applicants.length === n, 'no more rows after the limit');
  const s = login(e); const d = e.post({ action: 'getApplicants', token: s.token }); ok(d.cap === 3 && d.used === 3 && d.open === false, 'dashboard gets used/cap');
  e.store.set('CLOSED', '1'); e.store.delete('CLOSED'); // stale page that slipped through a race
  ok(!e.post({ action: 'submit', name: 'late', phone: '+20100' }).ok && e.get({ action: 'status' }).open === false, 'full batch refuses even if CLOSED flag was lost, and re-closes');
  const o = e.post({ action: 'setOpen', token: s.token, open: true }); ok(o.ok && o.used === 0 && o.cap === 3, 'reopen starts a new batch');
  ok(e.post({ action: 'submit', name: 'new1', phone: '+20100' }).ok, 'new batch accepts applicants'); }

// 28. owner notifications: only to NOTIFY_EMAIL, batched, quota safe
{ const OWN = 'owner@example.com'; const e = makeEnv(A + ',' + B); e.store.set('MAX_APPS', '100');
  e.post({ action: 'submit', name: 'x', phone: '+20100' }); ok(e.mails.length === 0, 'no NOTIFY_EMAIL => no notification');
  e.store.set('NOTIFY_EMAIL', OWN);
  e.post({ action: 'submit', name: 'First <i>One</i>', phone: '+20100', country: 'مصر', years: 'أكثر من ٥ سنوات', rate: '150 دولار' });
  ok(e.mails.length === 1 && e.mails[0].to === OWN, 'first applicant notifies the owner immediately');
  ok(e.mails[0].htmlBody.includes('150 دولار') && !e.mails[0].htmlBody.includes('<i>One'), 'notice shows rate and escapes names');
  ok(!/\+20100/.test(e.mails[0].body + e.mails[0].htmlBody), 'phone number is not in the notice');
  for (let i = 0; i < 4; i++) e.post({ action: 'submit', name: 'P' + i, phone: '+20100' });
  ok(e.mails.length === 1, 'next applicants within 10 minutes are batched, no extra mail');
  const s = login(e); const before = e.mails.length; e.post({ action: 'getApplicants', token: s.token });
  ok(e.mails.length === before, 'dashboard does not flush before the gap passes');
  e.store.set('n:last', String(Date.now() - 11 * 60 * 1000)); e.post({ action: 'getApplicants', token: s.token });
  const dig = e.mails[e.mails.length - 1]; ok(dig.to === OWN && dig.subject.includes('4 متقدمين جدد'), 'waiting applicants arrive as one digest: ' + dig.subject);
  e.ctx.MailApp.getRemainingDailyQuota = () => 2; const m0 = e.mails.length;
  e.store.set('n:last', '0'); e.post({ action: 'submit', name: 'Q', phone: '+20100' }); ok(e.mails.length === m0, 'no notice when mail quota is nearly gone'); }

// 29. final applicant forces a notice that says the form closed
{ const OWN = 'owner@example.com'; const e = makeEnv(A + ',' + B); e.store.set('MAX_APPS', '3'); e.store.set('NOTIFY_EMAIL', OWN);
  e.post({ action: 'submit', name: 'one', phone: '+20100' }); e.post({ action: 'submit', name: 'two', phone: '+20100' });
  const last = e.mails[e.mails.length - 1]; ok(e.mails.length === 2 && last.subject.startsWith('اكتمل العدد') && last.body.includes('قفل باب التقديم تلقائيًا'), 'completion notice sent right away: ' + last.subject);
  ok(e.mails.every((m) => m.to === OWN), 'notices only go to NOTIFY_EMAIL'); }


// 30. communication center: templates, sending, log, status
{ const e = makeEnv(A + ',' + B); const t = login(e).token;
  const gt = e.post({ action: 'getTemplates', token: t });
  ok(gt.ok && gt.templates.length === 10 && gt.sender === 'magmafyogp@gmail.com', 'ten default templates (5 x ar/en) and sender address');
  ok(e.post({ action: 'getTemplates' }).ok === false, 'templates need a session');
  const sv = e.post({ action: 'saveTemplate', token: t, key: 'accepted', lang: 'ar', subject: '=HYPERLINK("x")', headline: 'H', body: 'مرحبا {name}', wa: 'w' });
  ok(sv.ok, 'template saved');
  const g2 = e.post({ action: 'getTemplates', token: t }).templates.find((x) => x.key === 'accepted' && x.lang === 'ar');
  ok(g2.custom && g2.subject.startsWith(' =') && g2.body === 'مرحبا {name}', 'saved template returned, formula injection neutralised');
  ok(!e.post({ action: 'saveTemplate', token: t, key: 'evil', lang: 'ar', subject: 's', body: 'b' }).ok, 'unknown template key rejected');
  ok(e.post({ action: 'resetTemplate', token: t, key: 'accepted', lang: 'ar' }).ok && !e.post({ action: 'getTemplates', token: t }).templates.find((x) => x.key === 'accepted' && x.lang === 'ar').custom, 'reset returns to default');

  const pv = e.post({ action: 'previewMail', token: t, lang: 'ar', subject: 's', headline: '<script>x</script>', body: 'أهلًا <img src=x onerror=1>', forApplicant: true });
  ok(pv.ok && !pv.html.includes('<script>') && !pv.html.includes('<img src=x') && pv.html.includes('dir="rtl"') && pv.html.includes('logo'), 'preview is branded and escaped');

  e.post({ action: 'submit', name: 'Sara', phone: '+20123456789', email: 'sara@example.com', lang: 'en' });
  const sara = e.sheets.Applicants[e.sheets.Applicants.length - 1];
  const idx = e.sheets.Applicants[0].indexOf('lang');
  ok(idx > 0 && sara[idx] === 'en', 'applicant language stored');
  ok(e.mails[e.mails.length - 1].htmlBody.includes('dir="ltr"') && e.mails[e.mails.length - 1].subject.startsWith('We received'), 'English applicant gets the English confirmation');
  const sid = sara[0], n0 = e.mails.length;
  const r = e.post({ action: 'sendMail', token: t, applicantId: sid, template: 'accepted', lang: 'en', subject: 'Accepted', headline: 'Hi', body: 'Hello **Sara**', setStatus: true });
  const sent = e.mails[e.mails.length - 1];
  ok(r.ok && e.mails.length === n0 + 1 && sent.to === 'sara@example.com' && sent.replyTo === 'magmafyogp@gmail.com' && sent.name === 'Magmafy', 'sent to the applicant address from sheet, replyTo = company inbox');
  ok(r.status === 'مقبول' && JSON.stringify(e.post({ action: 'getApplicants', token: t }).reviews).includes('مقبول'), 'status updated to accepted');
  const ga = e.post({ action: 'getApplicants', token: t });
  ok(ga.sender === 'magmafyogp@gmail.com' && ga.msgs[sid] && ga.msgs[sid][0].ch === 'email', 'message history returned with applicants');
  ok(e.post({ action: 'sendMail', token: t, to: 'x@example.com', subject: 's', body: 'b {name}' }).error === 'placeholder', 'unfilled placeholder blocked');
  ok(e.post({ action: 'sendMail', token: t, to: 'x@y.com\nBcc: z@z.com', subject: 's', body: 'b' }).error === 'to', 'header injection in custom address rejected');
  ok(e.post({ action: 'sendMail', token: t, applicantId: 'nope', subject: 's', body: 'b' }).error === 'notfound', 'unknown applicant rejected');
  const c = e.post({ action: 'sendMail', token: t, to: 'friend@example.com', subject: 'Hi\nBcc: a@b.com', body: 'blank mail', lang: 'ar' });
  ok(c.ok && !/\n/.test(e.mails[e.mails.length - 1].subject), 'custom/blank mail sent, newline stripped from subject');
  const lg = e.post({ action: 'logMessage', token: t, applicantId: sid, template: 'interview', setStatus: true });
  ok(lg.ok && lg.status === 'مقابلة', 'WhatsApp log moves the status to interview');
  ok(!e.post({ action: 'logMessage', token: t, applicantId: '../x' }).ok, 'bad id rejected in log');
  let blocked = 0; for (let i = 0; i < 40; i++) if (e.post({ action: 'sendMail', token: t, to: 'u' + i + '@example.com', subject: 's', body: 'b' }).error === 'rate') blocked++;
  ok(blocked > 0, 'admin hourly send limit enforced');
  const e2 = makeEnv(A + ',' + B); const t2 = login(e2).token; e2.ctx.MailApp.getRemainingDailyQuota = () => 2;
  ok(e2.post({ action: 'sendMail', token: t2, to: 'a@example.com', subject: 's', body: 'b' }).error === 'quota', 'no admin mail when quota nearly gone'); }

// 21. interview checklist: auth, validation, sanitising, round trip
{ const e = makeEnv(A + ',' + B); const t = login(e).token;
  const good = { v: 1, fee: '300', cap: '250', checks: { q1: true, q2: false }, flags: { f2: true }, ratings: { exp: 5, niche: 9, gulf: 2.5 }, trial: { t1: 4 }, notes: { q1: '=HYPERLINK("x")' }, decision: 'trial', gen: 'ok', final: 'ok' };
  ok(e.post({ action: 'saveInterview', token: 'x'.repeat(96), id: 'a1', data: JSON.stringify(good) }).error === 'auth', 'interview needs a session');
  ok(e.post({ action: 'saveInterview', token: t, id: 'a1', data: JSON.stringify(good) }).ok, 'interview saved');
  ok(!e.post({ action: 'saveInterview', token: t, id: '../../x', data: JSON.stringify(good) }).ok, 'interview bad id rejected');
  ok(!e.post({ action: 'saveInterview', token: t, id: 'a1', data: 'not json' }).ok, 'interview bad json rejected');
  ok(!e.post({ action: 'saveInterview', token: t, id: 'a1', data: '[1,2]' }).ok, 'interview array rejected');
  ok(!e.post({ action: 'saveInterview', token: t, id: 'a1', data: { a: 1 } }).ok, 'interview non-string data rejected');
  ok(!e.post({ action: 'saveInterview', token: t, id: 'a1', data: JSON.stringify({ gen: 'x'.repeat(25000) }) }).ok, 'interview oversize rejected');
  const d = e.post({ action: 'getApplicants', token: t }); const iv = d.interviews.a1.data;
  ok(iv.fee === '300' && iv.checks.q1 === true && !('q2' in iv.checks), 'interview round trip, false checks dropped');
  ok(iv.ratings.exp === 5 && !('niche' in iv.ratings) && !('gulf' in iv.ratings), 'ratings clamped to integers 0-5');
  ok(iv.flags.f2 === true && iv.trial.t1 === 4 && iv.decision === 'trial', 'flags, trial and decision kept');
  ok(d.interviews.a1.by === A, 'interview records who saved it');
  // hostile payload: unknown keys, prototype keys, bad decision, bad numbers, too many keys
  const evil = { fee: '=1+1', cap: '1e9', decision: 'HACK', __proto__: { x: 1 }, checks: { '__proto__': true, 'a b': true, Q1: true }, notes: {}, extra: 'x' };
  for (let i = 0; i < 100; i++) evil.notes['q' + i] = 'n';
  ok(e.post({ action: 'saveInterview', token: t, id: 'a1', data: JSON.stringify(evil) }).ok, 'hostile interview accepted but cleaned');
  const iv2 = e.post({ action: 'getApplicants', token: t }).interviews.a1.data;
  ok(iv2.fee === '' && iv2.cap === '' && iv2.decision === '', 'bad numbers and decision neutralised');
  ok(Object.keys(iv2.checks).length === 0 && !('extra' in iv2), 'bad keys and unknown fields dropped');
  ok(Object.keys(iv2.notes).length <= 40, 'note count capped');
  ok(e.sheets.Interviews[1][1].startsWith('{'), 'stored cell is JSON, never a formula'); }

// 22b. contracts: validation, signing, freezing, ending
{ const e = makeEnv(A + ',' + B); const t = login(e).token;
  const stroke = []; for (let i = 0; i < 30; i++) stroke.push(10 + i * 5, 20 + (i % 7) * 8);
  const base = { no: 'MGF-20261119-A1', fee: '150', cur: 'USD', payDays: 7, noticeDays: 14, replyHours: 24, nonSol: 12, start: '2026-12-01', platforms: 'ميتا، جوجل', law: 'x',
    p1: { entity: 'ماجمافاي', rep: 'أشرف', title: 'شريك مؤسس' }, p2: { name: 'سارة علي', phone: '+20100', email: 's@x.com', country: 'مصر' },
    terms: [{ h: '1. البند', p: ['نص البند الأول'] }, { h: '2. البند', p: ['نص', 'نص ٢'] }] };
  const post = (op, doc, id = 'a1') => e.post({ action: 'saveContract', token: t, id, op, data: JSON.stringify(doc) });
  ok(e.post({ action: 'saveContract', token: 'x'.repeat(96), id: 'a1', op: 'draft', data: '{}' }).error === 'auth', 'contract needs a session');
  ok(!post('draft', base, '../x').ok && !e.post({ action: 'saveContract', token: t, id: 'a1', op: 'nope', data: '{}' }).ok && !e.post({ action: 'saveContract', token: t, id: 'a1', op: 'draft', data: 'bad' }).ok, 'bad id, op or json rejected');
  ok(!e.post({ action: 'saveContract', token: t, id: 'a1', op: 'draft', data: '[1]' }).ok && !e.post({ action: 'saveContract', token: t, id: 'a1', op: 'draft', data: 'x'.repeat(41000) }).ok, 'array and oversize rejected');
  ok(post('draft', base).ok, 'draft saved');
  let l = e.post({ action: 'getApplicants', token: t }).contracts.a1; ok(l.status === 'draft' && l.fee === '150' && l.name === 'سارة علي' && !('terms' in l) && !('sig' in l), 'list carries a light summary only');
  ok(post('draft', Object.assign({}, base, { fee: '175', cur: 'EVIL', payDays: 999, start: 'tomorrow' })).ok, 'draft can be overwritten');
  let c = e.post({ action: 'getContract', token: t, id: 'a1' }).contract; ok(c.fee === '175' && c.cur === 'USD' && c.payDays === 7 && c.start === '', 'bad currency, number and date neutralised');
  ok(e.post({ action: 'getContract', token: t, id: 'zz' }).contract === null, 'missing contract is null');
  // signing needs everything
  ok(post('sign', base).error === 'incomplete', 'cannot sign without a signature');
  ok(post('sign', Object.assign({}, base, { sig: { name: 'ab', strokes: [stroke] } })).error === 'incomplete', 'cannot sign with a short typed name');
  ok(post('sign', Object.assign({}, base, { fee: '', sig: { name: 'سارة علي', strokes: [stroke] } })).error === 'incomplete', 'cannot sign without a fee');
  ok(post('sign', Object.assign({}, base, { sig: { name: 'سارة علي', strokes: [[1, 2]] } })).error === 'incomplete', 'a dot is not a signature');
  ok(post('sign', Object.assign({}, base, { sig: { name: 'سارة علي', strokes: [[9999, 5, 4, 4].concat(stroke)] } })).error === 'incomplete', 'out-of-range stroke dropped');
  const r = post('sign', Object.assign({}, base, { fee: '150', status: 'ended', signedAt: '2000-01-01', hash: 'fake', sig: { name: 'سارة علي', strokes: [stroke] } }));
  ok(r.ok && r.contract.status === 'signed' && /^[0-9a-f]{64}$/.test(r.contract.hash), 'signed with a server hash');
  c = e.post({ action: 'getContract', token: t, id: 'a1' }).contract;
  ok(c.status === 'signed' && c.signedBy === A && c.signedAt.startsWith('20') && c.signedAt !== '2000-01-01' && c.hash !== 'fake', 'status, time, signer and hash come from the server, not the client');
  ok(c.sig.pts === 30 && c.sig.name === 'سارة علي' && c.terms.length === 2, 'signature and terms stored');
  // frozen
  ok(post('draft', Object.assign({}, base, { fee: '1' })).error === 'locked' && post('sign', Object.assign({}, base, { sig: { name: 'سارة علي', strokes: [stroke] } })).error === 'locked', 'a signed contract cannot be rewritten or re-signed');
  ok(e.post({ action: 'getContract', token: t, id: 'a1' }).contract.fee === '150', 'fee unchanged after rejected edits');
  // end
  ok(e.post({ action: 'saveContract', token: t, id: 'zz', op: 'end', data: '{}' }).error === 'invalid', 'cannot end a contract that is not signed');
  const en = e.post({ action: 'saveContract', token: t, id: 'a1', op: 'end', data: JSON.stringify({ reason: 'انتهى التعاون', fee: '9', terms: [] }) });
  c = e.post({ action: 'getContract', token: t, id: 'a1' }).contract;
  ok(en.ok && c.status === 'ended' && c.endReason === 'انتهى التعاون' && c.endedBy === A && c.fee === '150' && c.terms.length === 2 && c.hash === r.contract.hash, 'ending changes only the end fields');
  ok(post('draft', base).error === 'locked', 'an ended contract stays locked');
  // hostile
  const ev = { fee: '=1+1', p2: { name: '=HYPERLINK("x")' }, terms: [{ h: 'x'.repeat(500), p: new Array(20).fill('y'.repeat(1500)) }], __proto__: { a: 1 } }; for (let i = 0; i < 80; i++) ev.terms.push({ h: 'h' + i, p: ['p'] });
  ok(post('draft', ev, 'a2').ok, 'hostile draft accepted but cleaned');
  c = e.post({ action: 'getContract', token: t, id: 'a2' }).contract; ok(c.fee === '' && c.terms.length <= 30 && c.terms[0].h.length <= 120 && c.terms[0].p.length <= 12 && JSON.stringify(c.terms).length < 20000, 'terms capped');
  ok(e.sheets.Contracts[1][1].startsWith('{') && e.sheets.Contracts.every((row) => !/^[=+\-@]/.test(String(row[1]))), 'stored cell is JSON, never a formula'); }

console.log(fail === 0 ? `ALL ${pass} CHECKS PASSED` : `${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
