(function () {
  'use strict';

  // ---- clickjacking guard: the page only shows when it is the top window
  if (window.top === window.self) {
    var af = document.getElementById('antiframe');
    if (af) af.remove();
  } else {
    try { window.top.location = window.self.location; } catch (e) { /* stays hidden */ }
    return;
  }

  var S = window.MagmafyScoring;
  var CFG = window.MAGMAFY_CONFIG;
  var STATUSES = ['جديد', 'تم التواصل', 'مقابلة', 'مقبول', 'مرفوض'];
  var SESSION_KEY = 'mg_session'; // session token lives in this tab only, never in localStorage

  var state = {
    rows: [], evals: {}, dups: {}, reviews: {}, source: 'none', // 'server' | 'demo' | 'file' | 'none'
    sortKey: 'score', sortDir: -1, band: '', selected: null,
    open: null, me: ''
  };

  // ---------- helpers ----------
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return el;
  }
  function $(id) { return document.getElementById(id); }
  function safeUrl(u) { return /^https?:\/\/\S+$/i.test(String(u || '').trim()) ? String(u).trim() : ''; }
  function fmtDate(iso) {
    var d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' });
  }
  function yearsRank(r) {
    var t = S.norm(r.years);
    return t.indexOf('اكثر') !== -1 ? 4 : (t.indexOf('3') !== -1 && t.indexOf('5') !== -1) ? 3 : t.indexOf('1') !== -1 ? 2 : t.indexOf('اقل') !== -1 ? 1 : 0;
  }
  function setMe(email) {
    $('meLabel').textContent = email || '';
    $('meAv').textContent = email ? email.charAt(0) : '';
    $('meBox').hidden = !email;
  }
  function review(id) { return state.reviews[id] || {}; }
  function statusOf(id) { return review(id).status || 'جديد'; }

  var ss = {
    get: function () { try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch (e) { return ''; } },
    set: function (v) { try { sessionStorage.setItem(SESSION_KEY, v); } catch (e) {} },
    del: function () { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }
  };

  // ---------- server calls ----------
  function api(action, payload) {
    var body = { action: action };
    Object.keys(payload || {}).forEach(function (k) { body[k] = payload[k]; });
    return fetch(CFG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      redirect: 'follow'
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error === 'auth' && action !== 'verifyCode') {
        forceLogout('انتهت الجلسة. سجّل الدخول من جديد.');
        throw new Error('auth');
      }
      return j;
    });
  }

  // ---------- screens ----------
  function showLogin(msg, isErr) {
    $('main').hidden = true;
    $('login').hidden = false;
    $('emailForm').hidden = false;
    $('codeForm').hidden = true;
    $('codeInput').value = '';
    setLoginMsg(msg || '', isErr);
    $('emailInput').focus();
  }
  function showMain() {
    $('login').hidden = true;
    $('main').hidden = false;
  }
  function setLoginMsg(t, isErr) {
    var el = $('loginMsg');
    el.textContent = t || '';
    el.className = 'login-msg' + (isErr ? ' err' : '');
  }

  function clearData() {
    state.rows = []; state.evals = {}; state.dups = {}; state.reviews = {}; state.source = 'none';
    state.selected = null; state.me = ''; state.open = null;
    closeDrawer(true);
    $('drawer').textContent = '';
    $('tbody').textContent = '';
    $('stats').textContent = '';
    $('dist').textContent = '';
    $('banner').textContent = '';
    $('q').value = '';
    setMe('');
    stopIdle();
  }

  function forceLogout(msg) {
    ss.del();
    clearData();
    showLogin(msg, true);
  }

  function logout() {
    var t = ss.get();
    ss.del();
    clearData();
    showLogin('تم تسجيل الخروج.', false);
    if (t) api('logout', { token: t }).catch(function () {});
  }

  // ---------- idle auto-logout ----------
  var idleTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(function () { logoutIdle(); }, CFG.idleLogoutMinutes * 60 * 1000);
  }
  function logoutIdle() {
    var t = ss.get();
    ss.del();
    clearData();
    showLogin('تم تسجيل الخروج تلقائيًا لعدم النشاط.', false);
    if (t) api('logout', { token: t }).catch(function () {});
  }
  function startIdle() {
    ['click', 'keydown', 'mousemove', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, resetIdle, { passive: true }); });
    resetIdle();
  }
  function stopIdle() { clearTimeout(idleTimer); }

  // ---------- data ----------
  function setRows(rows, source) {
    state.rows = rows.filter(function (r) { return r && (r.name || r.phone); }).map(function (r, i) { if (!r.id) r.id = 'row' + i; r.id = String(r.id); return r; });
    state.source = source;
    state.dups = S.findDuplicates(state.rows);
    state.evals = {};
    state.rows.forEach(function (r) { state.evals[r.id] = S.evaluate(r); });
    render();
  }

  function loadData() {
    var t = ss.get();
    if (!t) return Promise.resolve(false);
    banner('', 'جارٍ تحميل المتقدمين...');
    return api('getApplicants', { token: t }).then(function (j) {
      if (!j || !j.ok) { banner('error', 'تعذّر تحميل البيانات. حاول التحديث.'); return false; }
      state.me = j.me || '';
      state.reviews = j.reviews || {};
      state.open = j.open;
      setMe(state.me);
      banner('', '');
      setRows(j.rows || [], 'server');
      renderGate();
      return true;
    }).catch(function (e) {
      if (e && e.message === 'auth') return false;
      banner('error', 'تعذّر الاتصال بالسيرفر. تأكد من الإنترنت وحاول التحديث.');
      return false;
    });
  }

  var saveTimers = {};
  function saveReview(id) {
    if (state.source !== 'server') return; // demo and imported files stay in memory only
    clearTimeout(saveTimers[id]);
    saveTimers[id] = setTimeout(function () {
      var r = review(id);
      api('saveReview', { token: ss.get(), id: id, status: r.status || 'جديد', note: r.note || '' }).then(function (j) {
        if (!j || !j.ok) banner('error', 'تعذّر حفظ الحالة أو الملاحظة. حاول مرة تانية.');
      }).catch(function () {});
    }, 500);
  }

  function banner(kind, text) {
    var b = $('banner');
    b.textContent = '';
    if (text) b.appendChild(h('div', { class: 'banner ' + (kind || ''), text: text }));
  }

  function parseCSV(text) {
    var rows = [], row = [], cur = '', q = false, i, c;
    for (i = 0; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); cur = ''; rows.push(row); row = [];
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    var head = rows.shift() || [];
    return rows.filter(function (r) { return r.length > 1; }).map(function (r, n) {
      var o = {};
      head.forEach(function (k, j) { o[k.trim()] = r[j]; });
      if (!o.id) o.id = 'imp' + n;
      return o;
    });
  }

  // ---------- applications gate (close / open) ----------
  function renderGate() {
    var st = $('gateState'), btn = $('gateBtn'), hint = $('gateHint');
    if (state.open === null) { st.textContent = '...'; st.className = 'pill'; btn.disabled = true; return; }
    st.textContent = state.open ? 'مفتوح' : 'مغلق';
    st.className = 'pill ' + (state.open ? 'open' : 'closed');
    hint.textContent = state.open ? '' : ' الزوار بيشوفوا رسالة إن التقديم مقفول حاليًا.';
    btn.textContent = state.open ? 'قفل باب التقديم' : 'فتح باب التقديم';
    btn.className = 'btn' + (state.open ? ' danger' : ' primary');
    btn.disabled = false;
  }

  function confirmDialog(title, text, yesLabel) {
    return new Promise(function (resolve) {
      var dlg = $('confirmDlg');
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = text;
      $('confirmYes').textContent = yesLabel;
      function done(v) { dlg.close(); $('confirmYes').onclick = null; $('confirmNo').onclick = null; resolve(v); }
      $('confirmYes').onclick = function () { done(true); };
      $('confirmNo').onclick = function () { done(false); };
      dlg.addEventListener('cancel', function () { resolve(false); }, { once: true });
      dlg.showModal();
    });
  }

  function toggleGate() {
    var wantOpen = !state.open;
    var title = wantOpen ? 'فتح باب التقديم؟' : 'قفل باب التقديم؟';
    var text = wantOpen ? 'هيرجع الفورم يستقبل طلبات جديدة.' : 'الفورم هيتقفل فورًا ويظهر للناس إننا اكتفينا حاليًا وإنهم ينتظروا إعلان جديد. الطلبات الجديدة بترفض من السيرفر نفسه.';
    confirmDialog(title, text, wantOpen ? 'فتح' : 'قفل').then(function (yes) {
      if (!yes) return;
      $('gateBtn').disabled = true;
      api('setOpen', { token: ss.get(), open: wantOpen }).then(function (j) {
        if (j && j.ok) { state.open = j.open; renderGate(); }
        else { banner('error', 'تعذّر تغيير حالة التقديم.'); renderGate(); }
      }).catch(function () { renderGate(); });
    });
  }

  // ---------- filtering and sorting ----------
  function visibleRows() {
    var q = S.norm($('q').value.trim()), docs = $('fDocs').value, st = $('fStatus').value, yr = $('fYears').value;
    var min = +$('fMin').value;
    var list = state.rows.filter(function (r) {
      var e = state.evals[r.id];
      if (e.score < min) return false;
      if (state.band && e.band.key !== state.band) return false;
      if (docs === 'complete' && !e.docs.complete) return false;
      if (docs === 'incomplete' && e.docs.complete) return false;
      if (st && statusOf(r.id) !== st) return false;
      if (yr && S.norm(r.years).indexOf(yr) === -1) return false;
      if (q) {
        var blob = S.norm([r.name, r.country, r.niche, r.gulf, r.result, r.tracking, r.drop, r.platforms].join(' '));
        if (blob.indexOf(q) === -1) return false;
      }
      return true;
    });
    var k = state.sortKey, d = state.sortDir;
    list.sort(function (a, b) {
      var ea = state.evals[a.id], eb = state.evals[b.id], x, y;
      if (k === 'score') { x = ea.score; y = eb.score; }
      else if (k === 'years') { x = yearsRank(a); y = yearsRank(b); }
      else if (k === 'spend') { x = S.parseSpendUSD(a.spend); y = S.parseSpendUSD(b.spend); }
      else if (k === 'submittedAt') { x = new Date(a.submittedAt).getTime() || 0; y = new Date(b.submittedAt).getTime() || 0; }
      else { x = String(a[k] || ''); y = String(b[k] || ''); return x.localeCompare(y, 'ar') * d; }
      return (x - y) * d;
    });
    return list;
  }

  // ---------- render ----------
  function renderDemoBtn() {
    var b = $('demoBtn'), away = state.source === 'demo' || state.source === 'file';
    b.textContent = away ? 'الرجوع للبيانات الحقيقية' : 'بيانات تجريبية';
    b.className = 'btn' + (away ? ' primary' : '');
  }

  function render() {
    renderDemoBtn();
    renderBanner();
    renderStats();
    renderDist();
    renderTable();
    if (state.selected) renderDrawer(state.selected);
  }

  function renderBanner() {
    if (state.source === 'demo') banner('demo', 'بيانات تجريبية للعرض فقط. أسماء وأرقام وهمية، والحالات والملاحظات مش بتتحفظ.');
    else if (state.source === 'file') banner('demo', 'بيانات من ملف على جهازك. الحالات والملاحظات مش بتتحفظ.');
    else if (state.source === 'server' && !state.rows.length) banner('', 'لا يوجد متقدمون بعد.');
  }

  function renderStats() {
    var n = state.rows.length, complete = 0, sum = 0, strong = 0, miss = 0;
    state.rows.forEach(function (r) {
      var e = state.evals[r.id];
      sum += e.score;
      if (e.docs.complete) complete++; else miss++;
      if (e.score >= 75 && e.docs.complete) strong++;
    });
    var box = $('stats');
    box.textContent = '';
    [[n, 'إجمالي المتقدمين'], [complete, 'مستنداتهم مكتملة'], [miss, 'ينقصهم شيء'], [n ? Math.round(sum / n) : 0, 'متوسط التقييم'], [strong, 'ممتاز ومستندات مكتملة']].forEach(function (s) {
      box.appendChild(h('div', { class: 'stat' }, h('b', { text: s[0] }), h('span', { text: s[1] })));
    });
  }

  function renderDist() {
    var bands = [['top', 'ممتاز', '٧٥ فأكثر'], ['good', 'جيد', '٥٥ إلى ٧٤'], ['mid', 'متوسط', '٣٥ إلى ٥٤'], ['low', 'ضعيف', 'أقل من ٣٥']];
    var counts = { top: 0, good: 0, mid: 0, low: 0 };
    state.rows.forEach(function (r) { counts[state.evals[r.id].band.key]++; });
    var max = Math.max(1, counts.top, counts.good, counts.mid, counts.low);
    var box = $('dist');
    box.textContent = '';
    bands.forEach(function (b) {
      var btn = h('button', { type: 'button', 'aria-pressed': state.band === b[0] ? 'true' : 'false', onclick: function () { state.band = state.band === b[0] ? '' : b[0]; render(); } },
        h('span', { class: 'band-' + b[0], text: b[1] + ' ' }), h('span', { class: 'small', text: b[2] }),
        h('div', null, h('strong', { text: counts[b[0]] })),
        h('div', { class: 'bar ' + b[0] }, h('i', { style: 'width:' + Math.round(counts[b[0]] / max * 100) + '%' })));
      box.appendChild(btn);
    });
  }

  function docsPill(e) {
    if (e.docs.complete) return h('span', { class: 'pill ok', text: e.docs.warnings.length ? 'مكتملة، راجع التنبيهات' : 'مكتملة' });
    return h('span', { class: 'pill miss', text: 'ناقص: ' + e.docs.missing.slice(0, 2).join('، ') + (e.docs.missing.length > 2 ? '...' : '') });
  }

  function renderTable() {
    var list = visibleRows(), tb = $('tbody');
    tb.textContent = '';
    if (!list.length) {
      tb.appendChild(h('tr', null, h('td', { colspan: 9, class: 'empty', text: state.rows.length ? 'لا نتائج مطابقة للفلاتر.' : 'لا يوجد متقدمون بعد.' })));
      return;
    }
    list.forEach(function (r, i) {
      var e = state.evals[r.id];
      var tr = h('tr', { tabindex: '0', 'aria-selected': state.selected === r.id ? 'true' : 'false', onclick: function () { openDrawer(r.id); }, onkeydown: function (ev) { if (ev.key === 'Enter') openDrawer(r.id); } },
        h('td', { class: 'rank', text: i + 1 }),
        h('td', null, h('b', { text: r.name || '(بدون اسم)' }), h('div', { class: 'small', text: r.country || '' }), state.dups[r.id] ? h('span', { class: 'pill warn', text: 'نص مكرر' }) : null),
        h('td', null, h('div', { class: 'score ' + e.band.key }, h('b', { text: e.score }), h('div', { class: 'meter' }, h('i', { style: 'width:' + e.score + '%' })))),
        h('td', { text: r.years || '-' }),
        h('td', { class: 'ltr', text: S.parseSpendUSD(r.spend) ? '$' + S.parseSpendUSD(r.spend).toLocaleString('en-US') : '-' }),
        h('td', { class: 'rate' + (r.rate ? '' : ' none'), text: r.rate || 'لم يذكر' }),
        h('td', null, docsPill(e)),
        h('td', { text: fmtDate(r.submittedAt) }),
        h('td', null, h('span', { class: 'pill neutral', text: statusOf(r.id) })));
      tb.appendChild(tr);
    });
  }

  // ---------- drawer ----------
  function openDrawer(id) { state.selected = id; renderDrawer(id); renderTable(); $('drawer').classList.add('open'); $('scrim').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer(silent) {
    state.selected = null;
    $('drawer').classList.remove('open'); $('scrim').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true');
    if (!silent) renderTable();
  }

  function linkRow(label, info) {
    var text = { missing: 'غير موجود', invalid: 'رابط غير صالح', ok: 'رابط من ' + info.kind, unknown: 'رابط غير معروف' }[info.status];
    var cls = info.status === 'ok' ? 'ok' : info.status === 'unknown' ? 'warn' : 'miss';
    var li = h('li', null, h('span', { class: 'pill ' + cls, text: text }), h('span', { text: label }));
    if (info.url && safeUrl(info.url)) li.appendChild(h('a', { href: safeUrl(info.url), target: '_blank', rel: 'noopener noreferrer', text: 'افتح' }));
    if (info.url) li.appendChild(h('span', { class: 'url', text: String(info.url).slice(0, 300) }));
    return li;
  }

  function renderDrawer(id) {
    var r = state.rows.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var e = state.evals[id], d = $('drawer');
    d.textContent = '';
    var phone = String(r.phone || '').replace(/[^\d]/g, '');
    d.appendChild(h('button', { class: 'btn close', type: 'button', onclick: function () { closeDrawer(); }, text: 'إغلاق' }));
    d.appendChild(h('h2', { text: r.name || '(بدون اسم)' }));
    d.appendChild(h('div', { class: 'rate-hero' + (r.rate ? '' : ' none') },
      h('small', { text: 'المقابل المتوقع على كل عميل' }),
      h('b', { text: r.rate || 'لم يذكر المقابل' })));
    var facts = h('div', { class: 'facts' });
    [['بلد الإقامة', r.country], ['سنوات الخبرة', r.years], ['متى يبدأ', r.avail], ['واتساب', r.phone, true], ['الإيميل', r.email, true, true]].forEach(function (f) {
      facts.appendChild(h('div', { class: 'fact' + (f[3] ? ' wide' : '') }, h('small', { text: f[0] }), h('b', { class: f[2] ? 'ltr' : '', text: f[1] || 'لم يُجب' })));
    });
    d.appendChild(facts);
    d.appendChild(h('div', { class: 'head-score' },
      h('div', { class: 'big band-' + e.band.key, text: e.score }),
      h('div', null, h('b', { class: 'band-' + e.band.key, text: e.band.label }), h('div', { class: 'small', text: 'من ١٠٠' }))));

    var actions = h('div', { class: 'row-actions' });
    if (phone.length >= 8) actions.appendChild(h('a', { class: 'btn primary', href: 'https://wa.me/' + phone, target: '_blank', rel: 'noopener noreferrer', text: 'واتساب' }));
    d.appendChild(actions);

    d.appendChild(h('h3', { text: 'المستندات' }));
    d.appendChild(h('ul', { class: 'checklist' }, linkRow('الـ CV', e.docs.cv), linkRow('النتائج السابقة', e.docs.work)));
    if (e.docs.missing.length) d.appendChild(h('p', { class: 'small', style: 'color:var(--bad);margin-top:10px', text: 'ناقص: ' + e.docs.missing.join('، ') }));
    else d.appendChild(h('p', { class: 'small', style: 'color:var(--good);margin-top:10px', text: 'كل البيانات والمستندات المطلوبة موجودة.' }));
    e.docs.warnings.forEach(function (w) { d.appendChild(h('p', { class: 'small', style: 'color:var(--warn)', text: '• ' + w })); });
    e.flags.concat(state.dups[id] ? ['نفس نص إجابة طويلة ظهر عند متقدم آخر، احتمال نسخ'] : []).forEach(function (f) {
      d.appendChild(h('p', { class: 'small', style: 'color:var(--warn)', text: '• ' + f }));
    });

    d.appendChild(h('h3', { text: 'تفصيل التقييم' }));
    e.parts.forEach(function (p) {
      var pct = Math.round(p.points / p.max * 100);
      var key = pct >= 75 ? 'top' : pct >= 50 ? 'good' : pct >= 30 ? 'mid' : 'low';
      d.appendChild(h('div', { class: 'crit' },
        h('span', { text: p.label }),
        h('div', { class: 'meter ' + key }, h('i', { style: 'width:' + pct + '%' })),
        h('span', { class: 'pts', text: p.points + '/' + p.max }),
        h('div', { class: 'note', text: p.note })));
    });

    d.appendChild(h('h3', { text: 'الحالة وملاحظاتك' }));
    var sel = h('select', { 'aria-label': 'الحالة', onchange: function () { state.reviews[id] = Object.assign({}, review(id), { status: sel.value }); saveReview(id); renderTable(); } });
    STATUSES.forEach(function (s) { sel.appendChild(h('option', { value: s, text: s, selected: statusOf(id) === s })); });
    d.appendChild(sel);
    var note = h('textarea', { 'aria-label': 'ملاحظات', maxlength: '2000', placeholder: state.source === 'server' ? 'ملاحظات المقابلة أو سبب القرار (بتتحفظ للمصرّح لهم فقط)' : 'ملاحظاتك', oninput: function () { state.reviews[id] = Object.assign({}, review(id), { note: note.value }); saveReview(id); } });
    note.value = review(id).note || '';
    d.appendChild(h('div', { style: 'margin-top:8px' }, note));
    if (review(id).by) d.appendChild(h('p', { class: 'small', text: 'آخر تعديل: ' + review(id).by }));

    d.appendChild(h('h3', { text: 'إجاباته كاملة' }));
    var qs = [['platforms', 'المنصات اللي أدارها بميزانية حقيقية'], ['spend', 'أعلى ميزانية شهرية أدارها'], ['niche', 'خبرته في الأثاث والديكور والمتاجر'], ['gulf', 'خبرته مع السوق السعودي والخليجي'], ['result', 'أفضل نتيجة حققها لعميل'], ['tracking', 'إزاي بيتأكد إن التتبع سليم'], ['drop', 'أول ٣ حاجات بيفحصها لما الأداء يهبط'], ['more', 'أي شيء تاني حب يقوله']];
    qs.forEach(function (f, i) {
      var v = r[f[0]] == null ? '' : String(r[f[0]]).trim();
      d.appendChild(h('div', { class: 'answer' },
        h('div', { class: 'a-label' }, h('i', { text: i + 1 }), h('span', { text: f[1] })),
        h('div', { class: 'a-text' + (v ? '' : ' a-empty'), text: v || 'لم يُجب' })));
    });
  }

  // ---------- login flow ----------
  var pendingEmail = '';
  var resendTimer = null;

  function startResendCooldown() {
    var btn = $('resendBtn'), left = 60;
    btn.disabled = true;
    clearInterval(resendTimer);
    btn.textContent = 'إعادة الإرسال بعد ' + left + ' ثانية';
    resendTimer = setInterval(function () {
      left--;
      if (left <= 0) { clearInterval(resendTimer); btn.disabled = false; btn.textContent = 'إعادة إرسال الكود'; }
      else btn.textContent = 'إعادة الإرسال بعد ' + left + ' ثانية';
    }, 1000);
  }

  function requestCode(email) {
    $('emailBtn').disabled = true;
    setLoginMsg('جارٍ الإرسال...', false);
    return api('requestCode', { email: email }).then(function () {
      pendingEmail = email;
      $('emailForm').hidden = true;
      $('codeForm').hidden = false;
      $('codeInput').value = '';
      $('codeInput').focus();
      setLoginMsg('', false);
      startResendCooldown();
    }).catch(function () {
      setLoginMsg('تعذّر الاتصال. حاول تاني.', true);
    }).then(function () { $('emailBtn').disabled = false; });
  }

  function bindLogin() {
    $('emailForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var email = $('emailInput').value.trim();
      if (!/^\S+@\S+\.\S+$/.test(email)) { setLoginMsg('اكتب إيميل صحيح.', true); return; }
      requestCode(email);
    });
    $('codeForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var code = $('codeInput').value.replace(/\s/g, '');
      if (!/^\d{8}$/.test(code)) { setLoginMsg('الكود ٨ أرقام.', true); return; }
      $('codeBtn').disabled = true;
      setLoginMsg('جارٍ التحقق...', false);
      api('verifyCode', { email: pendingEmail, code: code }).then(function (j) {
        if (j && j.ok && j.token) {
          ss.set(j.token);
          $('codeInput').value = '';
          return enterApp();
        }
        $('codeInput').value = '';
        setLoginMsg('الكود غير صحيح أو انتهت صلاحيته. اطلب كود جديد.', true);
      }).catch(function () { setLoginMsg('تعذّر الاتصال. حاول تاني.', true); })
        .then(function () { $('codeBtn').disabled = false; });
    });
    $('resendBtn').addEventListener('click', function () { if (pendingEmail) requestCode(pendingEmail); });
    $('changeEmailBtn').addEventListener('click', function () {
      pendingEmail = '';
      clearInterval(resendTimer);
      $('codeForm').hidden = true; $('emailForm').hidden = false; $('emailInput').focus(); setLoginMsg('', false);
    });
  }

  function enterApp() {
    return loadData().then(function (okLoad) {
      if (okLoad) { showMain(); startIdle(); }
      else if (!ss.get()) showLogin('', false);
      else showMain();
    });
  }

  // ---------- wiring ----------
  function bind() {
    var statusSel = $('fStatus');
    statusSel.appendChild(h('option', { value: '', text: 'الكل' }));
    STATUSES.forEach(function (s) { statusSel.appendChild(h('option', { value: s, text: s })); });
    ['q', 'fDocs', 'fStatus', 'fYears'].forEach(function (id) { $(id).addEventListener('input', renderTable); });
    $('fMin').addEventListener('input', function () { $('minVal').textContent = $('fMin').value; renderTable(); });
    Array.prototype.forEach.call(document.querySelectorAll('th [data-sort]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-sort');
        if (state.sortKey === k) state.sortDir *= -1; else { state.sortKey = k; state.sortDir = k === 'name' ? 1 : -1; }
        renderTable();
      });
    });
    $('scrim').addEventListener('click', function () { closeDrawer(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.selected) closeDrawer(); });

    $('demoBtn').addEventListener('click', function () {
      closeDrawer(true);
      if (state.source === 'demo' || state.source === 'file') { loadData(); return; } // back to the real data
      state.reviews = {};
      setRows(JSON.parse(JSON.stringify(window.MAGMAFY_DEMO_ROWS)), 'demo');
    });
    $('refreshBtn').addEventListener('click', function () { loadData(); });
    $('logoutBtn').addEventListener('click', logout);
    $('gateBtn').addEventListener('click', toggleGate);
    $('importBtn').addEventListener('click', function () { $('fileInput').click(); });
    $('fileInput').addEventListener('change', function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var rows = /\.json$/i.test(f.name) ? JSON.parse(rd.result) : parseCSV(String(rd.result).replace(/^﻿/, ''));
          if (rows && rows.rows) rows = rows.rows;
          if (!Array.isArray(rows)) throw new Error('صيغة غير مدعومة');
          closeDrawer(true);
          state.reviews = {};
          setRows(rows, 'file');
        } catch (err) { banner('error', 'تعذّر قراءة الملف: ' + err.message); }
      };
      rd.readAsText(f);
      ev.target.value = '';
    });
  }

  function boot() {
    bind();
    bindLogin();
    if (ss.get()) {
      // a saved session in this tab: try it; the server decides if it is still valid
      loadData().then(function (okLoad) {
        if (okLoad) { showMain(); startIdle(); }
        else if (!ss.get()) { /* forceLogout already showed the login */ }
        else showLogin('', false);
      });
    } else showLogin('', false);
  }

  boot();
})();
