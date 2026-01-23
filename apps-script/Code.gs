var SPREADSHEET_ID = "1WSQMXxEAWVqeSBcEiYPWZ8HAL5d9y0Rdcel6xupbTPI";
var SHEET_NAME = "OrderCycle";
var CLIENT_ID = "360849757137-agopfs0m8rgmcj541ucpg22btep5olt3.apps.googleusercontent.com";

var APPROVAL_COLUMN_BY_EMAIL = {
  "ea01@ntwoods.com": "BF",
  "ea02@ntwoods.com": "BG"
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

function doGet(e) {
  return handleRequest_(e);
}

function doPost(e) {
  return handleRequest_(e);
}

function handleRequest_(e) {
  var action = (e && e.parameter && e.parameter.action) || "";
  var callback = e && e.parameter && e.parameter.callback;

  var result;
  try {
    if (action === "listEligible") {
      result = listEligible_(e);
    } else if (action === "markChecked") {
      result = markChecked_(e);
    } else {
      throw new Error("Unknown action");
    }
  } catch (err) {
    result = {
      ok: false,
      error: err && err.message ? err.message : String(err)
    };
  }

  return createOutput_(callback, result);
}

function listEligible_(e) {
  var idToken = requireParam_(e, "id_token");
  var auth = verifyToken_(idToken);

  var sheet = getSheet_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, email: auth.email, items: [] };
  }

  var data = sheet.getRange(1, 1, lastRow, COLUMN_INDEX.ea02).getValues();
  var items = [];
  var approvalIndex = approvalColumnIndex_(auth.email);

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var orderId = normalizeCell_(row[COLUMN_INDEX.orderId - 1]);
    if (!orderId) {
      continue;
    }

    var aq = normalizeCell_(row[COLUMN_INDEX.aq - 1]);
    var ar = normalizeCell_(row[COLUMN_INDEX.ar - 1]);
    var approvalsValue = normalizeCell_(row[approvalIndex - 1]);

    var segments = buildSegments_(aq, ar);
    var approvals = splitApprovals_(approvalsValue);

    var pendingIndex = findPendingSegmentIndex_(segments, approvals);
    if (pendingIndex === null) {
      continue;
    }

    var segmentDocs = parseDocs_(segments[pendingIndex]);
    var segmentLabel = pendingIndex === 0 ? "Final" : "Additional-" + pendingIndex;

    items.push({
      rowIndex: i + 1,
      orderId: orderId,
      dealerName: normalizeCell_(row[COLUMN_INDEX.dealerName - 1]),
      marketingPerson: normalizeCell_(row[COLUMN_INDEX.marketingPerson - 1]),
      location: normalizeCell_(row[COLUMN_INDEX.location - 1]),
      crm: normalizeCell_(row[COLUMN_INDEX.crm - 1]),
      segmentIndex: pendingIndex,
      segmentLabel: segmentLabel,
      docs: segmentDocs,
      raw: {
        aq: aq,
        ar: ar,
        approvals: approvalsValue
      }
    });
  }

  return { ok: true, email: auth.email, items: items };
}

function markChecked_(e) {
  var idToken = requireParam_(e, "id_token");
  var orderId = requireParam_(e, "orderId");
  var segmentIndexParam = requireParam_(e, "segmentIndex");
  var rowIndexParam = e && e.parameter && e.parameter.rowIndex;
  var segmentIndex = parseInt(segmentIndexParam, 10);
  if (isNaN(segmentIndex) || segmentIndex < 0) {
    throw new Error("Invalid segmentIndex");
  }

  var auth = verifyToken_(idToken);
  var approvalColumn = approvalColumnIndex_(auth.email);

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);

  try {
    var sheet = getSheet_();
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      throw new Error("No data available");
    }

    var rowIndex = rowIndexParam ? parseInt(rowIndexParam, 10) : null;
    var maxColumn = Math.max(COLUMN_INDEX.orderId, COLUMN_INDEX.ar, approvalColumn);

    if (rowIndex !== null) {
      if (isNaN(rowIndex) || rowIndex < 2 || rowIndex > lastRow) {
        rowIndex = null;
      } else {
        var rowValues = sheet.getRange(rowIndex, 1, 1, maxColumn).getValues()[0];
        var rowOrderId = normalizeCell_(rowValues[COLUMN_INDEX.orderId - 1]);
        if (rowOrderId !== orderId) {
          rowIndex = null;
        }
      }
    }

    if (rowIndex === null) {
      var data = sheet.getRange(2, 1, lastRow - 1, maxColumn).getValues();
      for (var i = 0; i < data.length; i++) {
        var row = data[i];
        var rowOrderId = normalizeCell_(row[COLUMN_INDEX.orderId - 1]);
        if (!rowOrderId || rowOrderId !== orderId) {
          continue;
        }

        var aq = normalizeCell_(row[COLUMN_INDEX.aq - 1]);
        var ar = normalizeCell_(row[COLUMN_INDEX.ar - 1]);
        var approvalsValue = normalizeCell_(row[approvalColumn - 1]);

        var segments = buildSegments_(aq, ar);
        var approvals = splitApprovals_(approvalsValue);
        var pendingIndex = findPendingSegmentIndex_(segments, approvals);

        if (pendingIndex === segmentIndex) {
          rowIndex = i + 2;
          break;
        }
      }
    }

    if (rowIndex === null) {
      throw new Error("Order ID not found or segment already approved");
    }

    var approvalCell = sheet.getRange(rowIndex, approvalColumn);
    var approvalValue = normalizeCell_(approvalCell.getValue());
    var approvals = splitApprovals_(approvalValue);

    while (approvals.length <= segmentIndex) {
      approvals.push("");
    }

    approvals[segmentIndex] = "Yes";
    var updated = approvals.join(" | ");
    approvalCell.setValue(updated);

    logAction_(auth.email, orderId, segmentIndex);

    return { ok: true, updatedApprovals: updated };
  } finally {
    lock.releaseLock();
  }
}

function verifyToken_(idToken) {
  var response = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );

  if (response.getResponseCode() !== 200) {
    throw new Error("Unauthorized: invalid token");
  }

  var payload = JSON.parse(response.getContentText());
  if (payload.aud !== CLIENT_ID) {
    throw new Error("Unauthorized: invalid audience");
  }

  var email = payload.email;
  if (!APPROVAL_COLUMN_BY_EMAIL[email]) {
    throw new Error("Unauthorized: invalid user");
  }

  return { email: email };
}

function getSheet_() {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error("Sheet not found: " + SHEET_NAME);
  }
  return sheet;
}

function approvalColumnIndex_(email) {
  var column = APPROVAL_COLUMN_BY_EMAIL[email];
  if (!column) {
    throw new Error("Unauthorized: invalid user");
  }
  return columnToIndex_(column);
}

function columnToIndex_(column) {
  var letters = column.toUpperCase();
  var sum = 0;
  for (var i = 0; i < letters.length; i++) {
    sum *= 26;
    sum += letters.charCodeAt(i) - 64;
  }
  return sum;
}

function normalizeCell_(value) {
  if (value === null || value === undefined) {
    return "";
  }
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
      if (group) {
        groups.push(group);
      }
    }
  }

  for (var j = 0; j < groups.length; j++) {
    segments[j + 1] = groups[j];
  }

  return segments;
}

function splitApprovals_(value) {
  if (!value) {
    return [];
  }

  var parts = value.split("|");
  var approvals = [];
  for (var i = 0; i < parts.length; i++) {
    approvals.push(normalizeCell_(parts[i]));
  }
  return approvals;
}

function isApproved_(value) {
  return normalizeCell_(value).toLowerCase() === "yes";
}

function findPendingSegmentIndex_(segments, approvals) {
  for (var i = 0; i < segments.length; i++) {
    var docs = parseDocs_(segments[i]);
    if (!docs.length) {
      continue;
    }
    if (!isApproved_(approvals[i])) {
      return i;
    }
  }
  return null;
}

function parseDocs_(segment) {
  if (!segment) {
    return [];
  }

  var parts = segment.split(",");
  var docs = [];
  for (var i = 0; i < parts.length; i++) {
    var doc = normalizeCell_(parts[i]);
    if (doc) {
      docs.push(doc);
    }
  }
  return docs;
}

function logAction_(email, orderId, segmentIndex) {
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  var logSheet = spreadsheet.getSheetByName("Logs");
  if (!logSheet) {
    logSheet = spreadsheet.insertSheet("Logs");
    logSheet.appendRow(["timestamp", "email", "orderId", "segmentIndex", "segmentLabel"]);
  }

  var label = segmentIndex === 0 ? "Final" : "Additional-" + segmentIndex;
  logSheet.appendRow([new Date(), email, orderId, segmentIndex, label]);
}

function createOutput_(callback, data) {
  var json = JSON.stringify(data);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function requireParam_(e, name) {
  var value = e && e.parameter && e.parameter[name];
  if (!value) {
    throw new Error("Missing parameter: " + name);
  }
  return value;
}
