/**
 * BNDR Payment Portal — Google Apps Script Backend
 *
 * SETUP:
 * 1. Create a new Google Sheet
 * 2. Rename "Sheet1" to "Projects" and add headers in row 1:
 *    A: projectId | B: name | C: categories | D: contractors | E: totalEstimated | F: lastSynced
 * 3. Add a second sheet tab named "Payments" with headers in row 1:
 *    A: timestamp | B: project | C: date | D: amount | E: contractor | F: category | G: description | H: projectId
 * 4. Go to Extensions > Apps Script
 * 5. Delete any existing code and paste this entire file
 * 6. Click Deploy > New deployment
 *    - Type: Web app
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 7. Click Deploy, authorize when prompted
 * 8. Copy the Web app URL
 * 9. Paste it into the BNDR app's Export tab > Cloud Sync Settings
 * 10. Click "Sync Projects" to push your project data
 * 11. Share the Payment Portal link with your operations manager
 */

var NOTIFICATION_EMAIL = 'genebinder@bndrcapital.com';

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'projects';

  if (action === 'projects') {
    return getProjects();
  }

  return jsonResponse({ success: false, error: 'Unknown action' });
}

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, error: 'Invalid JSON' });
  }

  var action = payload.action;

  if (action === 'payment') {
    return handlePayment(payload);
  }
  if (action === 'sync') {
    return handleSync(payload);
  }

  return jsonResponse({ success: false, error: 'Unknown action' });
}

/* ── Get Projects (with payment totals) ── */
function getProjects() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var projectsSheet = ss.getSheetByName('Projects');
  var paymentsSheet = ss.getSheetByName('Payments');

  if (!projectsSheet || !paymentsSheet) {
    return jsonResponse({ success: false, error: 'Missing Projects or Payments sheet tab' });
  }

  var projectData = projectsSheet.getDataRange().getValues();
  var paymentData = paymentsSheet.getDataRange().getValues();

  // Build per-project payment totals from the Payments sheet
  var paidByProject = {};
  for (var i = 1; i < paymentData.length; i++) {
    var pid = paymentData[i][7];  // column H: projectId
    var amt = Number(paymentData[i][3]) || 0;
    var cat = String(paymentData[i][5] || '');
    if (!pid) continue;
    if (!paidByProject[pid]) paidByProject[pid] = { total: 0, byCategory: {} };
    paidByProject[pid].total += amt;
    if (cat) {
      if (!paidByProject[pid].byCategory[cat]) paidByProject[pid].byCategory[cat] = 0;
      paidByProject[pid].byCategory[cat] += amt;
    }
  }

  var projects = [];
  for (var i = 1; i < projectData.length; i++) {
    var row = projectData[i];
    var pid = row[0];
    if (!pid) continue;

    var categories = [];
    try { categories = JSON.parse(row[2] || '[]'); } catch (e) {}
    var contractors = [];
    try { contractors = JSON.parse(row[3] || '[]'); } catch (e) {}

    projects.push({
      id: pid,
      name: row[1] || '',
      categories: categories,
      contractors: contractors,
      totalEstimated: Number(row[4]) || 0,
      totalPaid: paidByProject[pid] ? paidByProject[pid].total : 0,
      paidByCategory: paidByProject[pid] ? paidByProject[pid].byCategory : {}
    });
  }

  return jsonResponse({ success: true, projects: projects });
}

/* ── Handle Payment Submission ── */
function handlePayment(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Payments');

  if (!sheet) {
    return jsonResponse({ success: false, error: 'Missing Payments sheet tab' });
  }

  var amount = Number(payload.amount) || 0;
  var projectName = payload.projectName || '';
  var contractor = payload.contractor || '';
  var category = payload.category || '';
  var description = payload.description || '';
  var date = payload.date || '';
  var projectId = payload.projectId || '';

  // Append row
  sheet.appendRow([
    new Date().toISOString(),
    projectName,
    date,
    amount,
    contractor,
    category,
    description,
    projectId
  ]);

  // Send email notification
  try {
    var fmtAmount = '$' + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    var subject = 'BNDR Payment: ' + fmtAmount + ' — ' + (projectName || 'Unknown Project');
    var body = 'New payment submitted via Payment Portal:\n\n' +
      'Project:     ' + projectName + '\n' +
      'Date:        ' + date + '\n' +
      'Amount:      ' + fmtAmount + '\n' +
      'Contractor:  ' + contractor + '\n' +
      'Category:    ' + category + '\n' +
      'Description: ' + description + '\n' +
      '\nTimestamp: ' + new Date().toISOString();

    MailApp.sendEmail(NOTIFICATION_EMAIL, subject, body);
  } catch (emailErr) {
    // Payment saved even if email fails
    Logger.log('Email error: ' + emailErr.message);
  }

  return jsonResponse({ success: true });
}

/* ── Handle Project Sync ── */
function handleSync(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Projects');

  if (!sheet) {
    return jsonResponse({ success: false, error: 'Missing Projects sheet tab' });
  }

  var projects = payload.projects || [];

  // Clear existing data (keep header row)
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 6).clearContent();
  }

  // Write all projects
  var now = new Date().toISOString();
  for (var i = 0; i < projects.length; i++) {
    var p = projects[i];
    sheet.appendRow([
      p.id || '',
      p.name || '',
      JSON.stringify(p.categories || []),
      JSON.stringify(p.contractors || []),
      Number(p.totalEstimated) || 0,
      now
    ]);
  }

  return jsonResponse({ success: true, count: projects.length });
}

/* ── Helper ── */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
