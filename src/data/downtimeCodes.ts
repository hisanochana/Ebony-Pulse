export interface DowntimeCodeItem {
  code: string;
  name: string;
  fullName: string;
  department: string;
  color: string;
  bgBadge: string;
}

export const DOWNTIME_CODE_LIST: DowntimeCodeItem[] = [
  { code: 'IE1', name: 'Cycle Time Not Achieved', fullName: 'IE1 - Cycle Time Not Achieved', department: 'IE / Technical', color: '#06b6d4', bgBadge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { code: 'PR4', name: 'Potential Capacity Not Achieved', fullName: 'PR4 - Potential Capacity Not Achieved', department: 'IE / Technical', color: '#0ea5e9', bgBadge: 'bg-sky-500/10 text-sky-400 border-sky-500/30' },
  { code: 'HR2', name: 'Absenteeism', fullName: 'HR2 - Absenteeism', department: 'HR / Manpower', color: '#f59e0b', bgBadge: 'bg-amber-500/10 text-amber-400 border-amber-500/30' },
  { code: 'EN1', name: 'Machine Breakdown', fullName: 'EN1 - Machine Breakdown', department: 'Engineering / Maintenance', color: '#ef4444', bgBadge: 'bg-rose-500/10 text-rose-400 border-rose-500/30' },
  { code: 'RM1', name: 'RM Issuing Delay', fullName: 'RM1 - RM Issuing Delay', department: 'Raw Materials & Trims', color: '#ec4899', bgBadge: 'bg-pink-500/10 text-pink-400 border-pink-500/30' },
  { code: 'HR3', name: 'Cadre Shortfall', fullName: 'HR3 - Cadre Shortfall', department: 'HR / Manpower', color: '#d97706', bgBadge: 'bg-amber-600/10 text-amber-500 border-amber-600/30' },
  { code: 'ME1', name: 'Trim Card Errors', fullName: 'ME1 - Trim Card Errors', department: 'Raw Materials & Trims', color: '#a855f7', bgBadge: 'bg-purple-500/10 text-purple-400 border-purple-500/30' },
  { code: 'CU1', name: 'Cutting Input Delay', fullName: 'CU1 - Cutting Input Delay', department: 'Cutting Department', color: '#3b82f6', bgBadge: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  { code: 'CU2', name: 'Cutting Quality Issues', fullName: 'CU2 - Cutting Quality Issues', department: 'Cutting Department', color: '#2563eb', bgBadge: 'bg-blue-600/10 text-blue-400 border-blue-600/30' },
  { code: 'TE2', name: 'Line Feeding Delay', fullName: 'TE2 - Line Feeding Delay', department: 'IE / Technical', color: '#14b8a6', bgBadge: 'bg-teal-500/10 text-teal-400 border-teal-500/30' },
  { code: 'EN2', name: 'Air Pressure Issue', fullName: 'EN2 - Air Pressure Issue', department: 'Engineering / Maintenance', color: '#f87171', bgBadge: 'bg-red-400/10 text-red-400 border-red-400/30' },
  { code: 'PL1', name: 'Planning Issue', fullName: 'PL1 - Planning Issue', department: 'Planning', color: '#8b5cf6', bgBadge: 'bg-violet-500/10 text-violet-400 border-violet-500/30' },
  { code: 'PR7', name: 'Absenteeism', fullName: 'PR7 - Absenteeism', department: 'HR / Manpower', color: '#b45309', bgBadge: 'bg-amber-700/10 text-amber-400 border-amber-700/30' },
  { code: 'ME5', name: 'RM Delay', fullName: 'ME5 - RM Delay', department: 'Raw Materials & Trims', color: '#e11d48', bgBadge: 'bg-rose-600/10 text-rose-400 border-rose-600/30' },
  { code: 'PR3', name: 'Rework', fullName: 'PR3 - Rework', department: 'Quality / Production', color: '#eab308', bgBadge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
  { code: 'PL2', name: 'Plan Changes', fullName: 'PL2 - Plan Changes', department: 'Planning', color: '#7c3aed', bgBadge: 'bg-purple-600/10 text-purple-400 border-purple-600/30' },
  { code: 'ME2', name: 'RM Shortages', fullName: 'ME2 - RM Shortages', department: 'Raw Materials & Trims', color: '#be185d', bgBadge: 'bg-pink-700/10 text-pink-400 border-pink-700/30' },
  { code: 'EN6', name: 'Machine In-House Delay', fullName: 'EN6 - Machine In-House Delay', department: 'Engineering / Maintenance', color: '#dc2626', bgBadge: 'bg-red-600/10 text-red-400 border-red-600/30' },
  { code: 'Q4', name: 'Checking Stock', fullName: 'Q4 - Checking Stock', department: 'Quality / Production', color: '#10b981', bgBadge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { code: 'ME6', name: 'Pre-Production Related Issues', fullName: 'ME6 - Pre-Production Related Issues', department: 'Raw Materials & Trims', color: '#9333ea', bgBadge: 'bg-purple-600/10 text-purple-300 border-purple-600/30' },
  { code: 'OTHER', name: 'Other', fullName: 'OTHER - Other', department: 'General / Other', color: '#64748b', bgBadge: 'bg-slate-500/10 text-slate-400 border-slate-500/30' }
];

export function findDowntimeCode(codeOrFullName: string): DowntimeCodeItem | undefined {
  if (!codeOrFullName) return undefined;
  const clean = codeOrFullName.trim().toUpperCase();
  return DOWNTIME_CODE_LIST.find(
    item => item.code.toUpperCase() === clean || item.fullName.toUpperCase().startsWith(clean) || clean.startsWith(item.code.toUpperCase())
  );
}

export function getDowntimeCodeBadge(category: string) {
  const found = findDowntimeCode(category);
  if (found) return found;
  return {
    code: category.split(' ')[0] || 'OTHER',
    name: category,
    fullName: category,
    department: 'General',
    color: '#64748b',
    bgBadge: 'bg-slate-500/10 text-slate-400 border-slate-500/30'
  };
}
