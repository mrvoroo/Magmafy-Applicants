(function () {
  'use strict';
  var S = window.MagmafyScoring;
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  var STATUSES = ['جديد', 'تم التواصل', 'مقابلة', 'مقبول', 'مرفوض'];
  var state = {
    rows: [], evals: {}, dups: {}, demo: false,
    sortKey: 'score', sortDir: -1, band: '', selected: null,
    status: JSON.parse(LS.get('mg_status', '{}')),
    notes: JSON.parse(LS.get('mg_notes', '{}'))
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
  function statusOf(id) { return state.status[id] || 'جديد'; }

  // ---------- data ----------
  function setRows(rows, demo) {
    state.rows = rows.filter(function (r) { return r && (r.name || r.phone); });
    state.demo = !!demo;
    state.dups = S.findDuplicates(state.rows);
    state.evals = {};
    state.rows.forEach(function (r) { state.evals[r.id] = S.evaluate(r); });
    render();
  }

  function banner(kind, text) {
    var b = $('banner');
    b.textContent = '';
    if (text) b.appendChild(h('div', { class: 'banner ' + (kind || ''), text: text }));
  }

  function loadFromSheet() {
    var ep = LS.get('mg_endpoint', ''), tk = LS.get('mg_token', '');
    if (!ep || !tk) { banner('', 'اربط الشيت من زر «ربط الشيت»، أو جرّب «بيانات تجريبية» لتشوف اللوحة.'); return Promise.resolve(); }
    banner('', 'جارٍ تحميل المتقدمين...');
    return fetch(ep + (ep.indexOf('?') === -1 ? '?' : '&') + 'token=' + encodeURIComponent(tk))
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error === 'unauthorized' ? 'التوكن غير صحيح' : (j.error || 'خطأ غير معروف'));
        banner('', '');
        setRows(j.rows || [], false);
      })
      .catch(function (e) { banner('error', 'تعذّر تحميل الشيت: ' + e.message + '. راجع الرابط والتوكن وأن الـ Web app منشور لـ «Anyone».'); });
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
  function render() {
    renderBanner();
    renderStats();
    renderDist();
    renderTable();
    if (state.selected) renderDrawer(state.selected);
  }

  function renderBanner() {
    if (state.demo) banner('demo', 'بيانات تجريبية للعرض فقط. أسماء وأرقام وهمية.');
    else if (!state.rows.length && !$('banner').textContent) banner('', 'لا يوجد متقدمون بعد.');
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
      tb.appendChild(h('tr', null, h('td', { colspan: 8, class: 'empty', text: state.rows.length ? 'لا نتائج مطابقة للفلاتر.' : 'لا يوجد متقدمون بعد. اربط الشيت أو جرّب البيانات التجريبية.' })));
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
        h('td', null, docsPill(e)),
        h('td', { text: fmtDate(r.submittedAt) }),
        h('td', null, h('span', { class: 'pill neutral', text: statusOf(r.id) })));
      tb.appendChild(tr);
    });
  }

  // ---------- drawer ----------
  function openDrawer(id) { state.selected = id; renderDrawer(id); renderTable(); $('drawer').classList.add('open'); $('scrim').classList.add('open'); $('drawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { state.selected = null; $('drawer').classList.remove('open'); $('scrim').classList.remove('open'); $('drawer').setAttribute('aria-hidden', 'true'); renderTable(); }

  function linkRow(label, info) {
    var text = { missing: 'غير موجود', invalid: 'رابط غير صالح', ok: 'رابط من ' + info.kind, unknown: 'رابط غير معروف' }[info.status];
    var cls = info.status === 'ok' ? 'ok' : info.status === 'unknown' ? 'warn' : 'miss';
    var li = h('li', null, h('span', { class: 'pill ' + cls, text: text }), h('span', { text: label }));
    if (info.url && safeUrl(info.url)) li.appendChild(h('a', { href: safeUrl(info.url), target: '_blank', rel: 'noopener noreferrer', text: 'افتح' }));
    return li;
  }

  function renderDrawer(id) {
    var r = state.rows.filter(function (x) { return x.id === id; })[0];
    if (!r) return;
    var e = state.evals[id], d = $('drawer');
    d.textContent = '';
    var phone = String(r.phone || '').replace(/[^\d]/g, '');
    d.appendChild(h('button', { class: 'btn close', type: 'button', onclick: closeDrawer, text: 'إغلاق' }));
    d.appendChild(h('h2', { text: r.name || '(بدون اسم)' }));
    d.appendChild(h('div', { class: 'small', text: [r.country, r.years, r.avail ? 'يبدأ: ' + r.avail : '', r.rate ? 'المقابل: ' + r.rate : ''].filter(Boolean).join(' | ') }));
    d.appendChild(h('div', { class: 'head-score' },
      h('div', { class: 'big band-' + e.band.key, text: e.score }),
      h('div', null, h('b', { class: 'band-' + e.band.key, text: e.band.label }), h('div', { class: 'small', text: 'من ١٠٠' }))));

    var actions = h('div', { class: 'row-actions' });
    if (phone.length >= 8) {
      actions.appendChild(h('a', { class: 'btn primary', href: 'https://wa.me/' + phone, target: '_blank', rel: 'noopener noreferrer', text: 'واتساب' }));
    }
    d.appendChild(actions);

    d.appendChild(h('h3', { text: 'المستندات' }));
    var ul = h('ul', { class: 'checklist' }, linkRow('الـ CV', e.docs.cv), linkRow('النتائج السابقة', e.docs.work));
    d.appendChild(ul);
    if (e.docs.missing.length) {
      d.appendChild(h('p', { class: 'small', style: 'color:var(--bad);margin-top:10px', text: 'ناقص: ' + e.docs.missing.join('، ') }));
    } else d.appendChild(h('p', { class: 'small', style: 'color:var(--good);margin-top:10px', text: 'كل البيانات والمستندات المطلوبة موجودة.' }));
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
    var sel = h('select', { 'aria-label': 'الحالة', onchange: function () { state.status[id] = sel.value; LS.set('mg_status', JSON.stringify(state.status)); renderTable(); } });
    STATUSES.forEach(function (s) { sel.appendChild(h('option', { value: s, text: s, selected: statusOf(id) === s })); });
    d.appendChild(sel);
    var note = h('textarea', { 'aria-label': 'ملاحظات', placeholder: 'ملاحظات المقابلة أو سبب القرار (محفوظة على متصفحك فقط)', oninput: function () { state.notes[id] = note.value; LS.set('mg_notes', JSON.stringify(state.notes)); } });
    note.value = state.notes[id] || '';
    d.appendChild(h('div', { style: 'margin-top:8px' }, note));

    d.appendChild(h('h3', { text: 'إجاباته' }));
    [['platforms', 'المنصات'], ['spend', 'أعلى ميزانية شهرية'], ['niche', 'خبرة الأثاث والمتاجر'], ['gulf', 'السوق الخليجي'], ['result', 'أفضل نتيجة'], ['tracking', 'التأكد من التتبع'], ['drop', 'أول ٣ فحوصات عند هبوط الأداء'], ['more', 'ملاحظات منه']].forEach(function (f) {
      if (r[f[0]]) d.appendChild(h('div', { class: 'answer' }, h('b', { text: f[1] }), String(r[f[0]])));
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
    $('scrim').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && state.selected) closeDrawer(); });

    $('demoBtn').addEventListener('click', function () { banner('', ''); setRows(window.MAGMAFY_DEMO_ROWS, true); });
    $('refreshBtn').addEventListener('click', loadFromSheet);
    $('importBtn').addEventListener('click', function () { $('fileInput').click(); });
    $('fileInput').addEventListener('change', function (ev) {
      var f = ev.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var rows = /\.json$/i.test(f.name) ? JSON.parse(rd.result) : parseCSV(String(rd.result).replace(/^﻿/, ''));
          if (rows.rows) rows = rows.rows;
          banner('', '');
          setRows(rows, false);
        } catch (err) { banner('error', 'تعذّر قراءة الملف: ' + err.message); }
      };
      rd.readAsText(f);
      ev.target.value = '';
    });

    var dlg = $('settings');
    $('settingsBtn').addEventListener('click', function () {
      $('endpointInput').value = LS.get('mg_endpoint', '');
      $('tokenInput').value = LS.get('mg_token', '');
      dlg.showModal();
    });
    $('settingsForm').addEventListener('submit', function (ev) {
      var v = ev.submitter && ev.submitter.value;
      if (v === 'save') {
        var ep = $('endpointInput').value.trim();
        if (ep && !/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(ep)) { ev.preventDefault(); banner('error', 'الرابط لازم يكون رابط Web app من Google Apps Script وينتهي بـ /exec'); return; }
        LS.set('mg_endpoint', ep); LS.set('mg_token', $('tokenInput').value.trim());
        loadFromSheet();
      } else if (v === 'clear') {
        LS.del('mg_endpoint'); LS.del('mg_token');
        setRows([], false); banner('', 'تم مسح رابط الشيت والتوكن من المتصفح.');
      }
    });
  }

  bind();
  render();
  loadFromSheet();
})();
