/**
 * Magmafy backend (Google Apps Script web app).
 * Serves the public recruiting form and the private applicants dashboard.
 *
 * SECURITY MODEL
 * - The dashboard is reachable only by the emails listed in the script property ADMINS.
 *   Login = one-time 8-digit code sent by email, then a random session token.
 * - Every private action checks the session here, on the server. Nothing in the web pages is trusted.
 * - Nothing is ever logged that could leak a code or a token.
 * - Closing applications is enforced here too, so a stale page cannot submit.
 *
 * SETUP (once, also after updating this file):
 * 1. Project Settings (gear icon) > Script properties > Add script property:
 *      ADMINS = first@example.com,second@example.com      (comma separated, no other emails)
 * 2. Select function `authorize` and press Run. Approve the permissions (sending email is new).
 * 3. Select function `setup` and press Run. It keeps your existing sheet, creates the Reviews tab,
 *    and DELETES the old static token.
 * 4. Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 *    Keep the same deployment so the /exec URL does not change.
 *
 * EMERGENCY:
 * - `revokeAllSessions` logs everybody out immediately.
 * - `lockdown` removes ADMINS (nobody can log in) and logs everybody out.
 */

var SHEET_NAME = 'Applicants';
var REVIEW_SHEET = 'Reviews';
var COLUMNS = [
  'id', 'submittedAt', 'name', 'phone', 'country', 'years', 'platforms', 'spend',
  'niche', 'gulf', 'result', 'tracking', 'drop', 'cv', 'work', 'avail', 'rate', 'more'
];
var REVIEW_COLUMNS = ['id', 'status', 'note', 'updatedBy', 'updatedAt'];
var STATUSES = ['جديد', 'تم التواصل', 'مقابلة', 'مقبول', 'مرفوض'];

var OTP_DIGITS = 8;
var OTP_TTL_MS = 10 * 60 * 1000;          // a code lives 10 minutes
var OTP_MAX_ATTEMPTS = 5;                  // wrong guesses per code
var OTP_LOCK_MS = 15 * 60 * 1000;          // lock after too many wrong guesses
var OTP_MAX_SENDS_PER_HOUR = 5;            // codes per email per hour
var GLOBAL_REQUESTS_PER_HOUR = 40;         // all code requests, any email
var SESSION_TTL_MS = 8 * 60 * 60 * 1000;   // a login lives 8 hours
var MAX_SESSIONS_PER_USER = 3;
var MAX_BODY = 60000;                      // request size limit (characters)
var MAX_FIELD = 4000;                      // per form field
var SUBMITS_PER_HOUR = 300;                // public form submissions per hour, all senders

// ---------------------------------------------------------------- entry points

function doPost(e) {
  try {
    var raw = e && e.postData && e.postData.contents ? String(e.postData.contents) : '';
    if (!raw || raw.length > MAX_BODY) return json_({ ok: false, error: 'invalid' });
    var data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return json_({ ok: false, error: 'invalid' });
    var action = data.action ? String(data.action) : 'submit'; // old cached form pages send no action
    switch (action) {
      case 'submit': return json_(submit_(data));
      case 'requestCode': return json_(requestCode_(data));
      case 'verifyCode': return json_(verifyCode_(data));
      case 'getApplicants': return json_(authed_(data, getApplicants_));
      case 'saveReview': return json_(authed_(data, saveReview_));
      case 'setOpen': return json_(authed_(data, setOpen_));
      case 'logout': return json_(logout_(data));
      default: return json_({ ok: false, error: 'invalid' });
    }
  } catch (err) {
    return json_({ ok: false, error: 'server' }); // never return error details to the caller
  }
}

// Public and harmless: only tells the form whether applications are open.
function doGet(e) {
  if (e && e.parameter && e.parameter.action === 'status') {
    return json_({ ok: true, open: !isClosed_() });
  }
  return json_({ ok: false, error: 'invalid' });
}

// ---------------------------------------------------------------- setup / admin utilities

function authorize() {
  MailApp.getRemainingDailyQuota(); // triggers the permission prompt for sending email
}

function setup() {
  var props = props_();
  var ss;
  if (props.getProperty('SHEET_ID')) {
    ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  } else {
    ss = SpreadsheetApp.create('Magmafy Applicants');
    props.setProperty('SHEET_ID', ss.getId());
  }
  var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(COLUMNS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold');
  }
  reviewsSheet_();
  props.deleteProperty('TOKEN'); // the old static token no longer exists anywhere
  Logger.log('Sheet: ' + ss.getUrl());
  Logger.log('Admins configured: ' + admins_().length + ' (must be 2)');
  Logger.log('Old token deleted. Now redeploy a NEW VERSION of the web app.');
}

function revokeAllSessions() {
  var props = props_(), all = props.getProperties();
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sess:') === 0 || k.indexOf('a:') === 0) props.deleteProperty(k);
  });
}

function lockdown() {
  props_().deleteProperty('ADMINS');
  revokeAllSessions();
}

// ---------------------------------------------------------------- public: form submission

function submit_(data) {
  if (data.website) return { ok: true }; // honeypot: bots fill it, people never see it
  if (isClosed_()) return { ok: false, error: 'closed' };
  if (!data.name || !data.phone) return { ok: false, error: 'missing' };

  var t = now_();
  var allowed = withLock_(function () {
    var s = recent_(getJ_('g:sub'), t, 3600000);
    if (s.length >= SUBMITS_PER_HOUR) return false;
    s.push(t);
    setJ_('g:sub', s);
    return true;
  });
  if (!allowed) return { ok: false, error: 'busy' };

  var row = COLUMNS.map(function (k) {
    if (k === 'id') return Utilities.getUuid().slice(0, 8);
    if (k === 'submittedAt') return new Date();
    return clean_(data[k], MAX_FIELD);
  });
  withLock_(function () { sheet_().appendRow(row); });
  return { ok: true };
}

// ---------------------------------------------------------------- login: request a code

function requestCode_(data) {
  var email = normEmail_(data.email);
  var t = now_();
  var code = withLock_(function () {
    var g = recent_(getJ_('g:req'), t, 3600000);
    if (g.length >= GLOBAL_REQUESTS_PER_HOUR) return false;
    g.push(t);
    setJ_('g:req', g);
    if (!email || admins_().indexOf(email) === -1) return false;

    var k = 'a:' + sha_(email);
    var rec = getJ_(k) || {};
    rec.sends = recent_(rec.sends, t, 3600000);
    if ((rec.lock && t < rec.lock) || rec.sends.length >= OTP_MAX_SENDS_PER_HOUR) {
      setJ_(k, rec);
      return false;
    }
    var c = randCode_(), salt = randHex_(32);
    rec.salt = salt;
    rec.h = sha_(salt + c); // only a salted hash of the code is stored
    rec.exp = t + OTP_TTL_MS;
    rec.att = 0;
    rec.sends.push(t);
    setJ_(k, rec);
    return c;
  });

  if (code === false) {
    Utilities.sleep(1500); // same answer, similar delay, for every email: no way to probe who is an admin
    return { ok: true };
  }
  try {
    // the recipient comes from the ADMINS list, never from user input
    MailApp.sendEmail({
      to: email,
      name: 'Magmafy',
      subject: 'كود الدخول للوحة المتقدمين',
      body: 'كود الدخول: ' + code + '\n\nصالح لمدة 10 دقائق ويُستخدم مرة واحدة.\n' +
            'لو أنت ما طلبتش الكود، تجاهل الرسالة ولا تشاركه مع أي شخص.'
    });
  } catch (err) {
    // swallow: the caller gets the same answer either way
  }
  return { ok: true };
}

// ---------------------------------------------------------------- login: verify the code

function verifyCode_(data) {
  var fail = { ok: false, error: 'invalid' };
  var email = normEmail_(data.email);
  var code = String(data.code == null ? '' : data.code).replace(/\s/g, '');
  var pattern = new RegExp('^\\d{' + OTP_DIGITS + '}$');
  if (!email || !pattern.test(code) || admins_().indexOf(email) === -1) {
    Utilities.sleep(800);
    return fail;
  }
  return withLock_(function () {
    var t = now_(), k = 'a:' + sha_(email), rec = getJ_(k);
    if (!rec || !rec.h || t > rec.exp || (rec.lock && t < rec.lock)) return fail;

    rec.att = (rec.att || 0) + 1;
    var good = safeEq_(sha_(rec.salt + code), rec.h);
    if (!good) {
      if (rec.att >= OTP_MAX_ATTEMPTS) { rec.h = ''; rec.lock = t + OTP_LOCK_MS; } // burn the code and lock
      setJ_(k, rec);
      return fail;
    }
    rec.h = ''; rec.att = 0; rec.lock = 0; // a code works once
    setJ_(k, rec);
    return newSession_(email, t);
  });
}

function newSession_(email, t) {
  var props = props_(), all = props.getProperties(), mine = [];
  Object.keys(all).forEach(function (k) {
    if (k.indexOf('sess:') !== 0) return;
    var s; try { s = JSON.parse(all[k]); } catch (e) { s = null; }
    if (!s || t > s.exp) { props.deleteProperty(k); return; }
    if (s.e === email) mine.push({ k: k, c: s.c });
  });
  mine.sort(function (a, b) { return a.c - b.c; });
  while (mine.length >= MAX_SESSIONS_PER_USER) props.deleteProperty(mine.shift().k);

  var token = randHex_(96); // 384 random bits; only its hash is stored
  setJ_('sess:' + sha_(token), { e: email, c: t, exp: t + SESSION_TTL_MS });
  return { ok: true, token: token, email: email, expiresAt: t + SESSION_TTL_MS };
}

function sessionEmail_(token) {
  token = String(token == null ? '' : token);
  if (!/^[0-9a-f]{96}$/.test(token)) return null;
  var k = 'sess:' + sha_(token), rec = getJ_(k);
  if (!rec) return null;
  if (now_() > rec.exp || admins_().indexOf(rec.e) === -1) { props_().deleteProperty(k); return null; }
  return rec.e;
}

function authed_(data, fn) {
  var email = sessionEmail_(data.token);
  if (!email) return { ok: false, error: 'auth' };
  return fn(data, email);
}

function logout_(data) {
  var token = String(data.token == null ? '' : data.token);
  if (/^[0-9a-f]{96}$/.test(token)) props_().deleteProperty('sess:' + sha_(token));
  return { ok: true };
}

// ---------------------------------------------------------------- private actions

function getApplicants_(data, email) {
  var values = sheet_().getDataRange().getValues();
  var head = values.shift();
  var rows = values.map(function (r) {
    var o = {};
    head.forEach(function (h, i) { var v = r[i]; o[h] = v instanceof Date ? v.toISOString() : v; });
    return o;
  });
  var rv = reviewsSheet_().getDataRange().getValues();
  rv.shift();
  var reviews = {};
  rv.forEach(function (r) {
    reviews[String(r[0])] = { status: r[1], note: r[2], by: r[3], at: r[4] instanceof Date ? r[4].toISOString() : r[4] };
  });
  return { ok: true, rows: rows, reviews: reviews, open: !isClosed_(), me: email };
}

function saveReview_(data, email) {
  var id = String(data.id == null ? '' : data.id);
  if (!/^[\w-]{1,40}$/.test(id)) return { ok: false, error: 'invalid' };
  var status = STATUSES.indexOf(data.status) !== -1 ? data.status : STATUSES[0];
  var note = clean_(data.note, 2000);
  withLock_(function () {
    var sh = reviewsSheet_(), ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
    var row = -1;
    for (var i = 1; i < ids.length; i++) if (String(ids[i][0]) === id) { row = i + 1; break; }
    var vals = [id, status, note, email, new Date()];
    if (row === -1) sh.appendRow(vals); else sh.getRange(row, 1, 1, vals.length).setValues([vals]);
  });
  return { ok: true };
}

function setOpen_(data, email) {
  var open = data.open === true;
  if (open) props_().deleteProperty('CLOSED'); else props_().setProperty('CLOSED', '1');
  setJ_('closedMeta', { by: email, at: new Date().toISOString(), open: open });
  return { ok: true, open: open };
}

// ---------------------------------------------------------------- helpers

function props_() { return PropertiesService.getScriptProperties(); }
function now_() { return Date.now(); }
function isClosed_() { return props_().getProperty('CLOSED') === '1'; }

function admins_() {
  var raw = props_().getProperty('ADMINS') || '';
  return raw.split(',').map(normEmail_).filter(function (x) { return x; });
}

// Exact match only: lowercase and trim, nothing else. "name+tag@gmail.com" is a different address.
function normEmail_(s) {
  s = String(s == null ? '' : s).trim().toLowerCase();
  if (s.length > 254) return '';
  return /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/.test(s) ? s : '';
}

function sha_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

function randHex_(n) {
  var out = '';
  while (out.length < n) out += Utilities.getUuid().replace(/-/g, ''); // UUID v4 comes from a secure RNG
  return out.slice(0, n);
}

function randCode_() {
  var h = randHex_(OTP_DIGITS * 8), c = '';
  for (var i = 0; i < OTP_DIGITS; i++) c += String(parseInt(h.substr(i * 8, 8), 16) % 10);
  return c;
}

function safeEq_(a, b) { // constant-time string compare
  a = String(a); b = String(b);
  if (a.length !== b.length) return false;
  var r = 0;
  for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function recent_(arr, t, windowMs) {
  return (Array.isArray(arr) ? arr : []).filter(function (x) { return typeof x === 'number' && t - x < windowMs; });
}

function clean_(v, max) {
  v = v == null ? '' : String(v);
  v = v.slice(0, max);
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; // stop spreadsheet formula injection
  return v;
}

function getJ_(k) {
  var v = props_().getProperty(k);
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}
function setJ_(k, o) { props_().setProperty(k, JSON.stringify(o)); }

function withLock_(fn) {
  var l = LockService.getScriptLock();
  l.waitLock(15000);
  try { return fn(); } finally { l.releaseLock(); }
}

function ss_() {
  var id = props_().getProperty('SHEET_ID');
  if (!id) throw new Error('run setup');
  return SpreadsheetApp.openById(id);
}
function sheet_() { return ss_().getSheetByName(SHEET_NAME); }
function reviewsSheet_() {
  var ss = ss_(), sh = ss.getSheetByName(REVIEW_SHEET);
  if (!sh) {
    sh = ss.insertSheet(REVIEW_SHEET);
    sh.appendRow(REVIEW_COLUMNS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, REVIEW_COLUMNS.length).setFontWeight('bold');
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
