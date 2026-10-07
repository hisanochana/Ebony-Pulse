import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Upload,
  Download,
  ExternalLink,
  Code2,
  Copy,
  Check,
  Link2
} from 'lucide-react';
import {
  getStoredSheetUrl,
  setStoredSheetUrl,
  getStoredAutoSync,
  setStoredAutoSync,
  getStoredLastSync,
  testSheetConnection,
  fetchLogsFromGoogleSheet,
  appendLogsToGoogleSheet,
  analyzeSheetUrl,
  PERMANENT_DEFAULT_SHEET_URL
} from '../services/googleSheetService';
import { ProductionLog } from '../types';
import { parseSheetData } from '../utils/csvParser';

interface SheetConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: ProductionLog[];
  onLogsUpdated: (newLogs: ProductionLog[]) => void;
}

export const SheetConnectionModal: React.FC<SheetConnectionModalProps> = ({
  isOpen,
  onClose,
  logs,
  onLogsUpdated
}) => {
  const [sheetUrl, setSheetUrl] = useState('');
  const [autoSync, setAutoSync] = useState(true);
  const [testStatus, setTestStatus] = useState<{ loading: boolean; success: boolean | null; message: string | null }>({
    loading: false,
    success: null,
    message: null
  });
  const [syncActionStatus, setSyncActionStatus] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(getStoredLastSync());
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const urlAnalysis = analyzeSheetUrl(sheetUrl);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result as string;
      if (text) {
        const parsed = parseSheetData(text);
        if (parsed.length > 0) {
          onLogsUpdated(parsed);
          setSyncActionStatus(`Successfully imported ${parsed.length} production rows directly from ${file.name}!`);
          setLastSync({
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            success: true,
            message: `Imported ${parsed.length} rows from ${file.name}`
          });
        } else {
          setSyncActionStatus('Could not find recognizable apparel production log rows in the uploaded CSV file.');
        }
      }
    };
    reader.readAsText(file);
    // Reset file input value
    e.target.value = '';
  };

  useEffect(() => {
    if (isOpen) {
      setSheetUrl(getStoredSheetUrl());
      setAutoSync(getStoredAutoSync());
      setLastSync(getStoredLastSync());
      setTestStatus({ loading: false, success: null, message: null });
      setSyncActionStatus(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = () => {
    setStoredSheetUrl(sheetUrl);
    setStoredAutoSync(autoSync);
    setSyncActionStatus('Settings saved successfully!');
    setLastSync(getStoredLastSync());
    setTimeout(() => setSyncActionStatus(null), 3000);
  };

  const handleTestConnection = async () => {
    if (!sheetUrl.trim()) {
      setTestStatus({ loading: false, success: false, message: 'Please enter a valid Google Apps Script Web App URL.' });
      return;
    }
    setTestStatus({ loading: true, success: null, message: 'Pinging Google Apps Script endpoint...' });
    const res = await testSheetConnection(sheetUrl.trim());
    setTestStatus({ loading: false, success: res.success, message: res.message });
  };

  const handleFetchFromSheet = async () => {
    if (!sheetUrl.trim()) {
      setSyncActionStatus('Please configure and save your Web App URL first.');
      return;
    }
    setIsSyncing(true);
    setSyncActionStatus('Fetching records from Google Sheet...');
    const res = await fetchLogsFromGoogleSheet(sheetUrl.trim());
    setIsSyncing(false);
    if (res.success && res.logs && res.logs.length > 0) {
      onLogsUpdated(res.logs);
      setSyncActionStatus(`Successfully loaded ${res.logs.length} rows from Google Sheet into Dashboard!`);
      setLastSync(getStoredLastSync());
    } else {
      setSyncActionStatus(res.message || 'Failed to fetch logs from Google Sheet.');
    }
  };

  const handlePushAllToSheet = async () => {
    if (!sheetUrl.trim()) {
      setSyncActionStatus('Please configure and save your Web App URL first.');
      return;
    }
    setIsSyncing(true);
    setSyncActionStatus(`Uploading ${logs.length} logs to Google Sheet...`);
    const res = await appendLogsToGoogleSheet(logs, 'bulk_sync', sheetUrl.trim());
    setIsSyncing(false);
    setSyncActionStatus(res.message);
    setLastSync(getStoredLastSync());
  };

  const scriptCode = `/**
 * EBONY HOLDINGS - LIVE GOOGLE SHEET CONNECTOR (Code.gs)
 * Paste this code into: Extensions > Apps Script in your Google Sheet.
 * Then click: Deploy > New deployment > Web App (Execute as: Me, Who has access: Anyone)
 * NOTE: If updating an existing deployment, click: Deploy > Manage deployments > Edit > Version: "New version" > Deploy
 */

var MASTER_SHEET_NAME = "Final Data Set"; // Primary sheet tab name

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

    if (data.action === "SUBMIT_LOGS" && Array.isArray(data.records)) {
      var ss = getSpreadsheet(data.spreadsheetId);
      if (!ss) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Spreadsheet not found. Please create this script via Extensions > Apps Script inside your Google Sheet."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      var sheet = getMasterSheet(ss);
      if (!sheet) {
        return ContentService.createTextOutput(JSON.stringify({
          status: "error",
          message: "Could not access or create target sheet tab."
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // Auto-initialize 22-column header row if sheet is empty
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
      
      for (var i = 0; i < data.records.length; i++) {
        var r = data.records[i];
        var firstLetter = (r.Factory || "").charAt(0).toUpperCase();
        var rawLine = String(r.Line || "").trim();
        var lineNo = r.Line_No || (rawLine.toUpperCase().indexOf(firstLetter) === 0 ? rawLine.toUpperCase() : (firstLetter + rawLine));
        var actualQty = Number(r.Actual_QTY) || 0;
        var smv = Number(r.SMV) || 0;
        var prodMins = Math.round(actualQty * smv);
        var presentTMs = Number(r.Present_TMs) || 0;
        var hoursWorked = Number(r.Hours_Worked) || 0;
        var workedMins = Number((presentTMs * hoursWorked * 60).toFixed(2));
        var calculatedDownTime = Math.max(0, Math.round(workedMins - (actualQty * smv)));
        var finalDownTime = Number(r.Down_Time) > 0 ? Number(r.Down_Time) : calculatedDownTime;
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
          data.user || r.User || "operator"
        ];

        sheet.appendRow(row);
        addedCount++;
        entryIds.push(entryId);
      }
      
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        added: addedCount,
        entryIds: entryIds,
        timestamp: timestamp,
        sheetName: sheet.getName()
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Invalid action" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function getAllLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    // Fallback: search for sheet tab with highest row count or active sheet
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

  // Dynamic header mapping
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

    // Do not skip if at least Date, Factory or Style is present
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
}`;

  const copyScript = () => {
    navigator.clipboard.writeText(scriptCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#121c2e] border border-[#1c2b44] rounded-xl shadow-2xl p-5 text-slate-100 my-8 space-y-4">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0d1625] border border-emerald-500/40 flex items-center justify-center text-emerald-400">
            <FileSpreadsheet className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="w-1 h-3.5 bg-emerald-500 rounded-full"></span>
              <h2 className="text-xs font-black uppercase text-white tracking-widest">Google Sheet Live Connection</h2>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${sheetUrl.trim() ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30'}`}>
                {sheetUrl.trim() ? 'Configured' : 'Setup Required'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Connect your Google Spreadsheet to automatically save operator entries to the sheet and update the dashboard in real-time.
            </p>
          </div>
        </div>

        {/* Status Notification */}
        {syncActionStatus && (
          <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-500/40 text-cyan-300 text-xs flex items-center justify-between">
            <span className="font-medium">{syncActionStatus}</span>
            <button onClick={() => setSyncActionStatus(null)} className="text-cyan-400 hover:text-cyan-200">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Main Bento Cards Grid */}
        <div className="grid grid-cols-1 gap-3 text-xs">
          
          {/* Card 1: Web App URL or Google Sheet URL Configuration */}
          <div className="p-3.5 rounded-xl bg-[#0d1625] border border-[#1c2b44] space-y-2.5">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-cyan-400" />
                <span>Google Sheet or Apps Script Web App URL</span>
              </label>
              <div className="flex items-center gap-2">
                {sheetUrl !== PERMANENT_DEFAULT_SHEET_URL && (
                  <button
                    type="button"
                    onClick={() => {
                      setSheetUrl(PERMANENT_DEFAULT_SHEET_URL);
                      setStoredSheetUrl(PERMANENT_DEFAULT_SHEET_URL);
                      setSyncActionStatus('Reset and locked to Ebony Holdings Master Sheet!');
                    }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-200 underline font-medium"
                  >
                    Reset to Permanent Master Link
                  </button>
                )}
                {lastSync.time && (
                  <span className="text-[10px] text-slate-400">
                    Last Sync: <strong className="text-slate-200">{lastSync.time}</strong>
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <input
                type="url"
                placeholder="Paste Google Sheet URL (docs.google.com/...) or Web App URL (.../exec)"
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                className="flex-1 bg-[#0b1320] border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testStatus.loading}
                className="px-3 py-1.5 rounded-lg bg-[#1c2b44] hover:bg-[#253959] text-cyan-300 font-bold text-xs border border-cyan-500/30 transition disabled:opacity-50"
              >
                {testStatus.loading ? 'Testing...' : 'Test URL'}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition"
              >
                Save
              </button>
            </div>

            {/* Smart URL Type Indicator */}
            {sheetUrl.trim() && (
              <div className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded bg-[#0b1320] border border-slate-800">
                {urlAnalysis.type === 'SHEET' && (
                  <div className="space-y-1 text-[11px]">
                    <div className="text-emerald-400 flex items-center gap-1">
                      <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" />
                      <strong>Direct Google Sheet Link:</strong> Read access enabled (Dashboard can import all rows).
                    </div>
                    <div className="text-amber-300 flex items-start gap-1">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        <strong>To record new shift entries directly into Google Sheet:</strong> Google requires an Apps Script Web App URL (<code className="font-mono bg-slate-900 px-1 py-0.5 rounded text-amber-200">.../exec</code>). Follow the 3-step guide below to deploy it in 60 seconds.
                      </span>
                    </div>
                  </div>
                )}
                {urlAnalysis.type === 'APPS_SCRIPT_EXEC' && (
                  <span className="text-cyan-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <strong>Google Apps Script Web App:</strong> Full bi-directional Live Read & Auto-Save Write enabled.
                  </span>
                )}
                {urlAnalysis.type === 'APPS_SCRIPT_DEV' && (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <strong>Notice:</strong> URL ends with <code>/dev</code>. The app will automatically query <code>/exec</code> so anonymous API access succeeds without login blocks.
                  </span>
                )}
                {urlAnalysis.type === 'APPS_SCRIPT_EDIT' && (
                  <span className="text-rose-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <strong>Apps Script Editor Link detected:</strong> Please click <em>Deploy &gt; New deployment &gt; Web app</em>, set &quot;Who has access&quot; to &quot;Anyone&quot;, and copy the generated <code>/exec</code> URL.
                  </span>
                )}
                {urlAnalysis.type === 'PUB_CSV' && (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <strong>Published CSV detected:</strong> Live 1-click direct sheet reading enabled.
                  </span>
                )}
              </div>
            )}

            {/* Test result message */}
            {testStatus.message && (
              <div className={`p-2 rounded-lg text-[11px] flex items-center gap-1.5 ${testStatus.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border border-rose-500/30'}`}>
                {testStatus.success ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                <span>{testStatus.message}</span>
              </div>
            )}

            {/* Auto-sync Switch */}
            <div className="pt-2 border-t border-[#1c2b44] flex items-center justify-between">
              <div>
                <span className="font-bold text-slate-200 text-xs">Automatic Live Sync on Shift Entry</span>
                <p className="text-[10px] text-slate-400">
                  When enabled, entering data automatically appends rows to your Google Sheet and recalculates the dashboard.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !autoSync;
                  setAutoSync(next);
                  setStoredAutoSync(next);
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${autoSync ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${autoSync ? 'translate-x-4' : 'translate-x-0'}`}
                />
              </button>
            </div>
          </div>

          {/* Card 2: Manual Actions (Fetch from Sheet / Upload to Sheet / Upload Local CSV) */}
          <div className="p-3.5 rounded-xl bg-[#0d1625] border border-[#1c2b44] space-y-2.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 block">
                Spreadsheet Synchronization &amp; CSV Import
              </span>
              <span className="text-[10px] text-cyan-400 font-semibold">
                Current in Dashboard: {logs.length} rows
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleFetchFromSheet}
                disabled={isSyncing}
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-[#121c2e] hover:bg-[#1c2b44] border border-[#1c2b44] hover:border-cyan-500/50 text-slate-200 transition text-xs font-bold"
              >
                <Download className={`w-3.5 h-3.5 text-cyan-400 ${isSyncing ? 'animate-bounce' : ''}`} />
                <span>{isSyncing ? 'Fetching...' : 'Fetch Live from Sheet'}</span>
              </button>

              <button
                type="button"
                onClick={handlePushAllToSheet}
                disabled={isSyncing}
                className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-[#121c2e] hover:bg-[#1c2b44] border border-[#1c2b44] hover:border-emerald-500/50 text-slate-200 transition text-xs font-bold"
              >
                <Upload className={`w-3.5 h-3.5 text-emerald-400 ${isSyncing ? 'animate-bounce' : ''}`} />
                <span>Push Rows to Sheet</span>
              </button>

              <label className="flex items-center justify-center gap-1.5 p-2 rounded-lg bg-[#121c2e] hover:bg-[#1c2b44] border border-[#1c2b44] hover:border-amber-500/50 text-slate-200 transition text-xs font-bold cursor-pointer">
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                <span>Import Local CSV File</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            <div className="bg-[#0b1320] p-2 rounded-lg border border-slate-800 text-[10px] text-slate-400 space-y-1">
              <p className="font-semibold text-slate-300">
                ⚡ Why did Google previously show &ldquo;Failed to fetch&rdquo;?
              </p>
              <p>
                Direct browser calls to Google Sheets fail due to browser CORS policies even when the sheet is shared publicly. We now route requests through an integrated server proxy and Google&apos;s visualization engine so your sheet loads smoothly.
              </p>
              <p className="text-slate-400">
                • <strong>Google Sheet link:</strong> Share &gt; change General Access to <em>&ldquo;Anyone with the link can view&rdquo;</em>.<br/>
                • <strong>Apps Script link:</strong> Deploy &gt; Manage deployments &gt; ensure <em>&ldquo;Who has access&rdquo;</em> is set to <em>&ldquo;Anyone&rdquo;</em>.
              </p>
            </div>
          </div>

          {/* Card 3: 3-Minute Setup Guide & Code.gs */}
          <div className="p-3.5 rounded-xl bg-[#0d1625] border border-[#1c2b44] space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Code2 className="w-3.5 h-3.5 text-purple-400" />
                <span>Quick Deployment Guide for your Google Sheet</span>
              </span>
              <button
                type="button"
                onClick={() => setShowCode(!showCode)}
                className="text-xs text-purple-400 hover:text-purple-300 font-bold hover:underline"
              >
                {showCode ? 'Hide Code.gs' : 'View Code.gs'}
              </button>
            </div>

            <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
              <li>In your Google Sheet, click <strong className="text-white">Extensions &rarr; Apps Script</strong>.</li>
              <li>Delete existing code, paste the script below, and verify the tab name matches <code className="text-purple-300 font-mono">Final Data Set</code>.</li>
              <li>Click <strong className="text-white">Deploy &rarr; New deployment</strong> &rarr; Select <strong className="text-white">Web app</strong>.</li>
              <li>Set <strong className="text-white">Execute as: Me</strong> and <strong className="text-white">Who has access: Anyone</strong>.</li>
              <li>Copy the generated Web App URL and paste it into the field above!</li>
            </ol>

            {showCode && (
              <div className="mt-2 space-y-1.5">
                <div className="flex justify-between items-center bg-[#1c2b44] px-3 py-1.5 rounded-t-lg text-[11px]">
                  <span className="font-mono text-slate-300">Code.gs (Ready to paste)</span>
                  <button
                    onClick={copyScript}
                    className="text-cyan-400 hover:text-cyan-300 font-bold flex items-center gap-1 text-xs"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'Copied' : 'Copy Script'}</span>
                  </button>
                </div>
                <pre className="p-3 text-[10px] font-mono text-slate-300 bg-[#080e18] rounded-b-lg max-h-48 overflow-y-auto leading-relaxed select-all border border-[#1c2b44]">
                  {scriptCode}
                </pre>
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-2 border-t border-[#1c2b44]">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#1c2b44] hover:bg-[#253959] text-white font-bold text-xs transition"
          >
            Close
          </button>
        </div>

      </div>
    </div>
  );
};
