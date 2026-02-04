var SPREADSHEET_ID = "1WSQMXxEAWVqeSBcEiYPWZ8HAL5d9y0Rdcel6xupbTPI";
var SHEET_NAME = "OrderCycle";
var CLIENT_ID = "360849757137-agopfs0m8rgmcj541ucpg22btep5olt3.apps.googleusercontent.com";
var MAX_ADDITIONAL_ORDERS = 4;
var ATTACHMENTS_COLUMN = columnToIndex_("BH");
var ATTACHMENTS_FOLDER_NAME = "ApprovedSalesOrders";
var DASH_KEY = "EA_DASH_KEY_CHANGE_ME";

// Returned-by-EA markers (shared with StagingList manager portal)
var RETURN_STATE_HEADER = "EA_SEGMENT_STATE";
var RETURN_REMARK_HEADER = "EA_SEGMENT_REMARK";
var RETURNED_AT_HEADER = "EA_SEGMENT_RETURNED_AT";

var EA_SEGMENT_STATE = {
  RETURNED: "RETURNED_BY_EA",
  PENDING: "PENDING_EA_APPROVAL",
  APPROVED: "APPROVED_BY_EA"
};

// Used only for manager integration (segmentUrl computation)
var FINAL_URL_COLUMN = columnToIndex_("O");
var ADDITIONAL_URLS_COLUMN = columnToIndex_("AC");


// NOTE: mapping exactly same rakha hai (logic untouched)
var APPROVAL_COLUMN_BY_EMAIL = {
  // Primary EAs
  "ea01@ntwoods.com": "BF",
  "ea02@ntwoods.com": "BG",

  // Backward compatibility (older org email used in some deployments)
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
var __returnLogSheet = null;
var __headerColIndexCache = {};

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
      // so we need a token-less count function.
      // Optional: pass `email=ea01@...` or `email=ea02@...` to count for that EA.
      var countEmail = normalizeCell_(e && e.parameter && e.parameter.email);
      result = countEligible_(countEmail);
    } else if (action === "markChecked") {
      result = markChecked_(e);
    } else if (action === "returnToManager") {
      result = returnToManager_(e);
    } else if (action === "listReturnedForManager") {
      result = listReturnedForManager_(e);
    } else if (action === "clearReturnedForManager") {
      result = clearReturnedForManager_(e);
    } else {
      throw new Error("Unknown action");
    }
  } catch (err) {
    result = { ok: false, error: err && err.message ? err.message : String(err) };
  }

  return createOutput_(callback, result);
}

function countEligible_(email) {
  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, count: 0 };

  var approvalEmail = email && APPROVAL_COLUMN_BY_EMAIL[email] ? email : "ea01@ntwoods.com";
  if (!APPROVAL_COLUMN_BY_EMAIL[approvalEmail]) {
    // fallback (older deployments)
    approvalEmail = "mis01@ntwoods.com";
  }

  var approvalIndex = columnToIndex_(APPROVAL_COLUMN_BY_EMAIL[approvalEmail]);
  var returnCols = ensureReturnColumns_(sheet);
  var stateCol = returnCols.stateCol;

  var maxCol = Math.max(
    approvalIndex,
    COLUMN_INDEX.orderId,
    COLUMN_INDEX.ar,
    COLUMN_INDEX.aq
  );

  var data = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();
  var statesColValues = sheet.getRange(2, stateCol, lastRow - 1, 1).getValues();

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
    var statesValue = normalizeCell_(statesColValues[i][0]);

    var segments = buildSegments_(aq, ar);
    var approvals = splitApprovals_(approvalsValue);
    var states = splitPipe_(statesValue);

    var pendingIndex = findPendingSegmentIndex_(segments, approvals, states);
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
  var returnCols = ensureReturnColumns_(sheet);
  var stateCol = returnCols.stateCol;

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
  var statesColValues = sheet.getRange(2, stateCol, lastRow - 1, 1).getValues();
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
    var statesValue = normalizeCell_(statesColValues[i][0]);

    var segments = buildSegments_(aq, ar);
    var approvals = splitApprovals_(approvalsValue);
    var states = splitPipe_(statesValue);

    var pendingIndex = findPendingSegmentIndex_(segments, approvals, states);
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
      rowIndex: i + 2,
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
  var rowIndexParam = normalizeCell_(e && e.parameter && e.parameter.rowIndex);
  var files = getFiles_(e);

  var segmentIndex = parseInt(segmentIndexParam, 10);
  if (isNaN(segmentIndex) || segmentIndex < 0) throw new Error("Invalid segmentIndex");
  if (!files || !files.length) throw new Error("Attachment required");

  var auth = verifyToken_(idToken);
  var approvalColumn = approvalColumnIndex_(auth.email);

  var sheet = getSheet_();
  var returnCols = ensureReturnColumns_(sheet);
  var stateCol = returnCols.stateCol;
  var remarkCol = returnCols.remarkCol;
  var returnedAtCol = returnCols.returnedAtCol;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error("No data available");

    var rowIndex = null;
    if (rowIndexParam) {
      var parsedRowIndex = parseInt(rowIndexParam, 10);
      if (isNaN(parsedRowIndex) || parsedRowIndex < 2 || parsedRowIndex > lastRow) {
        throw new Error("Invalid rowIndex");
      }
      rowIndex = parsedRowIndex;
      var cellOrderId = normalizeCell_(sheet.getRange(rowIndex, COLUMN_INDEX.orderId).getValue());
      if (cellOrderId !== orderId) throw new Error("rowIndex does not match orderId");
    } else {
      // FAST find: no full column read
      var finder = sheet
        .getRange(2, COLUMN_INDEX.orderId, lastRow - 1, 1)
        .createTextFinder(orderId)
        .matchEntireCell(true)
        .findNext();

      if (!finder) throw new Error("Order ID not found");
      rowIndex = finder.getRow();
    }

    var approvalCell = sheet.getRange(rowIndex, approvalColumn);
    var approvalValue = normalizeCell_(approvalCell.getValue());
    var approvals = splitApprovals_(approvalValue);

    // Validate segment exists for this row (prevents approving arbitrary indexes).
    var aqAr = sheet.getRange(rowIndex, COLUMN_INDEX.aq, 1, 2).getValues()[0];
    var segments = buildSegments_(normalizeCell_(aqAr[0]), normalizeCell_(aqAr[1]));
    if (segmentIndex >= segments.length || !normalizeCell_(segments[segmentIndex])) {
      throw new Error("Invalid segmentIndex for this order");
    }

    while (approvals.length <= segmentIndex) approvals.push("");
    approvals[segmentIndex] = "Yes";

    var attachmentUrls = saveAttachments_(orderId, files);
    appendAttachmentUrls_(sheet, rowIndex, attachmentUrls);

    var updated = approvals.join(" | ");
    approvalCell.setValue(updated);

    // Clear return markers (if any) and mark approved state
    var states = splitPipe_(sheet.getRange(rowIndex, stateCol).getValue());
    var remarks = splitPipe_(sheet.getRange(rowIndex, remarkCol).getValue());
    var returnedAts = splitPipe_(sheet.getRange(rowIndex, returnedAtCol).getValue());

    while (states.length <= segmentIndex) states.push("");
    while (remarks.length <= segmentIndex) remarks.push("");
    while (returnedAts.length <= segmentIndex) returnedAts.push("");

    states[segmentIndex] = EA_SEGMENT_STATE.APPROVED;
    remarks[segmentIndex] = "";
    returnedAts[segmentIndex] = "";

    sheet.getRange(rowIndex, stateCol).setValue(joinPipe_(states));
    sheet.getRange(rowIndex, remarkCol).setValue(joinPipe_(remarks));
    sheet.getRange(rowIndex, returnedAtCol).setValue(joinPipe_(returnedAts));

    logAction_(auth.email, orderId, segmentIndex);

    return { ok: true, updatedApprovals: updated };
  } finally {
    lock.releaseLock();
  }
}

function returnToManager_(e) {
  var idToken = requireParam_(e, "id_token");
  var orderId = normalizeCell_(requireParam_(e, "orderId"));
  var segmentIndexParam = requireParam_(e, "segmentIndex");
  var rowIndexParam = normalizeCell_(e && e.parameter && e.parameter.rowIndex);
  var remark = normalizeCell_(requireParam_(e, "remark"));

  var segmentIndex = parseInt(segmentIndexParam, 10);
  if (isNaN(segmentIndex) || segmentIndex < 0) throw new Error("Invalid segmentIndex");
  if (!remark || remark.length < 5) throw new Error("Remark must be at least 5 characters");

  // Keep pipe-safe + bounded.
  remark = remark.replace(/\|/g, "/").slice(0, 180);

  var auth = verifyToken_(idToken);
  var approvalColumn = approvalColumnIndex_(auth.email);
  var sheet = getSheet_();
  var returnCols = ensureReturnColumns_(sheet);
  var stateCol = returnCols.stateCol;
  var remarkCol = returnCols.remarkCol;
  var returnedAtCol = returnCols.returnedAtCol;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) throw new Error("No data available");

    var rowIndex = null;
    if (rowIndexParam) {
      var parsedRowIndex = parseInt(rowIndexParam, 10);
      if (isNaN(parsedRowIndex) || parsedRowIndex < 2 || parsedRowIndex > lastRow) {
        throw new Error("Invalid rowIndex");
      }
      rowIndex = parsedRowIndex;
      var cellOrderId = normalizeCell_(sheet.getRange(rowIndex, COLUMN_INDEX.orderId).getValue());
      if (cellOrderId !== orderId) throw new Error("rowIndex does not match orderId");
    } else {
      var finder = sheet
        .getRange(2, COLUMN_INDEX.orderId, lastRow - 1, 1)
        .createTextFinder(orderId)
        .matchEntireCell(true)
        .findNext();

      if (!finder) throw new Error("Order ID not found");
      rowIndex = finder.getRow();
    }

    // Don't allow returning an already approved segment.
    var approvalValue = normalizeCell_(sheet.getRange(rowIndex, approvalColumn).getValue());
    var approvals = splitApprovals_(approvalValue);
    if (isApprovedYes_(approvals[segmentIndex])) throw new Error("Segment already approved");

    // Validate segment exists for this row.
    var aqAr = sheet.getRange(rowIndex, COLUMN_INDEX.aq, 1, 2).getValues()[0];
    var segments = buildSegments_(normalizeCell_(aqAr[0]), normalizeCell_(aqAr[1]));
    if (segmentIndex >= segments.length || !normalizeCell_(segments[segmentIndex])) {
      throw new Error("Invalid segmentIndex for this order");
    }

    var states = splitPipe_(sheet.getRange(rowIndex, stateCol).getValue());
    var remarks = splitPipe_(sheet.getRange(rowIndex, remarkCol).getValue());
    var returnedAts = splitPipe_(sheet.getRange(rowIndex, returnedAtCol).getValue());

    while (states.length <= segmentIndex) states.push("");
    while (remarks.length <= segmentIndex) remarks.push("");
    while (returnedAts.length <= segmentIndex) returnedAts.push("");

    states[segmentIndex] = EA_SEGMENT_STATE.RETURNED;
    remarks[segmentIndex] = remark;
    returnedAts[segmentIndex] = new Date().toISOString();

    sheet.getRange(rowIndex, stateCol).setValue(joinPipe_(states));
    sheet.getRange(rowIndex, remarkCol).setValue(joinPipe_(remarks));
    sheet.getRange(rowIndex, returnedAtCol).setValue(joinPipe_(returnedAts));
    SpreadsheetApp.flush();

    logAction_(auth.email, orderId, segmentIndex);
    logReturnTransition_(auth.email, orderId, segmentIndex, "", EA_SEGMENT_STATE.RETURNED, remark);

    return { ok: true };
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
  if (payload.email_verified !== undefined && String(payload.email_verified) !== "true") {
    throw new Error("Unauthorized: email not verified");
  }
  if (payload.iss && payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
    throw new Error("Unauthorized: invalid issuer");
  }

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

function getReturnLogSheet_() {
  if (__returnLogSheet) return __returnLogSheet;

  var ss = getSpreadsheet_();
  var sh = ss.getSheetByName("Stagging_Return_Log");
  if (!sh) {
    sh = ss.insertSheet("Stagging_Return_Log");
    sh
      .getRange(1, 1, 1, 7)
      .setValues([["timestamp", "actor", "orderId", "segmentIndex", "segmentLabel", "fromState", "toState"]]);
    sh.getRange(1, 8).setValue("remark");
  }
  __returnLogSheet = sh;
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

function splitPipe_(value) {
  if (!value) return [];
  var parts = String(value).split("|");
  var out = [];
  for (var i = 0; i < parts.length; i++) out.push(normalizeCell_(parts[i]));
  return out;
}

function joinPipe_(parts) {
  if (!parts || !parts.length) return "";
  var out = [];
  for (var i = 0; i < parts.length; i++) out.push(normalizeCell_(parts[i]));
  return out.join(" | ");
}

function isApprovedYes_(value) {
  value = normalizeCell_(value);
  if (!value) return false;
  return value.toLowerCase() === "yes";
}

function isReturnedState_(value) {
  return normalizeCell_(value) === EA_SEGMENT_STATE.RETURNED;
}

function isApprovedState_(value) {
  return normalizeCell_(value) === EA_SEGMENT_STATE.APPROVED;
}

function findPendingSegmentIndex_(segments, approvals, states) {
  states = states || [];

  for (var i = 0; i < segments.length; i++) {
    var segment = normalizeCell_(segments[i]);
    if (!segment) continue;

    // Returned segments should not appear for EA until the manager clears them.
    if (isReturnedState_(states[i])) continue;

    // Approved segments are handled.
    if (isApprovedYes_(approvals[i]) || isApprovedState_(states[i])) continue;

    return i;
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

function logReturnTransition_(actor, orderId, segmentIndex, fromState, toState, remark) {
  var sh = getReturnLogSheet_();
  var label = segmentIndex === 0 ? "Final" : "Additional-" + segmentIndex;
  var nextRow = sh.getLastRow() + 1;
  sh
    .getRange(nextRow, 1, 1, 8)
    .setValues([[new Date(), actor, orderId, segmentIndex, label, fromState || "", toState || "", remark || ""]]);
}

function findColumnIndexByHeader_(sheet, headerName) {
  var key = sheet.getSheetId() + ":" + headerName;
  if (__headerColIndexCache[key]) return __headerColIndexCache[key];

  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) lastCol = 1;

  var finder = sheet
    .getRange(1, 1, 1, lastCol)
    .createTextFinder(headerName)
    .matchEntireCell(true)
    .findNext();

  if (!finder) return null;
  __headerColIndexCache[key] = finder.getColumn();
  return __headerColIndexCache[key];
}

function ensureReturnColumns_(sheet) {
  var stateCol = findColumnIndexByHeader_(sheet, RETURN_STATE_HEADER);
  var remarkCol = findColumnIndexByHeader_(sheet, RETURN_REMARK_HEADER);
  var returnedAtCol = findColumnIndexByHeader_(sheet, RETURNED_AT_HEADER);

  if (stateCol && remarkCol && returnedAtCol) {
    return { stateCol: stateCol, remarkCol: remarkCol, returnedAtCol: returnedAtCol };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    // Re-check under lock.
    stateCol = findColumnIndexByHeader_(sheet, RETURN_STATE_HEADER);
    remarkCol = findColumnIndexByHeader_(sheet, RETURN_REMARK_HEADER);
    returnedAtCol = findColumnIndexByHeader_(sheet, RETURNED_AT_HEADER);

    if (!stateCol) {
      stateCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, stateCol).setValue(RETURN_STATE_HEADER);
      __headerColIndexCache[sheet.getSheetId() + ":" + RETURN_STATE_HEADER] = stateCol;
    }

    if (!remarkCol) {
      remarkCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, remarkCol).setValue(RETURN_REMARK_HEADER);
      __headerColIndexCache[sheet.getSheetId() + ":" + RETURN_REMARK_HEADER] = remarkCol;
    }

    if (!returnedAtCol) {
      returnedAtCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, returnedAtCol).setValue(RETURNED_AT_HEADER);
      __headerColIndexCache[sheet.getSheetId() + ":" + RETURNED_AT_HEADER] = returnedAtCol;
    }

    return { stateCol: stateCol, remarkCol: remarkCol, returnedAtCol: returnedAtCol };
  } finally {
    lock.releaseLock();
  }
}

function listReturnedForManager_(e) {
  var key = (e && e.parameter && e.parameter.key) || "";
  if (!key || String(key).trim() !== DASH_KEY) {
    throw new Error("Access denied");
  }

  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, items: [] };

  var returnCols = ensureReturnColumns_(sheet);
  var stateCol = returnCols.stateCol;
  var remarkCol = returnCols.remarkCol;
  var returnedAtCol = returnCols.returnedAtCol;

  var maxCol = Math.max(
    COLUMN_INDEX.orderId,
    COLUMN_INDEX.crm,
    COLUMN_INDEX.location,
    COLUMN_INDEX.marketingPerson,
    COLUMN_INDEX.dealerName,
    FINAL_URL_COLUMN,
    ADDITIONAL_URLS_COLUMN
  );

  var data = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();
  var statesColValues = sheet.getRange(2, stateCol, lastRow - 1, 1).getValues();
  var remarksColValues = sheet.getRange(2, remarkCol, lastRow - 1, 1).getValues();
  var returnedAtColValues = sheet.getRange(2, returnedAtCol, lastRow - 1, 1).getValues();

  var idxOrderId = COLUMN_INDEX.orderId - 1;
  var idxDealer = COLUMN_INDEX.dealerName - 1;
  var idxMkt = COLUMN_INDEX.marketingPerson - 1;
  var idxLoc = COLUMN_INDEX.location - 1;
  var idxCrm = COLUMN_INDEX.crm - 1;
  var idxFinalUrl = FINAL_URL_COLUMN - 1;
  var idxAdditionalUrls = ADDITIONAL_URLS_COLUMN - 1;

  var items = [];

  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    var orderId = normalizeCell_(row[idxOrderId]);
    if (!orderId) continue;

    var states = splitPipe_(normalizeCell_(statesColValues[i][0]));
    if (!states.length) continue;

    var remarks = splitPipe_(normalizeCell_(remarksColValues[i][0]));
    var returnedAts = splitPipe_(normalizeCell_(returnedAtColValues[i][0]));

    var finalUrl = normalizeCell_(row[idxFinalUrl]);
    var additionalUrls = splitCsv_(normalizeCell_(row[idxAdditionalUrls]));

    for (var s = 0; s < states.length; s++) {
      if (!isReturnedState_(states[s])) continue;

      var segmentIndex = s;
      var segmentLabel = segmentIndex === 0 ? "Final" : "Additional-" + segmentIndex;
      var segmentUrl =
        segmentIndex === 0
          ? finalUrl
          : normalizeCell_(additionalUrls[segmentIndex - 1]);

      items.push({
        orderId: orderId,
        dealerName: normalizeCell_(row[idxDealer]),
        marketingPerson: normalizeCell_(row[idxMkt]),
        location: normalizeCell_(row[idxLoc]),
        crm: normalizeCell_(row[idxCrm]),
        segmentIndex: segmentIndex,
        segmentLabel: segmentLabel,
        segmentUrl: segmentUrl,
        remark: normalizeCell_((remarks && remarks[s]) || ""),
        returnedAt: normalizeCell_((returnedAts && returnedAts[s]) || ""),
        rowIndex: i + 2
      });
    }
  }

  return { ok: true, items: items };
}

function clearReturnedForManager_(e) {
  var key = (e && e.parameter && e.parameter.key) || "";
  if (!key || String(key).trim() !== DASH_KEY) {
    throw new Error("Access denied");
  }

  var orderId = normalizeCell_(requireParam_(e, "orderId"));
  var segmentIndexParam = normalizeCell_(e && e.parameter && e.parameter.segmentIndex);
  var segmentUrl = normalizeCell_(e && e.parameter && e.parameter.segmentUrl);

  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error("No data available");

  var returnCols = ensureReturnColumns_(sheet);
  var stateCol = returnCols.stateCol;
  var remarkCol = returnCols.remarkCol;
  var returnedAtCol = returnCols.returnedAtCol;

  var segmentIndex = null;
  if (segmentIndexParam) {
    var parsed = parseInt(segmentIndexParam, 10);
    if (!isNaN(parsed) && parsed >= 0) segmentIndex = parsed;
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var finder = sheet
      .getRange(2, COLUMN_INDEX.orderId, lastRow - 1, 1)
      .createTextFinder(orderId)
      .matchEntireCell(true)
      .findNext();

    if (!finder) throw new Error("Order ID not found");
    var rowIndex = finder.getRow();

    if (segmentIndex === null) {
      if (!segmentUrl) throw new Error("Missing segmentIndex or segmentUrl");

      var finalUrl = normalizeCell_(sheet.getRange(rowIndex, FINAL_URL_COLUMN).getValue());
      if (finalUrl && finalUrl === segmentUrl) {
        segmentIndex = 0;
      } else {
        var additionalUrls = splitCsv_(normalizeCell_(sheet.getRange(rowIndex, ADDITIONAL_URLS_COLUMN).getValue()));
        var pos = -1;
        for (var i = 0; i < additionalUrls.length; i++) {
          if (normalizeCell_(additionalUrls[i]) === segmentUrl) {
            pos = i;
            break;
          }
        }
        if (pos === -1) throw new Error("segmentUrl not found for order");
        segmentIndex = pos + 1;
      }
    }

    var states = splitPipe_(sheet.getRange(rowIndex, stateCol).getValue());
    var remarks = splitPipe_(sheet.getRange(rowIndex, remarkCol).getValue());
    var returnedAts = splitPipe_(sheet.getRange(rowIndex, returnedAtCol).getValue());

    while (states.length <= segmentIndex) states.push("");
    while (remarks.length <= segmentIndex) remarks.push("");
    while (returnedAts.length <= segmentIndex) returnedAts.push("");

    if (!isReturnedState_(states[segmentIndex])) {
      return { ok: true, cleared: false };
    }

    var fromState = states[segmentIndex];
    states[segmentIndex] = EA_SEGMENT_STATE.PENDING;
    remarks[segmentIndex] = "";
    returnedAts[segmentIndex] = "";

    sheet.getRange(rowIndex, stateCol).setValue(joinPipe_(states));
    sheet.getRange(rowIndex, remarkCol).setValue(joinPipe_(remarks));
    sheet.getRange(rowIndex, returnedAtCol).setValue(joinPipe_(returnedAts));
    SpreadsheetApp.flush();

    logReturnTransition_("manager", orderId, segmentIndex, fromState, EA_SEGMENT_STATE.PENDING, "");

    return { ok: true, cleared: true };
  } finally {
    lock.releaseLock();
  }
}

function splitCsv_(value) {
  if (!value) return [];
  var parts = String(value).split(",");
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var v = normalizeCell_(parts[i]);
    if (v) out.push(v);
  }
  return out;
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
        // If it's not JSON, it might be URL-encoded (some browsers send URLSearchParams as text/plain in no-cors).
        var parsed = parseUrlEncoded_(e.postData.contents);
        if (parsed) {
          for (var k in parsed) {
            if (k === "files") continue;
            merged.parameter[k] = parsed[k];
          }
        }
      }
    } else if (contentType.indexOf("application/x-www-form-urlencoded") === 0) {
      var parsedForm = parseUrlEncoded_(e.postData.contents);
      if (parsedForm) {
        for (var fk in parsedForm) {
          if (fk === "files") continue;
          merged.parameter[fk] = parsedForm[fk];
        }
      }
    }
  }

  return merged;
}

function parseUrlEncoded_(contents) {
  contents = String(contents || "").trim();
  if (!contents) return null;
  // Reject obvious JSON to avoid accidental parsing.
  if (contents[0] === "{" || contents[0] === "[") return null;

  var out = {};
  var pairs = contents.split("&");
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    if (!pair) continue;
    var idx = pair.indexOf("=");
    var rawKey = idx >= 0 ? pair.slice(0, idx) : pair;
    var rawVal = idx >= 0 ? pair.slice(idx + 1) : "";

    // application/x-www-form-urlencoded uses '+' for spaces.
    rawKey = rawKey.replace(/\+/g, " ");
    rawVal = rawVal.replace(/\+/g, " ");

    var key = "";
    var val = "";
    try {
      key = decodeURIComponent(rawKey);
      val = decodeURIComponent(rawVal);
    } catch (e) {
      // Skip malformed pairs.
      continue;
    }
    if (!key) continue;
    out[key] = val;
  }
  return out;
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
