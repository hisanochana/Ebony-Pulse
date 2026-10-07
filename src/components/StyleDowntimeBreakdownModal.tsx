import React, { useState, useEffect, useMemo } from 'react';
import { Clock, Plus, Trash2, CheckCircle2, AlertTriangle, X, ShieldAlert, Sparkles, HelpCircle } from 'lucide-react';
import { DowntimeCategoryLog, FactoryName, User } from '../types';
import { DOWNTIME_CODE_LIST, getDowntimeCodeBadge } from '../data/downtimeCodes';

interface BreakdownRow {
  id: string;
  categoryCode: string;
  downtimeMinutes: number;
  remarks: string;
}

interface StyleDowntimeBreakdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  styleName: string;
  product: string;
  brand: string;
  factory: FactoryName;
  line: string;
  date: string;
  supervisor: string;
  entryId?: string;
  totalStyleDowntime: number; // e.g. 1000 mins
  currentUser: User | null;
  initialBreakdowns?: DowntimeCategoryLog[];
  onSaveBreakdown: (logs: DowntimeCategoryLog[]) => void;
}

export const StyleDowntimeBreakdownModal: React.FC<StyleDowntimeBreakdownModalProps> = ({
  isOpen,
  onClose,
  styleName,
  product,
  brand,
  factory,
  line,
  date,
  supervisor,
  entryId,
  totalStyleDowntime,
  currentUser,
  initialBreakdowns = [],
  onSaveBreakdown
}) => {
  const [rows, setRows] = useState<BreakdownRow[]>(() => {
    if (initialBreakdowns && initialBreakdowns.length > 0) {
      return initialBreakdowns.map(b => ({
        id: b.id || `row-${Math.random()}`,
        categoryCode: b.categoryCode || (b.downtimeCategory ? b.downtimeCategory.split(' ')[0] : 'EN1'),
        downtimeMinutes: b.downtimeMinutes || 0,
        remarks: b.remarks || ''
      }));
    }
    // Default initial row
    return [
      {
        id: `row-${Date.now()}-1`,
        categoryCode: 'EN1',
        downtimeMinutes: Math.max(0, totalStyleDowntime),
        remarks: 'Machine breakdown during production run'
      }
    ];
  });

  const [activeDepartmentFilter, setActiveDepartmentFilter] = useState<string>('ALL');

  // Calculate allocated sum
  const allocatedMinutes = useMemo(() => {
    return rows.reduce((acc, r) => acc + (Number(r.downtimeMinutes) || 0), 0);
  }, [rows]);

  const remainingMinutes = totalStyleDowntime - allocatedMinutes;
  const isPerfectMatch = totalStyleDowntime > 0 && remainingMinutes === 0;
  const isOverAllocated = remainingMinutes < 0;

  const handleAddRow = (preselectedCode?: string) => {
    const codeToUse = preselectedCode || 'HR2';
    const initialMins = remainingMinutes > 0 ? remainingMinutes : 0;
    setRows(prev => [
      ...prev,
      {
        id: `row-${Date.now()}-${Math.random()}`,
        categoryCode: codeToUse,
        downtimeMinutes: initialMins,
        remarks: ''
      }
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setRows(prev => prev.filter(r => r.id !== id));
  };

  const handleUpdateRow = (id: string, field: keyof BreakdownRow, value: any) => {
    setRows(prev => prev.map(r => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleQuickAllocateRemaining = (id: string) => {
    if (remainingMinutes <= 0) return;
    setRows(prev =>
      prev.map(r => (r.id === id ? { ...r, downtimeMinutes: (Number(r.downtimeMinutes) || 0) + remainingMinutes } : r))
    );
  };

  const handleSave = () => {
    const finalLogs: DowntimeCategoryLog[] = rows
      .filter(r => Number(r.downtimeMinutes) > 0)
      .map((r, idx) => {
        const codeInfo = getDowntimeCodeBadge(r.categoryCode);
        return {
          id: `DT-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
          entryId: entryId || `EB-${date.replace(/-/g, '')}-${factory.substring(0, 2).toUpperCase()}-${line.replace(/[^0-9]/g, '') || '01'}`,
          date,
          factory,
          line,
          supervisor: supervisor || '',
          product: product || '',
          brand: brand || '',
          style: styleName,
          downtimeMinutes: Number(r.downtimeMinutes) || 0,
          downtimeCategory: codeInfo.fullName,
          categoryCode: codeInfo.code,
          remarks: r.remarks || `Style ${styleName} downtime breakdown`,
          user: currentUser?.username || 'operator',
          createdAt: new Date().toISOString()
        };
      });

    onSaveBreakdown(finalLogs);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-[#131f37]/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Downtime Code-Wise Breakdown</span>
                <span className="text-[11px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30 font-mono normal-case">
                  Style: {styleName || 'N/A'}
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Allocate style shift lost time ({totalStyleDowntime.toLocaleString()} mins) into category breakdown codes.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Style Context & Reconciliation Meter */}
        <div className="p-4 bg-[#0a101d] border-b border-slate-800/80 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-[#121c2e] p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Plant / Line</span>
              <span className="font-semibold text-white truncate block">{factory} - {line}</span>
            </div>
            <div className="bg-[#121c2e] p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Product / Brand</span>
              <span className="font-semibold text-white truncate block">{product} • {brand}</span>
            </div>
            <div className="bg-[#121c2e] p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Calculated Downtime</span>
              <span className="font-bold text-amber-400 font-mono block text-sm">{totalStyleDowntime.toLocaleString()} mins</span>
            </div>
            <div className="bg-[#121c2e] p-2 rounded-lg border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
              <span className={`text-[11px] font-bold block ${
                isPerfectMatch ? 'text-emerald-400' : isOverAllocated ? 'text-rose-400' : 'text-amber-400'
              }`}>
                {isPerfectMatch ? '100% Balanced' : isOverAllocated ? 'Over-Allocated' : `${remainingMinutes}m Unallocated`}
              </span>
            </div>
          </div>

          {/* Allocation Progress Bar */}
          <div className="space-y-1">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400">
                Allocated: <strong className="text-white font-mono">{allocatedMinutes.toLocaleString()}</strong> / {totalStyleDowntime.toLocaleString()} mins
              </span>
              <span className={`font-bold font-mono ${
                isPerfectMatch ? 'text-emerald-400' : isOverAllocated ? 'text-rose-400' : 'text-amber-400'
              }`}>
                {totalStyleDowntime > 0 ? Math.round((allocatedMinutes / totalStyleDowntime) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
              <div
                className={`h-full transition-all duration-300 ${
                  isOverAllocated ? 'bg-rose-500' : isPerfectMatch ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
                style={{ width: `${Math.min(100, totalStyleDowntime > 0 ? (allocatedMinutes / totalStyleDowntime) * 100 : 0)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Quick Add By DT Code Chips */}
        <div className="p-3 bg-[#0d1627] border-b border-slate-800 overflow-x-auto">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-300">Quick Add Category Code:</span>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto pr-1">
            {DOWNTIME_CODE_LIST.map(code => (
              <button
                key={code.code}
                type="button"
                onClick={() => handleAddRow(code.code)}
                className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition cursor-pointer hover:scale-105 active:scale-95 ${code.bgBadge}`}
                title={`${code.code}: ${code.name} (${code.department})`}
              >
                <strong>{code.code}</strong> {code.name}
              </button>
            ))}
          </div>
        </div>

        {/* Breakdown Rows Table */}
        <div className="p-4 flex-1 overflow-y-auto space-y-3">
          {rows.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <Clock className="w-8 h-8 mx-auto mb-2 text-slate-600" />
              <p className="text-xs">No downtime breakdown rows added yet.</p>
              <button
                type="button"
                onClick={() => handleAddRow()}
                className="mt-2 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Code Breakdown</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {rows.map((row, index) => {
                const selectedCodeInfo = getDowntimeCodeBadge(row.categoryCode);
                return (
                  <div
                    key={row.id}
                    className="p-3 bg-[#131d2e] border border-slate-800 rounded-xl space-y-2 hover:border-slate-700 transition"
                  >
                    <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
                      {/* Code Selector */}
                      <div className="flex-1 w-full sm:w-auto">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                          DT Code & Category
                        </label>
                        <select
                          value={row.categoryCode}
                          onChange={e => handleUpdateRow(row.id, 'categoryCode', e.target.value)}
                          className="w-full bg-[#0a101d] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500"
                        >
                          {DOWNTIME_CODE_LIST.map(c => (
                            <option key={c.code} value={c.code}>
                              {c.code} - {c.name} [{c.department}]
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Minutes Input */}
                      <div className="w-full sm:w-36">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                          Lost Minutes *
                        </label>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.downtimeMinutes === 0 ? '' : row.downtimeMinutes}
                            onChange={e => handleUpdateRow(row.id, 'downtimeMinutes', Number(e.target.value) || 0)}
                            placeholder="0"
                            className="w-full bg-[#0a101d] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-cyan-500"
                          />
                          {remainingMinutes > 0 && (
                            <button
                              type="button"
                              onClick={() => handleQuickAllocateRemaining(row.id)}
                              className="px-1.5 py-1.5 rounded bg-cyan-900/60 hover:bg-cyan-800 text-cyan-300 text-[10px] font-bold shrink-0 cursor-pointer"
                              title={`Auto-add remaining ${remainingMinutes} mins`}
                            >
                              +{remainingMinutes}m
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Delete Row */}
                      <div className="pt-4 sm:pt-4 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(row.id)}
                          className="p-1.5 rounded-lg bg-rose-950/50 hover:bg-rose-900 text-rose-300 border border-rose-800/50 transition cursor-pointer"
                          title="Remove breakdown row"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Remarks Input */}
                    <div>
                      <input
                        type="text"
                        value={row.remarks}
                        onChange={e => handleUpdateRow(row.id, 'remarks', e.target.value)}
                        placeholder="Specific cause description (e.g., Needle hook timing broken, 5 operators absent, cutter blade jammed)..."
                        className="w-full bg-[#0a101d] border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-600"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => handleAddRow()}
            className="w-full py-2 rounded-xl border border-dashed border-slate-700 hover:border-cyan-500/60 hover:bg-cyan-500/5 text-slate-400 hover:text-cyan-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Another Category Breakdown Row</span>
          </button>
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between bg-[#10192a]">
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>Records bond to Production Log via <strong>{entryId || 'Entry_ID'}</strong></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-sm shadow-cyan-950 transition cursor-pointer flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Save Downtime Breakdown ({allocatedMinutes}m)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
