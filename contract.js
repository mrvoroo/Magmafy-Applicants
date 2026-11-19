// Contract screen: a full-screen work screen opened from the applicant drawer.
// Builds a Magmafy-branded contract from the form fields, collects the contractor's drawn signature,
// and shows the Magmafy seal once the owner approves. Saving is done by the caller (app.js -> saveContract).
// All dynamic values are escaped before they touch innerHTML or written with .value / .textContent.
(function () {
  'use strict';

  var CUR = { USD: 'دولار أمريكي', SAR: 'ريال سعودي', EGP: 'جنيه مصري', AED: 'درهم إماراتي' };
  var STATUS = { none: 'لم يُنشأ', draft: 'مسودة', signed: 'موقّع ومعتمد', ended: 'منتهي' };
  var SIG_W = 300, SIG_H = 120, MAX_PTS = 1400;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function bdi(s) { return '<bdi>' + esc(s) + '</bdi>'; }
  function $(s, r) { return (r || document).querySelector(s); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function todayISO() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }

  function fmtDate(v) {
    if (!v) return '';
    var d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(+v.slice(0, 4), +v.slice(5, 7) - 1, +v.slice(8, 10)) : new Date(v);
    if (isNaN(d.getTime())) return '';
    try { return d.toLocaleDateString('ar', { day: 'numeric', month: 'long', year: 'numeric', numberingSystem: 'latn', calendar: 'gregory' }); }
    catch (e) { return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate()); }
  }

  function contractNo(id) {
    var d = todayISO().replace(/-/g, ''), tail = String(id || '').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase();
    while (tail.length < 4) tail = '0' + tail;
    return 'MGF-' + d + '-' + tail;
  }

  function defaults(o) {
    var a = o.applicant || {}, co = o.company || {};
    return {
      v: 1, no: contractNo(o.id), fee: o.fee ? String(o.fee) : '', cur: 'USD',
      payDays: 7, noticeDays: 14, replyHours: 24, nonSol: 12, start: todayISO(),
      platforms: 'ميتا (فيسبوك وإنستغرام)، جوجل، سناب شات، تيك توك',
      law: 'قوانين المملكة العربية السعودية',
      p1: { entity: co.entity || 'ماجمافاي', rep: co.rep || '', title: co.title || '' },
      p2: { name: a.name || '', phone: a.phone || '', email: a.email || '', country: a.country || '' },
      terms: []
    };
  }

  function normalise(d, o) {
    var b = defaults(o);
    if (d && typeof d === 'object') {
      ['no', 'fee', 'cur', 'payDays', 'noticeDays', 'replyHours', 'nonSol', 'start', 'platforms', 'law'].forEach(function (k) { if (d[k] !== undefined && d[k] !== null && d[k] !== '') b[k] = d[k]; });
      if (d.fee === '') b.fee = '';
      ['p1', 'p2'].forEach(function (p) { if (d[p] && typeof d[p] === 'object') Object.keys(b[p]).forEach(function (k) { if (typeof d[p][k] === 'string') b[p][k] = d[p][k]; }); });
      if (Array.isArray(d.terms)) b.terms = d.terms;
      ['status', 'sig', 'signedAt', 'signedBy', 'hash', 'endedAt', 'endReason'].forEach(function (k) { if (d[k] !== undefined) b[k] = d[k]; });
    }
    return b;
  }

  // ---------- the contract text (Arabic). Numbered when built, then frozen into the signed record. ----------
  function buildTerms(c) {
    var fee = c.fee ? c.fee + ' ' + (CUR[c.cur] || '') : '________';
    var A = 'الطرف الأول', B = 'الطرف الثاني';
    var L = [];
    L.push({ h: 'تمهيد', p: ['ماجمافاي وكالة متخصصة في خدمات التسويق الرقمي وتطوير المواقع والمتاجر الإلكترونية لعلامات الأثاث والديكور في المملكة العربية السعودية ودول الخليج. وتتولى الوكالة التعاقد مع العملاء وإدارة العلاقة معهم، ويرغب ' + B + ' في تنفيذ الحملات الإعلانية المدفوعة للعملاء الذين تسندهم إليه الوكالة، وفق الشروط التالية.'] });
    L.push({ h: 'طبيعة العلاقة', p: [
      'يعمل ' + B + ' بصفة متعاون مستقل، ولا ينشئ هذا العقد علاقة عمل أو شراكة أو وكالة بين الطرفين.',
      'لا يلتزم ' + A + ' بإسناد عدد معين من العملاء أو بحد أدنى من العمل أو الدخل، ولا يلتزم ' + B + ' بقبول أي عميل يُعرض عليه. غير أنه متى قبل عميلاً التزم بتنفيذه وفق هذا العقد.',
      B + ' مسؤول عن أدواته واشتراكاته وضرائبه والتزاماته النظامية في بلده، وله أن يعمل لدى غيره بشرط ألا يخل ذلك بجودة عمله أو بمواعيده أو بسرية معلومات العملاء.'] });
    L.push({ h: 'نطاق العمل', p: [
      'يتولى ' + B + ' إدارة الحملات الإعلانية المدفوعة للعملاء المسندين إليه على المنصات التالية: ' + (c.platforms || '________') + '. ويشمل ذلك تحليل الهدف والعرض، وإعداد الحملات والاستهداف، وإعداد التتبع والتحقق منه، وإدارة الميزانية اليومية، والتحسين المستمر، وإعداد تقرير أداء شهري.',
      'يُسنَد كل عميل بإشعار كتابي (عبر الواتساب أو البريد الإلكتروني) يتضمن اسم العميل وتاريخ البدء والميزانية المعتمدة، ويُعد هذا الإشعار ملحقاً بهذا العقد.',
      'لا يشمل النطاق تصميم المحتوى أو تصويره أو تطوير المواقع أو أي عمل آخر، إلا إذا اتُّفق عليه كتابياً بأجر مستقل.'] });
    L.push({ h: 'الأجر وطريقة الدفع', p: [
      'يستحق ' + B + ' أجراً ثابتاً قدره ' + fee + ' شهرياً عن كل عميل مُسنَد إليه وفعّال، ولا يتغير هذا الأجر بتغير ميزانية الإعلانات أو نتائج الحملات، ما لم يتفق الطرفان كتابياً على غير ذلك.',
      'يُدفع الأجر عن كل شهر ميلادي خلال ' + c.payDays + ' أيام من نهاية الشهر، بوسيلة تحويل يتفق عليها الطرفان، ويتحمل كل طرف رسوم جهته.',
      'إذا بدأ العميل أو انتهى أثناء الشهر احتُسب الأجر بالتناسب مع عدد الأيام الفعلية.',
      'إذا توقف العميل عن الدفع أو أنهى تعاقده مع ' + A + '، يُخطر ' + A + ' ' + B + ' فوراً، ويُحتسب الأجر حتى تاريخ التوقف.',
      'لا يستحق ' + B + ' أي عمولة أو نسبة أو مبلغ إضافي، ولا يحق له مطالبة العميل بأي مبلغ.'] });
    L.push({ h: 'التواصل مع العملاء', p: [
      'علاقة العميل ملك لـ' + A + '، ويتم التواصل مع العملاء عبره وحده. ولا يتواصل ' + B + ' مع العميل مباشرة إلا بإذن كتابي من ' + A + ' وفي حدود الإذن.',
      'يرد ' + B + ' على رسائل ' + A + ' خلال ' + c.replyHours + ' ساعة كحد أقصى في أيام العمل.',
      'يُبلغ ' + B + ' ' + A + ' فوراً بأي مشكلة جوهرية في الحساب أو الأداء أو الإنفاق، ولا ينتظر السؤال عنها.',
      'لا يعد ' + B + ' العميل بأي نتائج أو أرقام، وتكون جميع الوعود عبر ' + A + ' وحده.'] });
    L.push({ h: 'الحسابات والأصول', p: [
      'تكون جميع الحسابات الإعلانية والصفحات وحسابات التتبع والبكسل والنطاقات والمحتوى باسم ' + A + ' أو العميل، ويُمنح ' + B + ' صلاحية وصول فقط بالقدر اللازم للعمل.',
      'لا ينشئ ' + B + ' أي حساب باسمه الشخصي للعملاء، ولا ينقل ملكية أي أصل، ولا يضيف نفسه مالكاً، ولا يغيّر وسائل الدفع، ولا يزيل أي مدير.',
      'يلتزم ' + B + ' بالميزانية المعتمدة ولا يتجاوزها إلا بموافقة كتابية، فالميزانيات مملوكة للعميل وتُدار بأمانة.'] });
    L.push({ h: 'السرية', p: [
      'يُعد سرياً كل ما يطّلع عليه ' + B + ' بسبب هذا العقد، ويشمل ذلك هويات العملاء وبياناتهم وأسعارهم وأرباحهم وأداء حملاتهم وبيانات حساباتهم وهذا العقد وشروطه.',
      'لا يفصح ' + B + ' عن أي منها لأي جهة، ولا يستخدمها لغير تنفيذ هذا العقد، ولا يحتفظ بنسخ منها بعد انتهائه.',
      'لا يذكر ' + B + ' أسماء العملاء أو نتائجهم في محفظة أعماله أو منشوراته إلا بإذن كتابي.',
      'يستمر هذا الالتزام طوال مدة العقد وبعد انتهائه لمدة سنتين.'] });
    if (+c.nonSol > 0) L.push({ h: 'عدم استقطاب العملاء', p: [
      'لا يعرض ' + B + ' خدماته على عملاء ' + A + ' ولا يتعاقد معهم مباشرة، بشكل مباشر أو غير مباشر، طوال مدة العقد ولمدة ' + c.nonSol + ' شهراً بعد انتهائه.',
      'لا يمنع هذا البند ' + B + ' من العمل مع غير عملاء ' + A + '.'] });
    L.push({ h: 'الجودة والالتزام المهني', p: [
      'يؤدي ' + B + ' عمله بعناية مهنية، ويلتزم بالمواعيد المتفق عليها وبسياسات المنصات الإعلانية، ولا يستخدم أي أسلوب مخالف قد يعرّض الحسابات للحظر.',
      'يتحمل ' + B + ' الأضرار المباشرة الناتجة عن إهماله الجسيم أو مخالفته المتعمدة لهذا العقد أو لسياسات المنصات، على ألا يتجاوز ذلك مجموع ما تقاضاه من أجور خلال الأشهر الثلاثة السابقة للواقعة.',
      'لا يُسأل ' + B + ' عن تقلبات السوق أو قرارات المنصات أو العميل الخارجة عن سيطرته متى التزم بالأصول المهنية.'] });
    L.push({ h: 'الملكية الفكرية', p: [
      'تعود ملكية كل ما ينتجه ' + B + ' أثناء العمل من حملات ونصوص وتقارير وإعدادات إلى ' + A + ' أو إلى العميل بحسب اتفاقه معه، ويبقى لـ' + B + ' حقه في خبرته المهنية العامة وأساليبه.'] });
    L.push({ h: 'المدة والإنهاء', p: [
      'يبدأ هذا العقد في ' + (fmtDate(c.start) || '________') + ' ويستمر لمدة غير محددة حتى ينتهي وفق هذا البند.',
      'يجوز لأي طرف إنهاء العقد بإخطار كتابي قبل ' + c.noticeDays + ' يوماً، ويواصل ' + B + ' عمله بالجودة نفسها خلال مدة الإخطار ويسلّم العملاء تسليماً منظماً.',
      'يجوز لـ' + A + ' إنهاء العقد فوراً عند الإخلال بالسرية، أو التواصل المباشر المخالف مع العملاء، أو الإهمال الجسيم، أو التلاعب بالميزانيات أو الحسابات، أو الانقطاع عن العمل دون إبلاغ. ويُدفع لـ' + B + ' الأجر المستحق عن الفترة السابقة للإنهاء، مع حق ' + A + ' في اقتطاع الأضرار المثبتة وفق بند الجودة والالتزام المهني.',
      'عند انتهاء العقد تُسحب الصلاحيات فوراً، ويسلّم ' + B + ' خلال 48 ساعة كل التقارير والإعدادات والملفات وأي بيانات للعملاء في حوزته، ويسدد ' + A + ' المستحقات وفق بند الأجر.'] });
    L.push({ h: 'الإخطارات والتعديل', p: [
      'تُعد الرسائل المرسلة إلى رقم الهاتف أو البريد الإلكتروني المذكورين في بيانات ' + B + ' إخطارات رسمية، ويلتزم كل طرف بإبلاغ الآخر بأي تغيير في بياناته.',
      'لا يُعدَّل هذا العقد إلا بموافقة مكتوبة من الطرفين.'] });
    L.push({ h: 'القانون وتسوية النزاعات', p: [
      'يخضع هذا العقد لـ' + (c.law || '________') + '.',
      'يسعى الطرفان إلى حل أي خلاف ودياً خلال 14 يوماً من إخطار أحدهما الآخر به، فإن تعذر ذلك رُفع إلى الجهة المختصة وفق القانون المذكور.'] });
    L.push({ h: 'أحكام عامة', p: [
      'يمثل هذا العقد الاتفاق الكامل بين الطرفين ويحل محل أي اتفاق أو تفاهم سابق بينهما.',
      'إذا تبين بطلان أي بند من بنوده فلا يبطل ذلك باقي البنود.',
      'يقر الطرفان بصحة التوقيع الإلكتروني على هذا العقد، وبأن نسخته المحفوظة إلكترونياً لدى ' + A + ' لها حجية النسخة الأصلية.',
      'قرأ ' + B + ' هذا العقد وفهم جميع بنوده ووافق عليه بكامل إرادته.'] });
    return L.map(function (cl, i) { return { h: i === 0 ? cl.h : i + '. ' + cl.h, p: cl.p }; }); // the preamble is not numbered
  }

  // ---------- paper ----------
  var STAMP = '<svg class="ct-stamp" viewBox="0 0 160 160" aria-label="ختم ماجمافاي">' +
    '<defs><path id="ctArc" d="M 80,80 m -60,0 a 60,60 0 1,1 120,0 a 60,60 0 1,1 -120,0"/></defs>' +
    '<circle cx="80" cy="80" r="77" fill="none" stroke="#d62976" stroke-width="3.2"/>' +
    '<circle cx="80" cy="80" r="71" fill="none" stroke="#d62976" stroke-width="1"/>' +
    '<circle cx="80" cy="80" r="49" fill="none" stroke="#d62976" stroke-width="1.2"/>' +
    '<text font-size="10.5" font-weight="700" fill="#d62976" font-family="Space Grotesk, Arial, sans-serif" letter-spacing="1.2" dy="3.5"><textPath href="#ctArc" startOffset="0" textLength="372" lengthAdjust="spacing">MAGMAFY · OFFICIAL SEAL · FURNITURE &amp; DECOR ·</textPath></text>' +
    '<image href="logo-mark.webp" x="56" y="37" width="48" height="48"/>' +
    '<text x="80" y="102" text-anchor="middle" font-size="13" font-weight="700" fill="#d62976">ماجمافاي</text>' +
    '<text x="80" y="117" text-anchor="middle" font-size="9" fill="#d62976">معتمد</text></svg>';

  function sigSVG(sig) {
    if (!sig || !Array.isArray(sig.strokes)) return '';
    var out = '<svg class="ct-sigsvg" viewBox="0 0 ' + SIG_W + ' ' + SIG_H + '" aria-label="توقيع">';
    sig.strokes.forEach(function (st) {
      var pts = [];
      for (var i = 0; i + 1 < st.length; i += 2) pts.push((+st[i] | 0) + ',' + (+st[i + 1] | 0));
      if (pts.length === 1) { var xy = pts[0].split(','); out += '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="1.4" fill="#1b1226"/>'; }
      else if (pts.length > 1) out += '<polyline points="' + pts.join(' ') + '" fill="none" stroke="#1b1226" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
    });
    return out + '</svg>';
  }

  function paperHTML(c, status, pendingSig) {
    var signed = status === 'signed' || status === 'ended';
    var terms = signed && c.terms && c.terms.length ? c.terms : buildTerms(c);
    var dateISO = signed && c.signedAt ? c.signedAt : todayISO();
    var h = '<div class="ct-strip"></div>';
    h += '<header class="ct-head"><img class="ct-logo" src="logo-mark.webp" alt=""><div class="ct-brandbox"><b class="ct-brand">ماجمافاي</b><span>Magmafy · وكالة تسويق وتطوير لعلامات الأثاث والديكور</span></div>';
    h += '<div class="ct-meta"><div>رقم العقد: ' + bdi(c.no) + '</div><div>التاريخ: ' + esc(fmtDate(dateISO)) + '</div></div></header>';
    h += '<h1 class="ct-title">عقد تعاون مستقل</h1><p class="ct-sub">ميديا باير · تنفيذ الحملات الإعلانية المدفوعة</p>';
    h += '<section class="ct-parties"><div><span class="ct-lab">الطرف الأول</span><p><b>' + bdi(c.p1.entity || 'ماجمافاي') + '</b>' + (c.p1.rep ? '، ويمثلها ' + bdi(c.p1.rep) + (c.p1.title ? ' (' + esc(c.p1.title) + ')' : '') : '') + '.</p></div>';
    h += '<div><span class="ct-lab">الطرف الثاني</span><p><b>' + bdi(c.p2.name || '________') + '</b>' + (c.p2.country ? '، ' + bdi(c.p2.country) : '') + (c.p2.phone ? '، هاتف: ' + bdi(c.p2.phone) : '') + (c.p2.email ? '، بريد: ' + bdi(c.p2.email) : '') + '.</p></div></section>';
    terms.forEach(function (cl, i) {
      h += '<section class="ct-cl"><h2>' + esc(cl.h) + '</h2>';
      (cl.p || []).forEach(function (p, j) { h += i === 0 ? '<p>' + esc(p) + '</p>' : '<p><span class="ct-n">' + i + '.' + (j + 1) + '</span>' + esc(p) + '</p>'; });
      h += '</section>';
    });
    h += '<section class="ct-sign"><div class="ct-box"><span class="ct-lab">الطرف الأول · ' + esc(c.p1.entity || 'ماجمافاي') + '</span>';
    h += '<div class="ct-who">' + (c.p1.rep ? bdi(c.p1.rep) : '________') + (c.p1.title ? '<small>' + esc(c.p1.title) + '</small>' : '') + '</div>';
    h += signed ? STAMP : '<div class="ct-ph">يوضع ختم ماجمافاي بعد الاعتماد</div>';
    h += '<div class="ct-dt">' + (signed ? 'اعتُمد بتاريخ ' + esc(fmtDate(c.signedAt)) : 'التاريخ: ________') + '</div></div>';
    h += '<div class="ct-box"><span class="ct-lab">الطرف الثاني · المتعاون</span>';
    var sg = signed ? c.sig : pendingSig;
    h += '<div class="ct-who">' + bdi((signed && c.sig && c.sig.name) || c.p2.name || '________') + '</div>';
    h += sg && sg.strokes && sg.strokes.length ? '<div class="ct-sigwrap">' + sigSVG(sg) + '</div>' : '<div class="ct-ph">التوقيع</div>';
    h += '<div class="ct-dt">' + (signed ? 'وُقّع بتاريخ ' + esc(fmtDate(c.signedAt)) : 'التاريخ: ________') + '</div></div></section>';
    h += '<footer class="ct-foot">' + (signed && c.hash ? 'نسخة إلكترونية معتمدة · بصمة العقد: <bdi>' + esc(c.hash.slice(0, 16).toUpperCase()) + '</bdi> · ' : '') + 'ماجمافاي · عقد رقم <bdi>' + esc(c.no) + '</bdi></footer>';
    return h;
  }

  // ---------- signature pad ----------
  function SigPad(canvas, onChange) {
    var ctx = canvas.getContext('2d'), strokes = [], cur = null, pts = 0;
    function size() {
      var r = canvas.getBoundingClientRect(), d = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * d)); canvas.height = Math.max(1, Math.round(r.height * d)); draw();
    }
    function draw() {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(canvas.width / SIG_W, 0, 0, canvas.height / SIG_H, 0, 0);
      ctx.strokeStyle = '#1b1226'; ctx.fillStyle = '#1b1226'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      strokes.forEach(function (st) {
        if (st.length === 2) { ctx.beginPath(); ctx.arc(st[0], st[1], 1.4, 0, 6.3); ctx.fill(); return; }
        ctx.beginPath(); ctx.moveTo(st[0], st[1]);
        for (var i = 2; i + 1 < st.length; i += 2) ctx.lineTo(st[i], st[i + 1]);
        ctx.stroke();
      });
    }
    function pos(e) {
      var r = canvas.getBoundingClientRect();
      return [Math.max(0, Math.min(SIG_W, Math.round((e.clientX - r.left) / r.width * SIG_W))), Math.max(0, Math.min(SIG_H, Math.round((e.clientY - r.top) / r.height * SIG_H)))];
    }
    function down(e) {
      if (pts >= MAX_PTS) return;
      e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      var p = pos(e); cur = [p[0], p[1]]; strokes.push(cur); pts++; draw(); onChange();
    }
    function move(e) {
      if (!cur || pts >= MAX_PTS) return;
      e.preventDefault();
      var p = pos(e), n = cur.length;
      if (Math.abs(p[0] - cur[n - 2]) + Math.abs(p[1] - cur[n - 1]) < 2) return;
      cur.push(p[0], p[1]); pts++; draw(); onChange();
    }
    function up() { cur = null; }
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('pointerleave', up);
    size();
    return {
      resize: size,
      clear: function () { strokes = []; cur = null; pts = 0; draw(); onChange(); },
      points: function () { return pts; },
      data: function () { return { w: SIG_W, h: SIG_H, strokes: strokes.map(function (s) { return s.slice(); }) }; }
    };
  }

  // ---------- screen ----------
  var S = null;

  function summaryOf(d) {
    d = d || {};
    return { status: d.status || 'none', no: d.no || '', fee: d.fee || '', cur: d.cur || 'USD', start: d.start || '', name: (d.p2 && d.p2.name) || '', signedAt: d.signedAt || '', endedAt: d.endedAt || '' };
  }

  function field(label, key, type, extra) {
    return '<label class="iv-f">' + label + '<input data-k="' + key + '" type="' + (type || 'text') + '"' + (extra || '') + '></label>';
  }

  function shell() {
    var h = '<div class="iv-top"><div class="iv-top-in"><h2 id="ctH"></h2><span class="pill" id="ctSt"></span><span class="iv-save" id="ctSave" role="status"></span>' +
      '<button class="btn" type="button" id="ctPrint">طباعة / حفظ PDF</button><button class="btn" type="button" id="ctClose">إغلاق</button></div></div>';
    h += '<div class="iv-main ct-main"><div id="ctMsg" class="ct-msg" hidden></div>';
    h += '<div id="ctForm">';
    h += '<div class="iv-card"><h3>أطراف العقد</h3><div class="iv-grid">' +
      field('اسم المتعاون (الطرف الثاني)', 'p2.name', 'text', ' maxlength="80"') + field('دولته', 'p2.country', 'text', ' maxlength="60"') +
      field('هاتفه', 'p2.phone', 'text', ' maxlength="30" dir="ltr"') + field('بريده الإلكتروني', 'p2.email', 'email', ' maxlength="100" dir="ltr"') +
      field('ممثل ماجمافاي', 'p1.rep', 'text', ' maxlength="60"') + field('صفته', 'p1.title', 'text', ' maxlength="60"') +
      field('اسم الكيان (الطرف الأول)', 'p1.entity', 'text', ' maxlength="100"') + field('رقم العقد', 'no', 'text', ' readonly dir="ltr"') + '</div></div>';
    h += '<div class="iv-card"><h3>الأجر والمدد</h3><div class="iv-grid">' +
      field('الأجر الشهري الثابت عن كل عميل', 'fee', 'text', ' inputmode="decimal" maxlength="9" dir="ltr"') +
      '<label class="iv-f">العملة<select data-k="cur"><option value="USD">دولار أمريكي</option><option value="SAR">ريال سعودي</option><option value="EGP">جنيه مصري</option><option value="AED">درهم إماراتي</option></select></label>' +
      field('تاريخ بداية العقد', 'start', 'date') + field('الدفع بعد نهاية الشهر بـ (أيام)', 'payDays', 'number', ' min="1" max="30" inputmode="numeric"') +
      field('مهلة الإخطار بالإنهاء (أيام)', 'noticeDays', 'number', ' min="1" max="60" inputmode="numeric"') + field('الرد على الرسائل خلال (ساعات)', 'replyHours', 'number', ' min="1" max="72" inputmode="numeric"') +
      field('عدم الاستقطاب بعد الانتهاء (شهور، 0 = بدون)', 'nonSol', 'number', ' min="0" max="36" inputmode="numeric"') + field('المنصات', 'platforms', 'text', ' maxlength="200"') +
      field('القانون الحاكم', 'law', 'text', ' maxlength="200"') + '</div></div>';
    h += '</div>';
    h += '<div class="iv-card ct-papercard"><h3>نص العقد</h3><div class="ct-paper" id="ctPaper"></div></div>';
    h += '<div class="iv-card" id="ctSignCard"><h3>التوقيع والاعتماد</h3>' +
      '<label class="iv-chk"><input type="checkbox" id="ctRead"><span>راجعت العقد مع المتعاون وقرأ كل البنود ووافق عليها.</span></label>' +
      '<div class="iv-grid iv-gap">' + '<label class="iv-f">اسمه الكامل كتابةً (يتطابق مع الهوية)<input id="ctSigName" type="text" maxlength="80"></label></div>' +
      '<p class="small">توقيع المتعاون (بالإصبع أو الماوس):</p><canvas id="ctPad" class="ct-pad" aria-label="مساحة التوقيع"></canvas>' +
      '<div class="ct-actions"><button class="btn" type="button" id="ctClear">مسح التوقيع</button><button class="btn primary" type="button" id="ctSign">توقيع واعتماد العقد</button></div>' +
      '<p class="small" id="ctSignHint">بعد الاعتماد يُقفل العقد ولا يمكن تعديله، ويظهر ختم ماجمافاي ويُحفظ في بوابة المتقدمين.</p></div>';
    h += '<div class="iv-card" id="ctEndCard" hidden><h3>إنهاء العقد</h3><label class="iv-f">سبب الإنهاء (اختياري)<textarea id="ctEndWhy" maxlength="300"></textarea></label><div class="ct-actions"><button class="btn" type="button" id="ctEnd">إنهاء العقد</button></div></div>';
    h += '</div>';
    return h;
  }

  function getP(o, p) { var a = p.split('.'); for (var i = 0; i < a.length; i++) { if (o == null) return ''; o = o[a[i]]; } return o == null ? '' : o; }
  function setP(o, p, v) { var a = p.split('.'); for (var i = 0; i < a.length - 1; i++) o = o[a[i]]; o[a[a.length - 1]] = v; }
  var NUMK = { payDays: [1, 30, 7], noticeDays: [1, 60, 14], replyHours: [1, 72, 24], nonSol: [0, 36, 12] };

  function setSave(cls, text) { var el = $('#ctSave', S.root); el.className = 'iv-save ' + cls; el.textContent = text; }
  function showMsg(text, bad) { var m = $('#ctMsg', S.root); m.hidden = !text; m.textContent = text || ''; m.className = 'ct-msg' + (bad ? ' bad' : ''); }

  function renderPaper() {
    var paper = $('#ctPaper', S.root);
    var signed = S.status === 'signed' || S.status === 'ended';
    paper.className = 'ct-paper' + (signed ? '' : ' draft') + (S.status === 'ended' ? ' ended' : '');
    paper.innerHTML = paperHTML(S.doc, S.status, !signed && S.pad && S.pad.points() ? S.pad.data() : null);
  }

  function refreshUI() {
    var r = S.root, st = S.status, locked = st === 'signed' || st === 'ended';
    $('#ctH', r).textContent = 'العقد · ' + (S.opts.applicant && S.opts.applicant.name ? S.opts.applicant.name : '');
    var pill = $('#ctSt', r); pill.textContent = STATUS[st] || ''; pill.className = 'pill ' + (st === 'signed' ? 'ok' : st === 'ended' ? 'miss' : 'warn');
    $('#ctForm', r).hidden = locked;
    $('#ctSignCard', r).hidden = locked;
    $('#ctEndCard', r).hidden = st !== 'signed';
    if (st === 'ended') showMsg('العقد منتهي' + (S.doc.endedAt ? ' بتاريخ ' + fmtDate(S.doc.endedAt) : '') + (S.doc.endReason ? ' · السبب: ' + S.doc.endReason : '') + '.', true);
    else if (st === 'signed') showMsg('العقد موقّع ومعتمد بتاريخ ' + fmtDate(S.doc.signedAt) + ' ومحفوظ في البوابة. اطبعه أو احفظه PDF من الزر فوق.', false);
    else if (!S.opts.live) showMsg('في البيانات التجريبية العقد للمعاينة والطباعة فقط، ولا يتحفظ ولا يتوقّع.', true);
    else showMsg('', false);
    var sign = $('#ctSign', r); sign.disabled = !S.opts.live;
    renderPaper();
  }

  function fillForm() {
    $$all('[data-k]', S.root).forEach(function (el) { el.value = getP(S.doc, el.getAttribute('data-k')); });
  }
  function $$all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function scheduleDraft() {
    if (!S.opts.live || S.status !== 'draft' && S.status !== 'none') return;
    setSave('saving', 'بيحفظ…');
    clearTimeout(S.timer);
    S.timer = setTimeout(flushDraft, 800);
  }
  function errText(code) {
    if (code === 'locked') return 'العقد موقّع ومقفول ولا يمكن تعديله.';
    if (code === 'incomplete') return 'بيانات ناقصة أو توقيع غير كافٍ: راجع الاسم والأجر وتاريخ البداية والتوقيع.';
    return 'السيرفر محتاج تحديث (Code.gs) عشان يحفظ العقد.';
  }
  function draftPayload(me) { var d = JSON.parse(JSON.stringify((me || S).doc)); delete d.sig; delete d.status; return d; }
  function flushDraft() {
    var me = S;
    if (!me) return Promise.resolve();
    clearTimeout(me.timer); me.timer = null;
    if (!me.opts.live || (me.status !== 'draft' && me.status !== 'none')) return Promise.resolve();
    var seq = ++me.seq;
    return Promise.resolve(me.opts.save('draft', draftPayload(me))).then(function (j) {
      if (seq !== me.seq) return;
      if (j && j.ok) {
        if (me.status === 'none') me.status = 'draft';
        if (me.opts.onChange) me.opts.onChange(j.contract);
        if (S === me) { setSave('saved', 'اتحفظت المسودة'); refreshStatusOnly(); }
      } else if (S === me) setSave('error', errText(j && j.error));
    }, function () { if (S === me && seq === me.seq) setSave('error', 'مفيش اتصال. حاول تاني.'); });
  }
  function refreshStatusOnly() { var pill = $('#ctSt', S.root); pill.textContent = STATUS[S.status] || ''; pill.className = 'pill ' + (S.status === 'signed' ? 'ok' : S.status === 'ended' ? 'miss' : 'warn'); }

  function armTwoStep(btn, label, confirmLabel, run) {
    var armed = false, t = null;
    btn.addEventListener('click', function () {
      if (btn.disabled) return;
      if (!armed) {
        armed = true; btn.textContent = confirmLabel; btn.classList.add('danger');
        t = setTimeout(function () { armed = false; btn.textContent = label; btn.classList.remove('danger'); }, 6000);
        return;
      }
      clearTimeout(t); armed = false; btn.textContent = label; btn.classList.remove('danger'); run();
    });
  }

  function doSign() {
    var d = S.doc, name = $('#ctSigName', S.root).value.trim();
    var why = [];
    if (!$('#ctRead', S.root).checked) why.push('أكّد إنك راجعت العقد مع المتعاون');
    if (!d.p2.name.trim()) why.push('اسم المتعاون');
    if (!d.p1.rep.trim()) why.push('ممثل ماجمافاي');
    if (!/^\d{1,6}(\.\d{1,2})?$/.test(String(d.fee)) || !+d.fee) why.push('الأجر الشهري');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.start)) why.push('تاريخ البداية');
    if (name.length < 3) why.push('الاسم الكامل كتابةً');
    if (S.pad.points() < 15) why.push('توقيع واضح');
    if (why.length) { showMsg('ناقص: ' + why.join('، ') + '.', true); $('#ctMsg', S.root).scrollIntoView({ block: 'center' }); return; }
    d.terms = buildTerms(d);
    var payload = draftPayload(); payload.sig = Object.assign(S.pad.data(), { name: name });
    clearTimeout(S.timer); S.seq++;
    setSave('saving', 'بيعتمد العقد…'); $('#ctSign', S.root).disabled = true;
    Promise.resolve(S.opts.save('sign', payload)).then(function (j) {
      if (!S) return;
      if (j && j.ok) {
        return S.opts.load().then(function (full) {
          if (!S) return;
          S.doc = normalise(full && full.contract, S.opts); S.status = S.doc.status || 'signed';
          setSave('saved', 'اتعتمد واتحفظ'); if (S.opts.onChange) S.opts.onChange(j.contract); refreshUI();
          S.root.scrollTop = 0;
        });
      }
      $('#ctSign', S.root).disabled = !S.opts.live; setSave('error', errText(j && j.error)); showMsg(errText(j && j.error), true);
    }, function () { if (S) { $('#ctSign', S.root).disabled = false; setSave('error', 'مفيش اتصال. حاول تاني.'); } });
  }

  function doEnd() {
    var reason = $('#ctEndWhy', S.root).value.trim();
    setSave('saving', 'بينهي العقد…');
    Promise.resolve(S.opts.save('end', { reason: reason })).then(function (j) {
      if (!S) return;
      if (j && j.ok) {
        return S.opts.load().then(function (full) { if (!S) return; S.doc = normalise(full && full.contract, S.opts); S.status = S.doc.status || 'ended'; setSave('saved', 'اتنهى العقد'); if (S.opts.onChange) S.opts.onChange(j.contract); refreshUI(); });
      }
      setSave('error', errText(j && j.error));
    }, function () { if (S) setSave('error', 'مفيش اتصال. حاول تاني.'); });
  }

  function wire() {
    var r = S.root;
    $$all('[data-k]', r).forEach(function (el) {
      var evt = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
      el.addEventListener(evt, function () {
        var k = el.getAttribute('data-k'), v = el.value;
        if (NUMK[k]) { var n = parseInt(v, 10), m = NUMK[k]; v = isFinite(n) ? Math.max(m[0], Math.min(m[1], n)) : m[2]; }
        setP(S.doc, k, v); renderPaper(); scheduleDraft();
      });
    });
    S.pad = SigPad($('#ctPad', r), function () { if (S.raf) return; S.raf = requestAnimationFrame(function () { if (!S) return; S.raf = 0; renderPaper(); }); });
    $('#ctClear', r).addEventListener('click', function () { S.pad.clear(); });
    armTwoStep($('#ctSign', r), 'توقيع واعتماد العقد', 'تأكيد الاعتماد؟ لن يمكن التعديل بعدها', doSign);
    armTwoStep($('#ctEnd', r), 'إنهاء العقد', 'تأكيد إنهاء العقد؟', doEnd);
    $('#ctPrint', r).addEventListener('click', function () { window.print(); });
    $('#ctClose', r).addEventListener('click', function () { close(); });
    S.onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', S.onKey);
    S.onResize = function () { if (S.pad) S.pad.resize(); };
    window.addEventListener('resize', S.onResize);
  }

  function open(opts) {
    if (S) close(true);
    var root = document.createElement('div');
    root.className = 'iv ct'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'العقد');
    root.innerHTML = shell();
    document.body.appendChild(root); document.body.classList.add('ct-open');
    S = { opts: opts, root: root, status: 'none', doc: defaults(opts), timer: null, seq: 0, pad: null };
    wire(); fillForm(); refreshUI();
    var sum = opts.summary || null;
    if (sum && sum.status && sum.status !== 'none' && opts.load) {
      showMsg('بيحمّل العقد…', false);
      opts.load().then(function (full) {
        if (!S || S.root !== root) return;
        if (full && full.contract) { S.doc = normalise(full.contract, opts); S.status = S.doc.status || 'draft'; }
        fillForm(); refreshUI();
      }, function () { if (S && S.root === root) showMsg('تعذّر تحميل العقد. أغلق وافتح تاني.', true); });
    }
  }

  function close(silent) {
    if (!S) return;
    var cur = S; if (cur.timer) flushDraft();
    document.removeEventListener('keydown', cur.onKey); window.removeEventListener('resize', cur.onResize);
    cur.root.remove(); document.body.classList.remove('ct-open');
    S = null;
    if (!silent && cur.opts.onClose) cur.opts.onClose();
  }

  window.MagmafyContract = { open: open, close: close, summary: summaryOf, STATUS: STATUS, CUR: CUR, buildTerms: buildTerms };
})();
