import { FactoryName, ProductionLog, User } from '../types';
import { RAW_SHEET_CSV } from './rawSheetData';
import { parseSheetData } from '../utils/csvParser';
import { normalizeProductionLog } from '../utils/calculations';
import googleSheetSnapshot from './googleSheetSnapshot.json';

export const FACTORIES: FactoryName[] = ['Bulugolla', 'Kurunegala', 'Werapola'];

export interface LineSupervisorMapping {
  lineNo: string;
  line: string;
  supervisor: string;
  factory: FactoryName;
}

export const LINE_SUPERVISOR_DATA: LineSupervisorMapping[] = [
  { lineNo: 'B1', line: '1', supervisor: 'UPEKSHA', factory: 'Bulugolla' },
  { lineNo: 'K1', line: '1', supervisor: 'RASITHA', factory: 'Kurunegala' },
  { lineNo: 'K2', line: '2', supervisor: 'FATHIMA', factory: 'Kurunegala' },
  { lineNo: 'K3', line: '3', supervisor: 'ASHI', factory: 'Kurunegala' },
  { lineNo: 'K4', line: '4', supervisor: 'ASHI', factory: 'Kurunegala' },
  { lineNo: 'K5', line: '5', supervisor: 'PRADEEP', factory: 'Kurunegala' },
  { lineNo: 'K6', line: '6', supervisor: 'MALINDA', factory: 'Kurunegala' },
  { lineNo: 'W1', line: '1', supervisor: 'DILINI', factory: 'Werapola' },
  { lineNo: 'W2', line: '2', supervisor: 'MADUSHIKA', factory: 'Werapola' },
  { lineNo: 'W3', line: '3', supervisor: 'KUMARI', factory: 'Werapola' },
  { lineNo: 'W4', line: '4', supervisor: 'KUMARI', factory: 'Werapola' },
  { lineNo: 'W5', line: '5', supervisor: 'ANURUDDHIKA', factory: 'Werapola' },
  { lineNo: 'W6', line: '6', supervisor: 'KASUNI', factory: 'Werapola' },
  { lineNo: 'W7', line: '7', supervisor: 'KASUNI', factory: 'Werapola' },
  { lineNo: 'W9', line: '9', supervisor: 'DEEPIKA', factory: 'Werapola' },
  { lineNo: 'W10', line: '10', supervisor: 'DEEPIKA', factory: 'Werapola' },
  { lineNo: 'W13', line: '13', supervisor: 'NISHADI', factory: 'Werapola' },
  { lineNo: 'W14', line: '14', supervisor: 'NISHADI', factory: 'Werapola' },
  { lineNo: 'W15', line: '15', supervisor: 'KAUSHALYA', factory: 'Werapola' },
  { lineNo: 'W16', line: '16', supervisor: 'KUMARI', factory: 'Werapola' },
  { lineNo: 'W18', line: '18', supervisor: 'HARSHANI', factory: 'Werapola' },
  { lineNo: 'W19', line: '19', supervisor: 'NISHADI', factory: 'Werapola' },
  { lineNo: 'W1+2', line: '1+2', supervisor: 'MADUSHIKA', factory: 'Werapola' },
  { lineNo: 'W3+4', line: '3+4', supervisor: 'KUMARI', factory: 'Werapola' },
  { lineNo: 'W6+7', line: '6+7', supervisor: 'KASUNI', factory: 'Werapola' },
  { lineNo: 'W9+10', line: '9+10', supervisor: 'DEEPIKA', factory: 'Werapola' },
  { lineNo: 'W13+14', line: '13+14', supervisor: 'ANURUDDHIKA', factory: 'Werapola' },
  { lineNo: 'W5+15', line: '5+15', supervisor: 'ANURUDDHIKA', factory: 'Werapola' },
  { lineNo: 'W9+10+5', line: '9+10+5', supervisor: 'DEEPIKA', factory: 'Werapola' },
  { lineNo: 'W3+4+15', line: '3+4+15', supervisor: 'ANURUDDHIKA', factory: 'Werapola' },
  { lineNo: 'W17+8+11+12', line: '17+8+11+12', supervisor: 'MANORI', factory: 'Werapola' },
  { lineNo: 'W1+2+17+8+11+12', line: '1+2+17+8+11+12', supervisor: 'MADU', factory: 'Werapola' },
  { lineNo: 'W1+2+8+11+12+17', line: '1+2+8+11+12+17', supervisor: 'MADU', factory: 'Werapola' },
  { lineNo: 'W2+17+8+11+12', line: '2+17+8+11+12', supervisor: 'KUMARI', factory: 'Werapola' }
];

export const SUPERVISOR_OPTIONS = Array.from(
  new Set(LINE_SUPERVISOR_DATA.map(m => m.supervisor))
).sort();

export const LINE_OPTIONS = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '13', '14', '15', '16', '18', '19',
  '1+2', '3+4', '6+7', '9+10', '13+14', '5+15',
  '3+4+15', '9+10+5',
  '17+8+11+12', '1+2+17+8+11+12', '1+2+8+11+12+17', '2+17+8+11+12'
];

export const PRODUCT_OPTIONS = [
  'SHIRT BG',
  'TROUSER',
  'UNDERWEAR KG',
  'PRIMARK HIPSTER',
  'TRIBURG PANT',
  'VEST',
  'SHIRT WP',
  'NEXT DRESS',
  'BOW BLOUSE',
  'SENIOR BLOUSE',
  'POLO SHIRT',
  'CASUAL SHORTS',
  'KIDS WEAR',
  'JACKET'
];

export const BRAND_OPTIONS = [
  'VANTAGE',
  'EBONY',
  'Primark',
  'Triburg',
  'NEXT',
  'George',
  'M&S'
];

export const DOWNTIME_REASONS = [
  { code: 'HR2', desc: 'Power / Steam Interruption' },
  { code: 'PR4', desc: 'Machine Breakdown & Needle Break' },
  { code: 'EN1', desc: 'Feeding & Work-in-Progress Delay' },
  { code: 'EN2', desc: 'Cutting Section Input Delay' },
  { code: 'CU1', desc: 'Cutting Quality Shade / Defect' },
  { code: 'TE2', desc: 'Technical & Setting Adjustment' },
  { code: 'ME2', desc: 'Scheduled Preventive Maintenance' }
];

export const DOWNTIME_CATEGORIES: string[] = [
  'Machine Breakdown & Needle Break (PR4)',
  'Power / Steam Interruption (HR2)',
  'Feeding & Work-in-Progress Delay (EN1)',
  'Cutting Section Input Delay (EN2)',
  'Cutting Quality Shade / Defect (CU1)',
  'Technical & Setting Adjustment (TE2)',
  'Scheduled Preventive Maintenance (ME2)',
  'Mechanic Assistance Delay',
  'Material Shortage / Accessories',
  'Operator Training / Meeting'
];

export const INITIAL_USERS: User[] = [
  {
    id: 'usr-admin',
    username: 'admin',
    fullName: 'Executive Management',
    role: 'admin',
    factory: 'ALL',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-kg',
    username: 'kurunegala_op',
    fullName: 'Kurunegala Production Entry',
    role: 'operator',
    factory: 'Kurunegala',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-bg',
    username: 'bulugolla_op',
    fullName: 'Bulugolla Production Entry',
    role: 'operator',
    factory: 'Bulugolla',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-wp',
    username: 'werapola_op',
    fullName: 'Werapola Production Entry',
    role: 'operator',
    factory: 'Werapola',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-all-ops',
    username: 'all_factory_op',
    fullName: 'All Factory Production Ops',
    role: 'operator',
    factory: 'ALL',
    status: 'active',
    createdAt: '2026-01-01'
  },
  {
    id: 'usr-viewer',
    username: 'viewer',
    fullName: 'Operations Auditor & Viewer',
    role: 'viewer',
    factory: 'ALL',
    status: 'active',
    createdAt: '2026-01-01'
  }
];

export const USER_PASSWORDS: Record<string, string> = {
  admin: 'admin123',
  kurunegala_op: 'kg123',
  bulugolla_op: 'bg123',
  werapola_op: 'wp123',
  all_factory_op: 'all123',
  viewer: 'view123'
};

// Full authentic snapshot from the connected Ebony Holdings Google Sheet (3,631+ records)
export const INITIAL_LOGS: ProductionLog[] =
  Array.isArray(googleSheetSnapshot) && googleSheetSnapshot.length > 0
    ? (googleSheetSnapshot as any[]).map(normalizeProductionLog)
    : parseSheetData(RAW_SHEET_CSV);

