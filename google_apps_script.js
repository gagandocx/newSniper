/**
 * ═══════════════════════════════════════════════════════════════════
 * CoderSnap — License Server (Google Apps Script)
 * ═══════════════════════════════════════════════════════════════════
 * 
 * HOW TO SET UP:
 * 
 * 1. Create a new Google Sheet
 *    - Go to https://sheets.google.com → Create blank spreadsheet
 *    - Name it: "CoderSnap Licenses"
 *    - In Row 1, add these headers (exactly):
 *      A1: key
 *      B1: email
 *      C1: device_id
 *      D1: activated_at
 *      E1: last_verified
 *      F1: status
 * 
 * 2. Add your license keys
 *    - In column A (starting A2), paste your license keys (one per row)
 *    - Leave columns B-F empty — they get filled when a user activates
 *    - In column F, put "active" for keys you want available
 *    - Put "revoked" in column F to disable a key anytime
 * 
 * 3. Deploy as Apps Script
 *    - In the sheet, go to Extensions → Apps Script
 *    - Delete any existing code in Code.gs
 *    - Paste THIS ENTIRE FILE into Code.gs
 *    - Click Deploy → New deployment
 *    - Type: "Web app"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"
 *    - Click Deploy → Copy the URL
 *    - That URL is your LICENSE_SERVER_URL (paste it in license.js)
 * 
 * 4. Test it
 *    - Visit: YOUR_URL?action=verify&key=TESTKEY&email=test@test.com&device=abc123
 *    - Should return JSON: {"success":false,"error":"Invalid key"}
 * 
 * ═══════════════════════════════════════════════════════════════════
 * 
 * API ENDPOINTS (all via GET or POST to the deployed URL):
 * 
 * 1. ACTIVATE: First-time activation (binds key to email + device)
 *    ?action=activate&key=XXXXX&email=user@email.com&device=FINGERPRINT
 *    
 *    Returns:
 *    - {success: true} — activated successfully
 *    - {success: false, error: "..."} — failed (key invalid, already used, etc)
 * 
 * 2. VERIFY: Check if license is valid (called every time extension loads)
 *    ?action=verify&key=XXXXX&email=user@email.com&device=FINGERPRINT
 *    
 *    Returns:
 *    - {success: true, valid: true} — all good
 *    - {success: true, valid: false, error: "..."} — license problem
 * 
 * 3. LIST: List all keys and their status (for your admin use)
 *    ?action=list&admin=CODERSNAP2026
 *    
 *    Returns: Array of all license entries
 * 
 * ═══════════════════════════════════════════════════════════════════
 */

// ── Admin password for list endpoint ──
var ADMIN_PASS = 'CODERSNAP2026';

// ── Your Google Sheet ID (from the URL: docs.google.com/spreadsheets/d/THIS_PART/edit) ──
var SHEET_ID = '1r9Ab9yDh6OXz7s3vwRIW8RHOW0OZ2T0MInlhlK2iDlY';

function getSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName('CoderSnap Licenses')
      || SpreadsheetApp.openById(SHEET_ID).getSheets()[0];
}

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  var params = e.parameter || {};
  var action = params.action || '';
  
  var result;
  
  try {
    if (action === 'activate') {
      result = handleActivate(params);
    } else if (action === 'verify') {
      result = handleVerify(params);
    } else if (action === 'heartbeat') {
      result = handleHeartbeat(params);
    } else if (action === 'list') {
      result = handleList(params);
    } else {
      result = { success: false, error: 'Unknown action. Use: activate, verify, heartbeat, or list' };
    }
  } catch (err) {
    result = { success: false, error: 'Server error: ' + err.message };
  }
  
  return ContentService
    .createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── ACTIVATE: Bind key to email + device ──────────────────────────
function handleActivate(params) {
  var key = (params.key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var email = (params.email || '').toLowerCase().trim();
  var device = (params.device || '').trim();
  
  if (!key) return { success: false, error: 'Missing key' };
  if (!email || email.indexOf('@') === -1) return { success: false, error: 'Missing or invalid email' };
  if (!device) return { success: false, error: 'Missing device ID' };
  
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  
  // Find the key row
  var keyRow = -1;
  for (var i = 1; i < data.length; i++) {
    var rowKey = String(data[i][0]).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (rowKey === key) {
      keyRow = i;
      break;
    }
  }
  
  if (keyRow === -1) {
    return { success: false, error: 'Invalid key' };
  }
  
  var rowData = data[keyRow];
  var existingEmail = String(rowData[1] || '').toLowerCase().trim();
  var existingDevice = String(rowData[2] || '').trim();
  var status = String(rowData[5] || '').toLowerCase().trim();
  
  // Check if key is revoked or expired
  if (status === 'revoked') {
    return { success: false, error: 'This key has been revoked' };
  }
  if (status === 'expired') {
    return { success: false, error: 'This key has expired' };
  }
  
  // Check if already activated by someone else
  if (existingEmail && existingEmail !== email) {
    return { success: false, error: 'Key already bound to another account' };
  }
  
  // Check if already activated on a different device
  if (existingDevice && existingDevice !== device) {
    return { success: false, error: 'Key already activated on another device' };
  }
  
  // Activate: write email, device, timestamp, status
  var row = keyRow + 1; // Sheets is 1-indexed
  sheet.getRange(row, 2).setValue(email);           // B: email
  sheet.getRange(row, 3).setValue(device);          // C: device_id
  // D: activated_at — ONLY set on first activation, NEVER overwrite
  var existingActivatedAt = rowData[3] || '';
  if (!existingActivatedAt || String(existingActivatedAt).trim() === '') {
    sheet.getRange(row, 4).setValue(new Date().toISOString()); // D: activated_at (first time only)
  }
  sheet.getRange(row, 5).setValue(new Date().toISOString()); // E: last_verified
  sheet.getRange(row, 6).setValue('active');        // F: status
  
  // Calculate actual days remaining from the locked activation date
  var actualActivatedAt = existingActivatedAt || new Date().toISOString();
  var activationDate = new Date(actualActivatedAt);
  var diffMs = new Date().getTime() - activationDate.getTime();
  var daysRemaining = Math.max(0, 365 - Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  
  return { success: true, message: 'License activated successfully', daysRemaining: daysRemaining };
}

// ── VERIFY: Check if license is valid ─────────────────────────────
function handleVerify(params) {
  var key = (params.key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  var email = (params.email || '').toLowerCase().trim();
  var device = (params.device || '').trim();
  
  if (!key) return { success: false, error: 'Missing key' };
  
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  
  // Find the key row
  var keyRow = -1;
  for (var i = 1; i < data.length; i++) {
    var rowKey = String(data[i][0]).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (rowKey === key) {
      keyRow = i;
      break;
    }
  }
  
  if (keyRow === -1) {
    return { success: true, valid: false, error: 'Invalid key' };
  }
  
  var rowData = data[keyRow];
  var existingEmail = String(rowData[1] || '').toLowerCase().trim();
  var existingDevice = String(rowData[2] || '').trim();
  var activatedAt = rowData[3] || '';
  var status = String(rowData[5] || '').toLowerCase().trim();
  
  // Check if revoked
  if (status === 'revoked') {
    return { success: true, valid: false, error: 'License revoked' };
  }
  
  // Check if expired (1 year = 365 days from activation)
  if (status === 'expired') {
    return { success: true, valid: false, error: 'License expired — 1 year has passed since activation' };
  }
  
  if (activatedAt) {
    var activationDate = new Date(activatedAt);
    var now = new Date();
    var diffMs = now.getTime() - activationDate.getTime();
    var diffDays = diffMs / (1000 * 60 * 60 * 24);
    
    if (diffDays >= 365) {
      // Auto-expire: update status in sheet to 'expired'
      var row = keyRow + 1;
      sheet.getRange(row, 6).setValue('expired');
      return { success: true, valid: false, error: 'License expired — 1 year has passed since activation' };
    }
  }
  
  // Check if not yet activated
  if (!existingEmail) {
    return { success: true, valid: false, error: 'Key not activated yet' };
  }
  
  // Check email match
  if (email && existingEmail !== email) {
    return { success: true, valid: false, error: 'Email mismatch — key bound to different account' };
  }
  
  // Check device match
  if (device && existingDevice && existingDevice !== device) {
    return { success: true, valid: false, error: 'Device mismatch — key activated on different device' };
  }
  
  // Update last_verified timestamp
  var row = keyRow + 1;
  sheet.getRange(row, 5).setValue(new Date().toISOString());
  
  // Calculate days remaining for client display
  var daysRemaining = 365;
  if (activatedAt) {
    var activationDate = new Date(activatedAt);
    var diffMs = new Date().getTime() - activationDate.getTime();
    daysRemaining = Math.max(0, 365 - Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  }
  
  return { success: true, valid: true, email: existingEmail, daysRemaining: daysRemaining };
}

// ── LIST: Admin view of all keys ──────────────────────────────────
function handleList(params) {
  var pass = params.admin || '';
  if (pass !== ADMIN_PASS) {
    return { success: false, error: 'Unauthorized' };
  }
  
  var sheet = getSheet();
  var data = sheet.getDataRange().getValues();
  
  var keys = [];
  for (var i = 1; i < data.length; i++) {
    keys.push({
      key: data[i][0] || '',
      email: data[i][1] || '',
      device_id: data[i][2] || '',
      activated_at: data[i][3] || '',
      last_verified: data[i][4] || '',
      status: data[i][5] || 'available'
    });
  }
  
  return { success: true, total: keys.length, keys: keys };
}



// ── HEARTBEAT: Receive live stats from extension ──────────────────
// Writes to "Activity Dashboard" tab (creates it if not exists)
// Stats are now LIFETIME TOTALS sent from the extension — they never reset
// The extension persists stats in chrome.storage.local and accumulates across restarts
function handleHeartbeat(params) {
  var email = (params.email || '').toLowerCase().trim();
  var key = (params.key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  if (!email || !key) return { success: false, error: 'Missing email or key' };
  
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var dashSheet = ss.getSheetByName('Activity Dashboard');
  
  // Create the dashboard tab if it doesn't exist (expanded columns for lifetime + session data)
  if (!dashSheet) {
    dashSheet = ss.insertSheet('Activity Dashboard');
    dashSheet.getRange(1, 1, 1, 20).setValues([[
      'Email', 'Key', 'Status', 'Session Duration',
      'Total Shifts Found', 'Total Applied', 'Total CAPTCHA Solved', 'Total Rate Limits', 'Total Scans',
      'Sessions', 'License Activated', 'Days Left',
      'This Session Scans', 'This Session Found', 'This Session Applied',
      'City', 'Radius', 'Last Shift', 'Last Updated', 'Alert'
    ]]);
    dashSheet.getRange(1, 1, 1, 20).setFontWeight('bold');
    dashSheet.setFrozenRows(1);
  } else {
    // Migrate existing dashboard headers if needed
    var lastCol = dashSheet.getLastColumn();
    if (lastCol < 20) {
      dashSheet.getRange(1, 1, 1, 20).setValues([[
        'Email', 'Key', 'Status', 'Session Duration',
        'Total Shifts Found', 'Total Applied', 'Total CAPTCHA Solved', 'Total Rate Limits', 'Total Scans',
        'Sessions', 'License Activated', 'Days Left',
        'This Session Scans', 'This Session Found', 'This Session Applied',
        'City', 'Radius', 'Last Shift', 'Last Updated', 'Alert'
      ]]);
      dashSheet.getRange(1, 1, 1, 20).setFontWeight('bold');
    }
  }
  
  // Find existing row for this email, or create new one
  var data = dashSheet.getDataRange().getValues();
  var rowIdx = -1;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase().trim() === email) {
      rowIdx = i + 1; // Sheets is 1-indexed
      break;
    }
  }
  
  // ── Get the LOCKED activation date from the Licenses sheet ──
  // This is the TRUE activation date that NEVER changes
  var licenseActivatedAt = '';
  var daysLeft = '';
  var alertMsg = '';
  var licSheet = ss.getSheetByName('CoderSnap Licenses') || ss.getSheets()[0];
  var licData = licSheet.getDataRange().getValues();
  for (var j = 1; j < licData.length; j++) {
    var rowKey = String(licData[j][0] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (rowKey === key) {
      licenseActivatedAt = licData[j][3] || ''; // Column D: activated_at
      break;
    }
  }
  
  // Calculate days left from the license activation date (not extension firstStarted)
  if (licenseActivatedAt) {
    var actDate = new Date(licenseActivatedAt);
    var now = new Date();
    var diffMs = now.getTime() - actDate.getTime();
    var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    daysLeft = Math.max(0, 365 - diffDays);
    
    // Alert when license is expiring
    if (daysLeft <= 0) {
      alertMsg = '⛔ EXPIRED';
    } else if (daysLeft <= 7) {
      alertMsg = '🚨 EXPIRES IN ' + daysLeft + ' DAYS!';
    } else if (daysLeft <= 30) {
      alertMsg = '⚠️ ' + daysLeft + ' days left';
    } else {
      alertMsg = '✅ OK';
    }
  } else {
    daysLeft = 'N/A';
    alertMsg = '❓ No activation date';
  }
  
  // If this is an EXISTING row, preserve the License Activated date (LOCKED — never overwrite)
  // For NEW rows, use the activation date from Licenses sheet
  var lockedActivationDate = '';
  if (rowIdx > 0) {
    // Read existing "License Activated" value from column 11
    var existingActivation = data[rowIdx - 1][10]; // 0-indexed, column K (11th)
    if (existingActivation && String(existingActivation).trim() !== '' && String(existingActivation).trim() !== 'unknown') {
      lockedActivationDate = existingActivation; // Keep the locked date
    } else {
      // First time writing — use license activation date
      lockedActivationDate = licenseActivatedAt || new Date().toISOString();
    }
  } else {
    // Brand new row — use the license activation date from Licenses sheet
    lockedActivationDate = licenseActivatedAt || new Date().toISOString();
  }
  
  // Extension now sends lifetime totals — write them directly
  var rowData = [
    email,
    key,
    params.status || 'unknown',
    params.duration || '0min',
    params.shiftsFound || '0',
    params.applied || '0',
    params.captchaSolved || '0',
    params.rateLimitHits || '0',
    params.scans || '0',
    params.totalSessions || '1',
    lockedActivationDate,       // LOCKED — never changes after first write
    daysLeft,                   // Countdown from 365
    params.sessionScans || '0',
    params.sessionFound || '0',
    params.sessionApplied || '0',
    params.city || 'Any',
    params.radius || '50',
    params.lastShift || 'none',
    new Date().toISOString(),
    alertMsg                    // Expiry alert
  ];
  
  if (rowIdx > 0) {
    // Update existing row with lifetime totals
    dashSheet.getRange(rowIdx, 1, 1, 20).setValues([rowData]);
  } else {
    // Append new row
    dashSheet.appendRow(rowData);
  }
  
  return { success: true };
}
