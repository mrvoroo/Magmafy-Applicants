(function (root) {
  'use strict';

  // ================= pure helpers (also unit-tested in node) =================

  var TPL_LABELS = {
    received: 'وصلنا طلبك',
    advance: 'عدّيت للمرحلة الجاية',
    interview: 'ميعاد المقابلة',
    accepted: 'تم القبول',
    rejected: 'اعتذار مهذّب',
    custom: 'رسالة فاضية'
  };
  var TPL_ORDER = ['received', 'advance', 'interview', 'accepted', 'rejected'];

  // Countries: dial code, Arabic and English name, accepted lengths of the national number (without the leading 0),
  // and spellings used to recognise the applicant's "country" answer. keep0: the leading 0 is part of the number (Italy).
  var COUNTRIES = [
    { cc: '20', ar: 'مصر', en: 'Egypt', len: [10], al: ['مصر', 'egypt', 'cairo', 'القاهرة', 'الاسكندرية', 'الإسكندرية', 'alexandria', 'الجيزة', 'giza'] },
    { cc: '966', ar: 'السعودية', en: 'Saudi Arabia', len: [9], al: ['السعود', 'saudi', 'ksa', 'riyadh', 'الرياض', 'jeddah', 'جدة', 'dammam', 'الدمام'] },
    { cc: '971', ar: 'الإمارات', en: 'UAE', len: [9], al: ['الامارات', 'الإمارات', 'emirates', 'uae', 'dubai', 'دبي', 'abu dhabi', 'ابوظبي', 'أبوظبي', 'sharjah', 'الشارقة'] },
    { cc: '965', ar: 'الكويت', en: 'Kuwait', len: [8], al: ['الكويت', 'kuwait'] },
    { cc: '974', ar: 'قطر', en: 'Qatar', len: [8], al: ['قطر', 'qatar', 'doha', 'الدوحة'] },
    { cc: '973', ar: 'البحرين', en: 'Bahrain', len: [8], al: ['البحرين', 'bahrain'] },
    { cc: '968', ar: 'عُمان', en: 'Oman', len: [8], al: ['عمان', 'عُمان', 'oman', 'muscat', 'مسقط'] },
    { cc: '962', ar: 'الأردن', en: 'Jordan', len: [9], al: ['الاردن', 'الأردن', 'jordan', 'amman', 'عمّان'] },
    { cc: '964', ar: 'العراق', en: 'Iraq', len: [10], al: ['العراق', 'iraq', 'baghdad', 'بغداد'] },
    { cc: '961', ar: 'لبنان', en: 'Lebanon', len: [7, 8], al: ['لبنان', 'lebanon', 'beirut', 'بيروت'] },
    { cc: '963', ar: 'سوريا', en: 'Syria', len: [9], al: ['سوريا', 'syria'] },
    { cc: '970', ar: 'فلسطين', en: 'Palestine', len: [9], al: ['فلسطين', 'palestine'] },
    { cc: '967', ar: 'اليمن', en: 'Yemen', len: [9], al: ['اليمن', 'yemen'] },
    { cc: '249', ar: 'السودان', en: 'Sudan', len: [9], al: ['السودان', 'sudan'] },
    { cc: '218', ar: 'ليبيا', en: 'Libya', len: [9, 10], al: ['ليبيا', 'libya'] },
    { cc: '216', ar: 'تونس', en: 'Tunisia', len: [8], al: ['تونس', 'tunisia'] },
    { cc: '213', ar: 'الجزائر', en: 'Algeria', len: [9], al: ['الجزائر', 'algeria'] },
    { cc: '212', ar: 'المغرب', en: 'Morocco', len: [9], al: ['المغرب', 'morocco'] },
    { cc: '222', ar: 'موريتانيا', en: 'Mauritania', len: [8], al: ['موريتانيا', 'mauritania'] },
    { cc: '252', ar: 'الصومال', en: 'Somalia', len: [8, 9], al: ['الصومال', 'somalia'] },
    { cc: '253', ar: 'جيبوتي', en: 'Djibouti', len: [8], al: ['جيبوتي', 'djibouti'] },
    { cc: '90', ar: 'تركيا', en: 'Turkey', len: [10], al: ['تركيا', 'turkey', 'türkiye', 'turkiye', 'istanbul', 'اسطنبول', 'إسطنبول'] },
    { cc: '92', ar: 'باكستان', en: 'Pakistan', len: [10], al: ['باكستان', 'pakistan'] },
    { cc: '91', ar: 'الهند', en: 'India', len: [10], al: ['الهند', 'india'] },
    { cc: '880', ar: 'بنغلاديش', en: 'Bangladesh', len: [10], al: ['بنغلاديش', 'bangladesh'] },
    { cc: '62', ar: 'إندونيسيا', en: 'Indonesia', len: [9, 10, 11, 12], al: ['اندونيسيا', 'إندونيسيا', 'indonesia'] },
    { cc: '60', ar: 'ماليزيا', en: 'Malaysia', len: [9, 10], al: ['ماليزيا', 'malaysia'] },
    { cc: '63', ar: 'الفلبين', en: 'Philippines', len: [10], al: ['الفلبين', 'philippines'] },
    { cc: '44', ar: 'بريطانيا', en: 'UK', len: [10], al: ['بريطانيا', 'المملكة المتحدة', 'انجلترا', 'إنجلترا', 'uk', 'united kingdom', 'england', 'london', 'لندن'] },
    { cc: '1', ar: 'أمريكا / كندا', en: 'USA / Canada', len: [10], al: ['امريكا', 'أمريكا', 'الولايات المتحدة', 'usa', 'united states', 'america', 'canada', 'كندا'] },
    { cc: '49', ar: 'ألمانيا', en: 'Germany', len: [10, 11], al: ['المانيا', 'ألمانيا', 'germany', 'deutschland'] },
    { cc: '33', ar: 'فرنسا', en: 'France', len: [9], al: ['فرنسا', 'france'] },
    { cc: '39', ar: 'إيطاليا', en: 'Italy', len: [9, 10], keep0: true, al: ['ايطاليا', 'إيطاليا', 'italy'] },
    { cc: '34', ar: 'إسبانيا', en: 'Spain', len: [9], al: ['اسبانيا', 'إسبانيا', 'spain'] },
    { cc: '31', ar: 'هولندا', en: 'Netherlands', len: [9], al: ['هولندا', 'netherlands', 'holland'] },
    { cc: '46', ar: 'السويد', en: 'Sweden', len: [9], al: ['السويد', 'sweden'] },
    { cc: '30', ar: 'اليونان', en: 'Greece', len: [10], al: ['اليونان', 'greece'] },
    { cc: '357', ar: 'قبرص', en: 'Cyprus', len: [8], al: ['قبرص', 'cyprus'] },
    { cc: '7', ar: 'روسيا', en: 'Russia', len: [10], al: ['روسيا', 'russia'] },
    { cc: '86', ar: 'الصين', en: 'China', len: [11], al: ['الصين', 'china'] },
    { cc: '61', ar: 'أستراليا', en: 'Australia', len: [9], al: ['استراليا', 'أستراليا', 'australia'] },
    { cc: '27', ar: 'جنوب أفريقيا', en: 'South Africa', len: [9], al: ['جنوب افريقيا', 'جنوب أفريقيا', 'south africa'] },
    { cc: '234', ar: 'نيجيريا', en: 'Nigeria', len: [10], al: ['نيجيريا', 'nigeria'] },
    { cc: '254', ar: 'كينيا', en: 'Kenya', len: [9], al: ['كينيا', 'kenya'] },
    { cc: '251', ar: 'إثيوبيا', en: 'Ethiopia', len: [9], al: ['اثيوبيا', 'إثيوبيا', 'ethiopia'] },
    { cc: '55', ar: 'البرازيل', en: 'Brazil', len: [10, 11], al: ['البرازيل', 'brazil'] },
    { cc: '52', ar: 'المكسيك', en: 'Mexico', len: [10], al: ['المكسيك', 'mexico'] }
  ];
  function countryOf(name) {
    var c = lc(name).trim();
    if (!c) return null;
    for (var i = 0; i < COUNTRIES.length; i++) for (var j = 0; j < COUNTRIES[i].al.length; j++) {
      var a = COUNTRIES[i].al[j];
      if (/[a-z]/.test(a) ? new RegExp('(^|[^a-z])' + a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(c) : c.indexOf(a) !== -1) return COUNTRIES[i];
    }
    return null;
  }
  function entryOf(cc) { for (var i = 0; i < COUNTRIES.length; i++) if (COUNTRIES[i].cc === cc) return COUNTRIES[i]; return null; }
  function matchCC(d) { for (var n = 3; n >= 1; n--) { var e = entryOf(d.slice(0, n)); if (e) return e; } return null; }
  // time zones offered for interviews; the first is the default
  var ZONES = [
    ['Asia/Riyadh', 'السعودية', 'Saudi Arabia'],
    ['Africa/Cairo', 'مصر', 'Egypt'],
    ['Asia/Dubai', 'الإمارات', 'UAE'],
    ['Asia/Kuwait', 'الكويت', 'Kuwait'],
    ['Asia/Qatar', 'قطر', 'Qatar'],
    ['Asia/Bahrain', 'البحرين', 'Bahrain'],
    ['Asia/Muscat', 'عُمان', 'Oman'],
    ['Asia/Amman', 'الأردن', 'Jordan'],
    ['Asia/Baghdad', 'العراق', 'Iraq'],
    ['Africa/Casablanca', 'المغرب', 'Morocco'],
    ['Europe/Istanbul', 'تركيا', 'Turkey'],
    ['Europe/London', 'بريطانيا', 'UK']
  ];
  var ZONE_OF = [
    ['مصر', 'Africa/Cairo'], ['egypt', 'Africa/Cairo'], ['السعود', 'Asia/Riyadh'], ['saudi', 'Asia/Riyadh'], ['الامارات', 'Asia/Dubai'], ['الإمارات', 'Asia/Dubai'], ['emirates', 'Asia/Dubai'], ['uae', 'Asia/Dubai'],
    ['الكويت', 'Asia/Kuwait'], ['kuwait', 'Asia/Kuwait'], ['قطر', 'Asia/Qatar'], ['qatar', 'Asia/Qatar'], ['البحرين', 'Asia/Bahrain'], ['bahrain', 'Asia/Bahrain'],
    ['عمان', 'Asia/Muscat'], ['oman', 'Asia/Muscat'], ['الاردن', 'Asia/Amman'], ['الأردن', 'Asia/Amman'], ['jordan', 'Asia/Amman'], ['العراق', 'Asia/Baghdad'], ['iraq', 'Asia/Baghdad'],
    ['المغرب', 'Africa/Casablanca'], ['morocco', 'Africa/Casablanca'], ['تركيا', 'Europe/Istanbul'], ['turkey', 'Europe/Istanbul']
  ];

  function lc(s) { return String(s == null ? '' : s).toLowerCase(); }
  function lookup(table, country) {
    var c = lc(country);
    for (var i = 0; i < table.length; i++) if (c.indexOf(table[i][0]) !== -1) return table[i][1];
    return '';
  }

  function toDigits(raw) {
    return String(raw == null ? '' : raw).replace(/[٠-٩]/g, function (c) { return c.charCodeAt(0) - 0x660; })
      .replace(/[۰-۹]/g, function (c) { return c.charCodeAt(0) - 0x6F0; }).replace(/[^\d]/g, '');
  }

  // Turns what the applicant typed into the full international number wa.me needs (digits only, no + and no leading zeros).
  // home = the country entry to assume for a local number; explicit = the user picked that country, so don't warn about assuming it.
  // -> { ok, digits, cc, national, warn }
  function parsePhone(raw, home, explicit) {
    var s = String(raw == null ? '' : raw), d = toDigits(s), plus = /^\s*\+/.test(s), intl = false;
    function bad(w) { return { ok: false, digits: '', cc: '', national: '', warn: w }; }
    if (!d) return bad('مفيش رقم');
    if (d.indexOf('00') === 0) { d = d.replace(/^0+/, ''); intl = true; } else if (plus) intl = true;
    var cc = '', nat = '', warn = '', e;
    if (intl) {
      e = matchCC(d);
      if (!e) return d.length >= 8 && d.length <= 15 ? { ok: true, digits: d, cc: '', national: d, warn: 'كود الدولة مش معروف. راجع الرقم.' } : bad('الرقم شكله غير صحيح');
      cc = e.cc; nat = d.slice(cc.length);
      if (!e.keep0 && nat.charAt(0) === '0') { nat = nat.replace(/^0+/, ''); warn = 'اتشال صفر زايد بعد كود الدولة.'; }
    } else if (d.charAt(0) === '0') {
      if (!home) return bad('الرقم محلي ومش قادر أحدد كود الدولة. اختار الدولة من القايمة.');
      cc = home.cc; nat = home.keep0 ? d : d.replace(/^0+/, '');
      if (!explicit) warn = 'الرقم محلي، اتفترض إنه من ' + home.ar + ' (+' + cc + '). تأكد منه قبل الإرسال.';
    } else if (home) {
      var rest = d.indexOf(home.cc) === 0 ? d.slice(home.cc.length) : null, rest0 = rest === null ? null : (home.keep0 ? rest : rest.replace(/^0+/, ''));
      if (rest0 !== null && home.len.indexOf(rest0.length) !== -1) { cc = home.cc; nat = rest0; if (rest0 !== rest) warn = 'اتشال صفر زايد بعد كود الدولة.'; }
      else if (home.len.indexOf(d.length) !== -1) { cc = home.cc; nat = d; if (!explicit) warn = 'الرقم من غير صفر ولا كود دولة، اتفترض إنه من ' + home.ar + ' (+' + cc + '). تأكد منه.'; }
      else {
        var e2 = matchCC(d);
        if (e2 && d.length >= 8 && d.length <= 15 && e2.len.indexOf(d.length - e2.cc.length) !== -1) { cc = e2.cc; nat = d.slice(cc.length); warn = 'اتفترض إنه رقم دولي (+' + cc + ').'; }
        else return bad('الرقم مش واضح. عدّله أو اختار الدولة الصح.');
      }
    } else {
      var e3 = matchCC(d);
      if (e3 && e3.len.indexOf(d.length - e3.cc.length) !== -1) { cc = e3.cc; nat = d.slice(cc.length); }
      else return bad('مش قادر أحدد كود الدولة. اختارها من القايمة.');
    }
    var full = cc + nat;
    if (full.length < 8 || full.length > 15) return bad('الرقم شكله غير صحيح');
    var ent = entryOf(cc);
    if (ent && ent.len.indexOf(nat.length) === -1) warn = (warn ? warn + ' ' : '') + 'عدد أرقامه (' + nat.length + ') مش المعتاد لـ ' + ent.ar + ' (' + ent.len.join(' أو ') + '). راجعه.';
    return { ok: true, digits: full, cc: cc, national: nat, warn: warn };
  }
  function normalizePhone(raw, country) { return parsePhone(raw, countryOf(country), false); }

  function zoneForCountry(country) { return lookup(ZONE_OF, country); }
  function zoneName(z, lang) { for (var i = 0; i < ZONES.length; i++) if (ZONES[i][0] === z) return lang === 'en' ? ZONES[i][2] : ZONES[i][1]; return z; }

  function tzParts(ms, zone) {
    var f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    var o = {};
    f.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = +p.value; });
    return o;
  }
  function offsetMin(ms, zone) {
    var p = tzParts(ms, zone);
    return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000) / 60000);
  }
  // wall-clock time in a zone -> real instant (ms)
  function zonedToUtc(dateStr, timeStr, zone) {
    var d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || ''), t = /^(\d{1,2}):(\d{2})$/.exec(timeStr || '');
    if (!d || !t) return NaN;
    var guess = Date.UTC(+d[1], +d[2] - 1, +d[3], +t[1], +t[2]);
    var ms = guess - offsetMin(guess, zone) * 60000;
    ms = guess - offsetMin(ms, zone) * 60000;
    return ms;
  }
  function gmtLabel(ms, zone) {
    var m = offsetMin(ms, zone), sign = m < 0 ? '-' : '+', a = Math.abs(m), hh = Math.floor(a / 60), mm = a % 60;
    return 'GMT' + sign + hh + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '');
  }
  function fmtTime(ms, zone, lang) {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ar-EG-u-nu-latn', { timeZone: zone, hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(ms));
  }
  function fmtDay(ms, zone, lang) {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ar-EG-u-nu-latn', { timeZone: zone, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
  }

  // -> { date, time } texts that state the time zone explicitly, plus the applicant's own local equivalent
  function interviewWhen(dateStr, timeStr, zone, lang, applicantZone) {
    var ms = zonedToUtc(dateStr, timeStr, zone);
    if (isNaN(ms)) return null;
    var en = lang === 'en';
    var tz = en ? zoneName(zone, 'en') + ' time' : 'بتوقيت ' + zoneName(zone, 'ar');
    var time = fmtTime(ms, zone, lang) + ' (' + tz + (en ? ', ' : '، ') + gmtLabel(ms, zone) + ')';
    var date = fmtDay(ms, zone, lang);
    if (applicantZone && applicantZone !== zone) {
      var other = fmtTime(ms, applicantZone, lang), od = fmtDay(ms, applicantZone, lang);
      var otz = en ? zoneName(applicantZone, 'en') + ' time' : 'بتوقيت ' + zoneName(applicantZone, 'ar');
      time += en ? ' = ' + other + ' ' + otz + ' (' + gmtLabel(ms, applicantZone) + ')' : ' = ' + other + ' ' + otz + ' (' + gmtLabel(ms, applicantZone) + ')';
      if (od !== date) time += en ? ', ' + od : '، ' + od;
    }
    return { date: date, time: time, ms: ms };
  }

  function fillText(text, vars) {
    vars = vars || {};
    return String(text == null ? '' : text).replace(/\{(name|date|time)\}/g, function (m, k) { return vars[k] == null ? '' : String(vars[k]); })
      .replace(/[ \t]+([،,])/g, '$1');
  }
  function hasPlaceholders(text) { return /\{(name|date|time)\}/.test(String(text || '')); }
  function waLink(digits, text) { return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(text); }

  var util = { TPL_LABELS: TPL_LABELS, TPL_ORDER: TPL_ORDER, ZONES: ZONES, normalizePhone: normalizePhone, parsePhone: parsePhone, countryOf: countryOf, COUNTRIES: COUNTRIES, zoneForCountry: zoneForCountry, zonedToUtc: zonedToUtc, interviewWhen: interviewWhen, fillText: fillText, hasPlaceholders: hasPlaceholders, waLink: waLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = util;
  if (!root || !root.document) return;

  // ================= UI =================
  var X = null; // context from app.js
  var h, $;
  var tplCache = null, tplMeta = null; // cached templates from the server

  function init(ctx) {
    X = ctx; h = ctx.h; $ = ctx.$;
    build();
  }

  function loadTemplates(force) {
    if (tplCache && !force) return Promise.resolve(tplCache);
    return X.api('getTemplates', { token: X.token() }).then(function (j) {
      if (!j || !j.ok) throw new Error('tpl');
      tplCache = {};
      j.templates.forEach(function (t) { tplCache[t.key + '|' + t.lang] = t; });
      tplMeta = { sender: j.sender, status: j.status || {} };
      return tplCache;
    });
  }
  function tplOf(key, lang) { return tplCache && tplCache[key + '|' + lang]; }
  function statusFor(key) { return (tplMeta && tplMeta.status && tplMeta.status[key]) || ''; }
  function rowById(id) { return X.state.rows.filter(function (r) { return r.id === id; })[0]; }
  function langOf(r) { return r && r.lang === 'en' ? 'en' : 'ar'; }
  function senderLine() { return X.state.sender || (tplMeta && tplMeta.sender) || 'magmafyogp@gmail.com'; }

  function opt(v, t, sel) { return h('option', { value: v, text: t, selected: !!sel }); }
  function field(label, el, cls) { return h('label', { class: cls || '' }, h('span', { class: 'small', text: label }), el); }

  function insertAt(id, text, after) {
    var el = $(id), a = el.selectionStart == null ? el.value.length : el.selectionStart, b = el.selectionEnd == null ? a : el.selectionEnd;
    el.value = el.value.slice(0, a) + text + el.value.slice(b);
    el.focus(); el.selectionStart = el.selectionEnd = a + text.length;
    after();
  }
  function insertBar(id, after) {
    var bar = h('div', { class: 'insbar' }, h('span', { class: 'small', text: 'إدراج في النص:' }));
    [['{name}', 'الاسم'], ['{date}', 'يوم المقابلة'], ['{time}', 'الساعة والتوقيت']].forEach(function (p) {
      bar.appendChild(h('button', { type: 'button', class: 'tab', onclick: function () { insertAt(id, p[0], after); }, text: p[1] }));
    });
    return bar;
  }

  var previewTimer = null;
  function schedulePreview(frameId, getParams, msgId) {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(function () {
      var p = getParams();
      if (!p || !String(p.body || '').trim()) { $(frameId).srcdoc = ''; return; }
      X.api('previewMail', Object.assign({ token: X.token() }, p)).then(function (j) {
        if (j && j.ok) { $(frameId).srcdoc = j.html; if (msgId) $(msgId).textContent = ''; }
        else if (msgId) $(msgId).textContent = 'تعذّر عرض المعاينة.';
      }).catch(function () {});
    }, 700);
  }

  // ---------- interview date / time / zone block (shared by the mail and WhatsApp dialogs) ----------
  function whenBlock(prefix, onChange) {
    var tomorrow = new Date(Date.now() + 86400000);
    var ds = tomorrow.getFullYear() + '-' + ('0' + (tomorrow.getMonth() + 1)).slice(-2) + '-' + ('0' + tomorrow.getDate()).slice(-2);
    var date = h('input', { type: 'date', id: prefix + 'Date', value: ds, oninput: onChange });
    var time = h('input', { type: 'time', id: prefix + 'Time', value: '16:00', oninput: onChange });
    var zone = h('select', { id: prefix + 'Zone', onchange: onChange });
    ZONES.forEach(function (z, i) { zone.appendChild(opt(z[0], z[1], i === 0)); });
    var box = h('div', { class: 'when', id: prefix + 'When', hidden: true },
      h('div', { class: 'row3' }, field('يوم المقابلة', date), field('الساعة', time), field('التوقيت اللي بتحدد بيه', zone)),
      h('p', { class: 'small', id: prefix + 'WhenNote' }));
    return box;
  }
  function whenValues(prefix, r, lang) {
    var zone = $(prefix + 'Zone').value;
    var w = interviewWhen($(prefix + 'Date').value, $(prefix + 'Time').value, zone, lang, r ? zoneForCountry(r.country) : '');
    var note = $(prefix + 'WhenNote');
    note.textContent = w ? 'هيتكتب في الرسالة: ' + w.date + ' | ' + w.time : 'اختار يوم وساعة صحيحين.';
    return w;
  }

  // ---------- build the dialogs once ----------
  function build() {
    document.body.appendChild(mailDialog());
    document.body.appendChild(waDialog());
    document.body.appendChild(tplDialog());
  }

  // ======== MAIL (template / custom / blank) ========
  var M = { id: '', dirty: false };

  function mailDialog() {
    var dlg = h('dialog', { id: 'mailDlg', class: 'wide' });
    var to = h('select', { id: 'mTo', onchange: function () { recipientChanged(true); } });
    var custom = h('input', { id: 'mCustom', type: 'email', class: 'ltr', placeholder: 'name@example.com', oninput: function () { refresh(); } });
    var cname = h('input', { id: 'mCName', type: 'text', placeholder: 'اسمه (اختياري)', oninput: function () { refresh(); } });
    var tpl = h('select', { id: 'mTpl', onchange: function () { applyTemplate(); } });
    var lang = h('select', { id: 'mLang', onchange: function () { applyTemplate(); } }, opt('ar', 'عربي', true), opt('en', 'English'));
    var subj = h('input', { id: 'mSubj', type: 'text', maxlength: '150', oninput: function () { refresh(); } });
    var head = h('input', { id: 'mHead', type: 'text', maxlength: '120', oninput: function () { refresh(); } });
    var body = h('textarea', { id: 'mBody', maxlength: '6000', rows: '9', oninput: function () { refresh(); } });
    var st = h('input', { type: 'checkbox', id: 'mSetStatus' });
    dlg.appendChild(h('h2', { text: 'إرسال إيميل' }));
    dlg.appendChild(h('p', { class: 'small', id: 'mFrom' }));
    dlg.appendChild(h('div', { class: 'cols' },
      h('div', { class: 'col' },
        field('إلى', to),
        h('div', { id: 'mCustomBox', hidden: true, class: 'row2' }, field('الإيميل', custom), field('الاسم', cname)),
        h('div', { class: 'row2' }, field('القالب', tpl), field('لغة الرسالة', lang)),
        whenBlock('m', function () { refresh(); }),
        field('الموضوع', subj),
        field('العنوان الكبير داخل الرسالة (اختياري)', head),
        field('نص الرسالة', body),
        insertBar('mBody', function () { refresh(); }),
        h('p', { class: 'small', text: 'سطر فاضي = فقرة جديدة. **كلمة** = غامق. سطور بـ 1. 2. 3. = خطوات. {name} {date} {time} بتتعوّض تلقائيًا.' }),
        h('label', { class: 'check', id: 'mStatusRow' }, st, h('span', { id: 'mStatusTxt' }))),
      h('div', { class: 'col' },
        h('span', { class: 'small', text: 'معاينة الرسالة زي ما هتوصل' }),
        h('iframe', { id: 'mFrame', class: 'preview', sandbox: '', title: 'معاينة الإيميل' }),
        h('p', { class: 'small', id: 'mPrevMsg' }))));
    dlg.appendChild(h('p', { class: 'login-msg', id: 'mMsg', role: 'alert' }));
    dlg.appendChild(h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', id: 'mSend', onclick: sendMail, text: 'إرسال' }),
      h('button', { class: 'btn', type: 'button', onclick: function () { dlg.close(); }, text: 'إغلاق' })));
    return dlg;
  }

  function mailFill() {
    var id = $('mTo').value, r = id && id !== '__custom' ? rowById(id) : null;
    var lang = $('mLang').value, name = r ? r.name : $('mCName').value.trim();
    var w = null;
    if ($('mWhen').hidden === false) w = whenValues('m', r, lang);
    var vars = { name: name, date: w ? w.date : '', time: w ? w.time : '' };
    return { r: r, vars: vars, w: w, subject: fillText($('mSubj').value, vars), headline: fillText($('mHead').value, vars), body: fillText($('mBody').value, vars) };
  }

  function needsWhen() { return /\{(date|time)\}/.test($('mBody').value + $('mSubj').value) || $('mTpl').value === 'interview'; }

  function refresh() {
    $('mCustomBox').hidden = $('mTo').value !== '__custom';
    $('mWhen').hidden = !needsWhen();
    var f = mailFill();
    var key = $('mTpl').value, stt = statusFor(key);
    $('mStatusRow').hidden = !(f.r && stt);
    $('mStatusTxt').textContent = stt ? 'غيّر حالة المتقدم لـ «' + stt + '» بعد الإرسال' : '';
    schedulePreview('mFrame', function () {
      return { lang: $('mLang').value, subject: f.subject, headline: f.headline, body: f.body, forApplicant: !!f.r };
    }, 'mPrevMsg');
  }

  function applyTemplate() {
    var key = $('mTpl').value, lang = $('mLang').value;
    if (key === 'custom') { $('mSubj').value = ''; $('mHead').value = ''; $('mBody').value = ''; refresh(); return; }
    var t = tplOf(key, lang);
    if (!t) return;
    $('mSubj').value = t.subject; $('mHead').value = t.headline; $('mBody').value = t.body;
    $('mStatusRow').querySelector('input').checked = !!statusFor(key);
    refresh();
  }

  function recipientChanged(setLang) {
    var id = $('mTo').value, r = id !== '__custom' ? rowById(id) : null;
    if (setLang && r) { $('mLang').value = langOf(r); applyTemplate(); } else refresh();
  }

  function openMail(id, tplKey) {
    if (X.state.source !== 'server') return;
    loadTemplates().then(function () {
      var to = $('mTo');
      to.textContent = '';
      var withMail = X.state.rows.filter(function (r) { return /@/.test(String(r.email || '')); });
      withMail.forEach(function (r) { to.appendChild(opt(r.id, r.name + ' — ' + r.email, r.id === id)); });
      to.appendChild(opt('__custom', 'إيميل مخصص (أي حد)...', !id || !withMail.some(function (r) { return r.id === id; })));
      var tpl = $('mTpl'); tpl.textContent = '';
      TPL_ORDER.concat(['custom']).forEach(function (k) { tpl.appendChild(opt(k, TPL_LABELS[k], k === (tplKey || (id ? 'advance' : 'custom')))); });
      $('mFrom').textContent = 'هيتبعت من ' + senderLine() + ' والردود بترجع لنفس الإيميل.';
      $('mMsg').textContent = ''; $('mMsg').className = 'login-msg';
      var r = id ? rowById(id) : null;
      $('mLang').value = langOf(r);
      $('mCustom').value = ''; $('mCName').value = '';
      $('mFrame').srcdoc = '';
      applyTemplate();
      $('mSend').disabled = false;
      $('mailDlg').showModal();
    }).catch(function () { X.banner('error', 'تعذّر تحميل القوالب. حاول تاني.'); });
  }

  function sendMail() {
    var f = mailFill(), msg = $('mMsg'), custom = $('mTo').value === '__custom';
    var to = custom ? $('mCustom').value.trim() : (f.r && f.r.email);
    function err(t) { msg.textContent = t; msg.className = 'login-msg err'; }
    if (!to || !/^\S+@\S+\.\S+$/.test(to)) return err('اكتب إيميل صحيح.');
    if (!f.subject.trim() || !f.body.trim()) return err('الموضوع ونص الرسالة مطلوبين.');
    if (hasPlaceholders(f.subject + f.headline + f.body)) return err('فيه جزء ناقص في الرسالة (اسم أو يوم أو ساعة).');
    X.confirm('تأكيد الإرسال', 'هيتبعت إيميل من ' + senderLine() + ' إلى ' + to + '\nالموضوع: ' + f.subject, 'إرسال').then(function (yes) {
      if (!yes) return;
      $('mSend').disabled = true; err('جارٍ الإرسال...'); msg.className = 'login-msg';
      var key = $('mTpl').value;
      X.api('sendMail', {
        token: X.token(), applicantId: custom ? '' : f.r.id, to: custom ? to : '', template: key, lang: $('mLang').value,
        subject: f.subject, headline: f.headline, body: f.body, setStatus: !!(f.r && statusFor(key) && $('mStatusRow').querySelector('input').checked)
      }).then(function (j) {
        if (j && j.ok) {
          $('mailDlg').close();
          X.banner('ok', 'اتبعت الإيميل إلى ' + to + (j.status ? ' وتم تغيير الحالة لـ ' + j.status : '') + (j.left != null ? ' (المتبقي اليوم: ' + j.left + ' رسالة)' : '') + '.');
          X.reload();
          return;
        }
        var m = { rate: 'وصلت للحد الأقصى للإرسال في الساعة. استنى شوية.', quota: 'حصة الإيميلات اليومية قربت تخلص.', notfound: 'المتقدم مش موجود.', noemail: 'المتقدم ده مفيش له إيميل.', placeholder: 'فيه جزء ناقص في الرسالة.', send: 'جوجل رفض الإرسال. حاول بعد شوية.' }[j && j.error] || 'تعذّر الإرسال.';
        err(m); $('mSend').disabled = false;
      }).catch(function () { err('تعذّر الاتصال.'); $('mSend').disabled = false; });
    });
  }

  // ======== WHATSAPP ========
  function waDialog() {
    var dlg = h('dialog', { id: 'waDlg', class: 'wide narrow' });
    dlg.appendChild(h('h2', { id: 'wTitle' }));
    var ccSel = h('select', { id: 'wCc', onchange: function () { waRefresh(); } }, opt('', 'اختر الدولة'));
    COUNTRIES.forEach(function (c) { ccSel.appendChild(opt(c.cc, c.ar + ' +' + c.cc)); });
    dlg.appendChild(h('div', { class: 'row2' }, field('كود الدولة', ccSel), field('رقم الواتساب (تقدر تعدّله)', h('input', { id: 'wNum', type: 'tel', dir: 'ltr', maxlength: '30', oninput: function () { waRefresh(); } }))));
    dlg.appendChild(h('p', { class: 'small', id: 'wPhone' }));
    dlg.appendChild(h('div', { class: 'row2' },
      field('سبب الرسالة', h('select', { id: 'wTpl', onchange: function () { waTemplate(); } })),
      field('لغة الرسالة', h('select', { id: 'wLang', onchange: function () { waTemplate(); } }, opt('ar', 'عربي', true), opt('en', 'English')))));
    dlg.appendChild(whenBlock('w', function () { waRefresh(); }));
    dlg.appendChild(field('نص الرسالة (تقدر تعدّله)', h('textarea', { id: 'wBody', rows: '6', maxlength: '1500', oninput: function () { waRefresh(); } })));
    dlg.appendChild(insertBar('wBody', function () { waRefresh(); }));
    dlg.appendChild(h('div', { class: 'answer' }, h('div', { class: 'a-label' }, h('span', { text: 'اللي هيتبعت فعليًا' })), h('div', { class: 'a-text', id: 'wFinal' })));
    dlg.appendChild(h('label', { class: 'check', id: 'wStatusRow' }, h('input', { type: 'checkbox', id: 'wSetStatus' }), h('span', { id: 'wStatusTxt' })));
    dlg.appendChild(h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', id: 'wOpen', onclick: waOpen, text: 'افتح واتساب' }),
      h('button', { class: 'btn', type: 'button', onclick: function () { dlg.close(); }, text: 'إغلاق' })));
    return dlg;
  }
  var W = { id: '' };

  function waFinal() {
    var r = rowById(W.id), lang = $('wLang').value, w = null;
    if ($('wWhen').hidden === false) w = whenValues('w', r, lang);
    var text = fillText($('wBody').value, { name: r ? r.name : '', date: w ? w.date : '', time: w ? w.time : '' });
    return { r: r, text: text };
  }
  // the number that will really be used: what is typed in the number box, read with the chosen country code
  function waPhone() { return parsePhone($('wNum').value, entryOf($('wCc').value), true); }
  function waRefresh() {
    var raw = $('wBody').value;
    $('wWhen').hidden = !(/\{(date|time)\}/.test(raw) || $('wTpl').value === 'interview');
    var f = waFinal();
    $('wFinal').textContent = f.text;
    var key = $('wTpl').value, stt = statusFor(key);
    $('wStatusRow').hidden = !stt;
    $('wStatusTxt').textContent = stt ? 'غيّر حالة المتقدم لـ «' + stt + '» بعد فتح واتساب' : '';
    var p = waPhone();
    $('wPhone').textContent = p.ok ? 'الرقم: +' + p.digits + (p.warn ? ' — ' + p.warn : '') : (p.warn || '');
    $('wPhone').className = 'small' + (!p.ok ? ' bad' : p.warn ? ' warnc' : '');
    $('wOpen').disabled = !p.ok;
  }
  function waTemplate() {
    var key = $('wTpl').value, lang = $('wLang').value;
    var t = tplOf(key, lang);
    $('wBody').value = key === 'custom' || !t ? (lang === 'en' ? 'Hello {name}, this is the Magmafy team. ' : 'أهلًا {name}، معاك فريق Magmafy. ') : t.wa;
    $('wStatusRow').querySelector('input').checked = !!statusFor(key);
    waRefresh();
  }
  function openWa(id, tplKey) {
    if (X.state.source !== 'server') return;
    loadTemplates().then(function () {
      var r = rowById(id); if (!r) return;
      W.id = id;
      $('wTitle').textContent = 'رسالة واتساب إلى ' + (r.name || '');
      var sel = $('wTpl'); sel.textContent = '';
      TPL_ORDER.concat(['custom']).forEach(function (k) { sel.appendChild(opt(k, TPL_LABELS[k], k === (tplKey || 'interview'))); });
      $('wLang').value = langOf(r);
      var p0 = normalizePhone(r.phone, r.country), home = countryOf(r.country);
      $('wCc').value = p0.cc || (home ? home.cc : '');
      $('wNum').value = p0.ok ? p0.national : String(r.phone || '');
      waTemplate();
      $('waDlg').showModal();
    }).catch(function () { X.banner('error', 'تعذّر تحميل القوالب. حاول تاني.'); });
  }
  function waOpen() {
    var f = waFinal(), p = waPhone();
    if (!p.ok || !f.text.trim() || hasPlaceholders(f.text)) { $('wFinal').textContent = 'فيه جزء ناقص في الرسالة.'; return; }
    var key = $('wTpl').value, setSt = !!(statusFor(key) && $('wStatusRow').querySelector('input').checked);
    window.open(waLink(p.digits, f.text), '_blank', 'noopener'); // opened right away, inside the click, so popup blockers allow it
    X.api('logMessage', { token: X.token(), applicantId: f.r.id, template: key, setStatus: setSt }).then(function (j) {
      if (j && j.ok) { X.banner('ok', 'اتفتح واتساب لـ ' + f.r.name + (j.status ? ' وتم تغيير الحالة لـ ' + j.status : '') + '.'); X.reload(); }
    }).catch(function () {});
    $('waDlg').close();
  }

  // ======== TEMPLATE EDITOR ========
  var T = { key: 'received', lang: 'ar' };
  function tplDialog() {
    var dlg = h('dialog', { id: 'tplDlg', class: 'wide' });
    dlg.appendChild(h('h2', { text: 'قوالب الرسائل' }));
    dlg.appendChild(h('p', { class: 'small', text: 'التعديل هنا بيتحفظ للمشرفين الاتنين. كل قالب له نسخة عربي ونسخة إنجليزي، والإيميل بيتبعت بنفس الشكل الرسمي.' }));
    dlg.appendChild(h('div', { class: 'tabs', id: 'tTabs' }));
    dlg.appendChild(h('div', { class: 'cols' },
      h('div', { class: 'col' },
        h('div', { class: 'row2' },
          field('اللغة', h('select', { id: 'tLang', onchange: function () { T.lang = $('tLang').value; tplFill(); } }, opt('ar', 'عربي', true), opt('en', 'English'))),
          h('p', { class: 'small', id: 'tState' })),
        field('الموضوع', h('input', { id: 'tSubj', type: 'text', maxlength: '150', oninput: tplPreview })),
        field('العنوان الكبير', h('input', { id: 'tHead', type: 'text', maxlength: '120', oninput: tplPreview })),
        field('نص الإيميل', h('textarea', { id: 'tBody', rows: '10', maxlength: '6000', oninput: tplPreview })),
        field('رسالة الواتساب', h('textarea', { id: 'tWa', rows: '4', maxlength: '1500' })),
        h('p', { class: 'small', text: 'المتغيرات: {name} الاسم، {date} اليوم، {time} الساعة مع التوقيت (للمقابلة).' })),
      h('div', { class: 'col' },
        h('span', { class: 'small', text: 'معاينة' }),
        h('iframe', { id: 'tFrame', class: 'preview', sandbox: '', title: 'معاينة القالب' }))));
    dlg.appendChild(h('p', { class: 'login-msg', id: 'tMsg', role: 'alert' }));
    dlg.appendChild(h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', id: 'tSave', onclick: tplSave, text: 'حفظ التعديل' }),
      h('button', { class: 'btn', type: 'button', id: 'tReset', onclick: tplReset, text: 'رجوع للنص الأصلي' }),
      h('button', { class: 'btn', type: 'button', onclick: function () { dlg.close(); }, text: 'إغلاق' })));
    return dlg;
  }
  function tplTabs() {
    var box = $('tTabs'); box.textContent = '';
    TPL_ORDER.forEach(function (k) {
      var edited = ['ar', 'en'].some(function (l) { var t = tplOf(k, l); return t && t.custom; });
      box.appendChild(h('button', { type: 'button', class: 'tab' + (T.key === k ? ' on' : ''), onclick: function () { T.key = k; tplTabs(); tplFill(); }, text: TPL_LABELS[k] + (edited ? ' •' : '') }));
    });
  }
  function tplFill() {
    var t = tplOf(T.key, T.lang); if (!t) return;
    $('tSubj').value = t.subject; $('tHead').value = t.headline; $('tBody').value = t.body; $('tWa').value = t.wa;
    $('tState').textContent = t.custom ? 'معدّل عن الأصل' : 'النص الأصلي';
    $('tMsg').textContent = '';
    tplPreview();
  }
  function tplPreview() {
    var lang = T.lang, vars = { name: lang === 'en' ? 'Ahmed' : 'أحمد', date: lang === 'en' ? 'Thursday, 20 November 2026' : 'الخميس ٢٠ نوفمبر ٢٠٢٦', time: lang === 'en' ? '4:00 PM (Saudi Arabia time, GMT+3)' : '٤:٠٠ م (بتوقيت السعودية، GMT+3)' };
    schedulePreview('tFrame', function () {
      return { lang: lang, subject: fillText($('tSubj').value, vars), headline: fillText($('tHead').value, vars), body: fillText($('tBody').value, vars), forApplicant: true };
    });
  }
  function tplSave() {
    var m = $('tMsg'); m.className = 'login-msg'; m.textContent = 'جارٍ الحفظ...';
    X.api('saveTemplate', { token: X.token(), key: T.key, lang: T.lang, subject: $('tSubj').value, headline: $('tHead').value, body: $('tBody').value, wa: $('tWa').value }).then(function (j) {
      if (j && j.ok) return loadTemplates(true).then(function () { tplTabs(); tplFill(); m.textContent = 'اتحفظ.'; });
      m.className = 'login-msg err'; m.textContent = 'تعذّر الحفظ. الموضوع والنص مطلوبين.';
    }).catch(function () { m.className = 'login-msg err'; m.textContent = 'تعذّر الاتصال.'; });
  }
  function tplReset() {
    X.confirm('رجوع للنص الأصلي؟', 'تعديلاتك على القالب ده (' + (T.lang === 'en' ? 'English' : 'عربي') + ') هتتمسح ويرجع النص الأصلي.', 'رجوع للأصلي').then(function (yes) {
      if (!yes) return;
      X.api('resetTemplate', { token: X.token(), key: T.key, lang: T.lang }).then(function (j) {
        if (j && j.ok) return loadTemplates(true).then(function () { tplTabs(); tplFill(); $('tMsg').textContent = 'رجع للنص الأصلي.'; });
      }).catch(function () {});
    });
  }
  function openTemplates() {
    if (X.state.source !== 'server') return;
    loadTemplates().then(function () { tplTabs(); $('tLang').value = T.lang; tplFill(); $('tplDlg').showModal(); })
      .catch(function () { X.banner('error', 'تعذّر تحميل القوالب. حاول تاني.'); });
  }

  function reset() { tplCache = null; tplMeta = null; }

  root.MagmafyComms = { init: init, openMail: openMail, openWa: openWa, openTemplates: openTemplates, reset: reset, util: util, labels: TPL_LABELS };
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
