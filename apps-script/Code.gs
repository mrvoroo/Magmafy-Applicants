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
 *    Optional: NOTIFY_EMAIL = address that gets a "new applicant" email (batched, at most one per 10 minutes).
 *    Optional: MAX_APPS = how many applications to accept before the form closes by itself (default 15).
 * 3. Select function `setup` and press Run. It keeps your existing sheet, adds the new `email` and `lang`
 *    column headers, creates the Reviews, Templates and Messages tabs, and DELETES the old static token.
 *    The log shows "Emails are sent from: ..." which must be the company inbox (magmafyogp@gmail.com).
 * 4. Deploy > Manage deployments > pencil icon > Version: New version > Deploy.
 *    Keep the same deployment so the /exec URL does not change.
 *
 * COMMUNICATION CENTER
 * - Every email (confirmation, templates, custom) is sent by the account that owns and runs this script,
 *   with replyTo set to the same address, so replies land in that inbox.
 * - Templates are editable from the dashboard (tab Templates); defaults live in DEFAULT_TEMPLATES below.
 * - Sent emails and opened WhatsApp chats are logged in the Messages tab.
 * - Limits: 30 admin emails/hour per admin; the last MAIL_RESERVE quota is kept for login codes.
 *
 * EMERGENCY:
 * - `revokeAllSessions` logs everybody out immediately.
 * - `lockdown` removes ADMINS (nobody can log in) and logs everybody out.
 */

var SHEET_NAME = 'Applicants';
var REVIEW_SHEET = 'Reviews';
var COLUMNS = [
  'id', 'submittedAt', 'name', 'phone', 'country', 'years', 'platforms', 'spend',
  'niche', 'gulf', 'result', 'tracking', 'drop', 'cv', 'work', 'avail', 'rate', 'more', 'email', 'lang'
];
var REVIEW_COLUMNS = ['id', 'status', 'note', 'updatedBy', 'updatedAt'];
var INTERVIEW_SHEET = 'Interviews';
var INTERVIEW_COLUMNS = ['id', 'data', 'updatedBy', 'updatedAt'];
var MAX_INTERVIEW_JSON = 20000;
var INTERVIEW_DECISIONS = ['', 'trial', 'main', 'backup', 'reject'];
var CONTRACT_SHEET = 'Contracts';
var CONTRACT_COLUMNS = ['id', 'data', 'updatedBy', 'updatedAt'];
var MAX_CONTRACT_JSON = 40000;
var CONTRACT_CURRENCIES = ['USD', 'SAR', 'EGP', 'AED'];
var STATUSES = ['جديد', 'تم التواصل', 'مقابلة', 'مقبول', 'مرفوض'];
var TEMPLATE_SHEET = 'Templates';
var TEMPLATE_COLUMNS = ['key', 'lang', 'subject', 'headline', 'body', 'wa', 'updatedBy', 'updatedAt'];
var MESSAGES_SHEET = 'Messages';
var MESSAGE_COLUMNS = ['at', 'id', 'channel', 'template', 'to', 'subject', 'by'];
var TEMPLATE_KEYS = ['received', 'advance', 'interview', 'accepted', 'rejected'];
var TEMPLATE_STATUS = { advance: 'تم التواصل', interview: 'مقابلة', accepted: 'مقبول', rejected: 'مرفوض' };
var ADMIN_MAILS_PER_HOUR = 30;             // emails one admin can send from the dashboard per hour
var MAX_SUBJECT = 150, MAX_HEADLINE = 120, MAX_MAIL_BODY = 6000, MAX_WA = 1500;

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
var CONFIRM_MAILS_PER_DAY = 40;            // applicant confirmation emails per day, all senders
var MAIL_RESERVE = 20;                     // mail quota always kept free for admin login codes
var CONFIRM_SAME_ADDRESS_S = 6 * 3600;     // one confirmation per address per 6 hours
var DEFAULT_MAX_APPS = 15;                 // applications accepted per batch; override with script property MAX_APPS
var NOTIFY_GAP_MS = 10 * 60 * 1000;        // at most one "new applicant" email per 10 minutes (the rest are batched)
var NOTIFY_MAX_PENDING = 30;
var LOGO_URL = 'https://careers.magmafyogp.com/logo-email.png';
var SITE_URL = 'https://magmafyogp.com';

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
      case 'saveInterview': return json_(authed_(data, saveInterview_));
      case 'getContract': return json_(authed_(data, getContract_));
      case 'saveContract': return json_(authed_(data, saveContract_));
      case 'getTemplates': return json_(authed_(data, getTemplates_));
      case 'saveTemplate': return json_(authed_(data, saveTemplate_));
      case 'resetTemplate': return json_(authed_(data, resetTemplate_));
      case 'previewMail': return json_(authed_(data, previewMail_));
      case 'sendMail': return json_(authed_(data, sendMail_));
      case 'logMessage': return json_(authed_(data, logMessage_));
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
  ensureHeader_(sh);
  reviewsSheet_();
  templatesSheet_();
  messagesSheet_();
  interviewsSheet_();
  contractsSheet_();
  props.deleteProperty('TOKEN'); // the old static token no longer exists anywhere
  Logger.log('Sheet: ' + ss.getUrl());
  Logger.log('Owner notifications: ' + (normEmail_(props_().getProperty('NOTIFY_EMAIL')) ? 'on' : 'OFF (add the NOTIFY_EMAIL property)'));
  Logger.log('Admins configured: ' + admins_().length + ' (must be 2)');
  Logger.log('Emails are sent from: ' + senderEmail_());
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
    if (k === 'lang') return data.lang === 'en' ? 'en' : 'ar';
    return clean_(data[k], MAX_FIELD);
  });
  var outcome = withLock_(function () {
    var sh = sheet_(); ensureHeader_(sh);
    var used = usedCount_(sh);
    if (used >= maxApps_()) { autoClose_(); return 'full'; } // batch is complete: refuse, even a stale page
    sh.appendRow(row);
    if (used + 1 >= maxApps_()) { autoClose_(); return 'last'; }
    return 'ok';
  });
  if (outcome === 'full') return { ok: false, error: 'closed' };

  // notify the owner (batched) and confirm to the applicant; neither can fail the submission
  notifyNew_({ n: String(data.name).slice(0, 60), c: String(data.country == null ? '' : data.country).slice(0, 40),
    y: String(data.years == null ? '' : data.years).slice(0, 40), r: String(data.rate == null ? '' : data.rate).slice(0, 80) }, outcome === 'last');

  // confirmation email to the applicant (never blocks or fails the submission)
  var to = normEmail_(data.email);
  if (to) sendConfirmation_(String(data.name == null ? '' : data.name), to, data.lang === 'en' ? 'en' : 'ar');
  return { ok: true };
}

// ---------------------------------------------------------------- email templates (editable from the dashboard)

// Placeholders: {name} {date} {time}. In the body: a blank line starts a new paragraph, **text** is bold,
// lines starting with "1. " become numbered steps, lines starting with "• " become a list,
// and a line that is only **text** is a heading.
var DEFAULT_TEMPLATES = {
  received: {
    ar: {
      subject: 'استلمنا طلبك | Magmafy',
      headline: 'استلمنا طلبك بنجاح',
      body: ['أهلًا {name}،',
        'شكرًا لتقديمك على وظيفة ميديا باير في **Magmafy**، ونقدّر وقتك واهتمامك بالانضمام لفريقنا.',
        '**إيه اللي هيحصل بعد كده؟**\n1. نراجع إجاباتك ونتائجك السابقة بعناية.\n2. **لو بياناتك محققة المطلوب، هنتواصل معاك في أقرب وقت.**\n3. المرشحين المناسبين بنعمل معاهم مقابلة قصيرة.',
        'مش محتاج ترد على الرسالة دي ولا تبعت الطلب تاني.',
        'شكرًا مرة تانية على وقتك،\n**فريق Magmafy**'].join('\n\n'),
      wa: 'أهلًا {name}، معاك فريق Magmafy. استلمنا طلبك للتقديم على وظيفة ميديا باير، وهنراجعه ونتواصل معاك في أقرب وقت لو بياناتك محققة المطلوب.'
    },
    en: {
      subject: 'We received your application | Magmafy',
      headline: 'We received your application',
      body: ['Hello {name},',
        'Thank you for applying for the Media Buyer role at **Magmafy**. We appreciate your time and your interest in joining our team.',
        '**What happens next?**\n1. We carefully review your answers and past results.\n2. **If your profile meets our requirements, we will contact you as soon as possible.**\n3. Suitable candidates are invited to a short interview.',
        'You do not need to reply to this email or submit your application again.',
        'Thank you again for your time,\n**The Magmafy team**'].join('\n\n'),
      wa: 'Hello {name}, this is the Magmafy team. We received your application for the Media Buyer role and will review it. We will contact you soon if your profile meets our requirements.'
    }
  },
  advance: {
    ar: {
      subject: 'مبروك، عدّيت للمرحلة الجاية | Magmafy',
      headline: 'مبروك، عدّيت للمرحلة الجاية',
      body: ['أهلًا {name}،',
        'يسعدنا نبلّغك إن طلبك عدّى للمرحلة الجاية، وده بعد مراجعة إجاباتك ونتائجك السابقة.',
        'الخطوة الجاية مقابلة قصيرة معانا. هيتحدد ميعادها وهنتواصل معاك على واتساب في أقرب وقت.',
        'لو رقم الواتساب اللي سجّلته مش الأنسب للتواصل، رد على الرسالة دي وقولنا.',
        'شكرًا لوقتك،\n**فريق Magmafy**'].join('\n\n'),
      wa: 'أهلًا {name}، معاك فريق Magmafy. مبروك، طلبك عدّى للمرحلة الجاية. هنحدد ميعاد المقابلة ونبلّغك هنا في أقرب وقت.'
    },
    en: {
      subject: "Congratulations, you're through to the next stage | Magmafy",
      headline: "Congratulations, you're through to the next stage",
      body: ['Hello {name},',
        'We are pleased to let you know that your application has moved to the next stage, after reviewing your answers and past results.',
        'The next step is a short interview with us. We will set the time and contact you on WhatsApp as soon as possible.',
        'If the WhatsApp number you registered is not the best way to reach you, please reply to this email and let us know.',
        'Thank you for your time,\n**The Magmafy team**'].join('\n\n'),
      wa: "Hello {name}, this is the Magmafy team. Congratulations, your application has moved to the next stage. We'll set the interview time and let you know here soon."
    }
  },
  interview: {
    ar: {
      subject: 'ميعاد مقابلتك مع Magmafy',
      headline: 'ميعاد مقابلتك',
      body: ['أهلًا {name}،',
        'يسعدنا نحدد معاك ميعاد المقابلة:',
        '**اليوم:** {date}\n**الساعة:** {time}',
        'هنتواصل معاك على واتساب في الميعاد ده. لو مش مناسب، رد علينا بميعاد بديل قبلها بوقت كافي.',
        'ياريت تجهّز نتايجك السابقة وتكون جاهز تشرحها بالأرقام.',
        'بالتوفيق،\n**فريق Magmafy**'].join('\n\n'),
      wa: 'أهلًا {name}، معاك فريق Magmafy. حددنا ميعاد المقابلة:\nاليوم: {date}\nالساعة: {time}\nهنكلمك على واتساب في الميعاد ده. لو مش مناسب قولنا على ميعاد بديل.'
    },
    en: {
      subject: 'Your interview with Magmafy',
      headline: 'Your interview time',
      body: ['Hello {name},',
        'We are glad to set a time for your interview:',
        '**Day:** {date}\n**Time:** {time}',
        'We will contact you on WhatsApp at that time. If it does not suit you, please reply with an alternative well before it.',
        'Please have your past results ready and be prepared to walk us through the numbers.',
        'Good luck,\n**The Magmafy team**'].join('\n\n'),
      wa: "Hello {name}, this is the Magmafy team. Your interview is set:\nDay: {date}\nTime: {time}\nWe'll contact you on WhatsApp then. If it doesn't suit you, tell us an alternative time."
    }
  },
  accepted: {
    ar: {
      subject: 'مبروك، اتقبلت معانا في Magmafy',
      headline: 'مبروك، اتقبلت معانا',
      body: ['أهلًا {name}،',
        'يسعدنا نبلّغك إنك اتقبلت للانضمام لفريق **Magmafy** كميديا باير. 🎉',
        'هنبدأ الشغل قريب، والتواصل معاك من دلوقتي هيكون من إيميل الشركة نفسه، فياريت تتابع الإيميل ده.',
        'أي استفسار، رد على الرسالة دي مباشرة.',
        'أهلًا بيك في الفريق،\n**فريق Magmafy**'].join('\n\n'),
      wa: 'أهلًا {name}، معاك فريق Magmafy. مبروك، اتقبلت معانا! هنبدأ الشغل قريب، والتواصل من دلوقتي هيكون من إيميل الشركة، فياريت تتابعه.'
    },
    en: {
      subject: "Congratulations, you're in | Magmafy",
      headline: "Congratulations, you're in",
      body: ['Hello {name},',
        'We are delighted to let you know that you have been accepted to join the **Magmafy** team as a Media Buyer. 🎉',
        'We will start work soon, and from now on we will contact you from the company email itself, so please keep an eye on it.',
        'If you have any questions, just reply to this email.',
        'Welcome to the team,\n**The Magmafy team**'].join('\n\n'),
      wa: "Hello {name}, this is the Magmafy team. Congratulations, you've been accepted! We'll start soon and will contact you from the company email, so please keep an eye on it."
    }
  },
  rejected: {
    ar: {
      subject: 'بخصوص طلبك في Magmafy',
      headline: 'شكرًا لاهتمامك بالانضمام لفريقنا',
      body: ['أهلًا {name}،',
        'شكرًا لوقتك واهتمامك بالانضمام لفريق **Magmafy**، ونقدّر المجهود اللي بذلته في الطلب.',
        'بعد المراجعة، قررنا نكمل في الوقت الحالي مع مرشحين تانيين نتايجهم أقرب لاحتياجنا. ده مش تقليل من خبرتك، والاختيار كان صعب.',
        'هنحتفظ ببياناتك، ولو فتحنا باب التوظيف تاني هنتواصل معاك.',
        'نتمنالك التوفيق،\n**فريق Magmafy**'].join('\n\n'),
      wa: 'أهلًا {name}، معاك فريق Magmafy. شكرًا لوقتك واهتمامك. بعد المراجعة قررنا نكمل حاليًا مع مرشحين تانيين، وهنحتفظ ببياناتك ونتواصل معاك لو فتحنا باب التوظيف تاني. بالتوفيق.'
    },
    en: {
      subject: 'About your application at Magmafy',
      headline: 'Thank you for your interest in joining us',
      body: ['Hello {name},',
        'Thank you for your time and your interest in joining **Magmafy**. We appreciate the effort you put into your application.',
        'After reviewing it, we have decided to continue for now with other candidates whose results are closer to our needs. This is not a judgment of your experience, and the choice was a difficult one.',
        'We will keep your details, and if we open hiring again we will get in touch.',
        'We wish you the best,\n**The Magmafy team**'].join('\n\n'),
      wa: "Hello {name}, this is the Magmafy team. Thank you for your time and interest. After review we've decided to continue with other candidates for now. We'll keep your details and contact you if we hire again. All the best."
    }
  }
};

function normLang_(l) { return l === 'en' ? 'en' : 'ar'; }

function templatesMap_() {
  var out = {}, rows = templatesSheet_().getDataRange().getValues();
  rows.shift();
  rows.forEach(function (r) {
    if (r[0] && r[1]) out[r[0] + '|' + r[1]] = { subject: String(r[2]), headline: String(r[3]), body: String(r[4]), wa: String(r[5]) };
  });
  return out;
}

// the saved version if the admins edited it, otherwise the built-in default
function templateFor_(key, lang, map) {
  lang = normLang_(lang);
  var d = DEFAULT_TEMPLATES[key] && DEFAULT_TEMPLATES[key][lang];
  if (!d) return null;
  var o = (map || templatesMap_())[key + '|' + lang];
  return o ? { subject: o.subject, headline: o.headline, body: o.body, wa: o.wa, custom: true }
           : { subject: d.subject, headline: d.headline, body: d.body, wa: d.wa, custom: false };
}

function fillVars_(text, vars) {
  vars = vars || {};
  return String(text).replace(/\{(name|date|time)\}/g, function (m, k) { return vars[k] == null ? '' : String(vars[k]); })
    .replace(/[ \t]+([،,])/g, '$1');
}

function plainMd_(s) { return String(s).replace(/\*\*(.+?)\*\*/g, '$1'); }

function inlineMd_(s) {
  var h = esc_(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  return h.replace(/(https?:\/\/[^\s<]+)/g, function (u) { return '<a href="' + u + '" style="color:#962fbf;font-weight:700;">' + u + '</a>'; });
}

function bodyHtml_(body, rtl, font) {
  var align = rtl ? 'right' : 'left';
  var num = /^([0-9٠-٩]+)[.)]\s+(.*)$/, bul = /^[•\-]\s+(.*)$/;
  var items = String(body).replace(/\r/g, '').split(/\n{2,}/).map(function (blk) {
    var lines = blk.split('\n').map(function (l) { return l.trim(); }).filter(String);
    if (!lines.length) return null;
    if (lines.every(function (l) { return num.test(l); })) return { t: 'steps', lines: lines };
    if (lines.every(function (l) { return bul.test(l); })) return { t: 'bullets', lines: lines };
    if (lines.length === 1 && /^\*\*[^*]+\*\*$/.test(lines[0])) return { t: 'head', text: lines[0].slice(2, -2) };
    return { t: 'p', lines: lines };
  }).filter(function (x) { return x; });

  var pad = rtl ? '0 0 12px 12px' : '0 12px 12px 0';
  var stepRows = function (lines) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + lines.map(function (l) {
      var m = num.exec(l);
      return '<tr><td width="34" valign="top" style="padding:' + pad + ';">' +
        '<table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="28" height="28" align="center" bgcolor="#d62976" style="width:28px;height:28px;border-radius:14px;background:#d62976;color:#ffffff;font:700 14px/28px ' + font + ';">' + esc_(m[1]) + '</td></tr></table>' +
        '</td><td valign="top" style="padding:3px 0 12px 0;font:15px/1.7 ' + font + ';color:#3a2a4a;text-align:' + align + ';">' + inlineMd_(m[2]) + '</td></tr>';
    }).join('') + '</table>';
  };
  var card = function (inner) {
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf6fd;border:1px solid #eadcf3;border-radius:14px;margin:0 0 18px;"><tr><td style="padding:20px 20px 8px;">' + inner + '</td></tr></table>';
  };
  var headHtml = function (t) { return '<div style="margin:0 0 14px;font:700 17px/1.4 ' + font + ';color:#1a0f27;text-align:' + align + ';">' + inlineMd_(t) + '</div>'; };

  var out = '';
  for (var i = 0; i < items.length; i++) {
    var it = items[i], nx = items[i + 1];
    if (it.t === 'head' && nx && (nx.t === 'steps' || nx.t === 'bullets')) { // a heading directly above a list sits inside the list's card
      out += card(headHtml(it.text) + (nx.t === 'steps' ? stepRows(nx.lines) : bulletRows_(nx.lines, bul, font, align)));
      i++; continue;
    }
    if (it.t === 'head') out += '<div style="margin:6px 0 10px;font:700 18px/1.5 ' + font + ';color:#1a0f27;text-align:' + align + ';">' + inlineMd_(it.text) + '</div>';
    else if (it.t === 'steps') out += card(stepRows(it.lines));
    else if (it.t === 'bullets') out += card(bulletRows_(it.lines, bul, font, align));
    else out += '<p style="margin:0 0 16px;font:16px/1.8 ' + font + ';color:#2a1a38;text-align:' + align + ';">' + it.lines.map(inlineMd_).join('<br>') + '</p>';
  }
  return out;
}

function bulletRows_(lines, bul, font, align) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + lines.map(function (l) {
    return '<tr><td style="padding:2px 0 12px 0;font:15px/1.7 ' + font + ';color:#3a2a4a;text-align:' + align + ';">• ' + inlineMd_(bul.exec(l)[1]) + '</td></tr>';
  }).join('') + '</table>';
}

// One branded layout for every email: logo header, gradient bar, body, footer.
function renderMail_(lang, subject, headline, body, forApplicant) {
  lang = normLang_(lang);
  var rtl = lang === 'ar', font = "Tahoma,'Segoe UI',Arial,sans-serif", align = rtl ? 'right' : 'left';
  subject = String(subject).replace(/[\r\n\u0000-\u001f]+/g, ' ').trim();
  var pre = plainMd_(body).replace(/\s+/g, ' ').trim().slice(0, 110);
  var footer = forApplicant
    ? (rtl ? 'وصلتك الرسالة لأنك قدّمت على وظيفة ميديا باير عندنا.' : 'You received this email because you applied for the Media Buyer role at Magmafy.')
    : '';
  var html = '<!DOCTYPE html><html lang="' + lang + '" dir="' + (rtl ? 'rtl' : 'ltr') + '"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">' +
    '<title>' + esc_(subject) + '</title></head>' +
    '<body style="margin:0;padding:0;background:#f3eef7;">' +
    '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3eef7;">' + esc_(pre) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3eef7" style="background:#f3eef7;"><tr><td align="center" style="padding:28px 12px;">' +
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" dir="' + (rtl ? 'rtl' : 'ltr') + '" style="width:100%;max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;">' +
    '<tr><td align="center" bgcolor="#0e0716" style="background:#0e0716;padding:34px 24px 28px;">' +
    '<img src="' + LOGO_URL + '" width="76" height="76" alt="Magmafy" style="display:block;margin:0 auto 14px;border:0;border-radius:18px;">' +
    '<div style="font:700 26px/1.2 Arial,sans-serif;letter-spacing:1px;color:#ffffff;">Magmafy</div>' +
    '</td></tr>' +
    '<tr><td height="5" bgcolor="#d62976" style="height:5px;line-height:5px;font-size:0;background:#d62976;background-image:linear-gradient(90deg,#feda75,#fa7e1e,#d62976,#962fbf,#4f5bd5);">&nbsp;</td></tr>' +
    '<tr><td style="padding:34px 32px 18px;text-align:' + align + ';font-family:' + font + ';">' +
    (headline ? '<h1 style="margin:0 0 20px;font:700 26px/1.4 ' + font + ';color:#1a0f27;text-align:' + align + ';">' + inlineMd_(headline) + '</h1>' : '') +
    bodyHtml_(body, rtl, font) +
    '</td></tr>' +
    '<tr><td align="center" bgcolor="#f9f6fb" style="background:#f9f6fb;border-top:1px solid #eadcf3;padding:20px 24px;font:12px/1.8 ' + font + ';color:#8f7ea3;">' +
    (footer ? footer + '<br>' : '') +
    '<a href="' + SITE_URL + '" style="color:#962fbf;text-decoration:none;font-weight:700;">magmafyogp.com</a> · © Magmafy' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';
  var text = plainMd_(body).replace(/\n{3,}/g, '\n\n') + '\n\nMagmafy\n' + SITE_URL + '\n';
  return { subject: subject, html: html, text: text };
}

function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------- automatic confirmation to the applicant

function sendConfirmation_(name, to, lang) {
  try {
    var cache = CacheService.getScriptCache(), key = 'm:' + sha_(to);
    if (cache.get(key)) return; // this address already got one recently: no repeats, no mail-bombing
    var t = now_();
    var allowed = withLock_(function () {
      var m = recent_(getJ_('g:mail'), t, 86400000);
      if (m.length >= CONFIRM_MAILS_PER_DAY) return false;
      m.push(t);
      setJ_('g:mail', m);
      return true;
    });
    if (!allowed) return;
    if (MailApp.getRemainingDailyQuota() <= MAIL_RESERVE) return; // keep room for admin login codes
    cache.put(key, '1', CONFIRM_SAME_ADDRESS_S);
    name = name.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
    lang = normLang_(lang);
    var tp = templateFor_('received', lang);
    var m = renderMail_(lang, fillVars_(tp.subject, { name: name }), fillVars_(tp.headline, { name: name }), fillVars_(tp.body, { name: name }), true);
    MailApp.sendEmail({ to: to, name: 'Magmafy', replyTo: senderEmail_() || undefined, subject: m.subject, body: m.text, htmlBody: m.html });
  } catch (err) {
    // the applicant already saw the thank-you screen; nothing else to do
  }
}

// The account that runs the web app. Every email goes out from this address, and replies come back to it.
function senderEmail_() {
  try { return String(Session.getEffectiveUser().getEmail() || ''); } catch (e) { return ''; }
}

// ---------------------------------------------------------------- templates: dashboard actions

function getTemplates_(data, email) {
  var map = templatesMap_(), list = [];
  TEMPLATE_KEYS.forEach(function (k) {
    ['ar', 'en'].forEach(function (l) {
      var t = templateFor_(k, l, map), d = DEFAULT_TEMPLATES[k][l];
      list.push({ key: k, lang: l, subject: t.subject, headline: t.headline, body: t.body, wa: t.wa, custom: t.custom,
        def: { subject: d.subject, headline: d.headline, body: d.body, wa: d.wa } });
    });
  });
  return { ok: true, templates: list, sender: senderEmail_(), status: TEMPLATE_STATUS };
}

function cellSafe_(v, max) {
  v = String(v == null ? '' : v).replace(/\r/g, '').trim().slice(0, max);
  return /^[=+\-@\t]/.test(v) ? ' ' + v : v; // stop spreadsheet formula injection
}

function saveTemplate_(data, email) {
  var key = String(data.key), lang = String(data.lang);
  if (TEMPLATE_KEYS.indexOf(key) === -1 || (lang !== 'ar' && lang !== 'en')) return { ok: false, error: 'invalid' };
  var subject = cellSafe_(String(data.subject == null ? '' : data.subject).replace(/\n/g, ' '), MAX_SUBJECT);
  var headline = cellSafe_(String(data.headline == null ? '' : data.headline).replace(/\n/g, ' '), MAX_HEADLINE);
  var body = cellSafe_(data.body, MAX_MAIL_BODY);
  var wa = cellSafe_(data.wa, MAX_WA);
  if (!subject || !body) return { ok: false, error: 'empty' };
  withLock_(function () {
    var sh = templatesSheet_(), rows = sh.getDataRange().getValues(), row = -1;
    for (var i = 1; i < rows.length; i++) if (rows[i][0] === key && rows[i][1] === lang) { row = i + 1; break; }
    var vals = [key, lang, subject, headline, body, wa, email, new Date()];
    if (row === -1) sh.appendRow(vals); else sh.getRange(row, 1, 1, vals.length).setValues([vals]);
  });
  return { ok: true };
}

function resetTemplate_(data, email) {
  var key = String(data.key), lang = String(data.lang);
  if (TEMPLATE_KEYS.indexOf(key) === -1 || (lang !== 'ar' && lang !== 'en')) return { ok: false, error: 'invalid' };
  withLock_(function () {
    var sh = templatesSheet_(), rows = sh.getDataRange().getValues();
    for (var i = rows.length - 1; i >= 1; i--) if (rows[i][0] === key && rows[i][1] === lang) sh.deleteRow(i + 1);
  });
  return { ok: true };
}

// Server-side preview: the dashboard shows exactly the HTML that will be emailed.
function previewMail_(data, email) {
  var body = String(data.body == null ? '' : data.body).slice(0, MAX_MAIL_BODY);
  if (!body.trim()) return { ok: false, error: 'empty' };
  var m = renderMail_(data.lang, String(data.subject == null ? '' : data.subject).slice(0, MAX_SUBJECT),
    String(data.headline == null ? '' : data.headline).slice(0, MAX_HEADLINE), body, data.forApplicant === true);
  return { ok: true, html: m.html };
}

// ---------------------------------------------------------------- sending from the dashboard

function findApplicant_(id) {
  var values = sheet_().getDataRange().getValues(), head = values.shift();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0]) === id) {
      var o = {};
      head.forEach(function (h, j) { o[h] = values[i][j]; });
      return o;
    }
  }
  return null;
}

function appendMessage_(id, channel, tpl, to, subject, by) {
  var sh = messagesSheet_();
  sh.appendRow([new Date(), id, channel, tpl, cellSafe_(to, 120), cellSafe_(subject, MAX_SUBJECT), by]);
}

function messagesByApplicant_() {
  var rows = messagesSheet_().getDataRange().getValues(), out = {};
  rows.shift();
  rows.slice(-300).forEach(function (r) {
    var id = String(r[1] || '');
    if (!id) return;
    (out[id] = out[id] || []).push({ at: r[0] instanceof Date ? r[0].toISOString() : r[0], ch: r[2], tpl: r[3], by: r[6] });
  });
  Object.keys(out).forEach(function (k) { out[k] = out[k].slice(-8); });
  return out;
}

function sendMail_(data, email) {
  var tpl = String(data.template == null ? '' : data.template);
  if (tpl !== 'custom' && TEMPLATE_KEYS.indexOf(tpl) === -1) tpl = 'custom';
  var lang = normLang_(data.lang);
  var subject = String(data.subject == null ? '' : data.subject).replace(/[\r\n\u0000-\u001f]+/g, ' ').trim().slice(0, MAX_SUBJECT);
  var headline = String(data.headline == null ? '' : data.headline).replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_HEADLINE);
  var body = String(data.body == null ? '' : data.body).slice(0, MAX_MAIL_BODY);
  if (!subject || !body.trim()) return { ok: false, error: 'empty' };
  if (/\{[a-z_]{2,15}\}/.test(subject + headline + body)) return { ok: false, error: 'placeholder' }; // a {name}-style gap was left unfilled

  // the recipient: an applicant's own email read from the sheet (never from the browser), or an address typed by the admin
  var id = '', to = '', applicant = null;
  if (data.applicantId) {
    id = String(data.applicantId);
    if (!/^[\w-]{1,40}$/.test(id)) return { ok: false, error: 'invalid' };
    applicant = findApplicant_(id);
    if (!applicant) return { ok: false, error: 'notfound' };
    to = normEmail_(applicant.email);
    if (!to) return { ok: false, error: 'noemail' };
  } else {
    to = normEmail_(data.to);
    if (!to) return { ok: false, error: 'to' };
  }

  var t = now_(), k = 'am:' + sha_(email);
  var allowed = withLock_(function () {
    var s = recent_(getJ_(k), t, 3600000);
    if (s.length >= ADMIN_MAILS_PER_HOUR) return false;
    s.push(t);
    setJ_(k, s);
    return true;
  });
  if (!allowed) return { ok: false, error: 'rate' };
  if (MailApp.getRemainingDailyQuota() <= 3) return { ok: false, error: 'quota' }; // keeps the last few for login codes

  var m = renderMail_(lang, subject, headline, body, !!applicant);
  try {
    MailApp.sendEmail({ to: to, name: 'Magmafy', replyTo: senderEmail_() || undefined, subject: m.subject, body: m.text, htmlBody: m.html });
  } catch (err) {
    return { ok: false, error: 'send' };
  }
  appendMessage_(id, 'email', tpl, to, m.subject, email);
  var st = TEMPLATE_STATUS[tpl];
  if (id && data.setStatus === true && st) upsertReview_(id, st, null, email);
  return { ok: true, status: id && data.setStatus === true && st ? st : '', left: MailApp.getRemainingDailyQuota() };
}

// WhatsApp opens in the admin's own browser; this only records that it was opened (and moves the status).
function logMessage_(data, email) {
  var id = String(data.applicantId == null ? '' : data.applicantId);
  if (!/^[\w-]{1,40}$/.test(id)) return { ok: false, error: 'invalid' };
  var a = findApplicant_(id);
  if (!a) return { ok: false, error: 'notfound' };
  var tpl = String(data.template == null ? '' : data.template);
  if (tpl !== 'custom' && TEMPLATE_KEYS.indexOf(tpl) === -1) tpl = 'custom';
  appendMessage_(id, 'whatsapp', tpl, String(a.phone || ''), '', email);
  var st = TEMPLATE_STATUS[tpl];
  if (data.setStatus === true && st) upsertReview_(id, st, null, email);
  return { ok: true, status: data.setStatus === true && st ? st : '' };
}

// ---------------------------------------------------------------- batch limit + owner notifications

function maxApps_() {
  var n = parseInt(props_().getProperty('MAX_APPS'), 10);
  return n >= 1 && n <= 500 ? n : DEFAULT_MAX_APPS;
}
function baseCount_() { return Math.max(0, parseInt(props_().getProperty('BASE'), 10) || 0); }
function rowCount_(sh) { return Math.max(0, sh.getLastRow() - 1); }
function usedCount_(sh) { return Math.max(0, rowCount_(sh) - baseCount_()); }
function autoClose_() {
  props_().setProperty('CLOSED', '1');
  setJ_('closedMeta', { by: 'auto', at: new Date().toISOString(), open: false });
}

// Queue the applicant and send ONE email at most every NOTIFY_GAP_MS (always sent when the batch completes).
function notifyNew_(item, force) {
  try {
    if (!normEmail_(props_().getProperty('NOTIFY_EMAIL'))) return;
    var t = now_();
    var batch = withLock_(function () {
      var pend = getJ_('n:pend');
      pend = (Array.isArray(pend) ? pend : []).concat([item]).slice(-NOTIFY_MAX_PENDING);
      var last = Number(props_().getProperty('n:last')) || 0;
      if (!force && t - last < NOTIFY_GAP_MS) { setJ_('n:pend', pend); return null; }
      setJ_('n:pend', []);
      props_().setProperty('n:last', String(t));
      return pend;
    });
    if (batch) sendNotice_(batch);
  } catch (err) { /* never affects the applicant */ }
}

// Called when an admin opens the dashboard: sends anything still waiting once the gap has passed.
function flushNotices_() {
  try {
    if (!normEmail_(props_().getProperty('NOTIFY_EMAIL'))) return;
    var t = now_();
    var batch = withLock_(function () {
      var pend = getJ_('n:pend');
      var last = Number(props_().getProperty('n:last')) || 0;
      if (!Array.isArray(pend) || !pend.length || t - last < NOTIFY_GAP_MS) return null;
      setJ_('n:pend', []);
      props_().setProperty('n:last', String(t));
      return pend;
    });
    if (batch) sendNotice_(batch);
  } catch (err) { /* ignore */ }
}

function sendNotice_(list) {
  var to = normEmail_(props_().getProperty('NOTIFY_EMAIL'));
  if (!to || !list.length || MailApp.getRemainingDailyQuota() <= 3) return;
  var used = usedCount_(sheet_()), max = maxApps_(), done = used >= max;
  var subject = (done ? 'اكتمل العدد: ' : '') + (list.length === 1 ? 'متقدم جديد' : list.length + ' متقدمين جدد') + ' (' + used + ' من ' + max + ')';
  var lines = list.map(function (x) {
    return '• ' + x.n + (x.c ? ' - ' + x.c : '') + (x.y ? ' - ' + x.y : '') + (x.r ? ' - المقابل: ' + x.r : '');
  });
  var url = 'https://applicants.magmafyogp.com';
  var text = lines.join('\n') + '\n\nعدد التقديمات في الدفعة الحالية: ' + used + ' من ' + max + '.' +
    (done ? '\nتم قفل باب التقديم تلقائيًا لأن العدد اكتمل.' : '') + '\n\nافتح اللوحة: ' + url + '\n';
  var font = "Tahoma,'Segoe UI',Arial,sans-serif";
  var items = list.map(function (x) {
    return '<tr><td style="padding:10px 0;border-bottom:1px solid #eadcf3;font:15px/1.7 ' + font + ';color:#2a1a38;text-align:right;"><b>' + esc_(x.n) + '</b>' +
      (x.c || x.y ? '<br><span style="color:#8f7ea3;font-size:13px;">' + esc_([x.c, x.y].filter(String).join(' · ')) + '</span>' : '') +
      (x.r ? '<br><span style="color:#b36b00;font-weight:700;">المقابل: ' + esc_(x.r) + '</span>' : '') + '</td></tr>';
  }).join('');
  var html = '<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body style="margin:0;background:#f3eef7;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f3eef7"><tr><td align="center" style="padding:24px 12px;">' +
    '<table role="presentation" width="560" cellpadding="0" cellspacing="0" dir="rtl" style="width:100%;max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;">' +
    '<tr><td bgcolor="#0e0716" style="background:#0e0716;padding:22px 24px;text-align:right;font:700 18px/1.4 ' + font + ';color:#ffffff;">' +
    '<img src="' + LOGO_URL + '" width="40" height="40" alt="" style="vertical-align:middle;border-radius:10px;margin-left:12px;border:0;">' + esc_(subject) + '</td></tr>' +
    '<tr><td style="padding:12px 24px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + items + '</table></td></tr>' +
    '<tr><td style="padding:14px 24px 24px;text-align:right;font:14px/1.8 ' + font + ';color:#5b4a6b;">' +
    'الدفعة الحالية: <b>' + used + ' من ' + max + '</b>' + (done ? '<br><b style="color:#c0264f;">تم قفل باب التقديم تلقائيًا لأن العدد اكتمل.</b>' : '') +
    '<br><a href="' + url + '" style="color:#962fbf;font-weight:700;text-decoration:none;">افتح لوحة المتقدمين</a></td></tr>' +
    '</table></td></tr></table></body></html>';
  MailApp.sendEmail({ to: to, name: 'Magmafy', subject: subject, body: text, htmlBody: html });
}

// make sure the header row has every column name (adds the new `email` header to an existing sheet)
function ensureHeader_(sh) {
  if (sh.getLastRow() === 0) return;
  var rng = sh.getRange(1, 1, 1, COLUMNS.length), cur = rng.getValues()[0], changed = false;
  COLUMNS.forEach(function (c, i) { if (!cur[i]) { cur[i] = c; changed = true; } });
  if (changed) { rng.setValues([cur]); sh.getRange(1, 1, 1, COLUMNS.length).setFontWeight('bold'); }
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
  flushNotices_();
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
  return { ok: true, rows: rows, reviews: reviews, interviews: interviews_(), contracts: contracts_(), msgs: messagesByApplicant_(), sender: senderEmail_(), open: !isClosed_(), me: email, used: usedCount_(sheet_()), cap: maxApps_() };
}

function saveReview_(data, email) {
  var id = String(data.id == null ? '' : data.id);
  if (!/^[\w-]{1,40}$/.test(id)) return { ok: false, error: 'invalid' };
  var status = STATUSES.indexOf(data.status) !== -1 ? data.status : STATUSES[0];
  upsertReview_(id, status, clean_(data.note, 2000), email);
  return { ok: true };
}

// ---- interview checklist (one JSON document per applicant, sanitised field by field)
function interviewsSheet_() { return sheetWithHeader_(INTERVIEW_SHEET, INTERVIEW_COLUMNS); }

function pickMap_(src, valueFn, keyRe, maxKeys) {
  var out = {}, n = 0;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
  Object.keys(src).forEach(function (k) {
    if (n >= maxKeys || !keyRe.test(k)) return;
    var v = valueFn(src[k]);
    if (v !== undefined) { out[k] = v; n++; }
  });
  return out;
}
function boolV_(v) { return v === true ? true : undefined; }
function scoreV_(v) { return (typeof v === 'number' && v >= 0 && v <= 5 && v === Math.floor(v)) ? v : undefined; }
function textV_(max) { return function (v) { return typeof v === 'string' && v ? v.slice(0, max) : undefined; }; }
function numStr_(v) { v = v == null ? '' : String(v).trim(); return /^\d{1,6}(\.\d{1,2})?$/.test(v) ? v : ''; }

function sanitizeInterview_(o) {
  var keyRe = /^[a-z][a-z0-9]{0,7}$/;
  return {
    v: 1,
    fee: numStr_(o.fee),
    cap: numStr_(o.cap),
    checks: pickMap_(o.checks, boolV_, keyRe, 40),
    flags: pickMap_(o.flags, boolV_, keyRe, 20),
    prep: pickMap_(o.prep, boolV_, keyRe, 20),
    pitch: pickMap_(o.pitch, boolV_, keyRe, 20),
    close: pickMap_(o.close, boolV_, keyRe, 20),
    ratings: pickMap_(o.ratings, scoreV_, keyRe, 20),
    trial: pickMap_(o.trial, scoreV_, keyRe, 20),
    notes: pickMap_(o.notes, textV_(1000), keyRe, 40),
    decision: INTERVIEW_DECISIONS.indexOf(o.decision) !== -1 ? o.decision : '',
    gen: typeof o.gen === 'string' ? o.gen.slice(0, 1500) : '',
    final: typeof o.final === 'string' ? o.final.slice(0, 1500) : ''
  };
}

function saveInterview_(data, email) {
  var id = String(data.id == null ? '' : data.id);
  if (!/^[\w-]{1,40}$/.test(id)) return { ok: false, error: 'invalid' };
  var raw = typeof data.data === 'string' ? data.data : '';
  if (!raw || raw.length > MAX_INTERVIEW_JSON) return { ok: false, error: 'invalid' };
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return { ok: false, error: 'invalid' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'invalid' };
  var json = JSON.stringify(sanitizeInterview_(obj)); // starts with "{", so a spreadsheet never reads it as a formula
  withLock_(function () {
    var sh = interviewsSheet_(), ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
    var row = -1;
    for (var i = 1; i < ids.length; i++) if (String(ids[i][0]) === id) { row = i + 1; break; }
    var vals = [id, json, email, new Date()];
    if (row === -1) sh.appendRow(vals); else sh.getRange(row, 1, 1, vals.length).setValues([vals]);
  });
  return { ok: true };
}

function interviews_() {
  var rows = interviewsSheet_().getDataRange().getValues(), out = {};
  rows.shift();
  rows.forEach(function (r) {
    var d = null;
    try { d = JSON.parse(String(r[1])); } catch (e) { d = null; }
    if (d && typeof d === 'object') out[String(r[0])] = { data: d, by: r[2], at: r[3] instanceof Date ? r[3].toISOString() : r[3] };
  });
  return out;
}

// ---- contracts: one per applicant. A signed contract is frozen on the server; it can only be ended.
function contractsSheet_() { return sheetWithHeader_(CONTRACT_SHEET, CONTRACT_COLUMNS); }

function intIn_(v, lo, hi, dflt) { v = Number(v); return (isFinite(v) && v === Math.floor(v) && v >= lo && v <= hi) ? v : dflt; }
function str_(v, max) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : ''; }

function sanitizeSig_(s) {
  if (!s || typeof s !== 'object') return null;
  var W = 300, H = 120, MAX_PTS = 1500, strokes = [], pts = 0;
  (Array.isArray(s.strokes) ? s.strokes : []).slice(0, 40).forEach(function (st) {
    if (!Array.isArray(st)) return;
    var out = [], ok = true;
    for (var i = 0; i + 1 < st.length && ok; i += 2) {
      var x = intIn_(st[i], 0, W, -1), y = intIn_(st[i + 1], 0, H, -1);
      if (x < 0 || y < 0) ok = false; else out.push(x, y);
    }
    if (ok && out.length >= 2 && pts + out.length / 2 <= MAX_PTS) { strokes.push(out); pts += out.length / 2; }
  });
  return pts ? { w: W, h: H, strokes: strokes, name: str_(s.name, 80), pts: pts } : null;
}

function sanitizeTerms_(t) {
  var out = [], total = 0;
  (Array.isArray(t) ? t : []).slice(0, 30).forEach(function (c) {
    if (!c || typeof c !== 'object') return;
    var h = str_(c.h, 120), ps = [];
    (Array.isArray(c.p) ? c.p : []).slice(0, 12).forEach(function (p) {
      p = str_(p, 1500);
      if (p && total + p.length <= 16000) { ps.push(p); total += p.length; }
    });
    if (h || ps.length) out.push({ h: h, p: ps });
  });
  return out;
}

function sanitizeContract_(o) {
  var p1 = o.p1 && typeof o.p1 === 'object' ? o.p1 : {}, p2 = o.p2 && typeof o.p2 === 'object' ? o.p2 : {};
  return {
    v: 1,
    no: /^[A-Z0-9-]{4,24}$/.test(String(o.no)) ? String(o.no) : '',
    fee: numStr_(o.fee),
    cur: CONTRACT_CURRENCIES.indexOf(o.cur) !== -1 ? o.cur : 'USD',
    payDays: intIn_(o.payDays, 1, 30, 7),
    noticeDays: intIn_(o.noticeDays, 1, 60, 14),
    replyHours: intIn_(o.replyHours, 1, 72, 24),
    nonSol: intIn_(o.nonSol, 0, 36, 12),
    start: /^\d{4}-\d{2}-\d{2}$/.test(String(o.start)) ? String(o.start) : '',
    platforms: str_(o.platforms, 200),
    law: str_(o.law, 200),
    p1: { entity: str_(p1.entity, 100), rep: str_(p1.rep, 60), title: str_(p1.title, 60) },
    p2: { name: str_(p2.name, 80), phone: str_(p2.phone, 30), email: str_(p2.email, 100), country: str_(p2.country, 60) },
    terms: sanitizeTerms_(o.terms)
  };
}

function contractSummary_(d) {
  return {
    status: d.status || 'draft', no: d.no || '', fee: d.fee || '', cur: d.cur || 'USD', start: d.start || '',
    name: d.p2 && d.p2.name ? d.p2.name : '', signedAt: d.signedAt || '', endedAt: d.endedAt || ''
  };
}

function readContractRow_(id) {
  var rows = contractsSheet_().getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]) !== id) continue;
    var d = null;
    try { d = JSON.parse(String(rows[i][1])); } catch (e) { d = null; }
    return d && typeof d === 'object' ? { doc: d, by: rows[i][2], at: rows[i][3] instanceof Date ? rows[i][3].toISOString() : rows[i][3] } : null;
  }
  return null;
}

function getContract_(data, email) {
  var id = String(data.id == null ? '' : data.id);
  if (!/^[\w-]{1,40}$/.test(id)) return { ok: false, error: 'invalid' };
  var r = readContractRow_(id);
  return { ok: true, contract: r ? r.doc : null, by: r ? r.by : '', at: r ? r.at : '' };
}

function saveContract_(data, email) {
  var id = String(data.id == null ? '' : data.id);
  if (!/^[\w-]{1,40}$/.test(id)) return { ok: false, error: 'invalid' };
  var op = data.op === 'draft' || data.op === 'sign' || data.op === 'end' ? data.op : '';
  var raw = typeof data.data === 'string' ? data.data : '';
  if (!op || !raw || raw.length > MAX_CONTRACT_JSON) return { ok: false, error: 'invalid' };
  var obj;
  try { obj = JSON.parse(raw); } catch (e) { return { ok: false, error: 'invalid' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, error: 'invalid' };
  var failure = '', summary = null;
  withLock_(function () {
    var sh = contractsSheet_(), ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues(), row = -1, cur = null;
    for (var i = 1; i < ids.length; i++) if (String(ids[i][0]) === id) { row = i + 1; break; }
    if (row !== -1) { try { cur = JSON.parse(String(sh.getRange(row, 2, 1, 1).getValues()[0][0])); } catch (e) { cur = null; } }
    var st = cur && cur.status ? cur.status : 'none', doc;
    if (op === 'draft' || op === 'sign') {
      if (st === 'signed' || st === 'ended') { failure = 'locked'; return; } // a signed contract can never be rewritten
      doc = sanitizeContract_(obj);
      doc.status = 'draft';
      if (op === 'sign') {
        var sig = sanitizeSig_(obj.sig);
        if (!sig || sig.pts < 15 || sig.name.length < 3 || !doc.fee || !doc.p2.name || !doc.p1.rep || !doc.start || !doc.no || !doc.terms.length) { failure = 'incomplete'; return; }
        doc.status = 'signed'; doc.sig = sig; doc.signedAt = new Date().toISOString(); doc.signedBy = email;
        doc.hash = sha_(JSON.stringify({ no: doc.no, terms: doc.terms, fee: doc.fee, cur: doc.cur, start: doc.start, p1: doc.p1, p2: doc.p2, sig: sig, at: doc.signedAt }));
      }
    } else { // end: only a signed contract, and nothing but the end fields changes
      if (st !== 'signed') { failure = 'invalid'; return; }
      doc = cur; doc.status = 'ended'; doc.endedAt = new Date().toISOString(); doc.endedBy = email; doc.endReason = str_(obj.reason, 300);
    }
    var json = JSON.stringify(doc); // starts with "{", so a spreadsheet never reads it as a formula
    if (json.length > 48000) { failure = 'invalid'; return; }
    var vals = [id, json, email, new Date()];
    if (row === -1) sh.appendRow(vals); else sh.getRange(row, 1, 1, vals.length).setValues([vals]);
    summary = contractSummary_(doc);
    summary.hash = doc.hash || '';
  });
  return failure ? { ok: false, error: failure } : { ok: true, contract: summary };
}

function contracts_() {
  var rows = contractsSheet_().getDataRange().getValues(), out = {};
  rows.shift();
  rows.forEach(function (r) {
    var d = null;
    try { d = JSON.parse(String(r[1])); } catch (e) { d = null; }
    if (d && typeof d === 'object') out[String(r[0])] = contractSummary_(d);
  });
  return out;
}

// note === null keeps the existing note (used when a message changes the status automatically)
function upsertReview_(id, status, note, email) {
  withLock_(function () {
    var sh = reviewsSheet_(), ids = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
    var row = -1;
    for (var i = 1; i < ids.length; i++) if (String(ids[i][0]) === id) { row = i + 1; break; }
    if (note === null) note = row === -1 ? '' : sh.getRange(row, 3, 1, 1).getValues()[0][0];
    var vals = [id, status, note, email, new Date()];
    if (row === -1) sh.appendRow(vals); else sh.getRange(row, 1, 1, vals.length).setValues([vals]);
  });
}

function setOpen_(data, email) {
  var open = data.open === true;
  if (open) {
    props_().setProperty('BASE', String(rowCount_(sheet_()))); // reopening starts a fresh batch of MAX_APPS
    props_().deleteProperty('CLOSED');
  } else props_().setProperty('CLOSED', '1');
  setJ_('closedMeta', { by: email, at: new Date().toISOString(), open: open });
  return { ok: true, open: open, used: usedCount_(sheet_()), cap: maxApps_() };
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

function templatesSheet_() { return sheetWithHeader_(TEMPLATE_SHEET, TEMPLATE_COLUMNS); }
function messagesSheet_() { return sheetWithHeader_(MESSAGES_SHEET, MESSAGE_COLUMNS); }
function sheetWithHeader_(name, cols) {
  var ss = ss_(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(cols);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, cols.length).setFontWeight('bold');
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
