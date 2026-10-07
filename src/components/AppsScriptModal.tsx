import React, { useState } from 'react';
import { Copy, Check, ExternalLink, Code2, ShieldCheck, Database, Layers, FileSpreadsheet } from 'lucide-react';

interface AppsScriptModalProps {
  onOpenSheetModal?: () => void;
}

export const AppsScriptModal: React.FC<AppsScriptModalProps> = ({ onOpenSheetModal }) => {
  const [copied, setCopied] = useState(false);

  const appsScriptCode = `/**
 * EBONY HOLDINGS - APPAREL PRODUCTION WEB APP & GOOGLE SHEETS BACKEND (Code.gs)
 * Integrated Shift Log, Factory-Locked Authentication, Proportional Hour Engine & Executive Dashboard
 */

var MASTER_SHEET_NAME = "Final Data Set"; // Primary sheet tab name
var USERS_SHEET_NAME = "Users";
var DOWNTIME_SHEET_NAME = "Downtime_Logs"; // Downtime category tracking sheet tab name

function getSpreadsheet(spreadsheetId) {
  var ss = null;
  if (spreadsheetId) {
    try { ss = SpreadsheetApp.openById(spreadsheetId); } catch (e) {}
  }
  if (!ss) {
    try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) {}
  }
  return ss;
}

function getMasterSheet(ss) {
  if (!ss) return null;
  var candidateNames = [MASTER_SHEET_NAME, "Final Data Set", "Master Data", "Sheet1", "Sheet 1", "Data"];
  for (var i = 0; i < candidateNames.length; i++) {
    var s = ss.getSheetByName(candidateNames[i]);
    if (s) return s;
  }
  var allSheets = ss.getSheets();
  if (allSheets && allSheets.length > 0) {
    return allSheets[0];
  }
  return ss.insertSheet(MASTER_SHEET_NAME);
}

function getDowntimeSheet(ss) {
  if (!ss) return null;
  var s = ss.getSheetByName(DOWNTIME_SHEET_NAME);
  if (s) return s;
  var candidateNames = ["Downtime_Logs", "Downtime Logs", "Downtime", "Down Time", "DowntimeBreakdown"];
  for (var i = 0; i < candidateNames.length; i++) {
    var cand = ss.getSheetByName(candidateNames[i]);
    if (cand) return cand;
  }
  var newSheet = ss.insertSheet(DOWNTIME_SHEET_NAME);
  newSheet.appendRow([
    "Downtime_ID",
    "Entry_ID",
    "Date",
    "Factory",
    "Line",
    "Supervisor",
    "Product",
    "Brand",
    "Style",
    "Down_Time_Minutes",
    "Down_Time_Category",
    "Category_Code",
    "Remarks",
    "User",
    "Timestamp"
  ]);
  return newSheet;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "";
  
  if (action === "TEST") {
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Connected successfully to Google Sheet Web App!" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action === "GET_ALL_LOGS") {
    var spId = (e && e.parameter && e.parameter.spreadsheetId) || "";
    return ContentService.createTextOutput(JSON.stringify(getAllLogs(spId)))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (action === "GET_DOWNTIME_LOGS") {
    var spId2 = (e && e.parameter && e.parameter.spreadsheetId) || "";
    return ContentService.createTextOutput(JSON.stringify(getDowntimeLogs(spId2)))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify(getAllLogs()))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
  } catch (lockErr) {
    // continue
  }
  
  try {
    var contents = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    var data = JSON.parse(contents);

    if (data.action === "TEST_WRITE" || data.action === "TEST") {
      var testSS = getSpreadsheet(data.spreadsheetId);
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Write test verified! Connected to spreadsheet: " + (testSS ? testSS.getName() : "Active Sheet")
      })).setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "GET_ALL_LOGS") {
      return ContentService.createTextOutput(JSON.stringify(getAllLogs(data.spreadsheetId)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "GET_DOWNTIME_LOGS") {
      return ContentService.createTextOutput(JSON.stringify(getDowntimeLogs(data.spreadsheetId)))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    if (data.action === "SUBMIT_LOGS" && Array.isArray(data.records)) {
      return ContentService.createTextOutput(JSON.stringify(appendProductionLogs(data.records, data.user, data.spreadsheetId)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "SUBMIT_DOWNTIME_LOGS" && Array.isArray(data.records)) {
      return ContentService.createTextOutput(JSON.stringify(appendDowntimeLogs(data.records, data.spreadsheetId)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "DELETE_LOGS") {
      return ContentService.createTextOutput(JSON.stringify(deleteProductionLogs(data, data.spreadsheetId)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "UPDATE_LOG" || data.action === "EDIT_LOG") {
      return ContentService.createTextOutput(JSON.stringify(updateProductionLog(data.record || data.log, data.spreadsheetId)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "LOGIN") {
      return ContentService.createTextOutput(JSON.stringify(loginUser(data.username, data.password, data.spreadsheetId)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (data.action === "REGISTER") {
      return ContentService.createTextOutput(JSON.stringify(registerUser(data, data.spreadsheetId)))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Unknown action" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

/**
 * 22 MASTER COLUMNS:
 * 1. Entry_ID, 2. Timestamp, 3. Date, 4. Factory, 5. Line, 6. Line_No,
 * 7. Supervisor, 8. Style, 9. Product, 10. Brand, 11. SMV, 12. Planned_QTY,
 * 13. Actual_QTY, 14. Produced_Minutes, 15. Plan_TMs, 16. Actual_TMs,
 * 17. Present_TMs, 18. Hours_Worked, 19. Worked_Minutes, 20. Down_Time,
 * 21. Remarks, 22. User
 */
function appendProductionLogs(records, user, spreadsheetId) {
  var ss = getSpreadsheet(spreadsheetId);
  if (!ss) {
    return {
      status: "error",
      message: "Spreadsheet not found. Please open your Google Sheet and click Extensions > Apps Script to create the script directly inside your sheet."
    };
  }
  
  var sheet = getMasterSheet(ss);
  if (!sheet) {
    return { status: "error", message: "Could not access or create target sheet tab." };
  }

  // Auto-initialize 22-column header row if sheet is brand new / empty
  if (sheet.getLastRow() === 0) {
    sheet.appendRow([
      "Entry_ID", "Timestamp", "Date", "Factory", "Line", "Line_No",
      "Supervisor", "Style", "Product", "Brand", "SMV", "Planned_QTY",
      "Actual_QTY", "Produced_Minutes", "Plan_TMs", "Actual_TMs",
      "Present_TMs", "Hours_Worked", "Worked_Minutes", "Down_Time",
      "Remarks", "User"
    ]);
  }

  var timestamp = Utilities.formatDate(new Date(), "GMT+5:30", "yyyy-MM-dd HH:mm:ss");
  var addedCount = 0;
  var entryIds = [];

  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var firstLetter = (r.Factory || "").charAt(0).toUpperCase();
    var rawLine = String(r.Line || "").trim();
    var lineNo = r.Line_No || (rawLine.toUpperCase().indexOf(firstLetter) === 0 ? rawLine.toUpperCase() : (firstLetter + rawLine));
    var actualQty = Number(r.Actual_QTY) || 0;
    var smv = Number(r.SMV) || 0;
    var prodMins = Math.round(actualQty * smv);
    var presentTMs = Number(r.Present_TMs) || 0;
    var hoursWorked = Number(r.Hours_Worked) || 0;
    var rawWorkedMins = Number(r.Worked_Minutes);
    // Use submitted Worked_Minutes (which includes Hours Adjustments: ± hours * 60)
    var workedMins = (!isNaN(rawWorkedMins) && rawWorkedMins >= 0)
      ? Number(rawWorkedMins.toFixed(2))
      : Number((presentTMs * hoursWorked * 60).toFixed(2));
    
    // Formula: Down_Time = Total Worked Minutes - (Actual Output Qty * SMV)
    var calculatedDownTime = Math.max(0, Math.round(workedMins - (actualQty * smv)));
    var finalDownTime = Number(r.Down_Time) >= 0 ? Number(r.Down_Time) : calculatedDownTime;
    var entryId = r.Entry_ID || ("EBH-" + Utilities.formatDate(new Date(), "GMT+5:30", "yyMMdd") + "-" + lineNo + "-" + (i + 1));

    var row = [
      entryId,
      r.Timestamp || timestamp,
      r.Date || "",
      r.Factory || "",
      r.Line || "",
      lineNo,
      r.Supervisor || "",
      r.Style || "",
      r.Product || "",
      r.Brand || "",
      smv,
      Number(r.Planned_QTY) || 0,
      actualQty,
      prodMins,
      Number(r.Plan_TMs) || 0,
      Number(r.Actual_TMs) || 0,
      presentTMs,
      hoursWorked,
      workedMins,
      finalDownTime,
      r.Remarks || "",
      user || r.User || "operator"
    ];

    // Optional Column 23: Hours_Adjustment (if column exists or provided)
    if (r.Hours_Adjustment !== undefined && !isNaN(Number(r.Hours_Adjustment))) {
      row.push(Number(r.Hours_Adjustment));
    }

    sheet.appendRow(row);
    addedCount++;
    entryIds.push(entryId);
  }

  return {
    status: "success",
    added: addedCount,
    entryIds: entryIds,
    timestamp: timestamp,
    sheetName: sheet.getName()
  };
}

function deleteProductionLogs(params, spreadsheetId) {
  var ss = getSpreadsheet(spreadsheetId);
  if (!ss) return { status: "error", message: "Spreadsheet not found" };
  var sheet = getMasterSheet(ss);
  if (!sheet) return { status: "error", message: "Sheet not found" };
  var values = sheet.getDataRange().getValues();
  if (!values || values.length <= 1) return { status: "success", deletedCount: 0 };

  var entryId = (params.entryId || "").trim();
  var startDate = (params.startDate || "").trim();
  var endDate = (params.endDate || "").trim();
  var factory = (params.factory || "ALL").trim();

  var deletedCount = 0;
  for (var r = values.length - 1; r >= 1; r--) {
    var row = values[r];
    var rEntryId = String(row[0] || "").trim();
    var rDate = row[2] instanceof Date ? Utilities.formatDate(row[2], "GMT+5:30", "yyyy-MM-dd") : String(row[2] || "").trim();
    var rFactory = String(row[3] || "").trim();

    var shouldDelete = false;
    if (entryId && rEntryId === entryId) {
      shouldDelete = true;
    } else if (startDate || endDate || (factory && factory !== "ALL")) {
      var inRange = (!startDate || rDate >= startDate) && (!endDate || rDate <= endDate);
      var inFactory = factory === "ALL" || rFactory.toLowerCase() === factory.toLowerCase();
      if (inRange && inFactory) {
        shouldDelete = true;
      }
    }

    if (shouldDelete) {
      sheet.deleteRow(r + 1);
      deletedCount++;
    }
  }
  return { status: "success", deletedCount: deletedCount, message: "Deleted " + deletedCount + " rows successfully." };
}

function updateProductionLog(record, spreadsheetId) {
  if (!record || !record.Entry_ID) return { status: "error", message: "Missing Entry_ID" };
  var ss = getSpreadsheet(spreadsheetId);
  if (!ss) return { status: "error", message: "Spreadsheet not found" };
  var sheet = getMasterSheet(ss);
  if (!sheet) return { status: "error", message: "Sheet not found" };
  var values = sheet.getDataRange().getValues();
  var entryId = String(record.Entry_ID).trim();

  for (var r = 1; r < values.length; r++) {
    if (String(values[r][0]).trim() === entryId) {
      var smv = Number(record.SMV) || Number(values[r][10]) || 0;
      var actQty = record.Actual_QTY !== undefined ? Number(record.Actual_QTY) : Number(values[r][12]);
      var prodMins = Math.round(actQty * smv);
      var presTMs = record.Present_TMs !== undefined ? Number(record.Present_TMs) : Number(values[r][16]);
      var hrs = record.Hours_Worked !== undefined ? Number(record.Hours_Worked) : Number(values[r][17]);
      var workedMins = Number((presTMs * hrs * 60).toFixed(2));
      var dt = record.Down_Time !== undefined ? Number(record.Down_Time) : Math.max(0, Math.round(workedMins - prodMins));

      var updatedRow = [
        entryId,
        record.Timestamp || values[r][1],
        record.Date || values[r][2],
        record.Factory || values[r][3],
        record.Line || values[r][4],
        record.Line_No || values[r][5],
        record.Supervisor !== undefined ? record.Supervisor : values[r][6],
        record.Style !== undefined ? record.Style : values[r][7],
        record.Product !== undefined ? record.Product : values[r][8],
        record.Brand !== undefined ? record.Brand : values[r][9],
        smv,
        record.Planned_QTY !== undefined ? Number(record.Planned_QTY) : Number(values[r][11]),
        actQty,
        prodMins,
        record.Plan_TMs !== undefined ? Number(record.Plan_TMs) : Number(values[r][14]),
        record.Actual_TMs !== undefined ? Number(record.Actual_TMs) : Number(values[r][15]),
        presTMs,
        hrs,
        workedMins,
        dt,
        record.Remarks !== undefined ? record.Remarks : values[r][20],
        record.User || values[r][21]
      ];
      sheet.getRange(r + 1, 1, 1, 22).setValues([updatedRow]);
      return { status: "success", message: "Log entry " + entryId + " updated in Google Sheet successfully.", entryId: entryId };
    }
  }
  return { status: "error", message: "Entry_ID " + entryId + " not found in sheet." };
}

function getAllLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(MASTER_SHEET_NAME);
  if (!sheet) {
    var allSheets = ss.getSheets();
    sheet = allSheets[0];
    for (var s = 0; s < allSheets.length; s++) {
      if (allSheets[s].getName().toLowerCase().indexOf("final") !== -1 || allSheets[s].getName().toLowerCase().indexOf("data") !== -1) {
        sheet = allSheets[s];
        break;
      }
    }
  }

  var values = sheet.getDataRange().getValues();
  if (!values || values.length <= 1) return { status: "success", logs: [] };

  var headers = values[0].map(function(h) {
    return String(h).toLowerCase().replace(/[\\s_-]/g, "");
  });

  function getCol(names, fallback) {
    for (var n = 0; n < names.length; n++) {
      var key = names[n].toLowerCase().replace(/[\\s_-]/g, "");
      var idx = headers.indexOf(key);
      if (idx !== -1) return idx;
    }
    return fallback;
  }

  var colEntry = getCol(["entryid", "id", "entry"], 0);
  var colTime = getCol(["timestamp", "time"], 1);
  var colDate = getCol(["date", "shiftdate"], 2);
  var colFactory = getCol(["factory", "plant"], 3);
  var colLine = getCol(["line", "sewingline"], 4);
  var colLineNo = getCol(["lineno", "linecode"], 5);
  var colSuper = getCol(["supervisor", "leader"], 6);
  var colStyle = getCol(["style", "styleno"], 7);
  var colProd = getCol(["product", "category"], 8);
  var colBrand = getCol(["brand", "customer"], 9);
  var colSmv = getCol(["smv", "sam"], 10);
  var colPlanQty = getCol(["plannedqty", "targetqty"], 11);
  var colActQty = getCol(["actualqty", "output"], 12);
  var colProdMins = getCol(["producedminutes", "producedmins"], 13);
  var colPlanTM = getCol(["plantms"], 14);
  var colActTM = getCol(["actualtms"], 15);
  var colPresTM = getCol(["presenttms"], 16);
  var colHours = getCol(["hoursworked", "shifthours"], 17);
  var colWorkedMins = getCol(["workedminutes"], 18);
  var colDownTime = getCol(["downtime", "losttime"], 19);
  var colRemarks = getCol(["remarks", "notes"], 20);
  var colUser = getCol(["user", "operator"], 21);

  var logs = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var rawDate = r[colDate];
    var rawFactory = r[colFactory];
    var rawStyle = r[colStyle];

    if (!rawDate && !rawFactory && !rawStyle) continue;

    var dStr = "";
    if (rawDate instanceof Date) {
      dStr = Utilities.formatDate(rawDate, "GMT+5:30", "yyyy-MM-dd");
    } else {
      dStr = String(rawDate || "").trim();
    }

    var factoryStr = String(rawFactory || "Kurunegala").trim();
    var actQ = Number(r[colActQty]) || 0;
    var smvVal = Number(r[colSmv]) || 0;
    var presTM = Number(r[colPresTM]) || 0;
    var hrs = Number(r[colHours]) || 9.0;
    var wMins = Number(r[colWorkedMins]) || Math.round(presTM * hrs * 60);
    var pMins = Number(r[colProdMins]) || Math.round(actQ * smvVal);
    var dtVal = Number(r[colDownTime]);
    if (isNaN(dtVal) || dtVal === 0) {
      dtVal = Math.max(0, Math.round(wMins - (actQ * smvVal)));
    }

    logs.push({
      Entry_ID: String(r[colEntry] || ("ENT-" + i)),
      Timestamp: String(r[colTime] || ""),
      Date: dStr,
      Factory: factoryStr,
      Line: String(r[colLine] || ""),
      Line_No: String(r[colLineNo] || ""),
      Supervisor: String(r[colSuper] || ""),
      Style: String(rawStyle || ""),
      Product: String(r[colProd] || ""),
      Brand: String(r[colBrand] || ""),
      SMV: smvVal,
      Planned_QTY: Number(r[colPlanQty]) || 0,
      Actual_QTY: actQ,
      Produced_Minutes: pMins,
      Plan_TMs: Number(r[colPlanTM]) || 0,
      Actual_TMs: Number(r[colActTM]) || 0,
      Present_TMs: presTM,
      Hours_Worked: hrs,
      Worked_Minutes: wMins,
      Down_Time: dtVal,
      Remarks: String(r[colRemarks] || ""),
      User: String(r[colUser] || "")
    });
  }
  return { status: "success", count: logs.length, logs: logs };
}

function loginUser(username, password) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var userSheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!userSheet) return { status: "error", message: "Users sheet tab not found" };

  var data = userSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === String(username).toLowerCase() && String(data[i][1]) === String(password)) {
      return {
        status: "success",
        user: {
          username: data[i][0],
          factory: data[i][2],
          fullName: data[i][3] || data[i][0]
        }
      };
    }
  }
  return { status: "error", message: "Invalid username or password" };
}

function registerUser(info) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var userSheet = ss.getSheetByName(USERS_SHEET_NAME);
  if (!userSheet) {
    userSheet = ss.insertSheet(USERS_SHEET_NAME);
    userSheet.appendRow(["Username", "Password", "Factory", "FullName", "RegisteredAt"]);
  }
  userSheet.appendRow([
    info.username,
    info.password,
    info.factory,
    info.fullName || info.username,
    new Date()
  ]);
  return { status: "success" };
}

function appendDowntimeLogs(records, spreadsheetId) {
  var ss = getSpreadsheet(spreadsheetId);
  if (!ss) return { status: "error", message: "Spreadsheet not accessible" };
  var dtSheet = getDowntimeSheet(ss);
  if (!dtSheet) return { status: "error", message: "Could not open or create Downtime_Logs sheet" };
  
  var now = new Date();
  var rowsToAppend = [];
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    rowsToAppend.push([
      r.id || ("DT-" + now.getTime() + "-" + i),
      r.entryId || r.Entry_ID || "",
      r.date || Utilities.formatDate(now, "GMT+5:30", "yyyy-MM-dd"),
      r.factory || "",
      r.line || "",
      r.supervisor || "",
      r.product || "",
      r.brand || "",
      r.style || "",
      Number(r.downtimeMinutes) || 0,
      r.downtimeCategory || "OTHER - Other",
      r.categoryCode || (r.downtimeCategory ? String(r.downtimeCategory).split(" ")[0] : "OTHER"),
      r.remarks || "",
      r.user || "operator",
      r.createdAt || Utilities.formatDate(now, "GMT+5:30", "yyyy-MM-dd HH:mm:ss")
    ]);
  }
  
  if (rowsToAppend.length > 0) {
    var startRow = dtSheet.getLastRow() + 1;
    dtSheet.getRange(startRow, 1, rowsToAppend.length, rowsToAppend[0].length).setValues(rowsToAppend);
  }
  
  return { status: "success", count: rowsToAppend.length, message: "Logged " + rowsToAppend.length + " downtime records successfully." };
}

function getDowntimeLogs(spreadsheetId) {
  var ss = getSpreadsheet(spreadsheetId);
  if (!ss) return { status: "error", message: "Spreadsheet not found" };
  var dtSheet = getDowntimeSheet(ss);
  if (!dtSheet) return { status: "success", downtimeLogs: [] };
  var data = dtSheet.getDataRange().getValues();
  if (!data || data.length <= 1) return { status: "success", downtimeLogs: [] };
  
  var logs = [];
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (!row[0] && !row[8]) continue;
    logs.push({
      id: String(row[0] || ("DT-" + i)),
      entryId: String(row[1] || ""),
      date: String(row[2] || ""),
      factory: String(row[3] || ""),
      line: String(row[4] || ""),
      supervisor: String(row[5] || ""),
      product: String(row[6] || ""),
      brand: String(row[7] || ""),
      style: String(row[8] || ""),
      downtimeMinutes: Number(row[9]) || 0,
      downtimeCategory: String(row[10] || "OTHER - Other"),
      categoryCode: String(row[11] || ""),
      remarks: String(row[12] || ""),
      user: String(row[13] || ""),
      createdAt: String(row[14] || "")
    });
  }
  return { status: "success", count: logs.length, downtimeLogs: logs };
}
`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(appsScriptCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header Bento Card */}
      <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-4 shadow-md space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-[#0d1625] border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Code2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="w-1 h-3.5 bg-purple-500 rounded-full"></span>
                <h2 className="text-xs font-black uppercase text-white tracking-widest">Google Apps Script Integration Engine</h2>
                <span className="text-[10px] bg-purple-500/20 text-purple-300 font-bold px-1.5 py-0.5 rounded border border-purple-500/30">
                  Spreadsheet Code.gs
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Ready-to-deploy Google Apps Script backend that powers your Google Sheet and Google Sites embed.
              </p>
            </div>
          </div>

          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-sm shadow-purple-950/60 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Code Copied to Clipboard!' : 'Copy Code.gs Script'}</span>
          </button>
        </div>

        {/* 3 Step Deployment Instructions */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2.5 border-t border-[#1c2b44] text-xs">
          <div className="p-3 rounded-lg bg-[#0d1625] border border-[#1c2b44] space-y-1">
            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-wider block">
              Step 1: Open Apps Script
            </span>
            <p className="text-slate-300 text-[11px]">
              In your Google Sheet, click <strong className="text-white">Extensions</strong> &rarr; <strong className="text-white">Apps Script</strong>.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#0d1625] border border-[#1c2b44] space-y-1">
            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-wider block">
              Step 2: Paste Script
            </span>
            <p className="text-slate-300 text-[11px]">
              Paste the code below into <code className="text-purple-300 font-mono">Code.gs</code> and ensure sheet tab names match.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#0d1625] border border-[#1c2b44] space-y-1">
            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-wider block">
              Step 3: Deploy as Web App
            </span>
            <p className="text-slate-300 text-[11px]">
              Click <strong className="text-white">Deploy &rarr; New deployment</strong>, select <strong className="text-white">Web app</strong>, set &quot;Execute as: <strong className="text-white">Me</strong>&quot;, and &quot;Who has access: <strong className="text-emerald-400">Anyone</strong>&quot;.
            </p>
            <p className="text-[10px] text-amber-400 font-medium pt-1">
              ⚠️ If updating an existing deployment: Click <strong>Deploy &rarr; Manage deployments &rarr; Edit (pencil) &rarr; Version: &quot;New version&quot; &rarr; Deploy</strong>.
            </p>
          </div>

          <div className="p-3 rounded-lg bg-[#0d1625] border border-emerald-500/30 space-y-1">
            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-wider block">
              Step 4: Connect & Auto-Sync
            </span>
            <p className="text-slate-300 text-[11px]">
              Copy the Web App URL and paste it into the Sheet Connection manager to enable real-time auto-saving.
            </p>
            {onOpenSheetModal && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={onOpenSheetModal}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1.5 transition"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Open Sheet Connection Manager</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Code Viewer Bento Card */}
      <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl overflow-hidden shadow-md">
        <div className="bg-[#1c2b44] px-4 py-2 flex justify-between items-center text-xs">
          <span className="font-mono text-slate-300 flex items-center gap-2 text-[11px]">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            Code.gs (Backend & Proportional Calculation Engine)
          </span>
          <button
            onClick={copyToClipboard}
            className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 transition text-xs"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
        <pre className="p-4 text-xs font-mono text-slate-300 overflow-x-auto max-h-[460px] bg-[#0d1625] leading-relaxed select-all">
          {appsScriptCode}
        </pre>
      </div>
    </div>
  );
};
