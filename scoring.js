/*
 * Magmafy applicant scoring. Pure functions, no DOM. Works in the browser (window.MagmafyScoring)
 * and in Node (module.exports) so it can be tested.
 *
 * The score is a first filter for reading faster, not a verdict: it measures how complete and specific
 * the answers are, using keywords and numbers. Always open the results link and judge the real work.
 *
 * Criteria (total 100):
 *   experience 20, platforms 10, spend 15, niche 10, gulf 10, results 15, tracking 10, diagnosis 10
 */
(function (root) {
  'use strict';

  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
      .replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); })
      .replace(/٬/g, ',').replace(/٫/g, '.')
      .toLowerCase()
      .replace(/[ً-ٰٟ]/g, '')
      .replace(/ـ/g, '')
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه');
  }

  function hasAny(text, list) {
    for (var i = 0; i < list.length; i++) if (text.indexOf(norm(list[i])) !== -1) return true;
    return false;
  }
  function countGroups(text, groups) {
    var n = 0;
    for (var i = 0; i < groups.length; i++) if (hasAny(text, groups[i])) n++;
    return n;
  }
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function len(s) { return String(s == null ? '' : s).trim().length; }

  // ---------- criteria ----------
  function scoreExperience(row) {
    var t = norm(row.years);
    var p = 0, note = 'لم يحدد';
    if (!t) return { points: 0, max: 20, note: note };
    if (t.indexOf('اكثر') !== -1) { p = 20; note = 'أكثر من ٥ سنوات'; }
    else if (t.indexOf('3') !== -1 && t.indexOf('5') !== -1) { p = 16; note = '٣ إلى ٥ سنوات'; }
    else if (t.indexOf('1') !== -1 && t.indexOf('3') !== -1) { p = 10; note = '١ إلى ٣ سنوات'; }
    else if (t.indexOf('اقل') !== -1) { p = 4; note = 'أقل من سنة'; }
    return { points: p, max: 20, note: note };
  }

  function scorePlatforms(row) {
    var t = norm(row.platforms), p = 0, got = [];
    if (t.indexOf('meta') !== -1 || t.indexOf('facebook') !== -1) { p += 5; got.push('Meta'); }
    if (t.indexOf('google') !== -1) { p += 3; got.push('Google'); }
    if (t.indexOf('tiktok') !== -1) { p += 1; got.push('TikTok'); }
    if (t.indexOf('snap') !== -1) { p += 1; got.push('Snapchat'); }
    return { points: clamp(p, 0, 10), max: 10, note: got.length ? got.join('، ') : 'لم يحدد' };
  }

  // Largest monthly figure mentioned, in USD. Riyal amounts are converted (1 SAR ~ 0.27 USD).
  function parseSpendUSD(raw) {
    var t = norm(raw);
    var re = /(\d[\d,]*(?:\.\d+)?)\s*(k|الف|الاف|m|مليون)?/g, m, best = 0;
    while ((m = re.exec(t))) {
      var v = parseFloat(m[1].replace(/,/g, ''));
      if (isNaN(v)) continue;
      var u = m[2];
      if (u === 'k' || u === 'الف' || u === 'الاف') v *= 1000;
      else if (u === 'm' || u === 'مليون') v *= 1000000;
      if (v > best) best = v;
    }
    var usd = /(\$|usd|دولار)/.test(t);
    var sar = /(ريال|sar|sr\b)/.test(t);
    var egp = /(جنيه|egp)/.test(t);
    if (!usd && sar) best *= 0.27;
    else if (!usd && egp) best *= 0.02;
    return Math.round(best);
  }

  function scoreSpend(row) {
    var usd = parseSpendUSD(row.spend), p = 0;
    if (usd >= 10000) p = 15; else if (usd >= 5000) p = 12; else if (usd >= 2000) p = 8; else if (usd >= 500) p = 4; else if (usd > 0) p = 1;
    return { points: p, max: 15, note: usd ? 'حوالي ' + usd.toLocaleString('en-US') + ' دولار شهريًا' : 'لم يذكر رقمًا', usd: usd };
  }

  var FURNITURE = ['اثاث', 'مفروشات', 'ديكور', 'furniture', 'decor', 'home', 'منزل', 'مطبخ', 'غرف نوم', 'كنب', 'معرض', 'interior', 'تصميم داخلي'];
  var ECOM = ['متجر', 'متاجر', 'ecommerce', 'e-commerce', 'shopify', 'سله', 'زد ', 'woocommerce', 'اونلاين', 'online store', 'تجاره الكترونيه'];

  function scoreNiche(row) {
    var t = norm(row.niche), l = len(row.niche), p = 0, bits = [];
    if (hasAny(t, FURNITURE)) { p += 6; bits.push('أثاث/ديكور'); }
    if (hasAny(t, ECOM)) { p += 3; bits.push('متاجر إلكترونية'); }
    if (l >= 80) p += 1;
    if (l < 25) p = Math.min(p, 3);
    return { points: clamp(p, 0, 10), max: 10, note: bits.length ? bits.join('، ') : (l < 25 ? 'إجابة قصيرة جدًا' : 'لا تفاصيل عن المجال') };
  }

  var PLACES = ['سعود', 'ksa', 'خليج', 'الرياض', 'جده', 'الدمام', 'الامارات', 'دبي', 'الكويت', 'قطر', 'عمان', 'البحرين', 'gcc'];
  var PAY = ['مدي', 'mada', 'تمارا', 'tamara', 'تابي', 'tabby', 'cod', 'الدفع عند الاستلام', 'stc pay', 'apple pay', 'بوابه دفع'];
  var SEASON = ['رمضان', 'العيد', 'اليوم الوطني', 'يوم التاسيس', 'الجمعه البيضاء', 'white friday', '11.11', 'نوفمبر', 'موسم'];

  function scoreGulf(row) {
    var t = norm(row.gulf), l = len(row.gulf), p = 0, bits = [];
    if (hasAny(t, PLACES)) { p += 4; bits.push('أسواق خليجية'); }
    if (hasAny(t, PAY)) { p += 3; bits.push('طرق الدفع'); }
    if (hasAny(t, SEASON)) { p += 2; bits.push('مواسم'); }
    if (l >= 60) p += 1;
    if (l < 25) p = Math.min(p, 2);
    return { points: clamp(p, 0, 10), max: 10, note: bits.length ? bits.join('، ') : (l < 25 ? 'إجابة قصيرة جدًا' : 'لا ذكر لتفاصيل السوق') };
  }

  var METRICS = [['roas', 'عائد الانفاق', 'عائد'], ['cpa', 'cpl', 'cpc', 'cpm', 'تكلفه'], ['مبيعات', 'ارباح', 'ايراد', 'revenue', 'sales'], ['ليد', 'lead', 'طلبات', 'تحويل', 'conversion'], ['ctr', 'نسبه', '%']];

  function scoreResults(row) {
    var raw = norm(row.result), l = len(row.result);
    var nums = (raw.match(/\d[\d,.]*/g) || []).filter(function (x) { return x.length > 0; });
    var p = 0;
    if (nums.length >= 3) p += 8; else if (nums.length === 2) p += 5; else if (nums.length === 1) p += 2;
    var g = countGroups(raw, METRICS);
    if (g >= 3) p += 5; else if (g === 2) p += 4; else if (g === 1) p += 2;
    if (l >= 60) p += 2;
    if (l < 25) p = Math.min(p, 3);
    return { points: clamp(p, 0, 15), max: 15, note: nums.length + ' أرقام و' + g + ' مؤشرات أداء' };
  }

  var TRACK = [
    ['pixel', 'بيكسل'],
    ['capi', 'conversions api', 'conversion api', 'api التحويلات', 'server side', 'server-side'],
    ['events manager', 'test events', 'مدير الاحداث', 'اختبار الاحداث'],
    ['gtm', 'tag manager', 'google tag'],
    ['utm'],
    ['ga4', 'analytics', 'التحليلات'],
    ['dedup', 'ازاله التكرار', 'event id'],
    ['توثيق الدومين', 'domain verification', 'aggregated event', 'ايفنت', 'event match', 'match quality']
  ];

  function scoreTracking(row) {
    var t = norm(row.tracking), l = len(row.tracking);
    var g = countGroups(t, TRACK), p = g >= 4 ? 10 : g === 3 ? 8 : g === 2 ? 6 : g === 1 ? 3 : 0;
    if (l < 25) p = Math.min(p, 2);
    return { points: p, max: 10, note: g + ' من ٨ مفاهيم تتبع' };
  }

  var DIAG = [
    ['frequency', 'تكرار', 'اجهاد', 'fatigue', 'creative', 'ابداع', 'اعلان'],
    ['audience', 'جمهور', 'استهداف', 'overlap', 'تداخل'],
    ['landing', 'صفحه', 'موقع', 'سرعه', 'checkout', 'سله', 'دفع'],
    ['budget', 'ميزانيه', 'learning', 'تعلم', 'bid', 'مزايده', 'cpm'],
    ['تتبع', 'tracking', 'بيكسل', 'events', 'تحويلات'],
    ['منافس', 'موسم', 'seasonal', 'مخزون', 'سعر', 'عرض', 'stock']
  ];

  function scoreDiagnosis(row) {
    var t = norm(row.drop), l = len(row.drop);
    var g = countGroups(t, DIAG), p = g >= 5 ? 10 : g === 4 ? 8 : g === 3 ? 6 : g === 2 ? 4 : g === 1 ? 2 : 0;
    if (l < 25) p = Math.min(p, 2);
    return { points: p, max: 10, note: g + ' من ٦ محاور فحص' };
  }

  // ---------- documents ----------
  var HOSTS = [
    [/drive\.google\.com|docs\.google\.com/i, 'Google Drive'],
    [/dropbox\.com/i, 'Dropbox'],
    [/onedrive\.live\.com|1drv\.ms|sharepoint\.com/i, 'OneDrive'],
    [/notion\.(so|site)/i, 'Notion'],
    [/canva\.com/i, 'Canva'],
    [/behance\.net/i, 'Behance'],
    [/linkedin\.com/i, 'LinkedIn'],
    [/\.pdf(\?|#|$)/i, 'PDF']
  ];

  function checkLink(value) {
    var v = String(value == null ? '' : value).trim();
    if (!v) return { status: 'missing', kind: '' };
    if (!/^https?:\/\/\S+$/i.test(v)) return { status: 'invalid', kind: '' };
    for (var i = 0; i < HOSTS.length; i++) if (HOSTS[i][0].test(v)) return { status: 'ok', kind: HOSTS[i][1], url: v };
    return { status: 'unknown', kind: '', url: v };
  }

  function checkDocuments(row) {
    var missing = [], warnings = [];
    var cv = checkLink(row.cv), work = checkLink(row.work);
    if (cv.status === 'missing') missing.push('رابط الـ CV');
    else if (cv.status === 'invalid') missing.push('رابط CV غير صالح');
    else if (cv.status === 'unknown') warnings.push('رابط الـ CV من موقع غير معروف، افتحه وتأكد');
    if (work.status === 'missing') missing.push('رابط النتائج السابقة');
    else if (work.status === 'invalid') missing.push('رابط النتائج غير صالح');
    else if (work.status === 'unknown') warnings.push('رابط النتائج من موقع غير معروف، افتحه وتأكد');
    if (cv.url && work.url && cv.url === work.url) warnings.push('نفس الرابط للـ CV والنتائج');
    var phone = String(row.phone || '').replace(/\D/g, '');
    if (phone.length < 8) missing.push('رقم واتساب غير صالح');
    if (!len(row.name)) missing.push('الاسم');
    if (!len(row.rate)) missing.push('المقابل المتوقع');
    if (!len(row.avail)) missing.push('موعد البدء');
    if (cv.kind === 'Google Drive' || work.kind === 'Google Drive') warnings.push('تأكد إن صلاحية رابط Drive «أي شخص لديه الرابط»');
    return { cv: cv, work: work, missing: missing, warnings: warnings, complete: missing.length === 0 };
  }

  // ---------- total ----------
  var CRITERIA = [
    ['years', 'الخبرة', scoreExperience],
    ['platforms', 'المنصات', scorePlatforms],
    ['spend', 'حجم الميزانيات', scoreSpend],
    ['niche', 'خبرة الأثاث والمتاجر', scoreNiche],
    ['gulf', 'خبرة السوق الخليجي', scoreGulf],
    ['result', 'النتائج المثبتة بالأرقام', scoreResults],
    ['tracking', 'معرفة التتبع', scoreTracking],
    ['drop', 'تشخيص هبوط الأداء', scoreDiagnosis]
  ];

  function band(score) {
    if (score >= 75) return { key: 'top', label: 'ممتاز' };
    if (score >= 55) return { key: 'good', label: 'جيد' };
    if (score >= 35) return { key: 'mid', label: 'متوسط' };
    return { key: 'low', label: 'ضعيف' };
  }

  function evaluate(row) {
    var parts = [], total = 0;
    CRITERIA.forEach(function (c) {
      var r = c[2](row);
      parts.push({ key: c[0], label: c[1], points: r.points, max: r.max, note: r.note });
      total += r.points;
    });
    var docs = checkDocuments(row);
    var flags = [];
    var spend = parseSpendUSD(row.spend);
    if (norm(row.years).indexOf('اكثر') !== -1 && spend > 0 && spend < 1000) flags.push('خبرة طويلة مع ميزانيات صغيرة جدًا، اسأله عن السبب');
    if (len(row.result) < 25) flags.push('لم يذكر نتيجة محددة');
    if (parts[5].points <= 4 && total >= 55) flags.push('تقييم مرتفع لكن النتائج غير مدعومة بأرقام');
    if ((parts[6].points >= 8 && len(row.tracking) < 80) || (parts[7].points >= 8 && len(row.drop) < 80)) {
      flags.push('إجابات قصيرة مليانة مصطلحات بدون شرح، اطلب منه يشرح بمثال');
    }
    return { score: total, band: band(total), parts: parts, docs: docs, flags: flags };
  }

  // Marks applicants who pasted the same long answer as someone else.
  function findDuplicates(rows) {
    var seen = {}, dup = {};
    var keys = ['niche', 'gulf', 'result', 'tracking', 'drop'];
    rows.forEach(function (r) {
      keys.forEach(function (k) {
        var t = norm(r[k]).replace(/\s+/g, ' ').trim();
        if (t.length < 40) return;
        if (seen[t] && seen[t] !== r.id) { dup[r.id] = true; dup[seen[t]] = true; }
        else seen[t] = r.id;
      });
    });
    return dup;
  }

  var api = { evaluate: evaluate, findDuplicates: findDuplicates, parseSpendUSD: parseSpendUSD, checkLink: checkLink, norm: norm, band: band };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MagmafyScoring = api;
})(typeof window !== 'undefined' ? window : this);
