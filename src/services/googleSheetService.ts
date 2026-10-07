import { ProductionLog } from '../types';
import { parseSheetData } from '../utils/csvParser';
import { normalizeProductionLog } from '../utils/calculations';

// Permanent Default Apps Script Web App for Ebony Holdings Master Sheet
export const PERMANENT_DEFAULT_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbwCKmL3OR63Hw9-zjlEEPCAOTNf6X1SglvotnWsqdZL8wQLCI1dEEhFbrGPPtf4Wx8g/exec';

const SHEET_URL_STORAGE_KEY = 'ebony_google_sheet_url_v1';
const AUTO_SYNC_STORAGE_KEY = 'ebony_google_sheet_autosync_v1';
const LAST_SYNC_STORAGE_KEY = 'ebony_google_sheet_last_sync_v1';

export interface SyncStatus {
  isConfigured: boolean;
  autoSync: boolean;
  lastSyncTime: string | null;
  lastSyncSuccess: boolean | null;
  lastMessage: string | null;
}

export function getStoredSheetUrl(): string {
  try {
    const saved = localStorage.getItem(SHEET_URL_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved.trim();
    }
    return PERMANENT_DEFAULT_SHEET_URL;
  } catch {
    return PERMANENT_DEFAULT_SHEET_URL;
  }
}

export async function fetchServerSheetConfig(): Promise<{ sheetUrl: string; autoSync: boolean }> {
  try {
    const res = await fetch('/api/sheet/config');
    if (res.ok) {
      const data = await res.json();
      const activeUrl = (data.sheetUrl && data.sheetUrl.trim()) ? data.sheetUrl.trim() : PERMANENT_DEFAULT_SHEET_URL;
      localStorage.setItem(SHEET_URL_STORAGE_KEY, activeUrl);
      return { sheetUrl: activeUrl, autoSync: data.autoSync !== false };
    }
  } catch (e) {
    console.warn('Could not fetch server sheet config', e);
  }
  return { sheetUrl: getStoredSheetUrl(), autoSync: getStoredAutoSync() };
}

export function setStoredSheetUrl(url: string): void {
  try {
    const targetUrl = url.trim() || PERMANENT_DEFAULT_SHEET_URL;
    localStorage.setItem(SHEET_URL_STORAGE_KEY, targetUrl);
    // Save globally to server so all users & devices inherit it
    fetch('/api/sheet/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl: targetUrl, autoSync: getStoredAutoSync() })
    }).catch(err => console.warn('Could not persist sheet config to server', err));
  } catch (e) {
    console.error('Failed to store Google Sheet URL', e);
  }
}

export function getStoredAutoSync(): boolean {
  try {
    const val = localStorage.getItem(AUTO_SYNC_STORAGE_KEY);
    return val === null ? true : val === 'true';
  } catch {
    return true;
  }
}

export function setStoredAutoSync(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SYNC_STORAGE_KEY, String(enabled));
  } catch (e) {
    console.error('Failed to store auto-sync setting', e);
  }
}

export function getStoredLastSync(): { time: string | null; success: boolean | null; message: string | null } {
  try {
    const raw = localStorage.getItem(LAST_SYNC_STORAGE_KEY);
    if (!raw) return { time: null, success: null, message: null };
    return JSON.parse(raw);
  } catch {
    return { time: null, success: null, message: null };
  }
}

export function recordSyncStatus(success: boolean, message: string): void {
  try {
    const data = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      success,
      message
    };
    localStorage.setItem(LAST_SYNC_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Failed to record sync status', e);
  }
}

/**
 * Checks URL type and offers instant guidance before executing
 */
export function analyzeSheetUrl(rawUrl: string): {
  type: 'SHEET' | 'APPS_SCRIPT_EXEC' | 'APPS_SCRIPT_DEV' | 'APPS_SCRIPT_EDIT' | 'PUB_CSV' | 'UNKNOWN';
  isValid: boolean;
  message?: string;
  recommendedUrl?: string;
} {
  const url = (rawUrl || '').trim();
  if (!url) return { type: 'UNKNOWN', isValid: false, message: 'URL is empty' };

  if (url.includes('script.google.com')) {
    if (url.includes('/edit')) {
      return {
        type: 'APPS_SCRIPT_EDIT',
        isValid: false,
        message: 'This is the script editor link. In Apps Script, click Deploy > New deployment > Web app, set access to "Anyone", and copy the Web App URL.'
      };
    }
    if (url.endsWith('/dev')) {
      const fixed = url.replace(/\/dev$/, '/exec');
      return {
        type: 'APPS_SCRIPT_DEV',
        isValid: true,
        recommendedUrl: fixed,
        message: 'Notice: URL ends with /dev (which blocks anonymous API calls). We will use /exec automatically.'
      };
    }
    if (url.includes('/exec')) {
      return {
        type: 'APPS_SCRIPT_EXEC',
        isValid: true,
        message: 'Google Apps Script Web App detected (supports live Reading and Writing).'
      };
    }
  }

  if (url.includes('/pub?output=csv') || url.includes('/pubhtml')) {
    return {
      type: 'PUB_CSV',
      isValid: true,
      message: 'Published Google Sheet CSV detected (supports live direct Reading).'
    };
  }

  if (url.includes('docs.google.com/spreadsheets/d/')) {
    return {
      type: 'SHEET',
      isValid: true,
      message: 'Google Spreadsheet document link detected (supports live direct Reading).'
    };
  }

  return {
    type: 'UNKNOWN',
    isValid: false,
    message: 'Please provide either a Google Sheet URL or an Apps Script Web App URL.'
  };
}

/**
 * Client-Side JSONP Fallback for Google Sheets
 * Uses Google Visualization API script tag injection to completely bypass browser CORS!
 */
function fetchGoogleSheetViaJsonp(spreadsheetId: string, gid?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return reject(new Error('JSONP requires browser window environment.'));
    }

    const callbackName = `gviz_cb_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const script = document.createElement('script');
    const gidParam = gid ? `&gid=${gid}` : '';
    const src = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=responseHandler:${callbackName}${gidParam}`;

    const cleanup = () => {
      try {
        delete (window as any)[callbackName];
      } catch {}
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Google Sheet JSONP request timed out after 12 seconds.'));
    }, 12000);

    (window as any)[callbackName] = (data: any) => {
      cleanup();
      clearTimeout(timeout);
      if (data && data.status === 'ok' && data.table) {
        const cols = (data.table.cols || []).map((c: any) => c.label || c.id || '');
        const rows = (data.table.rows || []).map((r: any) => {
          return (r.c || []).map((cell: any) => {
            if (!cell || cell.v === null || cell.v === undefined) return '';
            const val = String(cell.f || cell.v);
            return val.includes(',') || val.includes('"') || val.includes('\n')
              ? `"${val.replace(/"/g, '""')}"`
              : val;
          }).join(',');
        });
        const csv = [cols.join(','), ...rows].join('\n');
        resolve(csv);
      } else if (data && data.status === 'error') {
        const errDetails = data.errors?.[0]?.detailed_message || data.errors?.[0]?.message || 'Access denied';
        reject(new Error(`Google Sheet returned error: ${errDetails}. Please ensure sharing is set to "Anyone with the link can view".`));
      } else {
        reject(new Error('Invalid data format returned by Google Sheet.'));
      }
    };

    script.src = src;
    script.onerror = () => {
      cleanup();
      clearTimeout(timeout);
      reject(new Error('Could not load Google Sheet. Ensure General access is set to "Anyone with the link can view".'));
    };

    document.body.appendChild(script);
  });
}

/**
 * Extracts spreadsheet ID from a Google Sheet URL
 */
export function extractSpreadsheetId(url?: string): string | null {
  const target = (url || getStoredSheetUrl()).trim();
  const match = target.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

export function isSheetReadOnly(url?: string): boolean {
  const target = (url || getStoredSheetUrl()).trim();
  return target.includes('docs.google.com/spreadsheets');
}

export function isSheetConfiguredForWriting(url?: string): boolean {
  const target = (url || getStoredSheetUrl()).trim();
  return target.includes('script.google.com') && (target.includes('/exec') || target.includes('/dev'));
}

/**
 * Sends logs to Google Apps Script Web App
 * Uses backend proxy to append directly into Google Sheet
 */
export async function appendLogsToGoogleSheet(
  logs: ProductionLog[],
  username?: string,
  customUrl?: string
): Promise<{ success: boolean; isReadOnly?: boolean; message: string; count: number }> {
  let url = (customUrl || getStoredSheetUrl()).trim();

  if (!url) {
    return {
      success: false,
      message: 'No Google Sheet or Web App URL is connected. Entry was saved locally to dashboard.',
      count: 0
    };
  }

  // If user configured a direct Google Sheet document link instead of Apps Script
  if (url.includes('docs.google.com/spreadsheets')) {
    const errorMsg = 'Your connected Google Sheet link is in Read-Only mode. Direct spreadsheet links allow viewing and live dashboard reading. To write shift records directly into your Google Sheet, deploy the Apps Script Web App (click "Apps Script" in top navigation).';
    recordSyncStatus(false, errorMsg);
    return {
      success: false,
      isReadOnly: true,
      message: errorMsg,
      count: 0
    };
  }

  if (url.endsWith('/dev')) {
    url = url.replace(/\/dev$/, '/exec');
  }

  const spreadsheetId = extractSpreadsheetId(url);

  // Send to backend server proxy
  try {
    const proxyRes = await fetch('/api/sheet/append', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        records: logs,
        user: username || 'operator',
        spreadsheetId
      })
    });

    const resData = await proxyRes.json();

    if (proxyRes.ok && resData.success) {
      const msg = resData.message || `Successfully saved ${logs.length} record(s) directly to Google Sheet!`;
      recordSyncStatus(true, msg);
      return { success: true, message: msg, count: logs.length };
    } else {
      const msg = resData.message || `Failed to record to Google Sheet (Server HTTP ${proxyRes.status})`;
      recordSyncStatus(false, msg);
      return { success: false, message: msg, count: 0 };
    }
  } catch (err: any) {
    const errorMsg = `Network error contacting Google Sheet proxy: ${err.message || 'Check connection'}`;
    recordSyncStatus(false, errorMsg);
    return { success: false, message: errorMsg, count: 0 };
  }
}

/**
 * Fetches all production logs directly from:
 * 1. Server-side proxy /api/sheet/fetch (Bypasses all CORS blocks for both Docs and Apps Script)
 * 2. Google Visualization JSONP engine (bypasses browser CORS for Google Sheets)
 * 3. Direct / fallback endpoints with specific actionable diagnostics
 */
export async function fetchLogsFromGoogleSheet(
  customUrl?: string
): Promise<{ success: boolean; logs?: ProductionLog[]; message: string }> {
  let url = (customUrl || getStoredSheetUrl()).trim();

  if (!url) {
    return {
      success: false,
      message: 'Google Sheet URL is not configured. Please paste your Google Sheet or Apps Script Web App link.'
    };
  }

  // Pre-process /dev url to /exec
  if (url.endsWith('/dev')) {
    url = url.replace(/\/dev$/, '/exec');
  }

  // =========================================================================
  // STRATEGY 1: BACKEND SERVER PROXY (/api/sheet/fetch)
  // Completely eliminates browser CORS errors for both Sheets and Apps Script!
  // =========================================================================
  try {
    const proxyRes = await fetch('/api/sheet/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    const data = await proxyRes.json();

    if (proxyRes.ok && data.success) {
      if (data.format === 'csv' && data.csvText) {
        const parsed = parseSheetData(data.csvText);
        if (parsed.length > 0) {
          const msg = `Successfully loaded ${parsed.length} records from Google Sheet!`;
          recordSyncStatus(true, msg);
          return { success: true, logs: parsed, message: msg };
        } else {
          return {
            success: false,
            message: 'Connected to Google Sheet, but no valid production log rows were found. Check your sheet column headers.'
          };
        }
      } else if (data.format === 'json' && Array.isArray(data.logs)) {
        const normalized = data.logs.map(normalizeProductionLog);
        const msg = `Successfully fetched ${normalized.length} records from Google Apps Script Web App!`;
        recordSyncStatus(true, msg);
        return { success: true, logs: normalized, message: msg };
      }
    } else if (data && data.message) {
      // If server returned a clear authorization or access issue from Google
      recordSyncStatus(false, data.message);
      return { success: false, message: data.message };
    }
  } catch (proxyErr) {
    console.warn('Backend proxy unavailable or failed, falling back to browser methods...', proxyErr);
  }

  // =========================================================================
  // STRATEGY 2: CLIENT-SIDE JSONP SCRIPT INJECTION (FOR GOOGLE SHEETS)
  // Bypasses browser CORS policy by loading Google's GViz table format as a script
  // =========================================================================
  const sheetDocMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (sheetDocMatch) {
    const spreadsheetId = sheetDocMatch[1];
    const gidMatch = url.match(/[?&#]gid=([0-9]+)/);
    const gid = gidMatch ? gidMatch[1] : undefined;

    try {
      const csvText = await fetchGoogleSheetViaJsonp(spreadsheetId, gid);
      if (csvText && csvText.length > 50) {
        const parsed = parseSheetData(csvText);
        if (parsed.length > 0) {
          const msg = `Successfully loaded ${parsed.length} records directly from Google Sheet via live link!`;
          recordSyncStatus(true, msg);
          return { success: true, logs: parsed, message: msg };
        }
      }
    } catch (jsonpErr: any) {
      console.warn('JSONP fetch attempt failed:', jsonpErr);
      const specificMsg = jsonpErr.message || '';
      if (specificMsg.includes('Anyone with the link')) {
        recordSyncStatus(false, specificMsg);
        return { success: false, message: specificMsg };
      }
    }

    // STRATEGY 3: CORS Proxy Fallback for direct Google Sheet CSV
    try {
      const gvizUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(gvizUrl)}`;
      const res = await fetch(proxyUrl);
      if (res.ok) {
        const text = await res.text();
        if (text && text.length > 50 && !text.includes('accounts.google.com')) {
          const parsed = parseSheetData(text);
          if (parsed.length > 0) {
            const msg = `Successfully loaded ${parsed.length} records from Google Sheet!`;
            recordSyncStatus(true, msg);
            return { success: true, logs: parsed, message: msg };
          }
        }
      }
    } catch (corsProxyErr) {
      console.warn('Public CORS proxy failed:', corsProxyErr);
    }
  }

  // =========================================================================
  // STRATEGY 4: DIRECT APPS SCRIPT WEB APP FETCH
  // =========================================================================
  if (url.includes('script.google.com')) {
    try {
      const fetchUrl = url.includes('?') ? `${url}&action=GET_ALL_LOGS` : `${url}?action=GET_ALL_LOGS`;
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      if (data && data.status === 'success' && Array.isArray(data.logs)) {
        const msg = `Successfully loaded ${data.logs.length} records from Apps Script!`;
        recordSyncStatus(true, msg);
        return { success: true, logs: data.logs, message: msg };
      } else if (data.message) {
        return { success: false, message: `Apps Script error: ${data.message}` };
      }
    } catch (appsScriptErr: any) {
      const msg = `Unable to fetch from Apps Script: ${appsScriptErr.message || 'CORS or Network issue'}. Verify in Apps Script: Deploy > Manage deployments > Who has access is set to 'Anyone'.`;
      recordSyncStatus(false, msg);
      return { success: false, message: msg };
    }
  }

  const finalMsg = `Could not load data from Google Sheet. Verify that the Google Sheet link has General Access set to "Anyone with the link can view" (not restricted to your organization).`;
  recordSyncStatus(false, finalMsg);
  return { success: false, message: finalMsg };
}

/**
 * Tests connection with Google Sheet / Web App
 */
export async function testSheetConnection(url: string): Promise<{ success: boolean; message: string }> {
  const cleanUrl = (url || '').trim();
  if (!cleanUrl) {
    return {
      success: false,
      message: 'Please provide a valid Google Sheet or Google Apps Script Web App URL.'
    };
  }

  // Try backend test first
  try {
    const res = await fetch('/api/sheet/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: cleanUrl })
    });
    if (res.ok) {
      const data = await res.json();
      return { success: data.success, message: data.message };
    }
  } catch {
    // Fall back to client tests
  }

  // Client-side test
  const analysis = analyzeSheetUrl(cleanUrl);
  if (!analysis.isValid) {
    return { success: false, message: analysis.message || 'Invalid URL.' };
  }

  if (analysis.type === 'SHEET' || analysis.type === 'PUB_CSV') {
    const docMatch = cleanUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (docMatch) {
      try {
        const csv = await fetchGoogleSheetViaJsonp(docMatch[1]);
        if (csv && csv.length > 20) {
          return {
            success: true,
            message: 'Google Sheet reached! Live read access verified.'
          };
        }
      } catch (err: any) {
        return {
          success: false,
          message: err.message || 'Could not access sheet. Ensure sharing is set to "Anyone with the link can view".'
        };
      }
    }
  }

  return {
    success: true,
    message: 'URL format verified. Click "Fetch Latest from Google Sheet" to synchronize data.'
  };
}

/**
 * Sends a deletion command to the server proxy which deletes matching rows
 * from the connected Google Sheet via Apps Script Web App.
 */
export async function deleteLogsFromGoogleSheet(params: {
  startDate?: string;
  endDate?: string;
  factory?: string;
  entryId?: string;
  user?: string;
}): Promise<{ success: boolean; message: string; deletedCount?: number }> {
  try {
    const res = await fetch('/api/sheet/delete-range', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheetUrl: getStoredSheetUrl(),
        ...params
      })
    });
    if (res.ok) {
      const data = await res.json();
      return {
        success: data.success !== false,
        message: data.message || 'Deletion executed successfully.',
        deletedCount: data.deletedCount
      };
    }
  } catch (err: any) {
    console.warn('Could not execute Google Sheet deletion via backend:', err.message);
  }
  return {
    success: true,
    message: 'Local logs deleted. Notice: If Google Sheet sync is active, ensure Apps Script is reachable.'
  };
}

/**
 * Synchronizes user accounts and passwords from the central server.
 * Enables cross-device authentication and instantaneous account approvals.
 */
export async function fetchServerUsers(): Promise<{
  success: boolean;
  users?: any[];
  passwords?: Record<string, string>;
}> {
  try {
    const res = await fetch('/api/users');
    if (res.ok) {
      const data = await res.json();
      return { success: true, users: data.users, passwords: data.passwords };
    }
  } catch (err) {
    console.warn('Failed to fetch server users:', err);
  }
  return { success: false };
}

export async function registerServerUser(user: any, password: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, password })
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message || 'Server connection error' };
  }
}

export async function updateServerUserDetails(
  username: string,
  details?: any,
  password?: string,
  status?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch('/api/users/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, details, password, status })
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function deleteServerUser(username: string): Promise<{ success: boolean }> {
  try {
    const res = await fetch(`/api/users/${encodeURIComponent(username)}`, {
      method: 'DELETE'
    });
    return { success: res.ok };
  } catch {
    return { success: false };
  }
}

export async function resetServerUserPassword(
  username: string,
  newPassword: string,
  factory?: string,
  reason?: string
): Promise<{ success: boolean; message: string; requiresApproval?: boolean }> {
  try {
    const res = await fetch('/api/users/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, newPassword, factory, reason })
    });
    const data = await res.json();
    return {
      success: data.success,
      requiresApproval: data.requiresApproval,
      message: data.message || (data.success ? 'Password reset request submitted!' : 'Failed to reset password.')
    };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection error' };
  }
}

export async function approveServerPasswordReset(
  username: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/users/approve-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection error' };
  }
}

export async function rejectServerPasswordReset(
  username: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/users/reject-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection error' };
  }
}

export async function requestServerRoleChange(
  username: string,
  requestedRole: string,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/users/request-role-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, requestedRole, reason })
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection error' };
  }
}

export async function approveServerRoleChange(
  username: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/users/approve-role-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection error' };
  }
}

export async function rejectServerRoleChange(
  username: string
): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/users/reject-role-change', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username })
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message || 'Connection error' };
  }
}

export async function syncServerUsers(
  users: any[],
  passwords: Record<string, string>
): Promise<{ success: boolean; users?: any[]; passwords?: Record<string, string> }> {
  try {
    const res = await fetch('/api/users/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users, passwords })
    });
    if (res.ok) {
      const data = await res.json();
      return { success: true, users: data.users, passwords: data.passwords };
    }
  } catch (err) {
    console.warn('Failed to sync server users:', err);
  }
  return { success: false };
}

/**
 * Change requests (Factory data ops request delete or edit data)
 */
export async function fetchChangeRequests(): Promise<{ success: boolean; requests?: any[] }> {
  try {
    const res = await fetch('/api/requests');
    if (res.ok) {
      const data = await res.json();
      return { success: true, requests: data.requests };
    }
  } catch (err) {
    console.warn('Could not fetch change requests:', err);
  }
  return { success: false, requests: [] };
}

export async function submitChangeRequest(requestData: any): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function reviewChangeRequest(
  requestId: string,
  status: 'APPROVED' | 'REJECTED',
  reviewedBy: string,
  reviewNotes?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch('/api/requests/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId, status, reviewedBy, reviewNotes })
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

/**
 * Updates a single production log entry in Google Sheet and local cache
 */
export async function updateLogToGoogleSheet(record: any, user?: string): Promise<{ success: boolean; message: string }> {
  try {
    const res = await fetch('/api/sheet/update-entry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sheetUrl: getStoredSheetUrl(),
        record,
        user: user || 'admin'
      })
    });
    if (res.ok) {
      const data = await res.json();
      return { success: data.success, message: data.message };
    }
  } catch (err: any) {
    console.warn('Could not execute Google Sheet update via backend:', err.message);
  }
  return { success: true, message: 'Log updated in local state.' };
}

/**
 * Downtime Category Tracking
 */
export async function fetchDowntimeLogs(): Promise<{ success: boolean; downtimeLogs?: any[] }> {
  try {
    const res = await fetch('/api/downtime-logs');
    if (res.ok) {
      const data = await res.json();
      return { success: true, downtimeLogs: data.downtimeLogs };
    }
  } catch (err) {
    console.warn('Could not fetch downtime logs:', err);
  }
  return { success: false, downtimeLogs: [] };
}

export async function submitDowntimeLogs(records: any[]): Promise<{ success: boolean; message?: string; downtimeLogs?: any[] }> {
  try {
    const res = await fetch('/api/downtime-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records })
    });
    const data = await res.json();
    return { success: data.success, message: data.message, downtimeLogs: data.downtimeLogs };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function deleteDowntimeLog(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch(`/api/downtime-logs/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function updateDowntimeLog(
  id: string,
  updates: Record<string, any>
): Promise<{ success: boolean; message?: string; record?: any }> {
  try {
    const res = await fetch(`/api/downtime-logs/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    return { success: data.success, message: data.message, record: data.record };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function saveGoogleUserToServer(profile: {
  email: string;
  name: string;
  factory: string;
  role: string;
  picture?: string;
}): Promise<{ success: boolean; message?: string; user?: any }> {
  try {
    const res = await fetch('/api/users/google-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profile)
    });
    const data = await res.json();
    return { success: data.success, message: data.message, user: data.user };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}

export async function fetchDailyProductionFromServer(params?: {
  date?: string;
  factory?: string;
  month?: string;
}): Promise<{ success: boolean; records?: any[] }> {
  try {
    const query = new URLSearchParams();
    if (params?.date) query.set('date', params.date);
    if (params?.factory) query.set('factory', params.factory);
    if (params?.month) query.set('month', params.month);

    const res = await fetch(`/api/daily-production?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      return { success: true, records: data.records || [] };
    }
  } catch (err) {
    console.warn('Failed to fetch daily production from server:', err);
  }
  return { success: false, records: [] };
}

export async function recordDailyProductionBatch(
  records: Array<{
    date: string;
    factory: string;
    product: string;
    plannedQty: number;
    actualQty: number;
  }>
): Promise<{ success: boolean; message?: string }> {
  try {
    const res = await fetch('/api/daily-production/record-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records })
    });
    const data = await res.json();
    return { success: data.success, message: data.message };
  } catch (err: any) {
    return { success: false, message: err.message };
  }
}



