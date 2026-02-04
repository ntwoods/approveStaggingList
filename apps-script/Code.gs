var SPREADSHEET_ID = "1WSQMXxEAWVqeSBcEiYPWZ8HAL5d9y0Rdcel6xupbTPI";
var SHEET_NAME = "OrderCycle";
var CLIENT_ID = "360849757137-agopfs0m8rgmcj541ucpg22btep5olt3.apps.googleusercontent.com";
var MAX_ADDITIONAL_ORDERS = 4;
var ATTACHMENTS_COLUMN = columnToIndex_("BH");
var ATTACHMENTS_FOLDER_NAME = "ApprovedSalesOrders";
var DASH_KEY = "EA_DASH_KEY_CHANGE_ME";


// NOTE: mapping exactly same rakha hai (logic untouched)
var APPROVAL_COLUMN_BY_EMAIL = {
  "mis01@ntwoods.com": "BF"
};

var COLUMN_INDEX = {
  dealerName: 2,
  marketingPerson: 3,
  location: 4,
  crm: 6,
  aq: 43,
  ar: 44,
  orderId: 56,
  ea01: 58,
  ea02: 59
};

// --------------------
// Execution-level caches (fast)
// --------------------
var __ss = null;
var __sheet = null;
var __logSheet = null;

function doGet(e) { return handleRequest_(e); }
function doPost(e) { return handleRequest_(normalizeEvent_(e)); }

function handleRequest_(e) {
  var action = (e && e.parameter && e.parameter.action) || "";
  var callback = e && e.parameter && e.parameter.callback;

  var result;
  try {
    if (action === "listEligible") {
      result = listEligible_(e);
    } else if (action === "COUNT_ELIGIBLE") {
  var key = (e && e.parameter && e.parameter.key) || "";
  if (!key || String(key).trim() !== DASH_KEY) {
    throw new Error("Access denied");
  }
  // eligible list already aati hai listEligible_ me, but it requires id_token,
  // so we need a token-less count function
  result = countEligible_(); 
}
else if (action === "markChecked") {
      result = markChecked_(e);
    } else {
      throw new Error("Unknown action");
    }
  } catch (err) {
    result = { ok: false, error: err && err.message ? err.message : String(err) };
  }

  return createOutput_(callback, result);
}

function countEligible_() {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, count: 0 };

  // NOTE: approvals BF column (mis01) is fixed for dashboard count
  // (because dashboard is for EA Shaista only)
  var approvalIndex = columnToIndex_(APPROVAL_COLUMN_BY_EMAIL["mis01@ntwoods.com"]); // BF -> 58
  var maxCol = Math.max(
    approvalIndex,
    COLUMN_INDEX.orderId,
    COLUMN_INDEX.ar,
    COLUMN_INDEX.aq
  );

  var data = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();

  var idxOrderId = COLUMN_INDEX.orderId - 1;
  var idxAQ = COLUMN_INDEX.aq - 1;
  var idxAR = COLUMN_INDEX.ar - 1;
  var idxApproval = approvalIndex - 1;

  var count = 0;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];

    var orderId = normalizeCell_(row[idxOrderId]);
    if (!orderId) continue;

    var aq = normalizeCell_(row[idxAQ]);
    var ar = normalizeCell_(row[idxAR]);
    var approvalsValue = normalizeCell_(row[idxApproval]);

    var segments = buildSegments_(aq, ar);
    var approvals = splitApprovals_(approvalsValue);

    var pendingIndex = findPendingSegmentIndex_(segments, approvals);
    if (pendingIndex === null) continue;

    count++;
  }

  return { ok: true, count: count };
}

// --------------------
// OPTIMIZED: listEligible_
// - reads only from row 2
// - reads only upto max required column (not always 59)
// - avoids repeated index math inside loop
// --------------------
function listEligible_(e) {
  var idToken = requireParam_(e, "id_token");
  var auth = verifyToken_(idToken);

  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, email: auth.email, items: [] };

  var approvalIndex = approvalColumnIndex_(auth.email);

  // read only needed columns (continuous range upto max)
  var maxCol = Math.max(
    approvalIndex,
    COLUMN_INDEX.orderId,
    COLUMN_INDEX.ar,
    COLUMN_INDEX.aq,
    COLUMN_INDEX.crm,
    COLUMN_INDEX.location,
    COLUMN_INDEX.marketingPerson,
    COLUMN_INDEX.dealerName
  );

  // start from row 2 (skip header row)
  var data = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();
  var items = [];

  // precompute 0-based indexes (micro-optimizations add up on large sheets)
  var idxOrderId = COLUMN_INDEX.orderId - 1;
  var idxAQ = COLUMN_INDEX.aq - 1;
  var idxAR = COLUMN_INDEX.ar - 1;
  var idxDealer = COLUMN_INDEX.dealerName - 1;
  var idxMkt = COLUMN_INDEX.marketingPerson - 1;
  var idxLoc = COLUMN_INDEX.location - 1;
  var idxCrm = COLUMN_INDEX.crm - 1;
  var idxApproval = approvalIndex - 1;

  for (var i = 0; i < data.length; i++) {
    var row = data[i];

    var orderId = normalizeCell_(row[idxOrderId]);
    if (!orderId) continue;

    var aq = normalizeCell_(row[idxAQ]);
    var ar = normalizeCell_(row[idxAR]);
    var approvalsValue = normalizeCell_(row[idxApproval]);

    var segments = buildSegments_(aq, ar);
    var approvals = splitApprovals_(approvalsValue);

    var pendingIndex = findPendingSegmentIndex_(segments, approvals);
    if (pendingIndex === null) continue;

    var segmentDocs = parseDocs_(segments[pendingIndex]);
    var segmentLabel = pendingIndex === 0 ? "Final" : "Additional-" + pendingIndex;

    items.push({
      orderId: orderId,
      dealerName: normalizeCell_(row[idxDealer]),
      marketingPerson: normalizeCell_(row[idxMkt]),
      location: normalizeCell_(row[idxLoc]),
      crm: normalizeCell_(row[idxCrm]),
      segmentIndex: pendingIndex,
      segmentLabel: segmentLabel,
      docs: segmentDocs,
      raw: { aq: aq, ar: ar, approvals: approvalsValue }
    });
  }

  return { ok: true, email: auth.email, items: items };
}

// --------------------
// OPTIMIZED: markChecked_
// - uses TextFinder instead of reading whole OrderId column
// --------------------
function markChecked_(e) {
  var idToken = requireParam_(e, "id_token");
  var orderId = normalizeCell_(requireParam_(e, "orderId"));
  var segmentIndexParam = requireParam_(e, "segmentIndex");
  var files = getFiles_(e);

  var segmentIndex = parseInt(segmentIndexParam, 10);
  if (isNaN(segmentIndex) || segmentIndex < 0) throw new Error("Invalid segmentIndex");
  if (!files || !files.length) throw new Error("Attachment required");

  var auth = verifyToken_(idToken);
  var approvalColumn = approvalColumnIndex_(auth.email);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error("No data available");

    // FAST find: no full column read
    var finder = sheet
      .getRange(2, COLUMN_INDEX.orderId, lastRow - 1, 1)
      .createTextFinder(orderId)
      .matchEntireCell(true)
      .findNext();

    if (!finder) throw new Error("Order ID not found");

    var rowIndex = finder.getRow();

    var approvalCell = sheet.getRange(rowIndex, approvalColumn);
    var approvalValue = normalizeCell_(approvalCell.getValue());
    var approvals = splitApprovals_(approvalValue);

    while (approvals.length <= segmentIndex) approvals.push("");
    approvals[segmentIndex] = "Yes";

    var attachmentUrls = saveAttachments_(orderId, files);
    appendAttachmentUrls_(sheet, rowIndex, attachmentUrls);

    var updated = approvals.join(" | ");
    approvalCell.setValue(updated);

    logAction_(auth.email, orderId, segmentIndex);

    return { ok: true, updatedApprovals: updated };
  } finally {
    lock.releaseLock();
  }
}

// --------------------
// OPTIMIZED: verifyToken_
// - caches verified token -> email for short TTL
// - removes repeated UrlFetch tokeninfo calls
// --------------------
function verifyToken_(idToken) {
  idToken = normalizeCell_(idToken);
  if (!idToken) throw new Error("Unauthorized: invalid token");

  var cache = CacheService.getScriptCache();
  var key = "tok:" + hashKey_(idToken);
  var cached = cache.get(key);

  if (cached) {
    var obj = JSON.parse(cached);
    if (obj && obj.email && APPROVAL_COLUMN_BY_EMAIL[obj.email]) {
      return { email: obj.email };
    }
  }

  var response = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );

  if (response.getResponseCode() !== 200) throw new Error("Unauthorized: invalid token");

  var payload = JSON.parse(response.getContentText());
  if (payload.aud !== CLIENT_ID) throw new Error("Unauthorized: invalid audience");

  var email = payload.email;
  if (!APPROVAL_COLUMN_BY_EMAIL[email]) throw new Error("Unauthorized: invalid user");

  // TTL: 5 minutes default (safe + huge perf win)
  // If exp available, keep TTL bounded within token life.
  var ttl = 300;
  var nowSec = Math.floor(Date.now() / 1000);
  if (payload.exp) {
    var expSec = parseInt(payload.exp, 10);
    if (!isNaN(expSec)) {
      ttl = Math.max(60, Math.min(ttl, expSec - nowSec - 10));
    }
  }
  cache.put(key, JSON.stringify({ email: email }), ttl);

  return { email: email };
}

// --------------------
// Spreadsheet getters (cached per execution)
// --------------------
function getSpreadsheet_() {
  if (__ss) return __ss;
  __ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return __ss;
}

function getSheet_() {
  if (__sheet) return __sheet;
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error("Sheet not found: " + SHEET_NAME);
  __sheet = sheet;
  return sheet;
}

function getLogSheet_() {
  if (__logSheet) return __logSheet;

  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName("Logs");
  if (!sh) {
    sh = ss.insertSheet("Logs");
    sh.getRange(1, 1, 1, 5).setValues([["timestamp", "email", "orderId", "segmentIndex", "segmentLabel"]]);
  }
  __logSheet = sh;
  return sh;
}

// --------------------
// Helpers (same logic)
// --------------------
function approvalColumnIndex_(email) {
  var column = APPROVAL_COLUMN_BY_EMAIL[email];
  if (!column) throw new Error("Unauthorized: invalid user");
  return columnToIndex_(column);
}

function columnToIndex_(column) {
  var letters = column.toUpperCase();
  var sum = 0;
  for (var i = 0; i < letters.length; i++) {
    sum = sum * 26 + (letters.charCodeAt(i) - 64);
  }
  return sum;
}

function normalizeCell_(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function buildSegments_(aq, ar) {
  var segments = [];
  segments[0] = aq || "";

  var groups = [];
  if (ar) {
    var rawGroups = ar.split(";");
    for (var i = 0; i < rawGroups.length; i++) {
      var group = normalizeCell_(rawGroups[i]);
      if (group) groups.push(group);
    }
  }

  if (groups.length > MAX_ADDITIONAL_ORDERS) groups = groups.slice(0, MAX_ADDITIONAL_ORDERS);

  for (var j = 0; j < groups.length; j++) segments[j + 1] = groups[j];
  return segments;
}

function splitApprovals_(value) {
  if (!value) return [];
  var parts = value.split("|");
  var approvals = [];
  for (var i = 0; i < parts.length; i++) approvals.push(normalizeCell_(parts[i]));
  return approvals;
}

function findPendingSegmentIndex_(segments, approvals) {
  for (var i = 0; i < segments.length; i++) {
    var segment = normalizeCell_(segments[i]);
    if (!segment) continue;
    if (approvals[i] !== "Yes") return i;
  }
  return null;
}

function isHttpUrl_(value) {
  return /^https?:\/\//i.test(value);
}

function parseDocs_(segment) {
  if (!segment) return [];

  var parts = segment.split(",");
  var docs = [];

  for (var i = 0; i < parts.length; i++) {
    var doc = normalizeCell_(parts[i]);
    if (!doc) continue;

    var lower = doc.toLowerCase();
    if (lower === "na" || lower === "n/a" || lower === "-" || lower === "none" || lower === "null") continue;

    if (isHttpUrl_(doc)) docs.push(doc);
  }
  return docs;
}

// OPTIMIZED logging: no appendRow
function logAction_(email, orderId, segmentIndex) {
  var logSheet = getLogSheet_();
  var label = segmentIndex === 0 ? "Final" : "Additional-" + segmentIndex;

  var nextRow = logSheet.getLastRow() + 1;
  logSheet.getRange(nextRow, 1, 1, 5).setValues([[new Date(), email, orderId, segmentIndex, label]]);
}

function createOutput_(callback, data) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService
      .createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function requireParam_(e, name) {
  var value = e && e.parameter && e.parameter[name];
  if (value === undefined || value === null || value === "") {
    throw new Error("Missing parameter: " + name);
  }
  return value;
}

function normalizeEvent_(e) {
  var merged = { parameter: {} };
  if (e && e.parameter) {
    for (var key in e.parameter) merged.parameter[key] = e.parameter[key];
  }

  if (e && e.postData && e.postData.contents) {
    var contentType = (e.postData.type || "").toLowerCase();
    if (contentType.indexOf("application/json") === 0 || contentType.indexOf("text/plain") === 0) {
      try {
        var body = JSON.parse(e.postData.contents);
        if (body && typeof body === "object") {
          for (var bodyKey in body) {
            if (bodyKey === "files") continue;
            merged.parameter[bodyKey] = body[bodyKey];
          }
          if (body.files) merged.files = body.files;
        }
      } catch (err) {
        // ignore JSON parse errors and fall back to query params
      }
    }
  }

  return merged;
}

function getFiles_(e) {
  if (e && e.files && e.files.length) return e.files;
  var filesValue = e && e.parameter && e.parameter.files;
  if (!filesValue) return [];
  if (typeof filesValue === "string") {
    try {
      var parsed = JSON.parse(filesValue);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }
  return Array.isArray(filesValue) ? filesValue : [];
}

function saveAttachments_(orderId, files) {
  var folder = getOrCreateFolder_(ATTACHMENTS_FOLDER_NAME);
  var urls = [];

  for (var i = 0; i < files.length; i++) {
    var blob = blobFromPayload_(files[i], orderId);
    if (!blob) continue;
    var created = folder.createFile(blob);
    urls.push(created.getUrl());
  }

  return urls;
}

function appendAttachmentUrls_(sheet, rowIndex, urls) {
  if (!urls || !urls.length) return;
  var cell = sheet.getRange(rowIndex, ATTACHMENTS_COLUMN);
  var existing = normalizeCell_(cell.getValue());
  var combined = existing ? existing + "," + urls.join(",") : urls.join(",");
  cell.setValue(combined);
}

function blobFromPayload_(file, orderId) {
  if (!file) return null;

  var name = normalizeCell_(file.name);
  if (!name) name = orderId + "_attachment_" + new Date().getTime();

  var data = file.data ? String(file.data) : "";
  if (!data) return null;

  var mimeType = normalizeCell_(file.type);
  var base64 = data;
  var match = data.match(/^data:([^;]+);base64,(.*)$/);
  if (match) {
    if (!mimeType) mimeType = match[1];
    base64 = match[2];
  }

  var bytes = Utilities.base64Decode(base64);
  return Utilities.newBlob(bytes, mimeType || undefined, name);
}

function getOrCreateFolder_(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

// Small helper to make CacheService key safe/short
function hashKey_(str) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str);
  return Utilities.base64EncodeWebSafe(raw).slice(0, 32);
}
