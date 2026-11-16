// End-to-end check of the dashboard UI against the simulated backend. Run: node apps-script/e2e.js (needs jsdom)
const { JSDOM } = require('jsdom'), fs = require('fs'), path = require('path');
const { makeEnv } = require('./test.js');
const root = path.join(__dirname, '..');
const A = 'mrvoroo@gmail.com', B = 'abdallahmahmood777@gmail.com';
const env = makeEnv(A + ',' + B);
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script src="([^"]+)"><\/script>/g, (m, s) => '<script>' + fs.readFileSync(path.join(root, s), 'utf8') + '</script>')
  .replace(/<link[^>]*fonts[^>]*>/g, '');
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL:', n); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dom = new JSDOM(html, { runScripts: 'dangerously', url: 'https://app.test/', pretendToBeVisual: true,
    beforeParse(w) {
      w.fetch = (u, o) => Promise.resolve({ json: () => Promise.resolve(env.post(null, o.body)) });
      w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
      w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
    } });
  const w = dom.window, d = w.document, $ = (id) => d.getElementById(id);
  const type = (el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  const submit = (f) => f.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(50);

  ok(!$('login').hidden && $('main').hidden, 'starts on login, app hidden');
  ok(!d.body.textContent.includes('Ali'), 'no applicant data before login');

  // attacker
  type($('emailInput'), 'attacker@evil.com'); submit($('emailForm')); await sleep(1700);
  ok(env.mails.length === 0, 'attacker gets no mail'); ok(!$('codeForm').hidden, 'UI shows same next step for attacker');
  type($('codeInput'), '12345678'); submit($('codeForm')); await sleep(1000);
  ok($('main').hidden, 'attacker stays out'); ok($('loginMsg').textContent.includes('غير صحيح'), 'generic error shown');

  // real admin, wrong then right
  $('changeEmailBtn').click(); type($('emailInput'), A); submit($('emailForm')); await sleep(100);
  ok(env.mails.length === 1 && env.mails[0].to === A, 'admin gets mail');
  type($('codeInput'), '00000000'); submit($('codeForm')); await sleep(1000); ok($('main').hidden, 'wrong code rejected');
  const code = env.mails[0].body.match(/\d{8}/)[0];
  type($('codeInput'), code); submit($('codeForm')); await sleep(300);
  ok(!$('main').hidden && $('login').hidden, 'admin enters'); ok($('tbody').textContent.includes('Ali'), 'data shown');
  ok($('gateState').textContent === 'مفتوح', 'gate shows open'); ok($('meLabel').textContent === A, 'shows who is logged in');
  ok(w.sessionStorage.getItem('mg_session').length === 96, 'session token kept in sessionStorage only');
  ok(w.localStorage.length === 0, 'nothing in localStorage');

  // close applications
  $('gateBtn').click(); ok($('confirmDlg').hasAttribute('open'), 'asks for confirmation'); $('confirmYes').click(); await sleep(200);
  ok(env.get({ action: 'status' }).open === false && $('gateState').textContent === 'مغلق', 'applications closed on the server');
  ok(!env.post({ action: 'submit', name: 'x', phone: '+20100000000' }).ok, 'form submit refused while closed');

  // review saves to server
  d.querySelector('#tbody tr').click(); const sel = d.querySelector('#drawer select'); sel.value = 'مقابلة'; sel.dispatchEvent(new w.Event('change')); await sleep(800);
  ok(env.sheets.Reviews && env.sheets.Reviews.some((r) => r[1] === 'مقابلة' && r[3] === A), 'review stored on server with reviewer');

  // reopen
  $('gateBtn').click(); $('confirmYes').click(); await sleep(200); ok(env.get({ action: 'status' }).open === true, 'reopened');

  // logout wipes everything
  const tok = w.sessionStorage.getItem('mg_session');
  $('logoutBtn').click(); await sleep(200);
  ok(!$('login').hidden && $('main').hidden, 'back to login'); ok(!w.sessionStorage.getItem('mg_session'), 'token removed');
  ok(!d.body.textContent.includes('Ali') && $('tbody').children.length === 0 && $('drawer').textContent === '', 'no applicant data left in the page');
  ok(!env.post({ action: 'getApplicants', token: tok }).ok, 'server killed the session');

  // XSS: hostile applicant data is shown as text, never as markup
  env.sheets.Applicants.push(['a2', '', '<img src=x onerror="window.__x=1">', '+20100', 'x']);
  env.post({ action: 'requestCode', email: B }); const c2 = env.mails[env.mails.length - 1].body.match(/\d{8}/)[0];
  type($('emailInput'), B); submit($('emailForm')); await sleep(100);
  type($('codeInput'), env.mails[env.mails.length - 1].body.match(/\d{8}/)[0]); submit($('codeForm')); await sleep(300);
  ok(!d.querySelector('#tbody img') && !w.__x, 'hostile name rendered as text');

  console.log(fail === 0 ? `E2E: ALL ${pass} CHECKS PASSED` : `E2E: ${fail} FAILED, ${pass} passed`);
  process.exit(fail ? 1 : 0);
})();
