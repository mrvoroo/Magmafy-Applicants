// Browser end-to-end of the communication center (real Chrome + real Code.gs logic in a simulated Google). Run: node apps-script/ui-e2e.js
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'); // needs: npm i playwright, and Chrome (set CHROME=/path if not /usr/bin/google-chrome)
const { makeEnv } = require(root + '/apps-script/test.js');
const A = 'mrvoroo@gmail.com', B = 'abdallahmahmood777@gmail.com';
const env = makeEnv(A + ',' + B);
// seed applicants
env.post({ action: 'submit', name: 'سارة أحمد', phone: '01001234567', email: 'sara@example.com', country: 'مصر', years: 'اكثر من 5 سنوات', rate: '150$ لكل عميل', lang: 'ar' });
env.post({ action: 'submit', name: 'Omar Khaled', phone: '+966501234567', email: 'omar@example.com', country: 'Saudi Arabia', years: '3 إلى 5 سنوات', lang: 'en' });
env.mails.length = 0;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const srv = http.createServer((q, r) => { let p = q.url.split('?')[0]; if (p === '/') p = '/index.html'; const f = path.join(root, p); if (!fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f)); }).listen(8099);
let pass = 0, fail = 0; const ok = (c, n) => { if (c) pass++; else { fail++; console.log('FAIL:', n); } };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await (await b.newContext({ viewport: { width: 1360, height: 900 }, locale: 'ar-EG' })).newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(String(e))); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.route('https://script.google.com/**', async (rt) => { const body = rt.request().postData(); await rt.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(env.post(null, body)) }); });
  await pg.context().route('https://wa.me/**', (rt) => rt.fulfill({ status: 200, contentType: 'text/html', body: 'wa' }));
  await pg.route('https://fonts.*/**', (rt) => rt.abort()); await pg.route('https://careers.magmafyogp.com/**', (rt) => rt.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(root + '/apple-touch-icon.png') }));
  await pg.goto('http://localhost:8099/');
  await pg.fill('#emailInput', A); await pg.click('#emailBtn');
  await pg.waitForSelector('#codeForm:not([hidden])');
  const code = env.mails[env.mails.length - 1].body.match(/\d{8}/)[0];
  await pg.fill('#codeInput', code); await pg.click('#codeBtn');
  await pg.waitForSelector('#main:not([hidden])'); await pg.waitForSelector('#tbody tr');
  ok(await pg.locator('#newMailBtn').isEnabled(), 'comms buttons enabled on real data');
  // open Sara drawer
  await pg.locator('#tbody tr', { hasText: 'سارة' }).click();
  await pg.waitForSelector('#drawer.open');
  await pg.locator('#drawer button', { hasText: 'إرسال إيميل' }).click();
  await pg.waitForSelector('#mailDlg[open]');
  await pg.waitForFunction(() => document.getElementById('mBody').value.includes('أهلًا'));
  ok((await pg.inputValue('#mSubj')).includes('مبروك'), 'default template for applicant is "advance" in Arabic');
  await pg.waitForFunction(() => (document.getElementById('mFrame').srcdoc || '').includes('Magmafy'), null, { timeout: 8000 });
  const fr = pg.frameLocator('#mFrame');
  ok((await fr.locator('body').innerText()).includes('سارة'), 'preview shows the applicant name filled in');
  ok((await fr.locator('img').first().evaluate((i) => i.complete && i.naturalWidth > 0)), 'logo image allowed in preview (CSP)');
  await pg.screenshot({ path: require('os').tmpdir() + '/ui-mail.png' });
  // interview template -> date/time/zone block
  await pg.selectOption('#mTpl', 'interview');
  await pg.waitForSelector('#mWhen:not([hidden])');
  await pg.fill('#mDate', '2026-11-26'); await pg.fill('#mTime', '16:00');
  const note = await pg.textContent('#mWhenNote');
  ok(note.includes('GMT+3') && note.includes('بتوقيت مصر') && note.includes('GMT+2'), 'interview note states Saudi time and Egypt equivalent: ' + note);
  await pg.waitForTimeout(1200);
  ok((await fr.locator('body').innerText()).includes('GMT+3'), 'preview contains the time zone');
  await pg.screenshot({ path: require('os').tmpdir() + '/ui-mail-interview.png' });
  // English switch
  await pg.selectOption('#mLang', 'en'); await pg.waitForTimeout(1200);
  ok((await pg.inputValue('#mSubj')).startsWith('Your interview'), 'English template loaded');
  await pg.selectOption('#mLang', 'ar'); await pg.waitForTimeout(300);
  const n0 = env.mails.length;
  await pg.click('#mSend'); await pg.waitForSelector('#confirmDlg[open]');
  ok((await pg.textContent('#confirmText')).includes('magmafyogp@gmail.com') && (await pg.textContent('#confirmText')).includes('sara@example.com'), 'confirm shows sender and recipient');
  await pg.click('#confirmYes'); await pg.waitForSelector('#mailDlg:not([open])', { state: 'attached' });
  ok(env.mails.length === n0 + 1 && env.mails[n0].to === 'sara@example.com' && env.mails[n0].replyTo === 'magmafyogp@gmail.com', 'mail sent to Sara with replyTo');
  ok(env.mails[n0].body.includes('GMT+3') && !/\{(name|date|time)\}/.test(env.mails[n0].body), 'sent text has timezone and no leftover placeholders');
  await pg.waitForSelector('#banner .banner.ok');
  await pg.waitForFunction(() => document.querySelector('#drawer .history'));
  ok((await pg.textContent('#drawer .history')).includes('إيميل'), 'history shows the email');
  ok((await pg.locator('#tbody tr', { hasText: 'سارة' }).textContent()).includes('مقابلة'), 'status moved to interview');
  // WhatsApp
  await pg.locator('#drawer button', { hasText: 'رسالة واتساب' }).click();
  await pg.waitForSelector('#waDlg[open]');
  ok((await pg.textContent('#wPhone')).includes('+201001234567') && (await pg.textContent('#wPhone')).includes('محلي'), 'local number normalised with warning');
  await pg.selectOption('#wTpl', 'accepted'); await pg.waitForTimeout(200);
  ok((await pg.textContent('#wFinal')).includes('سارة'), 'WhatsApp text filled with the name');
  await pg.selectOption('#wTpl', 'interview'); await pg.fill('#wDate', '2026-11-26'); await pg.fill('#wTime', '16:00');
  await pg.waitForTimeout(200);
  ok((await pg.textContent('#wFinal')).includes('GMT+3'), 'WhatsApp interview text states the zone');
  await pg.screenshot({ path: require('os').tmpdir() + '/ui-wa.png' });
  const [popup] = await Promise.all([pg.context().waitForEvent('page', { timeout: 5000 }).catch(() => null), pg.click('#wOpen')]);
  if (popup) { await popup.waitForLoadState().catch(() => {}); ok(popup.url().startsWith('https://wa.me/201001234567?text='), 'opens wa.me with prefilled text'); await popup.close().catch(() => {}); } else ok(false, 'wa popup');
  await pg.waitForTimeout(600);
  ok(env.sheets.Messages.some((r) => r[2] === 'whatsapp'), 'WhatsApp open logged');
  // Templates editor
  await pg.keyboard.press('Escape');
  await pg.click('#tplBtn'); await pg.waitForSelector('#tplDlg[open]');
  await pg.locator('#tTabs .tab', { hasText: 'تم القبول' }).click();
  await pg.fill('#tSubj', 'مبروك جدًا | Magmafy'); await pg.click('#tSave');
  await pg.waitForFunction(() => document.getElementById('tMsg').textContent.includes('اتحفظ'));
  ok((await pg.textContent('#tState')).includes('معدّل'), 'edited template flagged');
  await pg.waitForTimeout(1200); await pg.screenshot({ path: require('os').tmpdir() + '/ui-templates.png' });
  await pg.click('#tReset'); await pg.waitForSelector('#confirmDlg[open]'); await pg.click('#confirmYes');
  await pg.waitForFunction(() => document.getElementById('tState').textContent.includes('الأصلي'));
  ok(true, 'reset works');
  await pg.keyboard.press('Escape');
  // custom blank mail
  await pg.click('#newMailBtn'); await pg.waitForSelector('#mailDlg[open]');
  ok(await pg.locator('#mCustomBox').isVisible(), 'custom recipient box shown for new blank mail');
  await pg.fill('#mCustom', 'friend@example.com'); await pg.fill('#mSubj', 'Hello'); await pg.fill('#mBody', 'Just a test message');
  await pg.waitForTimeout(1200);
  const n1 = env.mails.length; await pg.click('#mSend'); await pg.waitForSelector('#confirmDlg[open]'); await pg.click('#confirmYes');
  await pg.waitForSelector('#mailDlg:not([open])', { state: 'attached' });
  ok(env.mails.length === n1 + 1 && env.mails[n1].to === 'friend@example.com', 'blank mail to a custom address sent');
  // demo mode disables
  await pg.click('#demoBtn'); await pg.waitForTimeout(200);
  ok(await pg.locator('#newMailBtn').isDisabled(), 'comms disabled in demo mode');
  ok(errs.filter((e) => !/fonts|ERR_FAILED|Failed to load resource/.test(e)).length === 0, 'no console errors: ' + errs.join(' | '));
  console.log(fail ? fail + ' FAILED, ' + pass + ' passed' : 'PW: ALL ' + pass + ' CHECKS PASSED');
  await b.close(); srv.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
