/**
 * Magmafy: backend for the recruiting form and the applicants dashboard.
 *
 * One-time setup (about 5 minutes):
 * 1. Open https://script.google.com and create a new project. Paste this file as Code.gs.
 * 2. Pick the function `setup` from the toolbar and press Run. Approve the permissions.
 *    It creates a Google Sheet named "Magmafy Applicants" in your Drive and a secret token.
 *    Open View > Logs (or Executions) and copy the sheet link and the token.
 * 3. Deploy > New deployment > type: Web app.
 *    Execute as: Me.  Who has access: Anyone.  Press Deploy and copy the Web app URL (ends with /exec).
 * 4. Put the URL in the form: index.html, constant SHEET_ENDPOINT (repo Magmafy-Recruting-form).
 * 5. In the dashboard (repo Magmafy-Applicants) paste the same URL and the token.
 *
 * If you change this code later: Deploy > Manage deployments > Edit > New version.
 */

var SHEET_NAME = 'Applicants';
var COLUMNS = [
  'id', 'submittedAt', 'name', 'phone', 'country', 'years', 'platforms', 'spend',
  'niche', 'gulf', 'result', 'tracking', 'drop', 'cv', 'work', 'avail', 'rate', 'more'
];
var MAX_LEN = 4000; // per field, protects the sheet from huge spam

function setup() {
  var props = PropertiesService.getScriptProperties();
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
  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  Logger.log('Sheet: ' + ss.getUrl());
  Logger.log('Token (keep it private): ' + props.getProperty('TOKEN'));
}

function sheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) throw new Error('Run setup() first');
  return SpreadsheetApp.openById(id).getSheetByName(SHEET_NAME);
}

// Form submissions (public). Body is JSON sent as text/plain.
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.website) return json_({ ok: true }); // honeypot: bots fill it, people don't
    if (!data.name || !data.phone) return json_({ ok: false, error: 'missing fields' });
    var row = COLUMNS.map(function (k) {
      if (k === 'id') return Utilities.getUuid().slice(0, 8);
      if (k === 'submittedAt') return new Date();
      var v = data[k] == null ? '' : String(data[k]);
      v = v.slice(0, MAX_LEN);
      if (/^[=+\-@]/.test(v)) v = "'" + v; // stop spreadsheet formula injection
      return v;
    });
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    sheet_().appendRow(row);
    lock.releaseLock();
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

// Dashboard reads (private): ?token=SECRET
function doGet(e) {
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!e.parameter || !token || e.parameter.token !== token) {
    return json_({ ok: false, error: 'unauthorized' });
  }
  var values = sheet_().getDataRange().getValues();
  var head = values.shift();
  var rows = values.map(function (r) {
    var o = {};
    head.forEach(function (h, i) {
      var v = r[i];
      o[h] = v instanceof Date ? v.toISOString() : v;
    });
    return o;
  });
  return json_({ ok: true, rows: rows });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
