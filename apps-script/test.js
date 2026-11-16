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
      setFrozenRows() {},
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
    ['getApplicants', 'saveReview', 'setOpen'].forEach((a) => { const r = e.post({ action: a, token: t, id: 'a1', status: 'مقبول', open: false }); ok(!r.ok && r.error === 'auth' && !r.rows, a + ' blocked for token ' + JSON.stringify(t)); }); });
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
{ const e = makeEnv(A + ',' + B);
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

console.log(fail === 0 ? `ALL ${pass} CHECKS PASSED` : `${fail} FAILED, ${pass} passed`);
process.exit(fail ? 1 : 0);
