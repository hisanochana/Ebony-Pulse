import React, { useState, useMemo } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Send,
  CheckCircle2,
  AlertCircle,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  Layers,
  ArrowRight,
  Database,
  Download
} from 'lucide-react';
import { DowntimeCategoryLog, FactoryName, ProductionLog, User } from '../types';
import { DOWNTIME_CODE_LIST, getDowntimeCodeBadge } from '../data/downtimeCodes';
import { submitDowntimeLogs, deleteDowntimeLog } from '../services/googleSheetService';
import { BRAND_OPTIONS, PRODUCT_OPTIONS } from '../data/initialData';

interface DowntimeEntryPanelProps {
  currentUser: User | null;
  recentLogs?: ProductionLog[];
  downtimeLogs?: DowntimeCategoryLog[];
  existingDowntimeLogs?: DowntimeCategoryLog[];
  onDowntimeLogsUpdated?: (updated: DowntimeCategoryLog[]) => void;
}

interface EntryRowItem {
  id: string;
  categoryCode: string;
  downtimeMinutes: number;
  remarks: string;
}

const FACTORY_OPTIONS: FactoryName[] = ['Kurunegala', 'Bulugolla', 'Werapola'];

const FACTORY_LINES: Record<FactoryName, string[]> = {
  Kurunegala: ['Line 01', 'Line 02', 'Line 03', 'Line 04', 'Line 05', 'Line 06', 'Line 07', 'Line 08'],
  Bulugolla: ['Line 01', 'Line 02', 'Line 03', 'Line 04', 'Line 05', 'Line 06'],
  Werapola: ['Line 01', 'Line 02', 'Line 03', 'Line 04']
};

const PRODUCT_CATEGORIES = Array.from(
  new Set([
    'SHIRT BG',
    'TROUSER',
    'UNDERWEAR KG',
    'PRIMARK HIPSTER',
    'TRIBURG SHIRT',
    'VEST',
    'SHIRT WP',
    'SENIOR BLOUSE',
    'NEXT DRESS',
    'POLO SHIRT',
    ...PRODUCT_OPTIONS
  ])
);

export const DowntimeEntryPanel: React.FC<DowntimeEntryPanelProps> = ({
  currentUser,
  recentLogs = [],
  downtimeLogs = [],
  existingDowntimeLogs,
  onDowntimeLogsUpdated = (_updated: DowntimeCategoryLog[]) => {}
}) => {
  const safeDowntimeLogs = useMemo(() => {
    if (Array.isArray(downtimeLogs) && downtimeLogs.length > 0) return downtimeLogs;
    if (Array.isArray(existingDowntimeLogs) && existingDowntimeLogs.length > 0) return existingDowntimeLogs;
    if (Array.isArray(downtimeLogs)) return downtimeLogs;
    if (Array.isArray(existingDowntimeLogs)) return existingDowntimeLogs;
    return [];
  }, [downtimeLogs, existingDowntimeLogs]);
  // Determine allowed plant
  const isOperator = currentUser?.role === 'operator';
  const initialFactory: FactoryName =
    currentUser && currentUser.factory && currentUser.factory !== 'ALL'
      ? (currentUser.factory as FactoryName)
      : 'Kurunegala';

  // Form State
  const [date, setDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [factory, setFactory] = useState<FactoryName>(initialFactory);
  const [line, setLine] = useState<string>(FACTORY_LINES[initialFactory][0] || 'Line 01');
  const [supervisor, setSupervisor] = useState<string>('');
  const [product, setProduct] = useState<string>('SHIRT BG');
  const [brand, setBrand] = useState<string>('VANTAGE');
  const [style, setStyle] = useState<string>('');
  const [selectedEntryId, setSelectedEntryId] = useState<string>('');
  const [entryConnectMode, setEntryConnectMode] = useState<'dropdown' | 'manual'>('dropdown');
  const [manualEntryIdInput, setManualEntryIdInput] = useState<string>('');

  // Track submitted recent shift entry IDs so they are removed from the auto-fill dropdown
  const [submittedRecentEntryIds, setSubmittedRecentEntryIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ebony_submitted_recent_downtime_entries_v1');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Filtered recent logs for dropdown list: excludes any log that has already had downtime logged/submitted
  const availableRecentLogs = useMemo(() => {
    const loggedSet = new Set<string>();
    // Exclude anything in safeDowntimeLogs
    safeDowntimeLogs.forEach(d => {
      if (d && d.entryId) loggedSet.add(d.entryId.trim().toLowerCase());
    });
    // Exclude anything in submittedRecentEntryIds
    submittedRecentEntryIds.forEach(id => {
      if (id) loggedSet.add(id.trim().toLowerCase());
    });

    return (recentLogs || []).filter(log => {
      if (!log || !log.Entry_ID) return false;
      return !loggedSet.has(log.Entry_ID.trim().toLowerCase());
    });
  }, [recentLogs, safeDowntimeLogs, submittedRecentEntryIds]);

  // Category breakdown rows to log
  const [rows, setRows] = useState<EntryRowItem[]>([
    {
      id: 'row-1',
      categoryCode: 'EN1',
      downtimeMinutes: 60,
      remarks: 'Machine breakdown during shift'
    }
  ]);

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Table filter state for recorded downtimes
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDepartment, setFilterDepartment] = useState('ALL');

  // Available lines for chosen factory
  const availableLines = FACTORY_LINES[factory] || FACTORY_LINES.Kurunegala;

  // Total minutes in current entry
  const totalEntryMinutes = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.downtimeMinutes) || 0), 0);
  }, [rows]);

  // When factory changes, ensure line is valid
  const handleFactoryChange = (newFactory: FactoryName) => {
    setFactory(newFactory);
    const lines = FACTORY_LINES[newFactory] || [];
    if (lines.length > 0 && !lines.includes(line)) {
      setLine(lines[0]);
    }
  };

  // Quick populate from recent production log
  const handleSelectRecentLog = (eId: string) => {
    setSelectedEntryId(eId);
    if (!eId) return;
    const found = recentLogs.find(l => l.Entry_ID === eId);
    if (found) {
      setDate(found.Date);
      if (FACTORY_OPTIONS.includes(found.Factory as FactoryName)) {
        setFactory(found.Factory as FactoryName);
      }
      setLine(found.Line);
      setSupervisor(found.Supervisor);
      setProduct(found.Product);
      setBrand(found.Brand);
      setStyle(found.Style);
      // Pre-fill minutes from shift downtime if available
      if (found.Down_Time && found.Down_Time > 0) {
        setRows(prev => [
          {
            id: `row-${Date.now()}`,
            categoryCode: 'EN1',
            downtimeMinutes: found.Down_Time,
            remarks: `Downtime breakdown for ${found.Style} (Shift total: ${found.Down_Time}m)`
          }
        ]);
      }
    }
  };

  // Manual Entry ID handler
  const handleManualEntryIdChange = (rawId: string) => {
    setManualEntryIdInput(rawId);
    const trimmed = rawId.trim();
    setSelectedEntryId(trimmed);
    if (!trimmed) return;
    const found = recentLogs.find(l => l.Entry_ID.toLowerCase() === trimmed.toLowerCase());
    if (found) {
      setDate(found.Date);
      if (FACTORY_OPTIONS.includes(found.Factory as FactoryName)) {
        setFactory(found.Factory as FactoryName);
      }
      setLine(found.Line);
      setSupervisor(found.Supervisor);
      setProduct(found.Product);
      setBrand(found.Brand);
      setStyle(found.Style);
      if (found.Down_Time && found.Down_Time > 0) {
        setRows(prev => [
          {
            id: `row-${Date.now()}`,
            categoryCode: 'EN1',
            downtimeMinutes: found.Down_Time,
            remarks: `Downtime breakdown for ${found.Style} (Shift total: ${found.Down_Time}m)`
          }
        ]);
      }
    }
  };

  const handleAddRow = (code?: string) => {
    const codeToUse = code || 'HR2';
    setRows(prev => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random()}`,
        categoryCode: codeToUse,
        downtimeMinutes: 30,
        remarks: ''
      }
    ]);
  };

  const handleRemoveRow = (id: string) => {
    if (rows.length === 1) return;
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: keyof EntryRowItem, value: any) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!style.trim()) {
      setFeedback({ type: 'error', message: 'Please enter a Style number/name.' });
      return;
    }

    const validRows = rows.filter(r => Number(r.downtimeMinutes) > 0);
    if (validRows.length === 0) {
      setFeedback({ type: 'error', message: 'Please specify downtime minutes greater than 0 for at least one category.' });
      return;
    }

    // Auto generate or format Entry_ID bond
    const entryIdToUse =
      selectedEntryId.trim() ||
      `EB-${date.replace(/-/g, '')}-${factory.substring(0, 2).toUpperCase()}-${line.replace(/[^0-9]/g, '') || '01'}`;

    const newRecords: DowntimeCategoryLog[] = validRows.map((r, idx) => {
      const codeInfo = getDowntimeCodeBadge(r.categoryCode);
      return {
        id: `DT-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
        entryId: entryIdToUse,
        date,
        factory,
        line,
        supervisor: supervisor.trim() || 'N/A',
        product,
        brand,
        style: style.trim().toUpperCase(),
        downtimeMinutes: Number(r.downtimeMinutes),
        downtimeCategory: codeInfo.fullName,
        categoryCode: codeInfo.code,
        remarks: r.remarks.trim() || `${codeInfo.name} delay during shift`,
        user: currentUser?.username || 'operator',
        createdAt: new Date().toISOString()
      };
    });

    setIsSubmitting(true);

    try {
      const res = await submitDowntimeLogs(newRecords);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: `Successfully recorded ${newRecords.length} downtime category row(s) (${totalEntryMinutes.toLocaleString()} mins) bonded to Entry ID: ${entryIdToUse}`
        });

        // Update local state
        const updated = [...newRecords, ...(safeDowntimeLogs || [])];
        if (onDowntimeLogsUpdated) {
          onDowntimeLogsUpdated(updated);
        }

        // When user submits a log from recent logs (or linked to an entry), remove it from recent shift entry auto fill drop down list
        const submittedId = (selectedEntryId.trim() || entryIdToUse).toLowerCase();
        if (submittedId) {
          setSubmittedRecentEntryIds(prev => {
            if (prev.includes(submittedId)) return prev;
            const nextList = [...prev, submittedId];
            try {
              localStorage.setItem('ebony_submitted_recent_downtime_entries_v1', JSON.stringify(nextList));
            } catch {}
            return nextList;
          });
        }

        // Reset rows to default
        setRows([
          {
            id: `row-${Date.now()}`,
            categoryCode: 'EN1',
            downtimeMinutes: 0,
            remarks: ''
          }
        ]);
        setStyle('');
        setSelectedEntryId('');
        setManualEntryIdInput('');
      } else {
        setFeedback({ type: 'error', message: res.message || 'Failed to submit downtime logs.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Network error submitting downtime logs.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    if (!window.confirm('Delete this downtime category record?')) return;
    try {
      const res = await deleteDowntimeLog(id);
      if (res.success) {
        const updated = (safeDowntimeLogs || []).filter(d => d && d.id !== id);
        if (onDowntimeLogsUpdated) {
          onDowntimeLogsUpdated(updated);
        }
      } else {
        alert(res.message || 'Could not delete record');
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting record');
    }
  };

  // Filtered list of downtime records
  const filteredRecords = useMemo(() => {
    return (safeDowntimeLogs || []).filter(rec => {
      if (!rec) return false;
      // Plant permission check
      if (currentUser?.role === 'operator' && currentUser?.factory && currentUser.factory !== 'ALL') {
        if (rec.factory !== currentUser.factory) return false;
      }

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matches =
          (rec.style || '').toLowerCase().includes(term) ||
          (rec.downtimeCategory || '').toLowerCase().includes(term) ||
          (rec.categoryCode && rec.categoryCode.toLowerCase().includes(term)) ||
          (rec.factory || '').toLowerCase().includes(term) ||
          (rec.line || '').toLowerCase().includes(term) ||
          (rec.entryId && rec.entryId.toLowerCase().includes(term)) ||
          (rec.remarks || '').toLowerCase().includes(term);
        if (!matches) return false;
      }

      if (filterDepartment !== 'ALL') {
        const badge = getDowntimeCodeBadge(rec.categoryCode || rec.downtimeCategory);
        if (badge.department !== filterDepartment) return false;
      }

      return true;
    });
  }, [safeDowntimeLogs, currentUser, searchTerm, filterDepartment]);

  // Export downtime records to CSV
  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return;
    const headers = [
      'Downtime_ID',
      'Entry_ID',
      'Date',
      'Factory',
      'Line',
      'Supervisor',
      'Product',
      'Brand',
      'Style',
      'Down_Time_Minutes',
      'Down_Time_Category',
      'Category_Code',
      'Remarks',
      'User',
      'Timestamp'
    ];

    const rowsData = filteredRecords.map(r => [
      `"${r.id}"`,
      `"${r.entryId || ''}"`,
      `"${r.date}"`,
      `"${r.factory}"`,
      `"${r.line}"`,
      `"${r.supervisor}"`,
      `"${r.product}"`,
      `"${r.brand}"`,
      `"${r.style}"`,
      r.downtimeMinutes,
      `"${r.downtimeCategory.replace(/"/g, '""')}"`,
      `"${r.categoryCode || ''}"`,
      `"${(r.remarks || '').replace(/"/g, '""')}"`,
      `"${r.user}"`,
      `"${r.createdAt || ''}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rowsData.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Ebony_Downtime_Category_Logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Main Entry Card */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
        
        {/* Title Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-4">
          <div>
            <div className="flex items-center gap-2 text-cyan-400 text-xs font-black uppercase tracking-wider mb-1">
              <Clock className="w-4 h-4" />
              <span>Downtime Category Data Entry</span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Log Code-Wise Lost Time Minutes &amp; Root Causes
            </h2>
          </div>

          <div className="flex items-center gap-2 bg-[#131f37] px-3 py-1.5 rounded-xl border border-slate-700">
            <span className="text-xs text-slate-400 font-medium">Entry Total:</span>
            <span className="text-sm font-bold font-mono text-amber-400">
              {totalEntryMinutes.toLocaleString()} mins
            </span>
          </div>
        </div>

        {/* Optional: Quick Connect to a Recent Shift Entry_ID (Dropdown or Manual Entry) */}
        <div className="p-3.5 bg-[#131d2e] rounded-xl border border-slate-800 space-y-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-[11px] font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span>Optional: Quick Connect to a Recent Shift Entry_ID</span>
            </label>
            
            {/* Mode Selector: Dropdown vs Manual */}
            <div className="flex items-center bg-[#0a101d] p-0.5 rounded-lg border border-slate-700/80 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setEntryConnectMode('dropdown')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                  entryConnectMode === 'dropdown'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Select from Recent Shifts
              </button>
              <button
                type="button"
                onClick={() => setEntryConnectMode('manual')}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition cursor-pointer ${
                  entryConnectMode === 'manual'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Enter Entry ID Manually
              </button>
            </div>
          </div>

          {/* Mode 1: Recent Shift Dropdown */}
          {entryConnectMode === 'dropdown' ? (
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <select
                value={selectedEntryId}
                onChange={e => handleSelectRecentLog(e.target.value)}
                className="w-full bg-[#0a101d] border border-slate-700 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">
                  {availableRecentLogs.length > 0
                    ? `-- Select a Recent Shift Entry Number to Auto-Fill (${availableRecentLogs.length} pending) --`
                    : '-- All Recent Shift Entries Have Downtime Logged --'}
                </option>
                {availableRecentLogs.slice(0, 50).map(log => (
                  <option key={log.Entry_ID} value={log.Entry_ID}>
                    {log.Entry_ID} | {log.Date} | {log.Factory} {log.Line} | Style: {log.Style} (Lost: {log.Down_Time || 0}m)
                  </option>
                ))}
              </select>
              {selectedEntryId && (
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-emerald-400 font-semibold px-2 py-1 bg-emerald-950/60 border border-emerald-800 rounded-md">
                    &check; Auto-filled details
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSelectRecentLog('')}
                    className="text-[10px] text-slate-400 hover:text-rose-400 underline cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Mode 2: Manual Entry ID Input */
            <div className="space-y-1.5">
              <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                <input
                  type="text"
                  value={manualEntryIdInput}
                  onChange={e => handleManualEntryIdChange(e.target.value)}
                  placeholder="Type or paste Entry ID (e.g. EB-20260828-WP-01)"
                  className="w-full bg-[#0a101d] border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-mono text-cyan-200 placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
                />
                {manualEntryIdInput && (
                  <button
                    type="button"
                    onClick={() => handleManualEntryIdChange('')}
                    className="px-2.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg shrink-0 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px]">
                {manualEntryIdInput.trim() ? (
                  recentLogs.some(l => l.Entry_ID.toLowerCase() === manualEntryIdInput.trim().toLowerCase()) ? (
                    <span className="text-emerald-400 font-medium">
                      &check; Matched existing shift log! Shift details auto-populated below.
                    </span>
                  ) : (
                    <span className="text-cyan-400">
                      &bull; Using custom Entry ID <code className="font-mono bg-slate-900 px-1 py-0.5 rounded text-amber-300">{manualEntryIdInput.trim()}</code>. Complete form fields below.
                    </span>
                  )
                ) : (
                  <span className="text-slate-500">
                    Type an existing Entry ID to auto-load shift data, or provide a custom ID to link downtime rows.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Feedback Message */}
        {feedback && (
          <div
            className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300'
                : 'bg-rose-950/70 border border-rose-800 text-rose-300'
            }`}
          >
            {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Data Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Header Dimensions Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-[#0a101d] p-4 rounded-xl border border-slate-800/80">
            {/* 1. Date */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* 2. Factory */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Factory Plant *
              </label>
              <select
                disabled={isOperator}
                value={factory}
                onChange={e => handleFactoryChange(e.target.value as FactoryName)}
                className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 disabled:opacity-75"
              >
                {FACTORY_OPTIONS.map(f => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>

            {/* 3. Line */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Sewing Line *
              </label>
              <select
                value={line}
                onChange={e => setLine(e.target.value)}
                className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {availableLines.map(l => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>

            {/* 4. Supervisor */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Supervisor
              </label>
              <input
                type="text"
                placeholder="Supervisor Name"
                value={supervisor}
                onChange={e => setSupervisor(e.target.value)}
                className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* 5. Product */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Product Category *
              </label>
              <select
                value={product}
                onChange={e => setProduct(e.target.value)}
                className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
              >
                {PRODUCT_CATEGORIES.map(p => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            {/* 6. Brand */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Brand / Customer *
              </label>
              <input
                type="text"
                required
                list="dt-brand-options"
                placeholder="e.g. VANTAGE, EBONY, Primark"
                value={brand}
                onChange={e => setBrand(e.target.value)}
                className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
              <datalist id="dt-brand-options">
                {BRAND_OPTIONS.map(b => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>

            {/* 7. Style */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Style No *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. B1SHIRT BG, SU 3409, KIMBALL60576"
                value={style}
                onChange={e => setStyle(e.target.value)}
                className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 uppercase"
              />
            </div>

            {/* 8. Submitter User */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                User / Submitter
              </label>
              <input
                type="text"
                readOnly
                value={currentUser?.username || 'operator'}
                className="w-full bg-[#0d1625] border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Breakdown Rows Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-400 px-1">
              <span>Category Breakdown Rows</span>
              <span>Total: {totalEntryMinutes} mins</span>
            </div>

            <div className="space-y-2.5">
              {rows.map((row, idx) => {
                const codeBadge = getDowntimeCodeBadge(row.categoryCode);
                return (
                  <div
                    key={row.id}
                    className="p-3 bg-[#0a101d] border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition"
                  >
                    <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center justify-between">
                      {/* Code Select */}
                      <div className="flex-1 w-full sm:w-auto">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                          Category Code *
                        </label>
                        <select
                          value={row.categoryCode}
                          onChange={e => handleUpdateRow(row.id, 'categoryCode', e.target.value)}
                          className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        >
                          {DOWNTIME_CODE_LIST.map(c => (
                            <option key={c.code} value={c.code}>
                              {c.code} - {c.name} ({c.department})
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Minutes */}
                      <div className="w-full sm:w-36">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                          Down Time Mins *
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={row.downtimeMinutes === 0 ? '' : row.downtimeMinutes}
                          onChange={e => handleUpdateRow(row.id, 'downtimeMinutes', Number(e.target.value) || 0)}
                          placeholder="e.g. 60"
                          className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-cyan-500"
                        />
                      </div>

                      {/* Remove */}
                      <div className="pt-4 sm:pt-4 shrink-0">
                        <button
                          type="button"
                          disabled={rows.length === 1}
                          onClick={() => handleRemoveRow(row.id)}
                          className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900 text-rose-300 border border-rose-800/50 disabled:opacity-30 transition cursor-pointer"
                          title="Remove row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Remarks */}
                    <div>
                      <input
                        type="text"
                        value={row.remarks}
                        onChange={e => handleUpdateRow(row.id, 'remarks', e.target.value)}
                        placeholder="Detailed remarks / root cause (e.g., Needle hook timing broken, 5 operators absent, cutter blade jammed)..."
                        className="w-full bg-[#121c2e] border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-600"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => handleAddRow()}
              className="w-full py-2 rounded-xl border border-dashed border-slate-700 hover:border-cyan-500/60 hover:bg-cyan-500/5 text-slate-400 hover:text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Downtime Category Row</span>
            </button>
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
            <div className="text-xs text-slate-400">
              Columns recorded: <span className="text-slate-300 font-mono">Date, Factory, Line, Supervisor, Product, Brand, Style, Down Time Minutes, Category, Remarks, User</span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/50 transition cursor-pointer flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Logging &amp; Synchronizing...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Submit Downtime Category Record ({totalEntryMinutes}m)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Recorded Downtime History Table */}
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>Recorded Downtime Category Logs</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 font-mono">
                {filteredRecords.length} records
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Synchronized downtime entries across factory plants and code categories.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search */}
            <div className="relative flex-1 sm:w-48">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search style, code, line..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-[#0a101d] border border-slate-700 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Department Filter */}
            <select
              value={filterDepartment}
              onChange={e => setFilterDepartment(e.target.value)}
              className="bg-[#0a101d] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Departments</option>
              <option value="Engineering / Maintenance">Engineering / Maintenance</option>
              <option value="HR / Manpower">HR / Manpower</option>
              <option value="Raw Materials & Trims">Raw Materials & Trims</option>
              <option value="Cutting Department">Cutting Department</option>
              <option value="IE / Technical">IE / Technical</option>
              <option value="Planning">Planning</option>
              <option value="Quality / Production">Quality / Production</option>
            </select>

            {/* Export */}
            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              title="Download Downtime CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-[#121c2e] text-slate-400 font-bold uppercase tracking-wider text-[10px] border-b border-slate-800">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Plant &amp; Line</th>
                <th className="py-2.5 px-3">Style &amp; Brand</th>
                <th className="py-2.5 px-3">Category Code</th>
                <th className="py-2.5 px-3 text-right">Downtime Mins</th>
                <th className="py-2.5 px-3">Remarks / Root Cause</th>
                <th className="py-2.5 px-3">Entry_ID Bond</th>
                <th className="py-2.5 px-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-slate-400">
                    No downtime records match your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredRecords.map(rec => {
                  const badge = getDowntimeCodeBadge(rec.categoryCode || rec.downtimeCategory);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-2.5 px-3 font-mono text-slate-300 whitespace-nowrap">{rec.date}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-semibold text-white">{rec.factory}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5 block">{rec.line}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="font-bold text-cyan-300 font-mono block">{rec.style}</span>
                        <span className="text-[10px] text-slate-400">{rec.brand} • {rec.product}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${badge.bgBadge}`}>
                          <strong className="font-mono mr-1">{badge.code}</strong> {badge.name}
                        </span>
                        <span className="text-[10px] text-slate-500 block mt-0.5">{badge.department}</span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-400 whitespace-nowrap">
                        {rec.downtimeMinutes.toLocaleString()} m
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 max-w-xs truncate" title={rec.remarks}>
                        {rec.remarks || '-'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                        {rec.entryId ? (
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                            {rec.entryId}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(rec.id)}
                          className="p-1 rounded bg-rose-950/40 hover:bg-rose-900 text-rose-400 hover:text-rose-200 transition cursor-pointer"
                          title="Delete downtime entry"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
