// Interview checklist: a full-screen work screen opened from the applicant drawer.
// Pure UI + scoring. Saving is done by the caller (app.js -> saveInterview on the server).
// All dynamic values are written with .value / .textContent; innerHTML only receives static, escaped strings.
(function () {
  'use strict';

  var CRIT = [
    { id: 'exp', n: 'خبرة حقيقية بأرقام', w: 20 },
    { id: 'niche', n: 'تخصص الأثاث والديكور والمتاجر', w: 15 },
    { id: 'gulf', n: 'معرفة السوق السعودي والخليجي', w: 15 },
    { id: 'track', n: 'التتبع والتشخيص', w: 15 },
    { id: 'clear', n: 'وضوح الشرح', w: 10 },
    { id: 'commit', n: 'الالتزام والتواصل', w: 10 },
    { id: 'bridge', n: 'قبول ترتيب الجسر', w: 5 },
    { id: 'price', n: 'السعر والتوافق', w: 10 }
  ];
  var CN = {}; CRIT.forEach(function (c) { CN[c.id] = c.n; });

  var Q = [
    { g: 'أ. الخبرة الحقيقية والتشخيص', core: 1, c: 'exp', t: 'احكيلي عن آخر عميل اشتغلت معاه في الأثاث أو الديكور أو متجر إلكتروني. إيه الهدف وإيه اللي حصل؟', h: 'أرقام قبل وبعد (ميزانية، تكلفة النتيجة، مبيعات) + حاجة مانجحتش. اللي كل قصصه نجاح كامل نشك فيه.' },
    { g: '', core: 1, c: 'clear', t: 'اشرحلي إزاي بتشغّل حملة لمعرض أثاث كأني صاحب المعرض ومش فاهم حاجة.', h: 'بيبسّط؟ لو غرق في المصطلحات هيغرقك قدام العميل.' },
    { g: '', core: 1, c: 'track', t: 'إيه أول 3 حاجات بتعملها لما تستلم حساب عميل جديد؟', h: 'فهم البزنس والعرض، مراجعة الحساب والبكسل والتتبع، بناء اختبار مبدئي. اللي يبدأ بـ «أنزّل إعلان» مبتدئ.' },
    { g: '', core: 0, c: 'track', t: 'حملة نتايجها وقعت فجأة بعد أسبوع كويس. أول 3 حاجات تفحصها؟', h: 'التتبع، إرهاق الإعلان وتكراره، الميزانية والمزايدة، منافس أو موسم، العرض وصفحة الهبوط.' },
    { g: '', core: 0, c: 'track', t: 'إزاي بتتأكد إن التتبع سليم قبل ما تصرف أول ريال؟', h: 'بكسل وأحداث واختبار فعلي، مش «بشوف الإعلان بيجيب نتايج».' },
    { g: 'ب. الأثاث والخليج', core: 0, c: 'niche', t: 'الأثاث سلعة غالية وقرار الشراء فيها طويل. إزاي بتبني الحملات؟', h: 'مراحل: وعي وتفاعل، إعادة استهداف، رسايل واتساب، تشجيع زيارة المعرض أو الطلب.' },
    { g: '', core: 0, c: 'gulf', t: 'إيه خبرتك مع السوق السعودي والخليجي؟ المواسم وطرق الدفع والمنصات؟', h: 'مواسم زي رمضان واليوم الوطني ويوم التأسيس والجمعة البيضاء، سناب وتيك توك، الدفع بالتقسيط أو عند الاستلام. الجواب العام من غير تفاصيل ضعيف.' },
    { g: '', core: 0, c: 'niche', t: 'لمتجر أثاث في الرياض، تبدأ بأنهي منصة؟ وتوزّع الميزانية إزاي وليه؟', h: 'مفيش جواب واحد صح. بنقيّم المنطق مش الاسم.' },
    { g: 'ج. التشغيل والترتيب', core: 1, c: 'commit', t: 'كام عميل تقدر تديرهم في نفس الوقت وإنت محافظ على الجودة؟', h: 'رقم واقعي بين 3 و8. اللي يقول 20 بيوزّع وقته على الكل بسطحية.' },
    { g: '', core: 1, c: 'exp', t: 'إيه النتيجة الواقعية اللي أقدر أوعد بيها العميل في أول 30 يوم؟', h: 'المحترف يقول «بيعتمد» ويسأل عن الميزانية والعرض والمدينة، وبعدين يدّيك نطاق حذر. اللي يوعد بأرقام كبيرة فورًا خطر.' },
    { g: '', core: 1, c: 'commit', t: 'إزاي هتبلّغني لو الحملة مش ماشية كويس؟ ومتى آخر مرة حصل؟', h: 'عايزين اللي يبلّغ بنفسه أول بأول، مش لما نسأل.' },
    { g: '', core: 1, c: 'commit', t: 'إيه أوقات شغلك؟ وبترد على رسالتي في كام ساعة في يوم عادي؟', h: 'جواب محدد. «دايمًا متاح» مش جواب حقيقي.' },
    { g: '', core: 1, c: 'bridge', t: 'اشتغلت قبل كده مع وكالة أو وسيط من غير ما تكلم العميل مباشرة؟ التجربة كانت إزاي؟', h: 'عايزينه مرتاح للترتيب، مش شايفه مؤقت لحد ما يتعرّف على العميل.' },
    { g: '', core: 0, c: 'bridge', t: 'الحسابات الإعلانية والصفحات هتبقى باسم الوكالة أو العميل وإنت بتاخد صلاحية وصول بس. أي مشكلة؟', h: 'الاعتراض على ده علامة حمرا.' },
    { g: 'د. الأجر والتوافق', core: 1, c: 'price', t: 'سعرك الشهري عن العميل الواحد؟ وإيه اللي بيتغير لو بقوا 4؟ (هو يقول رقمه الأول)', h: 'سعر واضح وبينزل شوية مع الحجم. اللي مفيش عنده سعر أو بيغيّره كل مرة هيتعبنا في الحسابات.' },
    { g: '', core: 1, c: 'price', t: 'إيه الميزانية الشهرية الأقل اللي تشوفها منطقية لعميل أثاث في السعودية؟', h: 'مش عشان الرقم نفسه، عشان نشوف خبرته بأسعار السوق.' },
    { g: '', core: 0, c: 'commit', t: 'إيه اللي محتاجه مننا عشان تنجح؟ وعندك أسئلة علينا؟', h: 'أسئلته بتكشف مستوى تفكيره: صلاحيات، سرعة اعتماد التصاميم، جودة المحتوى، حجم الميزانيات.' }
  ];
  Q.forEach(function (q, i) { q.id = 'q' + (i + 1); });
  var CORE = Q.filter(function (q) { return q.core; }).length;

  var FLAGS = [
    'اشترط يتواصل مع العميل مباشرة من أول يوم',
    'مش قادر يدّيني مثال واحد بأرقام حقيقية',
    'طلب دفع مقدم قبل أي شغل',
    'اتأخر عن المقابلة أو المهمة من غير ما يبلّغ',
    'اتكلم بسوء عن عملائه القدام',
    'وعد بأرقام كبيرة فورًا من غير ما يسأل عن الميزانية والعرض',
    'رفض إن الحسابات تبقى باسمنا أو باسم العميل'
  ];
  var FSHORT = ['تواصل مباشر مع العميل', 'مفيش مثال بأرقام', 'طلب دفع مقدم', 'اتأخر من غير إبلاغ', 'كلام سيئ عن عملائه', 'وعد بأرقام كبيرة', 'رفض الحسابات باسمنا'];
  var PREP = [
    'راجعت إجاباته ونتائجه وملف الـسي في هنا في الداشبورد',
    'حددت سقف الأجر عن كل عميل (اكتبه تحت)',
    'جهزت جملة التعريف بماجمافاي (من غير أرقام أو أسماء مش مؤكدة)',
    'خدت إذنه لو هسجّل المكالمة',
    'جهزت 3 أسئلة مخصوصة على ملفه'
  ];
  var PITCH = [
    'ماجمافاي وكالة متخصصة في الأثاث والديكور في السعودية والخليج',
    'إحنا اللي بنجيب العميل وبنتولى العلاقة، وهو يركّز على الحملات والنتائج',
    'مبلغ شهري ثابت عن كل عميل من غير بيع ولا متابعة ولا تحصيل',
    'كل عميل جديد بنوقّعه دخل إضافي له، وبعد 4 عملاء نتكلم عن تعاون أكبر'
  ];
  var CLOSE = [
    'سألته لو عنده أسئلة عليّ',
    'ما وعدتش بعدد عملاء ولا بشغل ثابت',
    'ما قلتش رقمي قبل ما يقول رقمه',
    'شرحت الخطوة الجاية (مهمة تجريبية) وإمتى هرد عليه',
    'شكرته على وقته'
  ];
  var TRIAL = [{ id: 't1', n: 'جودة التفكير' }, { id: 't2', n: 'واقعية الأرقام' }, { id: 't3', n: 'الالتزام بالموعد' }, { id: 't4', n: 'طريقة التسليم' }];
  var SEGS = [[0, 3, 'تعارف + جملة التعريف'], [3, 8, 'خلفيته وآخر عميل'], [8, 18, 'الأسئلة التقنية (أ)'], [18, 23, 'الأثاث والخليج (ب)'], [23, 27, 'التشغيل والترتيب (ج)'], [27, 30, 'الأجر (د) والخطوة الجاية']];
  var DEC = { '': 'لسه ماتقررش', trial: 'مهمة تجريبية', main: 'أساسي', backup: 'احتياطي', reject: 'رفض' };

  // ---------- helpers ----------
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function getP(o, p) { var a = p.split('.'); for (var i = 0; i < a.length; i++) { if (o == null) return undefined; o = o[a[i]]; } return o; }
  function setP(o, p, v) { var a = p.split('.'); for (var i = 0; i < a.length - 1; i++) { if (typeof o[a[i]] !== 'object' || o[a[i]] === null) o[a[i]] = {}; o = o[a[i]]; } o[a[a.length - 1]] = v; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function blank() { return { v: 1, fee: '', cap: '', checks: {}, flags: {}, prep: {}, pitch: {}, close: {}, ratings: {}, trial: {}, notes: {}, decision: '', gen: '', final: '' }; }
  function normalise(d) {
    var b = blank();
    if (d && typeof d === 'object') Object.keys(b).forEach(function (k) { if (d[k] !== undefined && d[k] !== null) b[k] = d[k]; });
    return b;
  }

  function calc(c) {
    var tot = 0, rated = 0;
    CRIT.forEach(function (k) { var r = c.ratings[k.id]; if (typeof r === 'number') { rated++; tot += (r / 5) * k.w; } });
    var flags = FLAGS.reduce(function (n, _, i) { return n + (c.flags['f' + i] ? 1 : 0); }, 0);
    var core = Q.filter(function (q) { return q.core && c.checks[q.id]; }).length;
    var asked = Q.filter(function (q) { return c.checks[q.id]; }).length;
    var tr = 0, trN = 0;
    TRIAL.forEach(function (t) { var v = c.trial[t.id]; if (typeof v === 'number') { trN++; tr += v; } });
    return { score: Math.round(tot), rated: rated, flags: flags, core: core, asked: asked, trial: trN ? (tr / (trN * 5) * 100) : null };
  }
  function band(r) {
    if (r.flags > 0) return { cls: 'no', t: 'رفض (علامة حمرا)' };
    if (r.rated < CRIT.length) return { cls: 'mid', t: 'التقييم ناقص ' + (CRIT.length - r.rated) + ' معيار' };
    if (r.score >= 80) return { cls: 'ok', t: 'ادخل المهمة التجريبية بثقة' };
    if (r.score >= 65) return { cls: 'mid', t: 'مهمة تجريبية بعد المقارنة' };
    return { cls: 'no', t: 'رفض أو احتياطي' };
  }
  function started(d) {
    var c = normalise(d), r = calc(c);
    return !!(r.rated || r.asked || r.flags || c.decision || c.fee);
  }
  function summaryOf(d) {
    var c = normalise(d), r = calc(c); r.band = band(r); r.decision = c.decision; r.started = started(d); return r;
  }

  function summaryText(c, name) {
    var r = calc(c), b = band(r), L = [];
    L.push('المتقدم: ' + name);
    L.push('الدرجة: ' + r.score + '/100 (' + b.t + ')');
    L.push('الأسئلة الأساسية: ' + r.core + '/' + CORE + ' · علامات الخطر: ' + r.flags);
    if (c.fee) L.push('سعره: ' + c.fee + ' دولار/عميل' + (c.cap ? ' (سقفي ' + c.cap + ')' : ''));
    if (r.trial !== null) L.push('المهمة التجريبية: ' + Math.round(r.trial) + '/100');
    L.push('القرار: ' + DEC[c.decision || '']);
    var fl = FLAGS.filter(function (_, k) { return c.flags['f' + k]; });
    if (fl.length) { L.push(''); L.push('علامات الخطر:'); fl.forEach(function (t) { L.push('- ' + t); }); }
    L.push(''); L.push('التقييم:');
    CRIT.forEach(function (k) { var v = c.ratings[k.id]; L.push('- ' + k.n + ': ' + (typeof v === 'number' ? v : '-') + '/5'); });
    L.push(''); L.push('نوتس الأسئلة:');
    Q.forEach(function (q) { var n = String(c.notes[q.id] || '').trim(); if (n) L.push(q.id.slice(1) + '. ' + q.t + '\n   ' + n); });
    if (String(c.gen || '').trim()) { L.push(''); L.push('انطباع عام: ' + String(c.gen).trim()); }
    if (String(c.final || '').trim()) { L.push(''); L.push('سبب القرار: ' + String(c.final).trim()); }
    return L.join('\n');
  }

  // ---------- the screen ----------
  var lastCap = ''; // remembered for this tab only, so the cap is typed once
  var cur = null;   // the open session

  function chkList(items, pre) {
    return items.map(function (t, i) { return '<label class="iv-chk"><input type="checkbox" data-bind="' + pre + '.k' + i + '"><span>' + esc(t) + '</span></label>'; }).join('');
  }

  function bodyHTML() {
    var h = '';
    h += '<div class="iv-card"><h3>بيانات المتقدم</h3><div class="iv-grid">'
      + '<div class="iv-f">الاسم<b id="ivName"></b></div>'
      + '<div class="iv-f">طلبه في الفورم<b id="ivRate"></b></div>'
      + '<label class="iv-f">سعره بعد المقابلة (دولار)<input type="number" inputmode="decimal" min="0" step="any" data-bind="fee"></label>'
      + '<label class="iv-f">سقفي عن العميل (دولار)<input type="number" inputmode="decimal" min="0" step="any" data-bind="cap"></label>'
      + '</div><p class="iv-note iv-warn" id="ivFee"></p></div>';
    h += '<div class="iv-card"><h3>قبل المقابلة</h3>' + chkList(PREP, 'prep') + '</div>';
    h += '<div class="iv-card"><h3>جملة التعريف (أول 3 دقايق)</h3><p class="iv-note">عبّر بكلامك، المهم الأفكار دي توصله.</p>' + chkList(PITCH, 'pitch') + '</div>';
    h += '<div class="iv-card"><h3>الأسئلة</h3><div class="iv-prog"><i id="ivBar"></i></div><p class="iv-note" id="ivProg"></p>';
    Q.forEach(function (q) {
      if (q.g) h += '<h4>' + esc(q.g) + '</h4>';
      h += '<div class="iv-q"><label class="iv-chk"><input type="checkbox" data-bind="checks.' + q.id + '"><span class="iv-qt">' + esc(q.t)
        + ' <span class="iv-tag' + (q.core ? ' core' : '') + '">' + (q.core ? 'أساسي' : 'إضافي') + '</span><span class="iv-tag">يغذّي: ' + esc(CN[q.c]) + '</span></span></label>'
        + '<details class="iv-hear"><summary>إيه اللي نسمعه في الجواب</summary>' + esc(q.h) + '</details>'
        + '<textarea maxlength="1000" data-bind="notes.' + q.id + '" placeholder="نوتس الجواب" aria-label="نوتس السؤال"></textarea></div>';
    });
    h += '</div>';
    h += '<div class="iv-card"><h3>التقييم (من 0 إلى 5 لكل معيار)</h3>';
    CRIT.forEach(function (k) {
      h += '<div class="iv-crit"><div><span class="iv-cn">' + esc(k.n) + '</span> <span class="iv-w">الوزن ' + k.w + '</span></div><div class="iv-rates" role="group" aria-label="' + esc(k.n) + '">';
      for (var v = 0; v <= 5; v++) h += '<button type="button" class="iv-rate" data-rate="' + k.id + '" data-val="' + v + '" aria-pressed="false">' + v + '</button>';
      h += '</div></div>';
    });
    h += '<div class="iv-score"><div><div class="iv-note">الدرجة من 100</div><div class="iv-big" id="ivScore">0</div></div><div><span class="iv-pill" id="ivBand"></span><div class="iv-note" id="ivBandNote"></div></div></div></div>';
    h += '<div class="iv-card"><h3>قفل المقابلة</h3>' + chkList(CLOSE, 'close') + '</div>';
    h += '<div class="iv-card"><h3>المهمة التجريبية (لو دخلها)</h3><p class="iv-note">خطة حملة من صفحة واحدة لمعرض أثاث افتراضي في الرياض، ساعة إلى ساعتين، من غير دفع.</p>';
    TRIAL.forEach(function (t) {
      h += '<div class="iv-crit"><div class="iv-cn">' + esc(t.n) + '</div><div class="iv-rates" role="group" aria-label="' + esc(t.n) + '">';
      for (var v = 0; v <= 5; v++) h += '<button type="button" class="iv-rate" data-trate="' + t.id + '" data-val="' + v + '" aria-pressed="false">' + v + '</button>';
      h += '</div></div>';
    });
    h += '<p class="iv-note" id="ivTrial"></p></div>';
    h += '<div class="iv-card"><h3>القرار والنوتس العامة</h3><label class="iv-f">القرار<select data-bind="decision">'
      + Object.keys(DEC).map(function (k) { return '<option value="' + k + '">' + esc(DEC[k]) + '</option>'; }).join('')
      + '</select></label>'
      + '<label class="iv-f iv-gap">انطباعي العام<textarea maxlength="1500" data-bind="gen" placeholder="شخصيته، طريقة كلامه، إحساسك"></textarea></label>'
      + '<label class="iv-f iv-gap">سبب القرار<textarea maxlength="1500" data-bind="final" placeholder="ليه اخترته أو رفضته"></textarea></label>'
      + '<div class="iv-actions"><button class="btn primary" type="button" id="ivCopy">نسخ الملخص</button></div><div id="ivCopyOut"></div>'
      + '<p class="iv-note iv-gap">الدرجة والتوصية أداة مساعدة، والقرار الأخير ليك. لتغيير حالة المتقدم (مقابلة، مقبول، مرفوض) ارجع للوحة بعد ما تقفل الشاشة دي.</p></div>';
    return h;
  }

  function riskHTML() {
    return '<button type="button" class="iv-risk-h" id="ivRiskTg" aria-expanded="false" aria-controls="ivChips">علامات الخطر <span class="iv-n z" id="ivRiskN">0</span><span class="iv-car" aria-hidden="true">▲</span></button>'
      + '<div class="iv-chips" id="ivChips">'
      + FLAGS.map(function (t, k) { return '<label class="iv-chip" title="' + esc(t) + '"><input type="checkbox" data-bind="flags.f' + k + '"><span>' + esc(FSHORT[k]) + '</span></label>'; }).join('')
      + '</div><div class="iv-risk-msg" id="ivRiskMsg"></div>';
  }

  function open(opts) {
    if (cur) close(true);
    var c = normalise(opts.data);
    if (!c.cap && lastCap) c.cap = lastCap;
    var opener = document.activeElement;
    var root = document.createElement('div');
    root.className = 'iv';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'مقابلة المتقدم');
    root.innerHTML =
      '<div class="iv-top"><div class="iv-top-in"><h2 id="ivTitle"></h2><span class="iv-save" id="ivSave" aria-live="polite"></span>'
      + '<div class="iv-timer"><span class="iv-t" id="ivTm">00:00</span><span class="iv-seg" id="ivSeg">جاهز</span>'
      + '<button class="btn" id="ivGo" type="button">ابدأ</button><button class="btn" id="ivRst" type="button">صفّر</button></div>'
      + '<button class="btn" id="ivClose" type="button">إغلاق</button></div></div>'
      + '<div class="iv-main" id="ivMain">' + bodyHTML() + '</div>'
      + '<div class="iv-risk" id="ivRisk" role="group" aria-label="علامات الخطر"><div class="iv-risk-in">' + riskHTML() + '</div></div>';
    document.body.appendChild(root);
    document.body.classList.add('iv-open');

    var S = { root: root, c: c, opts: opts, opener: opener, timer: null, sec: 0, saveT: null, dirty: false, riskOpen: false, onKey: null };
    cur = S;
    $('#ivTitle', root).textContent = 'مقابلة: ' + (opts.name || '(بدون اسم)');
    $('#ivName', root).textContent = opts.name || '(بدون اسم)';
    $('#ivRate', root).textContent = opts.rate || 'لم يذكر';
    if (!opts.live) setSave(S, 'demo');

    $$('[data-bind]', root).forEach(function (el) {
      var v = getP(c, el.getAttribute('data-bind'));
      if (el.type === 'checkbox') el.checked = !!v; else el.value = (v === undefined ? '' : v);
      var ev = (el.type === 'checkbox' || el.tagName === 'SELECT') ? 'change' : 'input';
      el.addEventListener(ev, function () {
        var path = el.getAttribute('data-bind'), val = el.type === 'checkbox' ? el.checked : el.value;
        if (el.type === 'checkbox' && !val) val = undefined; // keep the stored document small
        setP(c, path, val);
        if (path === 'cap') lastCap = String(c.cap || '');
        changed(S);
      });
    });
    root.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('.iv-rate') : null;
      if (!b) return;
      var val = Number(b.getAttribute('data-val'));
      if (b.hasAttribute('data-rate')) { var k = b.getAttribute('data-rate'); if (c.ratings[k] === val) delete c.ratings[k]; else c.ratings[k] = val; }
      else { var t = b.getAttribute('data-trate'); if (c.trial[t] === val) delete c.trial[t]; else c.trial[t] = val; }
      changed(S);
    });
    var mq = window.matchMedia('(max-width:760px)'), rk = $('#ivRisk', root), tg = $('#ivRiskTg', root);
    S.paintRisk = function () { var o = S.riskOpen && mq.matches; rk.classList.toggle('open', o); tg.setAttribute('aria-expanded', String(o)); };
    tg.addEventListener('click', function () { if (!mq.matches) return; S.riskOpen = !S.riskOpen; S.paintRisk(); });
    S.paintRisk();

    $('#ivCopy', root).addEventListener('click', function () { showCopy(summaryText(c, opts.name || ''), $('#ivCopyOut', root)); });
    $('#ivClose', root).addEventListener('click', function () { close(); });
    $('#ivGo', root).addEventListener('click', function () {
      if (S.timer) { clearInterval(S.timer); S.timer = null; this.textContent = 'كمّل'; }
      else { S.timer = setInterval(function () { S.sec++; paintTimer(S); }, 1000); this.textContent = 'وقّف'; }
      paintTimer(S);
    });
    $('#ivRst', root).addEventListener('click', function () { clearInterval(S.timer); S.timer = null; S.sec = 0; $('#ivGo', root).textContent = 'ابدأ'; paintTimer(S); });
    S.onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', S.onKey);
    refresh(S);
    $('#ivClose', root).focus();
  }

  function paintTimer(S) {
    var f = function (n) { return (n < 10 ? '0' : '') + n; }, root = S.root;
    $('#ivTm', root).textContent = f(Math.floor(S.sec / 60)) + ':' + f(S.sec % 60);
    var m = S.sec / 60, label = 'جاهز';
    if (S.sec > 0 || S.timer) { label = 'بعد الوقت المقترح'; for (var i = 0; i < SEGS.length; i++) { if (m >= SEGS[i][0] && m < SEGS[i][1]) { label = SEGS[i][2]; break; } } }
    $('#ivSeg', root).textContent = label;
  }

  function refresh(S) {
    var c = S.c, root = S.root, r = calc(c), b = band(r);
    $('#ivBar', root).style.width = Math.round(r.core / CORE * 100) + '%';
    $('#ivProg', root).textContent = 'الأسئلة الأساسية: ' + r.core + ' من ' + CORE + ' · كل الأسئلة: ' + r.asked + ' من ' + Q.length;
    $('#ivScore', root).textContent = r.score;
    var bp = $('#ivBand', root); bp.className = 'iv-pill ' + b.cls; bp.textContent = b.t;
    $('#ivBandNote', root).textContent = r.rated < CRIT.length ? ('اتقيّم ' + r.rated + ' من ' + CRIT.length + ' معايير') : 'التقييم مكتمل';
    var rk = $('#ivRisk', root); rk.classList.toggle('on', r.flags > 0);
    var rn = $('#ivRiskN', root); rn.textContent = r.flags; rn.className = 'iv-n' + (r.flags ? '' : ' z');
    $('#ivRiskMsg', root).textContent = r.flags ? 'القرار المقترح: رفض بغض النظر عن الدرجة' : '';
    var fee = parseFloat(c.fee), cap = parseFloat(c.cap);
    $('#ivFee', root).textContent = (!isNaN(fee) && !isNaN(cap) && fee > cap) ? ('سعره أعلى من سقفك بـ ' + (Math.round((fee - cap) * 100) / 100) + ' دولار عن كل عميل') : '';
    $$('[data-rate]', root).forEach(function (btn) { btn.setAttribute('aria-pressed', String(c.ratings[btn.getAttribute('data-rate')] === Number(btn.getAttribute('data-val')))); });
    $$('[data-trate]', root).forEach(function (btn) { btn.setAttribute('aria-pressed', String(c.trial[btn.getAttribute('data-trate')] === Number(btn.getAttribute('data-val')))); });
    $('#ivTrial', root).textContent = r.trial === null ? '' : ('درجة المهمة: ' + Math.round(r.trial) + ' من 100');
  }

  function setSave(S, state) {
    var el = $('#ivSave', S.root); if (!el) return;
    var t = { saved: 'محفوظ', saving: 'جارٍ الحفظ...', error: 'تعذّر الحفظ. هنحاول تاني مع أي تعديل.', old: 'السيرفر محتاج تحديث (Code.gs) عشان يحفظ المقابلة.', demo: 'للعرض فقط، مش بيتحفظ.' }[state] || '';
    el.textContent = t; el.className = 'iv-save ' + state;
  }

  function changed(S) {
    refresh(S);
    if (S.opts.onChange) S.opts.onChange(S.c);
    if (!S.opts.live) return;
    S.dirty = true; setSave(S, 'saving');
    clearTimeout(S.saveT);
    S.saveT = setTimeout(function () { flush(S); }, 700);
  }

  function flush(S) {
    clearTimeout(S.saveT);
    if (!S.dirty || !S.opts.live) return Promise.resolve();
    S.dirty = false;
    return S.opts.save(S.c).then(function (j) {
      if (cur !== S && !S.root.isConnected) return;
      if (j && j.ok) { if (!S.dirty) setSave(S, 'saved'); }
      else { S.dirty = true; setSave(S, j && j.error === 'invalid' ? 'old' : 'error'); }
    }).catch(function () { S.dirty = true; if (S.root.isConnected) setSave(S, 'error'); });
  }

  function close(silent) {
    var S = cur; if (!S) return;
    flush(S);
    clearInterval(S.timer);
    document.removeEventListener('keydown', S.onKey);
    S.root.remove();
    document.body.classList.remove('iv-open');
    cur = null;
    if (!silent && S.opts.onClose) S.opts.onClose(S.c);
    if (S.opener && S.opener.focus && S.opener.isConnected) S.opener.focus();
  }

  function showCopy(text, host) {
    function fallback() {
      host.textContent = '';
      var p = document.createElement('p'); p.className = 'iv-note'; p.textContent = 'انسخ النص من هنا:';
      var ta = document.createElement('textarea'); ta.className = 'iv-sheet'; ta.readOnly = true; ta.value = text;
      host.appendChild(p); host.appendChild(ta); ta.focus(); ta.select();
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () { host.textContent = 'اتنسخ.'; host.className = 'iv-note iv-ok'; }, fallback);
        return;
      }
    } catch (e) { /* falls through */ }
    fallback();
  }

  window.MagmafyInterview = { open: open, close: close, summary: summaryOf, DEC: DEC, CORE: CORE };
})();
