import React, { useMemo, useState, useEffect } from 'react';
import { Filter, RotateCcw, TrendingUp, Users, Clock, AlertTriangle, Briefcase, Shirt, CheckCircle2, ChevronRight, BarChart2, Calendar, Target, Download, Tag, Layers, Activity } from 'lucide-react';
import { ProductionLog, FilterState, FactoryName, DowntimeCategoryLog } from '../types';
import { FACTORIES, PRODUCT_OPTIONS } from '../data/initialData';
import { getDowntimeCodeBadge } from '../data/downtimeCodes';
import {
  exportToCSV,
  getEffectiveWorkedMinutes,
  getEffectiveProducedMinutes,
  calculateAggregatedMetrics,
  aggregateMultiStyleLineLogs
} from '../utils/calculations';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend, ReferenceLine,
  ComposedChart, Area, AreaChart
} from 'recharts';

interface DashboardProps {
  logs: ProductionLog[];
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  onResetFilters: () => void;
  downtimeLogs?: DowntimeCategoryLog[];
}

const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4'];

export const Dashboard: React.FC<DashboardProps> = ({
  logs = [],
  filters,
  onFilterChange,
  onResetFilters,
  downtimeLogs = []
}) => {
  const [paretoViewMode, setParetoViewMode] = useState<'divided' | 'combined'>('divided');
  const safeLogs = useMemo(() => Array.isArray(logs) ? logs : [], [logs]);
  const safeDowntimeLogs = useMemo(() => Array.isArray(downtimeLogs) ? downtimeLogs : [], [downtimeLogs]);

  // Available lines based on factory selection
  // When a factory is selected, ONLY show lines recorded in logs under that factory. Not applicable for All Plants filter.
  const availableLines = useMemo(() => {
    if (filters.factory === 'ALL') {
      const lines = Array.from(new Set(safeLogs.map(l => l?.Line).filter(Boolean))) as string[];
      return lines.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    }
    const factoryLogs = safeLogs.filter(l => l && l.Factory === filters.factory);
    const lines = Array.from(new Set(factoryLogs.map(l => l.Line).filter(Boolean))) as string[];
    return lines.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
  }, [safeLogs, filters.factory]);

  // Available products based on factory selection
  // When a factory is selected, ONLY show products recorded in logs under that factory. Not applicable for All Plants filter.
  const availableProducts = useMemo(() => {
    if (filters.factory === 'ALL') {
      const recordedProds = safeLogs.map(l => l?.Product).filter(Boolean) as string[];
      return Array.from(new Set([...PRODUCT_OPTIONS, ...recordedProds])).sort();
    }
    const factoryLogs = safeLogs.filter(l => l && l.Factory === filters.factory);
    const recordedProds = Array.from(new Set(factoryLogs.map(l => l.Product).filter(Boolean))) as string[];
    return recordedProds.sort();
  }, [safeLogs, filters.factory]);

  // Auto-reset line or product if they are not recorded under newly selected factory
  useEffect(() => {
    if (filters.factory !== 'ALL') {
      let needsReset = false;
      let newLine = filters.line;
      let newProduct = filters.product;

      if (filters.line !== 'ALL' && !availableLines.includes(filters.line)) {
        newLine = 'ALL';
        needsReset = true;
      }
      if (filters.product !== 'ALL' && !availableProducts.includes(filters.product)) {
        newProduct = 'ALL';
        needsReset = true;
      }

      if (needsReset) {
        onFilterChange({
          ...filters,
          line: newLine,
          product: newProduct
        });
      }
    }
  }, [filters.factory, availableLines, availableProducts]);

  // Filtered dataset (dashboard factory is completely unlocked)
  const filteredLogs = useMemo(() => {
    return safeLogs.filter(log => {
      if (filters.factory !== 'ALL' && log.Factory !== filters.factory) {
        return false;
      }
      if (filters.line !== 'ALL' && log.Line !== filters.line) {
        return false;
      }
      if (filters.product !== 'ALL' && log.Product !== filters.product) {
        return false;
      }
      if (filters.startDate && log.Date < filters.startDate) {
        return false;
      }
      if (filters.endDate && log.Date > filters.endDate) {
        return false;
      }
      return true;
    });
  }, [logs, filters]);

  // Executive Metrics Calculations - strictly respecting multi-style line aggregation
  // "get sum of efficiency (Dont devide or make average. for TM/MO count get average or devide it accordingly. this is applicable for all 3 factories."
  const metrics = useMemo(() => {
    const agg = calculateAggregatedMetrics(filteredLogs);

    const productAchievementPct = agg.totalPlan > 0
      ? Number(((agg.totalActual / agg.totalPlan) * 100).toFixed(1))
      : 0;

    const earnedStdHours = Math.round(agg.totalProdMinutes / 60);
    const clockedHours = Math.round(agg.totalWorkedMinutes / 60);

    return {
      totalPlan: agg.totalPlan,
      totalActual: agg.totalActual,
      totalProdMinutes: agg.totalProdMinutes,
      totalWorkedMinutes: agg.totalWorkedMinutes,
      lineEfficiency: agg.lineEfficiency,
      targetRealization: agg.targetRealization,
      laborAttendance: agg.laborAttendance,
      totalPresentTM: Math.round(agg.totalPresentTM),
      totalPlanTM: Math.round(agg.totalPlanTM),
      lostHours: agg.lostHours,
      downtimeHours: agg.downtimeHours,
      pcsPerOp: agg.pcsPerOp,
      productAchievementPct,
      earnedStdHours,
      clockedHours,
      multiStyleShiftsCount: agg.multiStyleShiftsCount
    };
  }, [filteredLogs]);

  // Data for Output by Product Chart (Bar Chart)
  const outputByProductData = useMemo(() => {
    const map: Record<string, { product: string; planned: number; actual: number }> = {};
    filteredLogs.forEach(l => {
      const prod = l.Product || 'Other';
      if (!map[prod]) {
        map[prod] = { product: prod, planned: 0, actual: 0 };
      }
      map[prod].planned += Number(l.Planned_QTY) || 0;
      map[prod].actual += Number(l.Actual_QTY) || 0;
    });
    return Object.values(map).sort((a, b) => b.actual - a.actual).slice(0, 8);
  }, [filteredLogs]);

  // Data for Factory Capacity Distribution (Donut Chart)
  const factoryCapacityData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredLogs.forEach(l => {
      const f = l.Factory;
      map[f] = (map[f] || 0) + getEffectiveProducedMinutes(l);
    });
    return Object.keys(map).map(k => ({
      name: k,
      value: Math.round(map[k] / 60) // hours
    }));
  }, [filteredLogs]);

  // Data for Daily Efficiency Trend (Line Chart) - strictly respects multi-style sum of efficiency
  // When all plants selected in filter, calculates separate efficiency for each factory
  const dailyTrendData = useMemo(() => {
    const dateMap = new Map<string, ProductionLog[]>();
    filteredLogs.forEach(l => {
      const d = l.Date;
      if (!d) return;
      if (!dateMap.has(d)) dateMap.set(d, []);
      dateMap.get(d)!.push(l);
    });

    return Array.from(dateMap.keys()).sort().map(date => {
      const dayLogs = dateMap.get(date)!;
      const dayMetrics = calculateAggregatedMetrics(dayLogs);
      
      const row: Record<string, any> = {
        date,
        efficiency: dayMetrics.lineEfficiency,
        overallEfficiency: dayMetrics.lineEfficiency,
        benchmark: 75
      };

      // Compute efficiency for each factory for this date
      FACTORIES.forEach(f => {
        const factoryDayLogs = dayLogs.filter(l => l.Factory === f);
        if (factoryDayLogs.length > 0) {
          const fMetrics = calculateAggregatedMetrics(factoryDayLogs);
          row[f] = fMetrics.lineEfficiency;
        } else {
          row[f] = null;
        }
      });

      return row;
    });
  }, [filteredLogs]);

  // Aggregate plant-wise efficiency summary for visual badges
  const factoryTrendSummary = useMemo(() => {
    const summary: Record<string, { efficiency: number; totalActual: number }> = {};
    FACTORIES.forEach(f => {
      const fLogs = filteredLogs.filter(l => l.Factory === f);
      if (fLogs.length > 0) {
        const m = calculateAggregatedMetrics(fLogs);
        summary[f] = { efficiency: m.lineEfficiency, totalActual: m.totalActual };
      }
    });
    return summary;
  }, [filteredLogs]);

  // Downtime Visual Analytics (Lost Time & Bottleneck Analysis)
  const downtimeAnalytics = useMemo(() => {
    let totalDowntimeMinutes = 0;
    const plantDowntimeMap: Record<string, number> = {};
    const lineDowntimeMap: Record<string, { lineKey: string; lineLabel: string; factory: string; minutes: number; hours: number }> = {};

    filteredLogs.forEach(l => {
      const wMins = getEffectiveWorkedMinutes(l);
      const pMins = getEffectiveProducedMinutes(l);
      const rawDt = Number(l.Down_Time);
      const dt = !isNaN(rawDt) && rawDt > 0 && rawDt <= wMins ? rawDt : Math.max(0, Math.round(wMins - pMins));
      totalDowntimeMinutes += dt;

      // Plant grouping
      const factory = l.Factory || 'Unknown';
      plantDowntimeMap[factory] = (plantDowntimeMap[factory] || 0) + dt;

      // Line grouping
      const lineNo = l.Line_No || l.Line || '1';
      const key = `${factory}-${lineNo}`;
      if (!lineDowntimeMap[key]) {
        lineDowntimeMap[key] = {
          lineKey: key,
          lineLabel: `${factory.slice(0, 1)}${lineNo}`,
          factory,
          minutes: 0,
          hours: 0
        };
      }
      lineDowntimeMap[key].minutes += dt;
    });

    Object.values(lineDowntimeMap).forEach(item => {
      item.hours = Number((item.minutes / 60).toFixed(1));
    });

    const topLines = Object.values(lineDowntimeMap)
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 7);

    const plantDistribution = Object.entries(plantDowntimeMap).map(([name, minutes], idx) => ({
      name,
      minutes,
      hours: Number((minutes / 60).toFixed(1)),
      pct: totalDowntimeMinutes > 0 ? Number(((minutes / totalDowntimeMinutes) * 100).toFixed(1)) : 0,
      fill: COLORS[idx % COLORS.length]
    }));

    const totalHours = Number((totalDowntimeMinutes / 60).toFixed(1));
    const totalClockedMinutes = metrics.clockedHours * 60;
    const downtimePct = totalClockedMinutes > 0
      ? Number(((totalDowntimeMinutes / totalClockedMinutes) * 100).toFixed(1))
      : 0;

    return {
      totalDowntimeMinutes,
      totalHours,
      downtimePct,
      topLines,
      plantDistribution
    };
  }, [filteredLogs, metrics.clockedHours]);

  // Category-wise granular downtime analytics (DT Codes breakdown)
  const categoryDowntimeAnalytics = useMemo(() => {
    const mockBrands = ['van heusen', 'ralph lauren', 'tommy hilfiger', 'arrow'];
    const mockStyles = ['VH-9920-F', 'RL-5501-SLIM', 'TH-TR-402', 'ARW-7740'];

    // Filter downtime logs based on dashboard filters (factory, date range)
    const logsToUse = (safeDowntimeLogs && safeDowntimeLogs.length > 0)
      ? safeDowntimeLogs.filter(d => {
          if (!d) return false;
          const b = (d.brand || '').trim().toLowerCase();
          const s = (d.style || '').trim().toUpperCase();
          if (mockBrands.some(mb => b.includes(mb)) || mockStyles.includes(s)) return false;
          if (filters.factory !== 'ALL' && d.factory !== filters.factory) return false;
          if (filters.line !== 'ALL' && d.line !== filters.line) return false;
          if (filters.product !== 'ALL' && d.product !== filters.product) return false;
          if (filters.startDate && d.date < filters.startDate) return false;
          if (filters.endDate && d.date > filters.endDate) return false;
          return true;
        })
      : [];

    let totalCategoryMinutes = 0;
    const codeMap: Record<
      string,
      {
        code: string;
        name: string;
        department: string;
        color: string;
        minutes: number;
        count: number;
        Kurunegala: number;
        Bulugolla: number;
        Werapola: number;
      }
    > = {};
    const deptMap: Record<string, { name: string; minutes: number; count: number }> = {};
    const styleMap: Record<string, { style: string; brand: string; factory: string; minutes: number; primaryCode: string }> = {};

    logsToUse.forEach(item => {
      const mins = Number(item.downtimeMinutes) || 0;
      totalCategoryMinutes += mins;

      const codeInfo = getDowntimeCodeBadge(item.categoryCode || item.downtimeCategory);
      const codeKey = codeInfo.code;
      const rawFactory = (item.factory || '').trim();
      const matchedFactory = rawFactory.toLowerCase().includes('kuru')
        ? 'Kurunegala'
        : rawFactory.toLowerCase().includes('bulu')
        ? 'Bulugolla'
        : rawFactory.toLowerCase().includes('wera')
        ? 'Werapola'
        : 'Kurunegala';

      if (!codeMap[codeKey]) {
        codeMap[codeKey] = {
          code: codeInfo.code,
          name: codeInfo.name,
          department: codeInfo.department,
          color: codeInfo.color,
          minutes: 0,
          count: 0,
          Kurunegala: 0,
          Bulugolla: 0,
          Werapola: 0
        };
      }
      codeMap[codeKey].minutes += mins;
      codeMap[codeKey].count += 1;
      if (matchedFactory === 'Kurunegala') codeMap[codeKey].Kurunegala += mins;
      else if (matchedFactory === 'Bulugolla') codeMap[codeKey].Bulugolla += mins;
      else if (matchedFactory === 'Werapola') codeMap[codeKey].Werapola += mins;

      const dept = codeInfo.department;
      if (!deptMap[dept]) {
        deptMap[dept] = { name: dept, minutes: 0, count: 0 };
      }
      deptMap[dept].minutes += mins;
      deptMap[dept].count += 1;

      const st = item.style || 'Unknown';
      if (!styleMap[st]) {
        styleMap[st] = {
          style: st,
          brand: item.brand,
          factory: item.factory,
          minutes: 0,
          primaryCode: codeInfo.code
        };
      }
      styleMap[st].minutes += mins;
    });

    const codeList = Object.values(codeMap).sort((a, b) => b.minutes - a.minutes);
    const topCodes = codeList.slice(0, 8).map(c => {
      const kPct = c.minutes > 0 ? Number(((c.Kurunegala / c.minutes) * 100).toFixed(1)) : 0;
      const bPct = c.minutes > 0 ? Number(((c.Bulugolla / c.minutes) * 100).toFixed(1)) : 0;
      const wPct = c.minutes > 0 ? Number(((c.Werapola / c.minutes) * 100).toFixed(1)) : 0;
      return {
        ...c,
        Kurunegala_pct: kPct,
        Bulugolla_pct: bPct,
        Werapola_pct: wPct,
        hours: Number((c.minutes / 60).toFixed(1)),
        pct: totalCategoryMinutes > 0 ? Number(((c.minutes / totalCategoryMinutes) * 100).toFixed(1)) : 0
      };
    });

    const deptColors = ['#0ea5e9', '#ec4899', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#06b6d4', '#64748b'];
    const deptList = Object.values(deptMap).sort((a, b) => b.minutes - a.minutes).map((d, idx) => ({
      name: d.name,
      minutes: d.minutes,
      hours: Number((d.minutes / 60).toFixed(1)),
      pct: totalCategoryMinutes > 0 ? Number(((d.minutes / totalCategoryMinutes) * 100).toFixed(1)) : 0,
      fill: deptColors[idx % deptColors.length]
    }));

    let topStyles = Object.values(styleMap).sort((a, b) => b.minutes - a.minutes).slice(0, 5);

    // If no category downtime logs found for this filter, extract top impacted styles from authentic production logs
    if (topStyles.length === 0 && filteredLogs.length > 0) {
      const prodStyleMap: Record<string, { style: string; brand: string; factory: string; minutes: number; primaryCode: string }> = {};
      filteredLogs.forEach(l => {
        const dt = Number(l.Down_Time) || 0;
        const st = (l.Style || '').trim();
        if (dt > 0 && st && st.toUpperCase() !== 'UNKNOWN') {
          if (!prodStyleMap[st]) {
            prodStyleMap[st] = {
              style: st,
              brand: l.Brand || 'VANTAGE',
              factory: l.Factory,
              minutes: 0,
              primaryCode: 'EN1'
            };
          }
          prodStyleMap[st].minutes += dt;
        }
      });
      topStyles = Object.values(prodStyleMap).sort((a, b) => b.minutes - a.minutes).slice(0, 5);
    }

    const topCode = topCodes.length > 0 ? topCodes[0] : null;

    return {
      totalRecords: logsToUse.length,
      totalCategoryMinutes,
      totalCategoryHours: Number((totalCategoryMinutes / 60).toFixed(1)),
      topCodes,
      deptList,
      topStyles,
      topCode
    };
  }, [downtimeLogs, filters, filteredLogs]);

  // Production Line Operational Summary Table - strictly respects multi-style line aggregation
  const lineSummaryData = useMemo(() => {
    const aggregatedShifts = aggregateMultiStyleLineLogs(filteredLogs);
    const map: Record<string, {
      factory: string;
      line: string;
      lineNo: string;
      supervisor: string;
      targetPcs: number;
      actualPcs: number;
      prodMin: number;
      workMin: number;
      multiStyleCount: number;
    }> = {};

    aggregatedShifts.forEach(shift => {
      const key = `${shift.factory}_${shift.line}_${shift.supervisor}`;
      if (!map[key]) {
        map[key] = {
          factory: shift.factory,
          line: shift.line,
          lineNo: shift.lineNo,
          supervisor: shift.supervisor,
          targetPcs: 0,
          actualPcs: 0,
          prodMin: 0,
          workMin: 0,
          multiStyleCount: 0
        };
      }
      map[key].targetPcs += shift.totalPlannedQty;
      map[key].actualPcs += shift.totalActualQty;
      map[key].prodMin += shift.totalProducedMinutes;
      map[key].workMin += shift.totalWorkedMinutes;
      if (shift.logsCount > 1) {
        map[key].multiStyleCount += 1;
      }
    });

    return Object.values(map)
      .map(item => {
        const eff = item.workMin > 0 ? Number(((item.prodMin / item.workMin) * 100).toFixed(1)) : 0;
        const earnedHrs = Math.round(item.prodMin / 60);
        return {
          ...item,
          efficiency: eff,
          earnedHrs
        };
      })
      .sort((a, b) => b.actualPcs - a.actualPcs);
  }, [filteredLogs]);

  return (
    <div className="space-y-4">

      {/* MULTI-SHEET INTERACTIVE FILTERS BENTO CARD */}
      <section className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-3.5 shadow-md transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 pb-2.5 mb-3 text-xs gap-2">
          <div className="flex items-center gap-2 text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-widest">
            <span className="w-1 h-3 bg-cyan-400 rounded-full"></span>
            <Filter className="w-3.5 h-3.5 text-cyan-400" />
            <span>Multi-Sheet Interactive Filters</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="text-slate-400 dark:text-slate-400 light:text-slate-600 text-xs">
              Showing <strong className="text-white dark:text-white light:text-slate-900 font-mono">{filteredLogs.length}</strong> of{' '}
              <strong className="font-mono text-slate-300 dark:text-slate-300 light:text-slate-700">{logs.length}</strong> logs
            </span>
            <button
              onClick={() => exportToCSV(filteredLogs)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition text-[11px] shadow-sm shadow-emerald-950 cursor-pointer"
              title="Download filtered production logs as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Logs CSV</span>
            </button>
            <button
              onClick={onResetFilters}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-100 border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-300 text-slate-300 dark:text-slate-300 light:text-slate-700 hover:text-white dark:hover:text-white light:hover:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-800 light:hover:bg-slate-200 transition text-[11px] font-bold"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Filters</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
          <div>
            <label className="block text-slate-400 dark:text-slate-400 light:text-slate-600 text-[10px] font-black uppercase tracking-wider mb-1">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={e => onFilterChange({ ...filters, startDate: e.target.value })}
              className="w-full bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 rounded-lg px-2.5 py-1.5 text-white dark:text-white light:text-slate-900 font-medium focus:border-cyan-500 focus:outline-none text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-400 dark:text-slate-400 light:text-slate-600 text-[10px] font-black uppercase tracking-wider mb-1">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={e => onFilterChange({ ...filters, endDate: e.target.value })}
              className="w-full bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 rounded-lg px-2.5 py-1.5 text-white dark:text-white light:text-slate-900 font-medium focus:border-cyan-500 focus:outline-none text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-400 dark:text-slate-400 light:text-slate-600 text-[10px] font-black uppercase tracking-wider mb-1">
              Factory Plant
            </label>
            <select
              value={filters.factory}
              onChange={e => {
                const newFactory = e.target.value;
                const nextLines = newFactory !== 'ALL'
                  ? Array.from(new Set(safeLogs.filter(l => l?.Factory === newFactory).map(l => l.Line).filter(Boolean)))
                  : [];
                const nextProducts = newFactory !== 'ALL'
                  ? Array.from(new Set(safeLogs.filter(l => l?.Factory === newFactory).map(l => l.Product).filter(Boolean)))
                  : [];

                const keepLine = newFactory === 'ALL' || (filters.line !== 'ALL' && nextLines.includes(filters.line));
                const keepProd = newFactory === 'ALL' || (filters.product !== 'ALL' && nextProducts.includes(filters.product));

                onFilterChange({
                  ...filters,
                  factory: newFactory,
                  line: keepLine ? filters.line : 'ALL',
                  product: keepProd ? filters.product : 'ALL'
                });
              }}
              className="w-full bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-white dark:text-white light:text-slate-900 focus:border-cyan-500 focus:outline-none text-xs"
            >
              <option value="ALL">All Plants</option>
              {FACTORIES.map(f => (
                <option key={f} value={f}>{f} Plant</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-slate-400 dark:text-slate-400 light:text-slate-600 text-[10px] font-black uppercase tracking-wider mb-1">
              Production Line {filters.factory !== 'ALL' && <span className="text-cyan-400">({availableLines.length} Plant Lines)</span>}
            </label>
            <select
              value={filters.line}
              onChange={e => onFilterChange({ ...filters, line: e.target.value })}
              className="w-full bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 rounded-lg px-2.5 py-1.5 text-white dark:text-white light:text-slate-900 font-semibold focus:border-cyan-500 focus:outline-none text-xs"
            >
              <option value="ALL">
                {filters.factory === 'ALL' ? 'All Lines' : `All Lines in ${filters.factory} (${availableLines.length})`}
              </option>
              {availableLines.map(l => (
                <option key={l} value={l}>Line {l}</option>
              ))}
            </select>
          </div>

          <div className="col-span-2 sm:col-span-1">
            <label className="block text-slate-400 dark:text-slate-400 light:text-slate-600 text-[10px] font-black uppercase tracking-wider mb-1">
              Product Category {filters.factory !== 'ALL' && <span className="text-purple-400">({availableProducts.length} Recorded)</span>}
            </label>
            <select
              value={filters.product}
              onChange={e => onFilterChange({ ...filters, product: e.target.value })}
              className="w-full bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 rounded-lg px-2.5 py-1.5 text-white dark:text-white light:text-slate-900 font-semibold focus:border-cyan-500 focus:outline-none text-xs"
            >
              <option value="ALL">
                {filters.factory === 'ALL' ? 'All Products' : `All Products in ${filters.factory} (${availableProducts.length})`}
              </option>
              {availableProducts.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* APPAREL EXECUTIVE KPI BENTO SCORECARD GRID */}
      <section className="space-y-2">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs gap-2 px-1">
          <h2 className="text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-widest flex items-center gap-2">
            <span className="w-1 h-3.5 bg-sky-500 rounded-full"></span>
            Executive Manufacturing KPI Scorecards
          </h2>
          <div className="text-slate-400 dark:text-slate-400 light:text-slate-600 text-[10px] font-bold flex items-center gap-2">
            <span>Target Realization: <strong className="text-emerald-400">100%</strong></span>
            <span>•</span>
            <span>Line Efficiency Benchmark: <strong className="text-cyan-400">75%</strong></span>
          </div>
        </div>

        {/* 6 BENTO CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          
          {/* 1. Total Output */}
          <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3 rounded-xl flex flex-col justify-between h-28 shadow-sm transition-colors">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-400 light:text-slate-600 tracking-wider">Total Output</span>
              <span className="text-sky-400 text-xs">👕</span>
            </div>
            <div>
              <div className="text-xl font-black text-white dark:text-white light:text-slate-900 leading-none">
                {metrics.totalActual >= 1000000
                  ? `${(metrics.totalActual / 1000000).toFixed(2)}M`
                  : metrics.totalActual >= 1000
                    ? `${(metrics.totalActual / 1000).toFixed(1)}k`
                    : metrics.totalActual.toLocaleString()}
              </div>
              <p className="text-[10px] font-bold text-emerald-400 mt-1">↗ {metrics.targetRealization}% Target</p>
            </div>
            <div className="w-full bg-slate-800 dark:bg-slate-800 light:bg-slate-200 h-1 rounded-full overflow-hidden">
              <div
                className="bg-sky-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, metrics.targetRealization)}%` }}
              />
            </div>
          </div>

          {/* 2. Line Efficiency */}
          <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3 rounded-xl flex flex-col justify-between h-28 shadow-sm transition-colors">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-400 light:text-slate-600 tracking-wider">Line Efficiency</span>
              <span className="text-emerald-400 text-xs">⏱️</span>
            </div>
            <div>
              <div className={`text-xl font-black leading-none ${metrics.lineEfficiency >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {metrics.lineEfficiency}%
              </div>
              <p className={`text-[10px] font-bold mt-1 ${metrics.lineEfficiency >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {metrics.lineEfficiency >= 75 ? '✔ Optimal (>75% Bench)' : '⚠ Under 75% Bench'}
              </p>
            </div>
            <div className="w-full bg-slate-800 dark:bg-slate-800 light:bg-slate-200 h-1 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${metrics.lineEfficiency >= 75 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, metrics.lineEfficiency)}%` }}
              />
            </div>
          </div>

          {/* 3. Attendance */}
          <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3 rounded-xl flex flex-col justify-between h-28 shadow-sm transition-colors">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-400 light:text-slate-600 tracking-wider">Attendance</span>
              <span className="text-amber-400 text-xs">👥</span>
            </div>
            <div>
              <div className="text-xl font-black text-white dark:text-white light:text-slate-900 leading-none">
                {metrics.laborAttendance}%
              </div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-400 light:text-slate-600 mt-1">
                {metrics.totalPresentTM} Present TMs
              </p>
            </div>
            <div className="w-full bg-slate-800 dark:bg-slate-800 light:bg-slate-200 h-1 rounded-full overflow-hidden">
              <div
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, metrics.laborAttendance)}%` }}
              />
            </div>
          </div>

          {/* 4. Non-Prod Time */}
          <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3 rounded-xl flex flex-col justify-between h-28 shadow-sm transition-colors">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-400 light:text-slate-600 tracking-wider">Non-Prod Time</span>
              <span className="text-rose-400 text-xs">🛑</span>
            </div>
            <div>
              <div className="text-xl font-black text-white dark:text-white light:text-slate-900 leading-none">
                {metrics.lostHours.toLocaleString()} h
              </div>
              <p className="text-[10px] font-bold text-rose-400 mt-1">
                Downtime Impact
              </p>
            </div>
            <div className="w-full bg-slate-800 dark:bg-slate-800 light:bg-slate-200 h-1 rounded-full overflow-hidden">
              <div
                className="bg-rose-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${metrics.clockedHours > 0 ? Math.min(100, (metrics.lostHours / metrics.clockedHours) * 100) : 0}%` }}
              />
            </div>
          </div>

          {/* 5. Product Achievement % / Pcs / Operator (Card Renamed & Updated with Product Achievement %) */}
          <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3 rounded-xl flex flex-col justify-between h-28 shadow-sm transition-colors">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-black text-purple-400 dark:text-purple-400 light:text-purple-600 tracking-wider">
                Product Achievement %
              </span>
              <span className="text-purple-400 text-xs">🎯</span>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-white dark:text-white light:text-slate-900 leading-none">
                  {metrics.productAchievementPct}%
                </span>
                <span className="text-[10px] font-mono text-slate-400 dark:text-slate-400 light:text-slate-500">
                  ({metrics.pcsPerOp} pcs/op)
                </span>
              </div>
              <p className="text-[10px] font-bold text-purple-400 mt-1 truncate">
                Pcs / Operator: {metrics.pcsPerOp}
              </p>
            </div>
            <div className="w-full bg-slate-800 dark:bg-slate-800 light:bg-slate-200 h-1 rounded-full overflow-hidden">
              <div
                className="bg-purple-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, metrics.productAchievementPct)}%` }}
              />
            </div>
          </div>

          {/* 6. Earned Std Hrs */}
          <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3 rounded-xl flex flex-col justify-between h-28 shadow-sm transition-colors">
            <div className="flex justify-between items-start">
              <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-400 light:text-slate-600 tracking-wider">Earned Std Hrs</span>
              <span className="text-cyan-400 text-xs">💼</span>
            </div>
            <div>
              <div className="text-xl font-black text-white dark:text-white light:text-slate-900 leading-none">
                {metrics.earnedStdHours >= 1000 ? `${(metrics.earnedStdHours / 1000).toFixed(1)}k` : metrics.earnedStdHours.toLocaleString()}
              </div>
              <p className="text-[10px] font-bold text-cyan-400 mt-1">
                Vs {metrics.clockedHours >= 1000 ? `${(metrics.clockedHours / 1000).toFixed(1)}k` : metrics.clockedHours} Clocked
              </p>
            </div>
            <div className="w-full bg-slate-800 dark:bg-slate-800 light:bg-slate-200 h-1 rounded-full overflow-hidden">
              <div
                className="bg-cyan-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${metrics.clockedHours > 0 ? Math.min(100, (metrics.earnedStdHours / metrics.clockedHours) * 100) : 0}%` }}
              />
            </div>
          </div>

        </div>
      </section>

      {/* 1ST VISUAL: DAILY LINE EFFICIENCY TREND (%) BENTO CARD */}
      <section className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-4 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 pb-3 border-b border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-1 h-3.5 bg-emerald-500 rounded-full"></span>
              <h3 className="text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-widest flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span>Daily Line Efficiency Trend (%)</span>
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
              {filters.factory === 'ALL'
                ? 'Multi-Plant Continuous Efficiency tracking across Kurunegala, Bulugolla & Werapola Plants (75% Standard Benchmark).'
                : `${filters.factory} Plant Continuous Line Efficiency tracking indexed against the 75% industry standard benchmark.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {filters.factory === 'ALL' ? (
              <>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-100 border border-cyan-800/40 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                  <span className="text-slate-300 dark:text-slate-300 light:text-slate-700 font-semibold">Kurunegala:</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {factoryTrendSummary['Kurunegala'] ? `${factoryTrendSummary['Kurunegala'].efficiency}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-100 border border-emerald-800/40 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span className="text-slate-300 dark:text-slate-300 light:text-slate-700 font-semibold">Bulugolla:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {factoryTrendSummary['Bulugolla'] ? `${factoryTrendSummary['Bulugolla'].efficiency}%` : 'N/A'}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-100 border border-amber-800/40 text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span className="text-slate-300 dark:text-slate-300 light:text-slate-700 font-semibold">Werapola:</span>
                  <span className="font-mono font-bold text-amber-400">
                    {factoryTrendSummary['Werapola'] ? `${factoryTrendSummary['Werapola'].efficiency}%` : 'N/A'}
                  </span>
                </div>
                <span className="text-rose-400 font-bold bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 rounded text-[10px]">
                  Benchmark: 75%
                </span>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-cyan-400 font-bold bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 rounded text-[10px]">
                  {filters.factory} Plant Average: {metrics.lineEfficiency}%
                </span>
                <span className="text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded text-[10px]">
                  Target Benchmark: 75.0%
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="h-64 sm:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyTrendData} margin={{ top: 10, right: 15, left: -15, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1c2b44" vertical={false} opacity={0.6} />
              <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 10 }} />
              <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0d1625', borderColor: '#1c2b44', borderRadius: '8px', fontSize: '12px' }}
                formatter={(val: any, name: any) => [
                  val != null ? `${val}%` : 'No Output',
                  name
                ]}
              />
              <Legend
                verticalAlign="top"
                height={32}
                iconType="circle"
                wrapperStyle={{ fontSize: '11px', paddingBottom: '4px' }}
              />
              <ReferenceLine
                y={75}
                stroke="#ef4444"
                strokeDasharray="4 4"
                label={{ value: '75% Benchmark', fill: '#ef4444', fontSize: 10, position: 'insideTopRight' }}
              />

              {filters.factory === 'ALL' ? (
                <>
                  <Line
                    type="monotone"
                    dataKey="Kurunegala"
                    name="Kurunegala Plant"
                    stroke="#06b6d4"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: '#06b6d4', stroke: '#0d1625', strokeWidth: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Bulugolla"
                    name="Bulugolla Plant"
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: '#10b981', stroke: '#0d1625', strokeWidth: 2 }}
                    connectNulls
                  />
                  <Line
                    type="monotone"
                    dataKey="Werapola"
                    name="Werapola Plant"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: '#f59e0b', stroke: '#0d1625', strokeWidth: 2 }}
                    connectNulls
                  />
                </>
              ) : (
                <Line
                  type="monotone"
                  dataKey="efficiency"
                  name={`${filters.factory} Plant Efficiency`}
                  stroke="#10b981"
                  strokeWidth={3}
                  dot={false}
                  activeDot={{ r: 6, fill: '#10b981', stroke: '#0d1625', strokeWidth: 2 }}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* VISUAL ANALYTICS ROW (BENTO GRID CARDS) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        
        {/* Planned Target vs Actual Garment Output (Bar Chart Bento Box) */}
        <div className="col-span-1 lg:col-span-2 bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-4 flex flex-col shadow-sm transition-colors">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-widest flex items-center gap-2">
              <span className="w-1 h-3 bg-sky-500 rounded-full"></span> Planned vs Actual Output
            </h3>
            <div className="flex gap-3 text-[10px]">
              <span className="flex items-center gap-1 text-slate-400 dark:text-slate-400 light:text-slate-600">
                <span className="w-2 h-2 rounded-full bg-slate-700"></span> Target
              </span>
              <span className="flex items-center gap-1 text-white dark:text-white light:text-slate-900 font-bold">
                <span className="w-2 h-2 rounded-full bg-sky-500"></span> Actual
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={outputByProductData} margin={{ top: 10, right: 10, left: -15, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c2b44" vertical={false} opacity={0.6} />
                <XAxis dataKey="product" stroke="#64748b" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" />
                <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1625', borderColor: '#1c2b44', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(val: any) => [Number(val).toLocaleString() + ' pcs']}
                />
                <Bar dataKey="planned" name="Planned Target" fill="#1e293b" radius={[3, 3, 0, 0]} />
                <Bar dataKey="actual" name="Actual Output" fill="#0ea5e9" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Factory Capacity Distribution (Donut Chart Bento Box) */}
        <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-4 flex flex-col justify-between shadow-sm transition-colors">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-widest flex items-center gap-2">
              <span className="w-1 h-3 bg-purple-500 rounded-full"></span> Plant Share
            </h3>
            <span className="text-[10px] text-slate-400 dark:text-slate-400 light:text-slate-600 font-bold">Capacity</span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={factoryCapacityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {factoryCapacityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#0d1625', borderColor: '#1c2b44', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(val: any) => [`${Number(val).toLocaleString()} Std Hrs`, 'Capacity']}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-bold pt-2 border-t border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200">
            {factoryCapacityData.map((f, i) => (
              <div key={f.name} className="flex items-center gap-2 text-slate-300 dark:text-slate-300 light:text-slate-700">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }}></span>
                <span className="truncate">{f.name}: {f.value}h</span>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* DOWNTIME VISUAL REPRESENTATION & LOST TIME ANALYTICS */}
      <section className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-4 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3 pb-3 border-b border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-1 h-3.5 bg-rose-500 rounded-full"></span>
              <h3 className="text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-widest flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                <span>Downtime Visual Analytics &amp; Lost Time Impact</span>
              </h3>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
              Comparative visualization of non-productive downtime across factory plants and high-lost-time production lines.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-100 border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-300 flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-400 light:text-slate-600">Total Downtime:</span>
              <span className="font-mono font-bold text-rose-400">{downtimeAnalytics.totalHours.toLocaleString()} hrs</span>
              <span className="text-[10px] text-slate-500 font-mono">({downtimeAnalytics.totalDowntimeMinutes.toLocaleString()} mins)</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 font-bold flex items-center gap-1.5">
              <span className="text-[10px] uppercase">Downtime Impact:</span>
              <span>{downtimeAnalytics.downtimePct}% of Clocked Hrs</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 1. Bar Chart: Highest Downtime Lines */}
          <div className="col-span-1 lg:col-span-2 bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-3.5 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-[11px] font-black uppercase text-slate-200 dark:text-slate-200 light:text-slate-800 tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                Highest Lost-Time Production Lines (Hours Lost)
              </h4>
              <span className="text-[10px] text-slate-400 dark:text-slate-400 light:text-slate-500">Top line bottlenecks</span>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={downtimeAnalytics.topLines} margin={{ top: 10, right: 10, left: -15, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2b44" vertical={false} opacity={0.6} />
                  <XAxis dataKey="lineLabel" stroke="#64748b" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 10 }} tickFormatter={v => `${v}h`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0d1625', borderColor: '#1c2b44', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(val: any, _name: any, item: any) => [
                      `${Number(val).toLocaleString()} hrs (${item?.payload?.minutes?.toLocaleString() || 0} mins)`,
                      `Lost Time (${item?.payload?.factory || ''})`
                    ]}
                  />
                  <Bar dataKey="hours" name="Downtime (Hours)" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. Donut Chart: Downtime by Plant */}
          <div className="bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-1">
              <h4 className="text-[11px] font-black uppercase text-slate-200 dark:text-slate-200 light:text-slate-800 tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                Downtime by Plant
              </h4>
              <span className="text-[10px] text-slate-400 dark:text-slate-400 light:text-slate-500 font-mono">Lost Hours</span>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={downtimeAnalytics.plantDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    paddingAngle={4}
                    dataKey="hours"
                  >
                    {downtimeAnalytics.plantDistribution.map((entry, index) => (
                      <Cell key={`dt-cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0d1625', borderColor: '#1c2b44', borderRadius: '8px', fontSize: '12px' }}
                    formatter={(val: any) => [`${val} hrs`, 'Downtime']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-1.5 pt-2 border-t border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 text-[11px]">
              {downtimeAnalytics.plantDistribution.map((p) => (
                <div key={p.name} className="flex items-center justify-between text-slate-300 dark:text-slate-300 light:text-slate-700">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.fill }} />
                    <span className="font-semibold">{p.name}:</span>
                  </div>
                  <div className="font-mono text-xs">
                    <span className="text-white dark:text-white light:text-slate-900 font-bold">{p.hours}h</span>
                    <span className="text-slate-400 ml-1">({p.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Granular Category-Wise Downtime Breakdown (DT Codes & Department Root-Causes) */}
        {categoryDowntimeAnalytics.totalRecords > 0 && (
          <div className="mt-4 pt-4 border-t border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <div>
                <h4 className="text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-wider flex items-center gap-2">
                  <Tag className="w-4 h-4 text-cyan-400" />
                  <span>Category-Wise Root Cause Breakdown (DT Codes)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono">
                    {categoryDowntimeAnalytics.totalRecords} Records Bonded via Entry_ID
                  </span>
                </h4>
                <p className="text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-600 mt-0.5">
                  Granular categorization of shift lost time into standardized industry DT reason codes.
                </p>
              </div>

              {categoryDowntimeAnalytics.topCode && (
                <div className="px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex items-center gap-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Primary Bottleneck:</span>
                  <span className="font-mono font-bold text-white dark:text-white light:text-slate-900">
                    {categoryDowntimeAnalytics.topCode.code} - {categoryDowntimeAnalytics.topCode.name}
                  </span>
                  <span className="text-[10px] text-rose-300">({categoryDowntimeAnalytics.topCode.minutes}m / {categoryDowntimeAnalytics.topCode.pct}%)</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Pareto Bar Chart by DT Code with Plant-Wise Portion Identify View */}
              <div className="col-span-1 lg:col-span-2 bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-3.5 flex flex-col">
                <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h5 className="text-[11px] font-black uppercase text-slate-200 dark:text-slate-200 light:text-slate-800 tracking-wider flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                      Lost Minutes by Downtime Code (Pareto Ranking)
                    </h5>
                    {filters.factory === 'ALL' && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 font-mono font-bold">
                        Plant Share Active
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Plant Legend Indicators when All Plants are selected */}
                    {filters.factory === 'ALL' && (
                      <div className="hidden sm:flex items-center gap-2 text-[10px]">
                        <span className="flex items-center gap-1 text-cyan-300 font-medium">
                          <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Kurunegala
                        </span>
                        <span className="flex items-center gap-1 text-emerald-300 font-medium">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span> Bulugolla
                        </span>
                        <span className="flex items-center gap-1 text-purple-300 font-medium">
                          <span className="w-2 h-2 rounded-full bg-purple-400"></span> Werapola
                        </span>
                      </div>
                    )}

                    {/* View Mode Toggle when All Plants is selected */}
                    {filters.factory === 'ALL' && (
                      <div className="flex items-center bg-[#070d18] dark:bg-[#070d18] light:bg-slate-200 p-0.5 rounded-lg border border-slate-700/60 dark:border-slate-700/60 light:border-slate-300 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setParetoViewMode('divided')}
                          className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                            paretoViewMode === 'divided'
                              ? 'bg-cyan-600 text-white shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Divide each bar into factory-wise stacked portions"
                        >
                          Plant-Divided Bars
                        </button>
                        <button
                          type="button"
                          onClick={() => setParetoViewMode('combined')}
                          className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                            paretoViewMode === 'combined'
                              ? 'bg-cyan-600 text-white shadow'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Show single combined bar per downtime code"
                        >
                          Single Bar
                        </button>
                      </div>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono">Minutes Lost</span>
                  </div>
                </div>

                <div className="h-60 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryDowntimeAnalytics.topCodes} margin={{ top: 10, right: 10, left: -15, bottom: 25 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1c2b44" vertical={false} opacity={0.6} />
                      <XAxis
                        dataKey="code"
                        stroke="#64748b"
                        tick={{ fontSize: 10 }}
                        interval={0}
                      />
                      <YAxis stroke="#64748b" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0d1625', borderColor: '#1c2b44', borderRadius: '8px', fontSize: '12px' }}
                        content={({ active, payload }) => {
                          if (!active || !payload || !payload.length) return null;
                          const data = payload[0]?.payload;
                          if (!data) return null;
                          return (
                            <div className="bg-[#0d1625] border border-[#1c2b44] p-3 rounded-xl shadow-2xl text-xs space-y-2 font-sans min-w-[230px]">
                              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
                                <span className="font-bold text-white font-mono text-sm text-cyan-400">{data.code}</span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-semibold">
                                  {data.department}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-200 font-medium">{data.name}</div>

                              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800/80">
                                <span className="text-slate-400">Total Lost:</span>
                                <span className="font-mono font-bold text-white">
                                  {data.minutes?.toLocaleString()}m ({data.hours} hrs - {data.pct}%)
                                </span>
                              </div>

                              {filters.factory === 'ALL' && (
                                <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
                                  <div className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center justify-between">
                                    <span>Plant Portion Breakdown</span>
                                    <span>Share</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-cyan-300 bg-cyan-950/20 px-1.5 py-0.5 rounded">
                                    <span className="flex items-center gap-1.5 font-medium">
                                      <span className="w-2 h-2 rounded-full bg-cyan-400" /> Kurunegala:
                                    </span>
                                    <span className="font-mono font-bold">{data.Kurunegala || 0}m ({data.Kurunegala_pct || 0}%)</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-emerald-300 bg-emerald-950/20 px-1.5 py-0.5 rounded">
                                    <span className="flex items-center gap-1.5 font-medium">
                                      <span className="w-2 h-2 rounded-full bg-emerald-400" /> Bulugolla:
                                    </span>
                                    <span className="font-mono font-bold">{data.Bulugolla || 0}m ({data.Bulugolla_pct || 0}%)</span>
                                  </div>
                                  <div className="flex items-center justify-between text-[11px] text-purple-300 bg-purple-950/20 px-1.5 py-0.5 rounded">
                                    <span className="flex items-center gap-1.5 font-medium">
                                      <span className="w-2 h-2 rounded-full bg-purple-400" /> Werapola:
                                    </span>
                                    <span className="font-mono font-bold">{data.Werapola || 0}m ({data.Werapola_pct || 0}%)</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }}
                      />
                      {filters.factory === 'ALL' && paretoViewMode === 'divided' ? (
                        <>
                          <Bar dataKey="Kurunegala" name="Kurunegala Plant" stackId="downtime" fill="#06b6d4" />
                          <Bar dataKey="Bulugolla" name="Bulugolla Plant" stackId="downtime" fill="#10b981" />
                          <Bar dataKey="Werapola" name="Werapola Plant" stackId="downtime" fill="#a855f7" radius={[4, 4, 0, 0]} />
                        </>
                      ) : (
                        <Bar dataKey="minutes" name="Downtime Minutes" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={38}>
                          {categoryDowntimeAnalytics.topCodes.map((entry, index) => (
                            <Cell
                              key={`cell-code-${index}`}
                              fill={
                                filters.factory === 'Kurunegala' ? '#06b6d4' :
                                filters.factory === 'Bulugolla' ? '#10b981' :
                                filters.factory === 'Werapola' ? '#a855f7' :
                                entry.color || COLORS[index % COLORS.length]
                              }
                            />
                          ))}
                        </Bar>
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2 pt-2 border-t border-[#1c2b44] text-[10px]">
                  {categoryDowntimeAnalytics.topCodes.map(c => (
                    <div key={c.code} className="px-2 py-1 rounded-lg bg-slate-800/80 text-slate-300 border border-slate-700/60 font-mono flex flex-col gap-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <strong className="text-white">{c.code}:</strong>
                        <span className="font-bold text-cyan-300">{c.minutes}m ({c.pct}%)</span>
                      </div>
                      {filters.factory === 'ALL' && (
                        <div className="flex items-center gap-1.5 text-[9px] pt-0.5 border-t border-slate-700/40">
                          <span className="text-cyan-400 font-bold" title="Kurunegala">K:{c.Kurunegala_pct}%</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-emerald-400 font-bold" title="Bulugolla">B:{c.Bulugolla_pct}%</span>
                          <span className="text-slate-500">•</span>
                          <span className="text-purple-400 font-bold" title="Werapola">W:{c.Werapola_pct}%</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Department Loss Distribution Donut */}
              <div className="bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-3.5 flex flex-col justify-between">
                <div className="flex justify-between items-center mb-1">
                  <h5 className="text-[11px] font-black uppercase text-slate-200 dark:text-slate-200 light:text-slate-800 tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>
                    Loss by Department
                  </h5>
                  <span className="text-[10px] text-slate-400 font-mono">Dept Share</span>
                </div>
                <div className="h-44 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryDowntimeAnalytics.deptList}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={65}
                        paddingAngle={4}
                        dataKey="minutes"
                      >
                        {categoryDowntimeAnalytics.deptList.map((entry, index) => (
                          <Cell key={`dept-cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0d1625', borderColor: '#1c2b44', borderRadius: '8px', fontSize: '12px' }}
                        formatter={(val: any) => [`${Number(val).toLocaleString()} mins`, 'Loss']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-1 pt-2 border-t border-[#1c2b44] text-[11px] max-h-32 overflow-y-auto">
                  {categoryDowntimeAnalytics.deptList.map(d => (
                    <div key={d.name} className="flex items-center justify-between text-slate-300">
                      <div className="flex items-center gap-1.5 truncate pr-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.fill }} />
                        <span className="font-semibold truncate text-[10px]">{d.name}</span>
                      </div>
                      <div className="font-mono text-xs shrink-0">
                        <span className="text-white font-bold">{d.minutes}m</span>
                        <span className="text-slate-400 text-[10px] ml-1">({d.pct}%)</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Top Impacted Styles Loss Table */}
            {categoryDowntimeAnalytics.topStyles.length > 0 && (
              <div className="bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-3">
                <div className="flex justify-between items-center mb-2">
                  <h5 className="text-[11px] font-black uppercase text-slate-200 dark:text-slate-200 light:text-slate-800 tracking-wider flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    <span>Top Styles Impacted by Downtime Bottlenecks</span>
                  </h5>
                  <span className="text-[10px] text-slate-400">Ranked by Total Lost Minutes</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 text-xs">
                  {categoryDowntimeAnalytics.topStyles.map(st => {
                    const codeBadge = getDowntimeCodeBadge(st.primaryCode);
                    return (
                      <div key={st.style} className="p-2.5 rounded-lg bg-[#121c2e] border border-slate-800 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-white text-xs truncate">{st.style}</span>
                            <span className="text-[10px] text-slate-400">{st.factory}</span>
                          </div>
                          <span className="text-[10px] text-slate-400 block truncate">{st.brand}</span>
                        </div>
                        <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-slate-800/80">
                          <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded border ${codeBadge.bgBadge}`}>
                            {codeBadge.code}
                          </span>
                          <span className="font-mono font-bold text-amber-400">{st.minutes}m</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* PRODUCTION LINE OPERATIONAL SUMMARY TABLE BENTO BOX */}
      <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col transition-colors">
        <div className="bg-[#1c2b44] dark:bg-[#1c2b44] light:bg-slate-100 px-4 py-2.5 flex justify-between items-center text-xs">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-300 dark:text-slate-300 light:text-slate-800 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
            Operational Efficiency Table
          </h3>
          <span className="text-[9px] text-slate-400 dark:text-slate-400 light:text-slate-600 font-mono">Sorted by Actual Output</span>
        </div>
        <div className="overflow-x-auto max-h-72">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="text-slate-400 dark:text-slate-400 light:text-slate-600 uppercase text-[9px] font-black border-b border-slate-800 dark:border-slate-800 light:border-slate-200 bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50">
                <th className="p-3">Plant</th>
                <th className="p-3">Line</th>
                <th className="p-3">Supervisor</th>
                <th className="p-3 text-right">Target</th>
                <th className="p-3 text-right">Actual</th>
                <th className="p-3 text-right">Earned Std Hrs</th>
                <th className="p-3 text-right">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 dark:divide-slate-800/50 light:divide-slate-200">
              {lineSummaryData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-6 text-slate-500">
                    No production logs match the current filter selection.
                  </td>
                </tr>
              ) : (
                lineSummaryData.map((row, idx) => {
                  const effBadge = row.efficiency >= 75
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : row.efficiency >= 60
                      ? 'bg-amber-500/10 text-amber-400'
                      : 'bg-rose-500/10 text-rose-400';
                  return (
                    <tr key={idx} className="hover:bg-slate-800/30 dark:hover:bg-slate-800/30 light:hover:bg-slate-50 transition">
                      <td className="p-2.5 px-3 text-slate-400 dark:text-slate-400 light:text-slate-600">{row.factory}</td>
                      <td className="p-2.5 font-bold text-white dark:text-white light:text-slate-900 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        {row.lineNo}
                      </td>
                      <td className="p-2.5 text-slate-300 dark:text-slate-300 light:text-slate-700">{row.supervisor || '-'}</td>
                      <td className="p-2.5 text-right font-mono text-slate-400 dark:text-slate-400 light:text-slate-600">{row.targetPcs.toLocaleString()}</td>
                      <td className="p-2.5 text-right font-mono font-bold text-white dark:text-white light:text-slate-900">{row.actualPcs.toLocaleString()}</td>
                      <td className="p-2.5 text-right font-mono text-cyan-400">{row.earnedHrs.toLocaleString()} hrs</td>
                      <td className="p-2.5 text-right">
                        <span className={`px-2 py-0.5 rounded font-bold ${effBadge}`}>
                          {row.efficiency}%
                        </span>
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

