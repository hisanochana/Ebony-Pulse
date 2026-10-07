import express from 'express';
import path from 'path';
import fs from 'fs';

// Process-level safety against unexpected exits in production / Cloud Run
process.on('uncaughtException', (err) => {
  console.error('[SERVER] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] Unhandled rejection at:', promise, 'reason:', reason);
});

const app = express();

// Disable ETags for dynamic API responses to prevent 304 empty responses in proxies
app.disable('etag');

// Global API no-cache middleware
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Standard health endpoints for Cloud Run / load balancers
app.get(['/health', '/healthz', '/api/health'], (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.use(express.json({ limit: '15mb' }));

const DEFAULT_SHEET_URL =
  'https://script.google.com/macros/s/AKfycbwCKmL3OR63Hw9-zjlEEPCAOTNf6X1SglvotnWsqdZL8wQLCI1dEEhFbrGPPtf4Wx8g/exec';
const SHEET_CONFIG_FILE = path.join(process.cwd(), 'sheet-config.json');
const SHEET_LOGS_CACHE_FILE = path.join(process.cwd(), 'sheet-logs-cache.json');
const USERS_FILE = path.join(process.cwd(), 'users.json');
const PASSWORDS_FILE = path.join(process.cwd(), 'passwords.json');
const CHANGE_REQUESTS_FILE = path.join(process.cwd(), 'change-requests.json');
const DOWNTIME_LOGS_FILE = path.join(process.cwd(), 'downtime-logs.json');
const DAILY_PRODUCTION_FILE = path.join(process.cwd(), 'daily-production.json');

interface DailyProductionRecord {
  date: string;
  factory: string;
  product: string;
  plannedQty: number;
  actualQty: number;
  qtyVariance: number;
  updatedAt?: string;
}

function loadDailyProductionRecords(): DailyProductionRecord[] {
  try {
    if (fs.existsSync(DAILY_PRODUCTION_FILE)) {
      const raw = fs.readFileSync(DAILY_PRODUCTION_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error loading daily-production.json', e);
  }
  return [];
}

function saveDailyProductionRecords(records: DailyProductionRecord[]) {
  try {
    fs.writeFileSync(DAILY_PRODUCTION_FILE, JSON.stringify(records, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving daily-production.json', e);
  }
}

// Default initial users
const DEFAULT_USERS = [
  {
    id: 'usr-admin',
    username: 'admin',
    fullName: 'Central Administrator',
    role: 'admin',
    factory: 'ALL',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-kg',
    username: 'kurunegala_op',
    fullName: 'Kurunegala Shift Operator',
    role: 'operator',
    factory: 'Kurunegala',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-bg',
    username: 'bulugolla_op',
    fullName: 'Bulugolla Shift Operator',
    role: 'operator',
    factory: 'Bulugolla',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-wp',
    username: 'werapola_op',
    fullName: 'Werapola Shift Operator',
    role: 'operator',
    factory: 'Werapola',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-all',
    username: 'all_factory_op',
    fullName: 'Multi-Plant Shift Operator',
    role: 'operator',
    factory: 'ALL',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-view',
    username: 'viewer',
    fullName: 'Executive Board Viewer',
    role: 'viewer',
    factory: 'ALL',
    status: 'active',
    createdAt: '2026-01-01'
  }
];

const DEFAULT_PASSWORDS: Record<string, string> = {
  admin: 'admin123',
  kurunegala_op: 'kg123',
  bulugolla_op: 'bg123',
  werapola_op: 'wp123',
  all_factory_op: 'all123',
  viewer: 'view123'
};

let inMemoryUsers: any[] = [...DEFAULT_USERS];
let inMemoryPasswords: Record<string, string> = { ...DEFAULT_PASSWORDS };

function loadServerUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        inMemoryUsers = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading users.json', e);
  }
  return inMemoryUsers;
}

function saveServerUsers(users: any[]) {
  inMemoryUsers = users;
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Notice: users.json could not be written to disk (in-memory preserved):', e);
  }
}

function loadServerPasswords(): Record<string, string> {
  try {
    if (fs.existsSync(PASSWORDS_FILE)) {
      const raw = fs.readFileSync(PASSWORDS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        inMemoryPasswords = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error loading passwords.json', e);
  }
  return inMemoryPasswords;
}

function saveServerPasswords(passwords: Record<string, string>) {
  inMemoryPasswords = passwords;
  try {
    fs.writeFileSync(PASSWORDS_FILE, JSON.stringify(passwords, null, 2), 'utf-8');
  } catch (e) {
    console.warn('Notice: passwords.json could not be written to disk (in-memory preserved):', e);
  }
}

function loadChangeRequests() {
  try {
    if (fs.existsSync(CHANGE_REQUESTS_FILE)) {
      const raw = fs.readFileSync(CHANGE_REQUESTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.error('Error loading change-requests.json', e);
  }
  return [];
}

function saveChangeRequests(requests: any[]) {
  try {
    fs.writeFileSync(CHANGE_REQUESTS_FILE, JSON.stringify(requests, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving change-requests.json', e);
  }
}

const DEFAULT_SAMPLE_DOWNTIME_LOGS = [
  {
    id: 'DT-20260828-01',
    entryId: 'EB-20260828-BG-01',
    date: '2026-08-28',
    factory: 'Bulugolla',
    line: 'Line 01',
    supervisor: 'UPEKSHA',
    product: 'SHIRT BG',
    brand: 'VANTAGE',
    style: 'B1SHIRT BG',
    downtimeMinutes: 450,
    downtimeCategory: 'EN1 - Machine Breakdown',
    categoryCode: 'EN1',
    remarks: 'Buttonhole machine needle bar motor replacement',
    user: 'bulugolla_op',
    createdAt: '2026-08-28T10:30:00Z'
  },
  {
    id: 'DT-20260828-02',
    entryId: 'EB-20260828-BG-01',
    date: '2026-08-28',
    factory: 'Bulugolla',
    line: 'Line 01',
    supervisor: 'UPEKSHA',
    product: 'SHIRT BG',
    brand: 'VANTAGE',
    style: 'B1SHIRT BG',
    downtimeMinutes: 300,
    downtimeCategory: 'HR2 - Absenteeism',
    categoryCode: 'HR2',
    remarks: '4 sewer operators absent without prior notice',
    user: 'bulugolla_op',
    createdAt: '2026-08-28T11:00:00Z'
  },
  {
    id: 'DT-20260828-03',
    entryId: 'EB-20260828-BG-01',
    date: '2026-08-28',
    factory: 'Bulugolla',
    line: 'Line 01',
    supervisor: 'UPEKSHA',
    product: 'SHIRT BG',
    brand: 'VANTAGE',
    style: 'B1SHIRT BG',
    downtimeMinutes: 250,
    downtimeCategory: 'RM1 - RM Issuing Delay',
    categoryCode: 'RM1',
    remarks: 'Cuff interlining trims delayed from stores',
    user: 'bulugolla_op',
    createdAt: '2026-08-28T14:15:00Z'
  },
  {
    id: 'DT-20260829-04',
    entryId: 'EB-20260829-KG-01',
    date: '2026-08-29',
    factory: 'Kurunegala',
    line: 'Line 01',
    supervisor: 'RASITHA',
    product: 'TROUSER',
    brand: 'VANTAGE',
    style: 'SU 3409',
    downtimeMinutes: 520,
    downtimeCategory: 'IE1 - Cycle Time Not Achieved',
    categoryCode: 'IE1',
    remarks: 'New waist pocket attachment operation SMV imbalance',
    user: 'kurunegala_op',
    createdAt: '2026-08-29T09:45:00Z'
  },
  {
    id: 'DT-20260829-05',
    entryId: 'EB-20260829-KG-01',
    date: '2026-08-29',
    factory: 'Kurunegala',
    line: 'Line 01',
    supervisor: 'RASITHA',
    product: 'TROUSER',
    brand: 'VANTAGE',
    style: 'SU 3409',
    downtimeMinutes: 380,
    downtimeCategory: 'CU1 - Cutting Input Delay',
    categoryCode: 'CU1',
    remarks: 'Front placket panels bundle delivery late',
    user: 'kurunegala_op',
    createdAt: '2026-08-29T13:20:00Z'
  },
  {
    id: 'DT-20260830-06',
    entryId: 'EB-20260830-WP-01',
    date: '2026-08-30',
    factory: 'Werapola',
    line: 'Line 03',
    supervisor: 'KUMARI',
    product: 'PRIMARK HIPSTER',
    brand: 'Primark',
    style: 'KIMBALL60576',
    downtimeMinutes: 410,
    downtimeCategory: 'TE2 - Line Feeding Delay',
    categoryCode: 'TE2',
    remarks: 'Waistband elastic feed bottleneck at front line',
    user: 'werapola_op',
    createdAt: '2026-08-30T11:10:00Z'
  },
  {
    id: 'DT-20260830-07',
    entryId: 'EB-20260830-WP-01',
    date: '2026-08-30',
    factory: 'Werapola',
    line: 'Line 03',
    supervisor: 'KUMARI',
    product: 'PRIMARK HIPSTER',
    brand: 'Primark',
    style: 'KIMBALL60576',
    downtimeMinutes: 320,
    downtimeCategory: 'PR3 - Rework',
    categoryCode: 'PR3',
    remarks: 'Side seam overlock puckering repair on 60 pieces',
    user: 'werapola_op',
    createdAt: '2026-08-30T15:00:00Z'
  },
  {
    id: 'DT-20260831-08',
    entryId: 'EB-20260831-KG-02',
    date: '2026-08-31',
    factory: 'Kurunegala',
    line: 'Line 02',
    supervisor: 'FATHIMA',
    product: 'UNDERWEAR KG',
    brand: 'EBONY',
    style: '861-0126-2B',
    downtimeMinutes: 350,
    downtimeCategory: 'EN2 - Air Pressure Issue',
    categoryCode: 'EN2',
    remarks: 'Pneumatic line pressure drop in compressor block B',
    user: 'kurunegala_op',
    createdAt: '2026-08-31T08:30:00Z'
  },
  {
    id: 'DT-20260831-09',
    entryId: 'EB-20260831-KG-02',
    date: '2026-08-31',
    factory: 'Kurunegala',
    line: 'Line 02',
    supervisor: 'FATHIMA',
    product: 'UNDERWEAR KG',
    brand: 'EBONY',
    style: '861-0126-2B',
    downtimeMinutes: 270,
    downtimeCategory: 'PR4 - Potential Capacity Not Achieved',
    categoryCode: 'PR4',
    remarks: 'Elastic waistband tension adjustment line recalibration',
    user: 'kurunegala_op',
    createdAt: '2026-08-31T12:00:00Z'
  },
  {
    id: 'DT-20260901-10',
    entryId: 'EB-20260901-WP-02',
    date: '2026-09-01',
    factory: 'Werapola',
    line: 'Line 06',
    supervisor: 'KASUNI',
    product: 'TRIBURG SHIRT',
    brand: 'Triburg',
    style: '169161',
    downtimeMinutes: 340,
    downtimeCategory: 'EN1 - Machine Breakdown',
    categoryCode: 'EN1',
    remarks: 'Collar edge stitching machine motor overheated',
    user: 'werapola_op',
    createdAt: '2026-09-01T10:15:00Z'
  },
  {
    id: 'DT-20260901-11',
    entryId: 'EB-20260901-WP-02',
    date: '2026-09-01',
    factory: 'Werapola',
    line: 'Line 06',
    supervisor: 'KASUNI',
    product: 'TRIBURG SHIRT',
    brand: 'Triburg',
    style: '169161',
    downtimeMinutes: 280,
    downtimeCategory: 'RM1 - RM Issuing Delay',
    categoryCode: 'RM1',
    remarks: 'Main fabric roll shade variation inspection delay',
    user: 'werapola_op',
    createdAt: '2026-09-01T14:40:00Z'
  },
  {
    id: 'DT-20260902-12',
    entryId: 'EB-20260902-WP-03',
    date: '2026-09-02',
    factory: 'Werapola',
    line: 'Line 18',
    supervisor: 'HARSHANI',
    product: 'SHIRT WP',
    brand: 'EBONY',
    style: '26007L',
    downtimeMinutes: 310,
    downtimeCategory: 'CU1 - Cutting Input Delay',
    categoryCode: 'CU1',
    remarks: 'Sleeve placket matching bundles delayed from cutting',
    user: 'werapola_op',
    createdAt: '2026-09-02T11:20:00Z'
  }
];

function isLegacyMockDowntime(record: any): boolean {
  if (!record) return true;
  const brand = (record.brand || '').trim().toLowerCase();
  const style = (record.style || '').trim().toUpperCase();
  const mockBrands = ['van heusen', 'ralph lauren', 'tommy hilfiger', 'arrow'];
  const mockStyles = ['VH-9920-F', 'RL-5501-SLIM', 'TH-TR-402', 'ARW-7740'];
  return mockBrands.some(b => brand.includes(b)) || mockStyles.includes(style);
}

function loadDowntimeLogs() {
  try {
    if (fs.existsSync(DOWNTIME_LOGS_FILE)) {
      const raw = fs.readFileSync(DOWNTIME_LOGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Sanitize out any obsolete placeholder mock brands/styles
        const cleaned = parsed.filter(p => !isLegacyMockDowntime(p));
        if (cleaned.length > 0) {
          // If cleaned differs from original, save sanitized version
          if (cleaned.length !== parsed.length) {
            saveDowntimeLogs(cleaned);
          }
          return cleaned;
        }
      }
    }
  } catch (e) {
    console.error('Error loading downtime-logs.json', e);
  }
  saveDowntimeLogs(DEFAULT_SAMPLE_DOWNTIME_LOGS);
  return DEFAULT_SAMPLE_DOWNTIME_LOGS;
}

function saveDowntimeLogs(downtimeLogs: any[]) {
  try {
    fs.writeFileSync(DOWNTIME_LOGS_FILE, JSON.stringify(downtimeLogs, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving downtime-logs.json', e);
  }
}

function loadServerSheetConfig(): { sheetUrl: string; autoSync: boolean } {
  try {
    if (fs.existsSync(SHEET_CONFIG_FILE)) {
      const raw = fs.readFileSync(SHEET_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.sheetUrl === 'string' && parsed.sheetUrl.trim()) {
        return {
          sheetUrl: parsed.sheetUrl.trim(),
          autoSync: parsed.autoSync !== false
        };
      }
    }
  } catch (e) {
    console.error('Error loading sheet-config.json', e);
  }
  const envUrl = process.env.GOOGLE_SHEET_URL || process.env.GOOGLE_APPS_SCRIPT_URL || '';
  return { sheetUrl: envUrl || DEFAULT_SHEET_URL, autoSync: true };
}

function saveServerSheetConfig(config: { sheetUrl: string; autoSync?: boolean }) {
  try {
    fs.writeFileSync(SHEET_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error saving sheet-config.json', e);
  }
}

// Global server-stored sheet configuration endpoints
app.get('/api/sheet/config', (req, res) => {
  const config = loadServerSheetConfig();
  res.json({ success: true, ...config });
});

app.post('/api/sheet/config', (req, res) => {
  const { sheetUrl, autoSync } = req.body || {};
  const cleanUrl = typeof sheetUrl === 'string' ? sheetUrl.trim() : '';
  saveServerSheetConfig({ sheetUrl: cleanUrl, autoSync: autoSync !== false });
  res.json({
    success: true,
    sheetUrl: cleanUrl,
    autoSync: autoSync !== false,
    message: 'Google Sheet configuration permanently saved on server for all users!'
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * -------------------------------------------------------------
 * CENTRALIZED AUTHENTICATION & USERS SYNC ENDPOINTS
 * Ensures cross-device synchronization: accounts created or updated
 * on ANY device are immediately persisted and visible on all devices.
 * -------------------------------------------------------------
 */
// Initialize users and passwords on startup so files exist immediately on disk
loadServerUsers();
loadServerPasswords();

app.get('/api/users', (req, res) => {
  const users = loadServerUsers();
  const passwords = loadServerPasswords();
  res.json({ success: true, users, passwords });
});

app.post('/api/users/sync', (req, res) => {
  const { users, passwords } = req.body || {};
  let currentUsers = loadServerUsers();
  const currentPasswords = loadServerPasswords();

  if (Array.isArray(users) && users.length > 0) {
    const userMap = new Map(currentUsers.map(u => [u.username.toLowerCase(), u]));
    users.forEach(u => {
      if (u && u.username) {
        const lower = u.username.toLowerCase();
        if (!userMap.has(lower)) {
          currentUsers.push(u);
          userMap.set(lower, u);
        }
      }
    });
    saveServerUsers(currentUsers);
  }

  if (passwords && typeof passwords === 'object') {
    Object.assign(currentPasswords, passwords);
    saveServerPasswords(currentPasswords);
  }

  const finalUsers = loadServerUsers();
  const finalPasswords = loadServerPasswords();
  res.json({
    success: true,
    users: finalUsers,
    passwords: finalPasswords,
    message: 'User credentials and profiles synchronized across all devices successfully.'
  });
});

app.post('/api/users/register', (req, res) => {
  const { user, password } = req.body || {};
  if (!user || !user.username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }

  const users = loadServerUsers();
  const passwords = loadServerPasswords();

  const cleanUsername = String(user.username).trim().toLowerCase();
  const exists = users.some(u => u.username.toLowerCase() === cleanUsername);
  if (exists) {
    return res.status(400).json({ success: false, message: 'Username already exists.' });
  }

  const newUser = {
    id: user.id || `usr-${Date.now()}`,
    username: user.username.trim(),
    fullName: user.fullName || user.username,
    role: user.role || 'operator',
    factory: user.factory || 'Kurunegala',
    status: user.status || 'pending',
    createdAt: user.createdAt || new Date().toISOString().split('T')[0]
  };

  users.push(newUser);
  passwords[newUser.username] = password;

  saveServerUsers(users);
  saveServerPasswords(passwords);

  res.json({
    success: true,
    user: newUser,
    message: `Account "${newUser.username}" created successfully on the server.`
  });
});

app.post('/api/users/update', (req, res) => {
  const { username, details, password, status } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  const users = loadServerUsers();
  const passwords = loadServerPasswords();

  const targetIdx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (targetIdx === -1) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (details && typeof details === 'object') {
    users[targetIdx] = { ...users[targetIdx], ...details };
  }

  if (status) {
    users[targetIdx].status = status;
  }

  if (password && typeof password === 'string' && password.trim()) {
    passwords[users[targetIdx].username] = password.trim();
  }

  saveServerUsers(users);
  saveServerPasswords(passwords);

  res.json({
    success: true,
    user: users[targetIdx],
    passwords,
    message: `User "${users[targetIdx].username}" updated successfully on server.`
  });
});

app.post('/api/users/google-save', (req, res) => {
  const { email, name, factory, role, picture } = req.body || {};
  if (!email || typeof email !== 'string') {
    return res.status(400).json({ success: false, message: 'Verified email is required.' });
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = (name && typeof name === 'string' && name.trim()) ? name.trim() : cleanEmail.split('@')[0];
  const assignedFactory = factory || 'ALL';
  const assignedRole = role || 'operator';

  const users = loadServerUsers();
  const passwords = loadServerPasswords();

  const targetIdx = users.findIndex(
    u => u.username.toLowerCase() === cleanEmail || (u.email && u.email.toLowerCase() === cleanEmail)
  );

  // Check if primary central administrator
  const isPrimaryAdmin = cleanEmail === 'admin' || cleanEmail === 'hisanochana@gmail.com';

  let resultUser: any;

  if (targetIdx !== -1) {
    // Preserve existing authorization status from the Users Sheet!
    // Do NOT automatically override pending or suspended status.
    const existingStatus = users[targetIdx].status || (isPrimaryAdmin ? 'active' : 'pending');
    users[targetIdx] = {
      ...users[targetIdx],
      fullName: cleanName,
      factory: users[targetIdx].factory || assignedFactory,
      role: users[targetIdx].role || assignedRole,
      email: cleanEmail,
      picture: picture || users[targetIdx].picture || '',
      status: isPrimaryAdmin ? 'active' : existingStatus
    };
    resultUser = users[targetIdx];
  } else {
    // Create new Google user - default to 'pending' unless it is primary administrator
    // This enforces the requirement: user must receive approval from User Sheet
    resultUser = {
      id: `usr-google-${Date.now()}`,
      username: cleanEmail,
      email: cleanEmail,
      fullName: cleanName,
      role: isPrimaryAdmin ? 'admin' : assignedRole,
      factory: isPrimaryAdmin ? 'ALL' : assignedFactory,
      picture: picture || '',
      status: isPrimaryAdmin ? 'active' : 'pending',
      createdAt: new Date().toISOString().split('T')[0]
    };
    users.push(resultUser);
    passwords[resultUser.username] = 'google_sso_verified';
  }

  saveServerUsers(users);
  saveServerPasswords(passwords);

  // Sync to connected Google Sheet if available
  const sheetConfig = loadServerSheetConfig();
  if (sheetConfig.sheetUrl && sheetConfig.sheetUrl.includes('script.google.com')) {
    try {
      fetch(sheetConfig.sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SYNC_USER',
          user: resultUser
        }),
        redirect: 'follow'
      }).catch(err => console.warn('User sheet sync notice:', err.message));
    } catch {}
  }

  res.json({
    success: true,
    user: resultUser,
    message: resultUser.status === 'active'
      ? `Account for ${cleanName} (${cleanEmail}) authorized successfully.`
      : `Account for ${cleanName} (${cleanEmail}) saved in Users Sheet. Awaiting approval from Central Administrator.`
  });
});

app.put('/api/users/:username', (req, res) => {
  const username = req.params.username;
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  const { details, password, status, role, factory } = req.body || {};
  const users = loadServerUsers();
  const passwords = loadServerPasswords();

  const targetIdx = users.findIndex(u => u.username.toLowerCase() === username.toLowerCase());
  if (targetIdx === -1) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (details && typeof details === 'object') {
    users[targetIdx] = { ...users[targetIdx], ...details };
  }
  if (status) {
    users[targetIdx].status = status;
  }
  if (role) {
    users[targetIdx].role = role;
  }
  if (factory) {
    users[targetIdx].factory = factory;
  }
  if (password && typeof password === 'string' && password.trim()) {
    passwords[users[targetIdx].username] = password.trim();
  }

  saveServerUsers(users);
  saveServerPasswords(passwords);

  res.json({
    success: true,
    user: users[targetIdx],
    passwords,
    message: `User "${users[targetIdx].username}" updated successfully on server.`
  });
});

app.delete('/api/users/:username', (req, res) => {
  const username = req.params.username;
  if (!username || username === 'admin') {
    return res.status(400).json({ success: false, message: 'Cannot delete central administrator.' });
  }

  let users = loadServerUsers();
  const passwords = loadServerPasswords();

  users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
  delete passwords[username];

  saveServerUsers(users);
  saveServerPasswords(passwords);

  res.json({ success: true, message: `User "${username}" deleted from server.` });
});

// Submit password reset request - requires admin approval before new password is activated
app.post('/api/users/reset-password', (req, res) => {
  const { username, factory, newPassword, reason } = req.body || {};
  if (!username || !newPassword) {
    return res.status(400).json({ success: false, message: 'Username and new password are required.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 4) {
    return res.status(400).json({ success: false, message: 'New password must be at least 4 characters long.' });
  }

  const users = loadServerUsers();

  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ success: false, message: 'Account not found. Please verify your username.' });
  }

  // Security check: verify factory allocation if provided
  if (user.role !== 'admin' && factory && user.factory !== 'ALL' && user.factory !== factory) {
    return res.status(403).json({
      success: false,
      message: 'Security verification failed: Selected factory does not match the factory allocated to this account.'
    });
  }

  // Record pending password reset request - do NOT update password directly
  user.pendingPasswordReset = {
    requestedPassword: newPassword.trim(),
    requestedAt: new Date().toISOString(),
    factory: factory || user.factory,
    reason: reason || 'Password reset requested via Forgot Password'
  };
  // Account is put into pending approval state so they cannot log in directly
  user.status = 'pending';

  saveServerUsers(users);

  res.json({
    success: true,
    requiresApproval: true,
    message: `Password reset request for "${user.username}" has been submitted to the Central Administrator for approval. For system security, your account remains pending until an Admin reviews and approves the request.`
  });
});

// Admin approves password reset
app.post('/api/users/approve-password-reset', (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  const users = loadServerUsers();
  const passwords = loadServerPasswords();

  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (!user.pendingPasswordReset || !user.pendingPasswordReset.requestedPassword) {
    return res.status(400).json({ success: false, message: 'No pending password reset request found for this user.' });
  }

  const newPass = user.pendingPasswordReset.requestedPassword;
  passwords[user.username] = newPass;
  delete user.pendingPasswordReset;
  user.status = 'active';

  saveServerUsers(users);
  saveServerPasswords(passwords);

  res.json({
    success: true,
    message: `Password reset approved for "${user.username}". The new password is now active and the account has been reactivated.`
  });
});

// Admin rejects password reset
app.post('/api/users/reject-password-reset', (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  const users = loadServerUsers();
  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  delete user.pendingPasswordReset;
  const passwords = loadServerPasswords();
  if (passwords[user.username]) {
    user.status = 'active';
  }

  saveServerUsers(users);

  res.json({
    success: true,
    message: `Password reset request for "${user.username}" was rejected.`
  });
});

// User requests role change
app.post('/api/users/request-role-change', (req, res) => {
  const { username, requestedRole, reason } = req.body || {};
  if (!username || !requestedRole) {
    return res.status(400).json({ success: false, message: 'Username and requested role are required.' });
  }

  const validRoles = ['operator', 'supervisor', 'manager', 'admin', 'viewer'];
  if (!validRoles.includes(requestedRole)) {
    return res.status(400).json({ success: false, message: 'Invalid requested role.' });
  }

  const users = loadServerUsers();
  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  user.pendingRoleChange = {
    requestedRole,
    requestedAt: new Date().toISOString(),
    reason: reason || 'User requested role change'
  };

  saveServerUsers(users);

  res.json({
    success: true,
    message: `Role change request to "${requestedRole}" for "${user.username}" has been submitted for Central Admin approval.`
  });
});

// Admin approves role change
app.post('/api/users/approve-role-change', (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  const users = loadServerUsers();
  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  if (!user.pendingRoleChange || !user.pendingRoleChange.requestedRole) {
    return res.status(400).json({ success: false, message: 'No pending role change request for this user.' });
  }

  const newRole = user.pendingRoleChange.requestedRole;
  user.role = newRole;
  delete user.pendingRoleChange;

  saveServerUsers(users);

  res.json({
    success: true,
    message: `Role change approved for "${user.username}". New role is now "${newRole}".`
  });
});

// Admin rejects role change
app.post('/api/users/reject-role-change', (req, res) => {
  const { username } = req.body || {};
  if (!username) {
    return res.status(400).json({ success: false, message: 'Username is required.' });
  }

  const users = loadServerUsers();
  const user = users.find(u => u.username.toLowerCase() === username.trim().toLowerCase());
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  delete user.pendingRoleChange;
  saveServerUsers(users);

  res.json({
    success: true,
    message: `Role change request for "${user.username}" was rejected.`
  });
});

/**
 * -------------------------------------------------------------
 * DATA CHANGE REQUESTS (Factory Data Ops -> Admin Workflow)
 * Factory data ops request delete or edit data from production logs.
 * Admin reviews and approves/rejects; approved deletions/edits sync to sheet.
 * -------------------------------------------------------------
 */
app.get('/api/requests', (req, res) => {
  const requests = loadChangeRequests();
  res.json({ success: true, requests });
});

app.post('/api/requests', (req, res) => {
  const { type, entryId, logSnapshot, proposedChanges, reason, requestedBy } = req.body || {};
  if (!type || !entryId || !requestedBy) {
    return res.status(400).json({ success: false, message: 'Missing required request parameters.' });
  }

  const requests = loadChangeRequests();
  const newReq = {
    id: `REQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: type === 'EDIT' ? 'EDIT' : 'DELETE',
    entryId,
    logSnapshot: logSnapshot || {},
    proposedChanges: proposedChanges || null,
    reason: reason || 'Operation request',
    requestedBy,
    requestedAt: new Date().toISOString(),
    status: 'PENDING'
  };

  requests.unshift(newReq);
  saveChangeRequests(requests);

  res.json({
    success: true,
    request: newReq,
    message: `Change request for entry ${entryId} sent to central administrator.`
  });
});

app.post('/api/requests/review', (req, res) => {
  const { requestId, status, reviewedBy, reviewNotes } = req.body || {};
  if (!requestId || !status || !['APPROVED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Valid requestId and status (APPROVED/REJECTED) required.' });
  }

  const requests = loadChangeRequests();
  const target = requests.find(r => r.id === requestId);
  if (!target) {
    return res.status(404).json({ success: false, message: 'Request not found.' });
  }

  target.status = status;
  target.reviewedBy = reviewedBy || 'admin';
  target.reviewedAt = new Date().toISOString();
  target.reviewNotes = reviewNotes || '';

  saveChangeRequests(requests);
  res.json({ success: true, request: target, message: `Request status updated to ${status}.` });
});

/**
 * -------------------------------------------------------------
 * DOWNTIME CATEGORY TRACKING ENDPOINTS
 * Records and retrieves downtime data: Date, Factory, Line, Supervisor,
 * Product, Brand, Style, Down Time Minutes, Down Time Category, Remarks, User
 * -------------------------------------------------------------
 */
app.get('/api/downtime-logs', (req, res) => {
  const downtimeLogs = loadDowntimeLogs();
  res.json({ success: true, downtimeLogs });
});

app.post('/api/downtime-logs', async (req, res) => {
  const { records } = req.body || {};
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, message: 'No downtime records provided.' });
  }

  const currentDowntimes = loadDowntimeLogs();
  const stampedRecords = records.map(r => {
    const rawCategory = r.downtimeCategory || 'OTHER - Other';
    const rawCode = r.categoryCode || (rawCategory ? rawCategory.split(' ')[0] : 'OTHER');
    return {
      id: r.id || `DT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      entryId: r.entryId || r.Entry_ID || '',
      date: r.date || new Date().toISOString().split('T')[0],
      factory: r.factory,
      line: r.line,
      supervisor: r.supervisor || '',
      product: r.product || '',
      brand: r.brand || '',
      style: r.style || '',
      downtimeMinutes: Number(r.downtimeMinutes) || 0,
      downtimeCategory: rawCategory,
      categoryCode: rawCode,
      remarks: r.remarks || '',
      user: r.user || 'operator',
      createdAt: r.createdAt || new Date().toISOString()
    };
  });

  currentDowntimes.unshift(...stampedRecords);
  saveDowntimeLogs(currentDowntimes);

  // Attempt to synchronize downtime logs to Google Sheet if Web App is configured
  const sheetConfig = loadServerSheetConfig();
  if (sheetConfig.sheetUrl && sheetConfig.sheetUrl.includes('script.google.com')) {
    try {
      fetch(sheetConfig.sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'SUBMIT_DOWNTIME_LOGS',
          records: stampedRecords
        }),
        redirect: 'follow'
      }).catch(err => console.warn('Downtime sheet sync async notice:', err.message));
    } catch (e) {
      // Non-blocking
    }
  }

  res.json({
    success: true,
    added: stampedRecords.length,
    downtimeLogs: stampedRecords,
    message: `Successfully logged ${stampedRecords.length} downtime category records!`
  });
});

app.delete('/api/downtime-logs/:id', (req, res) => {
  const { id } = req.params;
  const currentDowntimes = loadDowntimeLogs();
  const filtered = currentDowntimes.filter(d => d.id !== id);
  if (filtered.length === currentDowntimes.length) {
    return res.status(404).json({ success: false, message: 'Downtime record not found.' });
  }
  saveDowntimeLogs(filtered);
  res.json({ success: true, message: 'Downtime record removed successfully.' });
});

// Amend / update an existing downtime incident record
app.put('/api/downtime-logs/:id', (req, res) => {
  const { id } = req.params;
  const updates = req.body || {};
  const currentDowntimes = loadDowntimeLogs();
  const index = currentDowntimes.findIndex(d => d.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Downtime record not found.' });
  }

  const existing = currentDowntimes[index];
  const rawCategory = updates.downtimeCategory || existing.downtimeCategory;
  const rawCode = updates.categoryCode || (rawCategory ? rawCategory.split(' ')[0] : existing.categoryCode);

  const updatedRecord = {
    ...existing,
    ...updates,
    id: existing.id, // prevent changing ID
    categoryCode: rawCode,
    downtimeCategory: rawCategory,
    downtimeMinutes: updates.downtimeMinutes !== undefined ? Number(updates.downtimeMinutes) : existing.downtimeMinutes,
    updatedAt: new Date().toISOString()
  };

  currentDowntimes[index] = updatedRecord;
  saveDowntimeLogs(currentDowntimes);

  // Sync amendment to Google Sheet
  const sheetConfig = loadServerSheetConfig();
  if (sheetConfig.sheetUrl && sheetConfig.sheetUrl.includes('script.google.com')) {
    try {
      fetch(sheetConfig.sheetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_DOWNTIME_LOG',
          record: updatedRecord
        }),
        redirect: 'follow'
      }).catch(err => console.warn('Downtime amend sheet sync notice:', err.message));
    } catch {}
  }

  res.json({
    success: true,
    record: updatedRecord,
    message: `Downtime incident #${id} updated successfully.`
  });
});

app.post('/api/downtime-logs/amend', (req, res) => {
  const { id, ...updates } = req.body || {};
  if (!id) {
    return res.status(400).json({ success: false, message: 'Record ID is required.' });
  }
  const currentDowntimes = loadDowntimeLogs();
  const index = currentDowntimes.findIndex(d => d.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, message: 'Downtime record not found.' });
  }

  const existing = currentDowntimes[index];
  const rawCategory = updates.downtimeCategory || existing.downtimeCategory;
  const rawCode = updates.categoryCode || (rawCategory ? rawCategory.split(' ')[0] : existing.categoryCode);

  const updatedRecord = {
    ...existing,
    ...updates,
    id: existing.id,
    categoryCode: rawCode,
    downtimeCategory: rawCategory,
    downtimeMinutes: updates.downtimeMinutes !== undefined ? Number(updates.downtimeMinutes) : existing.downtimeMinutes,
    updatedAt: new Date().toISOString()
  };

  currentDowntimes[index] = updatedRecord;
  saveDowntimeLogs(currentDowntimes);

  res.json({
    success: true,
    record: updatedRecord,
    message: `Downtime incident #${id} amended successfully.`
  });
});

/**
 * -------------------------------------------------------------
 * DAILY PRODUCTION ACTUAL & PLANNED QUANTITY DATABASE ENDPOINTS
 * Records and tracks daily actual and planned quantities using the date
 * to feed the Production Status visuals and variance charts.
 * -------------------------------------------------------------
 */
app.get('/api/daily-production', (req, res) => {
  const { date, factory, month } = req.query as { date?: string; factory?: string; month?: string };
  let records = loadDailyProductionRecords();

  if (date) {
    records = records.filter(r => r.date === date);
  }
  if (factory && factory !== 'ALL') {
    records = records.filter(r => r.factory === factory);
  }
  if (month) {
    records = records.filter(r => r.date && r.date.startsWith(month));
  }

  res.json({ success: true, records });
});

app.post('/api/daily-production', (req, res) => {
  const { date, factory, product, plannedQty, actualQty } = req.body || {};
  if (!date || !factory || !product) {
    return res.status(400).json({ success: false, message: 'Date, factory, and product are required.' });
  }

  const records = loadDailyProductionRecords();
  const plan = Number(plannedQty) || 0;
  const act = Number(actualQty) || 0;
  const variance = plan - act;

  const existingIdx = records.findIndex(
    r => r.date === date && r.factory.toLowerCase() === factory.toLowerCase() && r.product.toLowerCase() === product.toLowerCase()
  );

  const entry: DailyProductionRecord = {
    date,
    factory,
    product,
    plannedQty: plan,
    actualQty: act,
    qtyVariance: variance,
    updatedAt: new Date().toISOString()
  };

  if (existingIdx !== -1) {
    records[existingIdx] = entry;
  } else {
    records.push(entry);
  }

  saveDailyProductionRecords(records);
  res.json({ success: true, record: entry, message: `Recorded daily quantity for ${product} on ${date}.` });
});

app.post('/api/daily-production/record-batch', (req, res) => {
  const { records } = req.body || {};
  if (!Array.isArray(records)) {
    return res.status(400).json({ success: false, message: 'Records array is required.' });
  }

  const currentRecords = loadDailyProductionRecords();
  const map = new Map<string, DailyProductionRecord>();

  currentRecords.forEach(r => {
    map.set(`${r.date}|${r.factory.toLowerCase()}|${r.product.toLowerCase()}`, r);
  });

  records.forEach((r: any) => {
    if (r && r.date && r.factory && r.product) {
      const plan = Number(r.plannedQty !== undefined ? r.plannedQty : r.Planned_QTY) || 0;
      const act = Number(r.actualQty !== undefined ? r.actualQty : r.Actual_QTY) || 0;
      const key = `${r.date}|${r.factory.toLowerCase()}|${r.product.toLowerCase()}`;
      map.set(key, {
        date: r.date,
        factory: r.factory,
        product: r.product,
        plannedQty: plan,
        actualQty: act,
        qtyVariance: plan - act,
        updatedAt: new Date().toISOString()
      });
    }
  });

  const updatedList = Array.from(map.values());
  saveDailyProductionRecords(updatedList);

  res.json({
    success: true,
    totalRecords: updatedList.length,
    message: `Recorded ${records.length} daily production quantities in database.`
  });
});

/**
 * Server-side Sheet Fetch Proxy
 * Bypasses all browser CORS limitations for Google Sheets and Google Apps Script
 */
app.post('/api/sheet/fetch', async (req, res) => {
  const { url } = req.body || {};
  let cleanUrl = (url || '').trim();

  // Fallback to server-persisted sheet URL if not provided
  if (!cleanUrl) {
    cleanUrl = loadServerSheetConfig().sheetUrl;
  }

  if (!cleanUrl) {
    return res.status(400).json({
      success: false,
      message: 'No Google Sheet or Web App URL configured. Please configure it in the Google Sheet setup modal.'
    });
  }

  // Check 1: Is user passing an Apps Script Editor URL?
  if (cleanUrl.includes('script.google.com') && cleanUrl.includes('/edit')) {
    return res.status(400).json({
      success: false,
      message: 'You entered the Apps Script Editor URL. Please click "Deploy" > "New deployment" > "Web app", set access to "Anyone", and copy the Web App URL that ends with /exec.'
    });
  }

  // Check 2: Direct Google Sheet URL (docs.google.com/spreadsheets/d/...)
  const docMatch = cleanUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const isPubUrl = cleanUrl.includes('/pub?output=csv') || cleanUrl.includes('/pubhtml');

  if (docMatch || isPubUrl) {
    let candidateUrls: string[] = [];

    if (docMatch) {
      const spreadsheetId = docMatch[1];
      const gidMatch = cleanUrl.match(/[?&#]gid=([0-9]+)/);
      const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';

      candidateUrls = [
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv${gidParam}`,
        `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv${gidParam}`
      ];
    } else {
      // Published URL
      candidateUrls = [cleanUrl.replace('/pubhtml', '/pub?output=csv')];
    }

    let lastError = '';
    for (const expUrl of candidateUrls) {
      try {
        const response = await fetch(expUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          redirect: 'follow'
        });

        const text = await response.text();

        // Check if Google redirected to a sign-in or authorization page
        if (text.includes('ServiceLogin') || text.includes('accounts.google.com') || (text.includes('<!DOCTYPE') && text.includes('<html'))) {
          return res.status(403).json({
            success: false,
            message: 'Google Sheet is not shared publicly. In your Google Sheet, click "Share" (top right), change General Access from "Restricted" to "Anyone with the link can view" (or viewable by Anyone), and click Done.'
          });
        }

        if (response.ok && text.length > 20) {
          return res.json({
            success: true,
            format: 'csv',
            csvText: text,
            message: 'Successfully retrieved Google Sheet CSV directly from Google servers!'
          });
        } else {
          lastError = `HTTP ${response.status} ${response.statusText}`;
        }
      } catch (err: any) {
        lastError = err.message || 'Fetch error';
      }
    }

    return res.status(502).json({
      success: false,
      message: `Could not retrieve CSV from Google Sheet: ${lastError}. Make sure the sheet is shared as "Anyone with the link can view".`
    });
  }

  // Check 3: Google Apps Script Web App (script.google.com/macros/s/.../exec)
  if (cleanUrl.includes('script.google.com')) {
    let targetUrl = cleanUrl;

    if (targetUrl.endsWith('/dev')) {
      // /dev requires Google Workspace login, try /exec
      targetUrl = targetUrl.replace(/\/dev$/, '/exec');
    }

    const queryUrl = targetUrl.includes('?') ? `${targetUrl}&action=GET_ALL_LOGS` : `${targetUrl}?action=GET_ALL_LOGS`;

    try {
      const response = await fetch(queryUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        },
        redirect: 'follow'
      });

      const contentType = response.headers.get('content-type') || '';
      const text = await response.text();

      // Check if response is Google Login page (occurs when Apps Script is not deployed to "Anyone")
      if (text.includes('accounts.google.com') || (text.includes('<!DOCTYPE') && text.includes('Google Drive'))) {
        return res.status(403).json({
          success: false,
          message: 'Google Apps Script deployment is restricted. In Apps Script, click "Deploy" > "Manage deployments" > Edit, and ensure "Who has access" is set to "Anyone" (not "Only myself" or restricted to your company domain).'
        });
      }

      // Try parsing as JSON
      try {
        const json = JSON.parse(text);
        if (json.status === 'success' && Array.isArray(json.logs)) {
          try {
            fs.writeFileSync(SHEET_LOGS_CACHE_FILE, JSON.stringify(json.logs), 'utf-8');
          } catch (cacheErr) {
            console.warn('Could not write to logs cache file:', cacheErr);
          }
          return res.json({
            success: true,
            format: 'json',
            logs: json.logs,
            message: `Retrieved ${json.logs.length} logs from Google Apps Script Web App!`
          });
        } else if (json.message) {
          return res.status(400).json({
            success: false,
            message: `Apps Script response: ${json.message}`
          });
        }
      } catch {
        // If not JSON, check if it's CSV text returned by Apps Script
        if (text.length > 50 && text.includes(',')) {
          return res.json({
            success: true,
            format: 'csv',
            csvText: text,
            message: 'Retrieved CSV from Google Apps Script!'
          });
        }
      }

      // Check if we have cached logs to fall back on
      if (fs.existsSync(SHEET_LOGS_CACHE_FILE)) {
        try {
          const rawCache = fs.readFileSync(SHEET_LOGS_CACHE_FILE, 'utf-8');
          const cached = JSON.parse(rawCache);
          if (Array.isArray(cached) && cached.length > 0) {
            return res.json({
              success: true,
              format: 'json',
              logs: cached,
              message: `Retrieved ${cached.length} cached logs (fallback).`
            });
          }
        } catch {}
      }

      return res.status(502).json({
        success: false,
        message: `Received unexpected response from Apps Script (${contentType}): ${text.substring(0, 200)}...`
      });
    } catch (err: any) {
      // If error occurs, check if we have cached logs
      if (fs.existsSync(SHEET_LOGS_CACHE_FILE)) {
        try {
          const rawCache = fs.readFileSync(SHEET_LOGS_CACHE_FILE, 'utf-8');
          const cached = JSON.parse(rawCache);
          if (Array.isArray(cached) && cached.length > 0) {
            return res.json({
              success: true,
              format: 'json',
              logs: cached,
              message: `Retrieved ${cached.length} cached logs from disk.`
            });
          }
        } catch {}
      }
      return res.status(502).json({
        success: false,
        message: `Network error connecting to Apps Script: ${err.message || 'Failed to reach host'}`
      });
    }
  }

  return res.status(400).json({
    success: false,
    message: 'Unrecognized URL. Please provide a Google Sheet link (docs.google.com/spreadsheets/d/...) or an Apps Script Web App link (script.google.com/macros/s/.../exec).'
  });
});

/**
 * Server-side Append Proxy for Apps Script
 */
app.post('/api/sheet/append', async (req, res) => {
  const { url, records, user, spreadsheetId } = req.body || {};
  let cleanUrl = (url || '').trim();

  // Fallback to server-persisted sheet URL if not provided
  if (!cleanUrl) {
    cleanUrl = loadServerSheetConfig().sheetUrl;
  }

  if (!cleanUrl) {
    return res.status(400).json({
      success: false,
      message: 'No Google Sheet or Web App URL configured. Please configure it in the Google Sheet setup modal.'
    });
  }

  // If user passed a spreadsheet link instead of Apps Script
  if (cleanUrl.includes('docs.google.com/spreadsheets')) {
    return res.status(400).json({
      success: false,
      message: 'Direct Google Spreadsheet links (docs.google.com) are Read-Only. Google Sheets requires an Apps Script Web App (.../exec) to append rows into the spreadsheet. Please click "Apps Script" in the top navigation to set up your Web App connector.'
    });
  }

  if (!cleanUrl.includes('script.google.com')) {
    return res.status(400).json({
      success: false,
      message: 'URL must be a deployed Google Apps Script Web App link ending with /exec.'
    });
  }

  let targetUrl = cleanUrl;
  if (targetUrl.endsWith('/dev')) {
    targetUrl = targetUrl.replace(/\/dev$/, '/exec');
  }

  try {
    const slTimestamp = (() => {
      try {
        const formatter = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Asia/Colombo',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });
        const parts = formatter.formatToParts(new Date());
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
        return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
      } catch {
        return new Date().toISOString().replace('T', ' ').substring(0, 19);
      }
    })();

    const payload = {
      action: 'SUBMIT_LOGS',
      records: records || [],
      user: user || 'operator',
      spreadsheetId: spreadsheetId || undefined,
      timestamp: slTimestamp
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      redirect: 'follow'
    });

    const text = await response.text();

    // Check if Google redirected to a sign-in or authorization page
    if (text.includes('accounts.google.com') || (text.includes('<!DOCTYPE') && text.includes('Google Drive'))) {
      return res.status(403).json({
        success: false,
        message: 'Google Apps Script blocked the write request. In Apps Script, click "Deploy" > "Manage deployments" > Edit, ensure "Who has access" is set to "Anyone", and click Deploy.'
      });
    }

    if (text.includes('Script function not found')) {
      return res.status(400).json({
        success: false,
        message: 'The Apps Script is missing the doPost function. Please paste the updated Code.gs and deploy a New Version.'
      });
    }

    try {
      const data = JSON.parse(text);
      if (data.status === 'success' || data.added !== undefined) {
        try {
          if (fs.existsSync(SHEET_LOGS_CACHE_FILE) && Array.isArray(records) && records.length > 0) {
            const rawCache = fs.readFileSync(SHEET_LOGS_CACHE_FILE, 'utf-8');
            const cached = JSON.parse(rawCache);
            if (Array.isArray(cached)) {
              cached.push(...records);
              fs.writeFileSync(SHEET_LOGS_CACHE_FILE, JSON.stringify(cached), 'utf-8');
            }
          }
        } catch (cacheAppendErr) {
          console.warn('Could not append to server logs cache:', cacheAppendErr);
        }
        return res.json({
          success: true,
          message: `Successfully appended ${data.added || records?.length || 0} rows directly into Google Sheet!`,
          data
        });
      } else if (data.status === 'error' || data.message) {
        return res.status(400).json({
          success: false,
          message: `Apps Script reported an error: ${data.message || 'Failed to append rows'}`
        });
      }
    } catch {
      // If not JSON
      if (response.ok) {
        return res.json({
          success: true,
          message: `Sent ${records?.length || 0} row(s) to Google Sheet Web App.`
        });
      }
    }

    return res.status(502).json({
      success: false,
      message: `Unexpected response from Google Apps Script: ${text.substring(0, 180)}`
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      message: `Failed to deliver records to Apps Script: ${err.message || 'Connection error'}`
    });
  }
});

/**
 * Server-side Delete Logs Proxy: Synchronizes deletions to Google Sheet!
 * Supports deleting single entries by entryId or bulk deleting by date range and factory.
 */
app.post('/api/sheet/delete-range', async (req, res) => {
  const { sheetUrl, startDate, endDate, factory, entryId, user } = req.body || {};
  let targetUrl = (sheetUrl || '').trim();

  if (!targetUrl) {
    targetUrl = loadServerSheetConfig().sheetUrl;
  }

  // Update local server logs cache if present
  try {
    if (fs.existsSync(SHEET_LOGS_CACHE_FILE)) {
      const rawCache = fs.readFileSync(SHEET_LOGS_CACHE_FILE, 'utf-8');
      const cached = JSON.parse(rawCache);
      if (Array.isArray(cached)) {
        const filtered = cached.filter((item: any) => {
          if (entryId && item.Entry_ID === entryId) return false;
          const d = item.Date;
          const inRange = (!startDate || d >= startDate) && (!endDate || d <= endDate);
          const inFactory = !factory || factory === 'ALL' || item.Factory === factory;
          if (startDate || endDate || (factory && factory !== 'ALL')) {
            if (inRange && inFactory) return false;
          }
          return true;
        });
        fs.writeFileSync(SHEET_LOGS_CACHE_FILE, JSON.stringify(filtered), 'utf-8');
      }
    }
  } catch (err) {
    console.warn('Cache update warning on delete:', err);
  }

  if (!targetUrl || !targetUrl.includes('script.google.com')) {
    return res.json({
      success: true,
      message: 'Local logs deleted. Notice: To delete rows directly from the Google Sheet, ensure Apps Script Web App is connected.'
    });
  }

  try {
    const payload = {
      action: 'DELETE_LOGS',
      startDate: startDate || '',
      endDate: endDate || '',
      factory: factory || 'ALL',
      entryId: entryId || '',
      user: user || 'admin'
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      redirect: 'follow'
    });

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      return res.json({
        success: true,
        deletedCount: data.deletedCount || 0,
        message: data.message || `Deleted ${data.deletedCount || 0} rows from Google Sheet successfully.`
      });
    } catch {
      return res.json({
        success: true,
        message: 'Delete request delivered to Google Sheet Apps Script.'
      });
    }
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      message: `Failed to contact Google Apps Script to delete records: ${err.message}`
    });
  }
});

/**
 * Server-side Update Log Proxy: Synchronizes edited/amended logs to Google Sheet!
 * Updates local cache and delivers updated record to Google Apps Script.
 */
app.post('/api/sheet/update-entry', async (req, res) => {
  const { sheetUrl, record, user } = req.body || {};
  if (!record || !record.Entry_ID) {
    return res.status(400).json({ success: false, message: 'Record with Entry_ID is required.' });
  }

  // Update local server logs cache if present
  try {
    if (fs.existsSync(SHEET_LOGS_CACHE_FILE)) {
      const rawCache = fs.readFileSync(SHEET_LOGS_CACHE_FILE, 'utf-8');
      const cached = JSON.parse(rawCache);
      if (Array.isArray(cached)) {
        const idx = cached.findIndex((item: any) => item.Entry_ID === record.Entry_ID);
        if (idx !== -1) {
          cached[idx] = { ...cached[idx], ...record };
        } else {
          cached.unshift(record);
        }
        fs.writeFileSync(SHEET_LOGS_CACHE_FILE, JSON.stringify(cached), 'utf-8');
      }
    }
  } catch (err) {
    console.warn('Cache update warning on update-entry:', err);
  }

  let targetUrl = (sheetUrl || '').trim();
  if (!targetUrl) {
    targetUrl = loadServerSheetConfig().sheetUrl;
  }

  if (!targetUrl || !targetUrl.includes('script.google.com')) {
    return res.json({
      success: true,
      message: 'Log updated in local cache. Notice: To sync changes directly to the Google Sheet, ensure Apps Script is connected.'
    });
  }

  try {
    const payload = {
      action: 'UPDATE_LOG',
      record,
      user: user || 'admin'
    };

    const response = await fetch(targetUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      redirect: 'follow'
    });

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (data.status === 'success' || data.success === true) {
        return res.json({
          success: true,
          message: data.message || `Log entry ${record.Entry_ID} updated in Google Sheet successfully.`
        });
      } else if (data.message && data.message.includes('Unknown action')) {
        // Fallback for older Apps Script versions: delete old row and append updated row
        const delRes = await fetch(targetUrl, {
          method: 'POST',
          body: JSON.stringify({ action: 'DELETE_LOGS', entryId: record.Entry_ID, user: user || 'admin' }),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow'
        });
        await delRes.text();
        const appendRes = await fetch(targetUrl, {
          method: 'POST',
          body: JSON.stringify({ action: 'SUBMIT_LOGS', records: [record], user: user || 'admin' }),
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          redirect: 'follow'
        });
        await appendRes.text();
        return res.json({
          success: true,
          message: `Log entry ${record.Entry_ID} resubmitted to Google Sheet successfully.`
        });
      }
      return res.json({
        success: true,
        message: data.message || 'Log update processed.'
      });
    } catch {
      return res.json({
        success: true,
        message: 'Update request delivered to Google Apps Script.'
      });
    }
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      message: `Failed to contact Google Apps Script to update record: ${err.message}`
    });
  }
});

/**
 * Server-side URL Connection Tester
 */
app.post('/api/sheet/test', async (req, res) => {
  const { url } = req.body || {};
  const cleanUrl = (url || '').trim();

  if (!cleanUrl) {
    return res.status(400).json({ success: false, message: 'Please provide a URL to test.' });
  }

  if (cleanUrl.includes('script.google.com') && cleanUrl.includes('/edit')) {
    return res.json({
      success: false,
      message: 'This is the Apps Script editor URL. Please deploy as Web App and use the /exec link.'
    });
  }

  const docMatch = cleanUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (docMatch) {
    try {
      const testUrl = `https://docs.google.com/spreadsheets/d/${docMatch[1]}/gviz/tq?tqx=out:csv`;
      const response = await fetch(testUrl, { redirect: 'follow' });
      const text = await response.text();

      if (text.includes('ServiceLogin') || text.includes('accounts.google.com')) {
        return res.json({
          success: false,
          message: 'Spreadsheet is not public. Please set sharing to "Anyone with the link can view".'
        });
      }

      if (response.ok && text.length > 10) {
        return res.json({
          success: true,
          type: 'sheet',
          isReadOnly: true,
          message: 'Direct Google Sheet link confirmed (Read-Only). Live dashboard reading is active. Note: To record new shift logs directly back into your sheet, deploy the 1-minute Apps Script Web App.'
        });
      }

      return res.json({
        success: false,
        message: 'Could not access sheet. Ensure sharing is set to "Anyone with the link can view".'
      });
    } catch (err: any) {
      return res.json({
        success: false,
        message: `Failed to reach Google Sheet: ${err.message}`
      });
    }
  }

  if (cleanUrl.includes('script.google.com')) {
    try {
      const testUrl = cleanUrl.includes('?') ? `${cleanUrl}&action=TEST` : `${cleanUrl}?action=TEST`;
      const response = await fetch(testUrl, { redirect: 'follow' });
      const text = await response.text();

      if (text.includes('accounts.google.com')) {
        return res.json({
          success: false,
          message: 'Apps Script requires authorization or is not deployed to "Anyone".'
        });
      }

      return res.json({
        success: true,
        type: 'script',
        message: 'Google Apps Script Web App reached successfully! Bi-directional read & write enabled.'
      });
    } catch (err: any) {
      return res.json({
        success: false,
        message: `Could not reach Apps Script Web App: ${err.message}`
      });
    }
  }

  return res.json({
    success: false,
    message: 'URL must be a Google Spreadsheet link (docs.google.com) or an Apps Script link (script.google.com).'
  });
});

// Start server with Vite middleware in dev or static serving in production
async function startServer() {
  const isDev =
    process.env.NODE_ENV === 'development' ||
    process.env.npm_lifecycle_event === 'dev' ||
    process.argv.some(arg => arg.includes('tsx'));

  const distPath = path.join(process.cwd(), 'dist');
  const distExists = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = !isDev && (process.env.NODE_ENV === 'production' || distExists);

  if (!isProduction) {
    try {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true, hmr: false },
        appType: 'spa'
      });
      app.use(vite.middlewares);
      console.log('[SERVER] Running in DEVELOPMENT mode with Vite middleware.');
    } catch (viteErr) {
      console.warn('[SERVER] Vite dev middleware could not be loaded, falling back to static:', viteErr);
      app.use(express.static(distPath));
    }
  } else {
    console.log('[SERVER] Running in PRODUCTION mode serving static bundle.');
    app.use(express.static(distPath, { maxAge: '1h', etag: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ success: false, message: `API route ${req.method} ${req.path} not found` });
      }
      const indexPath = path.join(distPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath, (err) => {
          if (err && !res.headersSent) {
            next(err);
          }
        });
      }
      res.status(404).send('Not Found');
    });
  }

  // Determine port: Cloud Run / standard 3000
  const preferredPort = process.env.DEFAULT_APP_PORT
    ? parseInt(process.env.DEFAULT_APP_PORT, 10)
    : (process.env.PORT && process.env.PORT !== '8080' ? parseInt(process.env.PORT, 10) : 3000);

  const listenOnPort = (port: number) => {
    const srv = app.listen(port, '0.0.0.0', () => {
      console.log(`[SERVER] App successfully running on http://0.0.0.0:${port}`);
    });

    srv.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.warn(`[SERVER] Port ${port} is already in use.`);
        if (port !== 3000) {
          console.log('[SERVER] Retrying on port 3000...');
          listenOnPort(3000);
        } else if (process.env.PORT && parseInt(process.env.PORT, 10) !== 3000) {
          const altPort = parseInt(process.env.PORT, 10);
          console.log(`[SERVER] Retrying on PORT=${altPort}...`);
          listenOnPort(altPort);
        }
      } else {
        console.error('[SERVER] Server listen error:', err);
      }
    });
  };

  listenOnPort(preferredPort);
}

startServer();
