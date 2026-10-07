import React, { useMemo, useState, useEffect } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  Clock,
  Layers,
  Shirt,
  Calendar,
  Filter,
  RotateCcw,
  Download,
  CheckCircle2,
  BarChart2,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  TrendingDown,
  Info,
  Database,
  RefreshCw,
  Table,
  ChevronLeft,
  ChevronRight,
  CalendarDays
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Cell,
  ComposedChart,
  Line,
  Area
} from 'recharts';
import { ProductionLog, FilterState, FactoryName } from '../types';
import { FACTORIES, PRODUCT_OPTIONS } from '../data/initialData';
import { fetchDailyProductionFromServer, recordDailyProductionBatch } from '../services/googleSheetService';

interface ProductionStatusPageProps {
  logs: ProductionLog[];
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  onResetFilters: () => void;
}

export const ProductionStatusPage: React.FC<ProductionStatusPageProps> = ({
  logs = [],
  filters,
  onFilterChange,
  onResetFilters
}) => {
  const safeLogs = useMemo(() => (Array.isArray(logs) ? logs : []), [logs]);

  // Pace basis selector: Recent Day Actual vs. Previous Day Actual vs. Daily Average
  const [paceBasis, setPaceBasis] = useState<'recent' | 'previous' | 'avg'>('recent');
  // Sort field
  const [sortField, setSortField] = useState<'daysBehind' | 'qtyVariance' | 'actual' | 'planned'>('daysBehind');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  // View mode
  const [viewMode, setViewMode] = useState<'all' | 'behind_only' | 'on_track'>('all');

  // Daily production database records & sync state
  const [dailyDbRecords, setDailyDbRecords] = useState<any[]>([]);
  const [isSyncingDailyDb, setIsSyncingDailyDb] = useState(false);
  const [showDailyBreakdown, setShowDailyBreakdown] = useState(false);
  type MtdChartViewType = 'daily_output' | 's_curve' | 'days_behind_trend' | 'variance' | 'product_output';
  const [mtdChartView, setMtdChartView] = useState<MtdChartViewType>('daily_output');

  // Helper to format present day (local date YYYY-MM-DD)
  const getPresentDay = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Day filter state:
  // Dynamically filters and displays Month-To-Date (MTD) metrics from the 1st working day of the selected month
  // through the chosen date, defaulting to the present day on initial load.
  const [selectedDay, setSelectedDay] = useState<string>(() => {
    if (filters.endDate && /^\d{4}-\d{2}-\d{2}$/.test(filters.endDate)) {
      return filters.endDate;
    }
    return getPresentDay();
  });

  // Handle user selecting a day in the day filter
  const handleSelectDay = (day: string) => {
    if (!day) return;
    setSelectedDay(day);
    onFilterChange({
      ...filters,
      startDate: `${day.slice(0, 7)}-01`,
      endDate: day
    });
  };

  // Determine current active month, bounds, and first working day based on selectedDay
  const currentMonthInfo = useMemo(() => {
    const dayToUse = selectedDay || getPresentDay();
    const targetYearMonth = dayToUse.slice(0, 7); // e.g. "2026-09"
    const [yearStr, monthStr] = targetYearMonth.split('-');
    const yearNum = parseInt(yearStr, 10);
    const monthNum = parseInt(monthStr, 10);

    const dateObj = new Date(yearNum, monthNum - 1, 1);
    const monthName = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Calendar bounds
    const monthStart = `${targetYearMonth}-01`;
    const lastDayOfMonth = new Date(yearNum, monthNum, 0).getDate();
    const monthEnd = `${targetYearMonth}-${String(lastDayOfMonth).padStart(2, '0')}`;

    // Find all recorded dates in this month
    const monthLogs = safeLogs.filter(l => l.Date && l.Date.startsWith(targetYearMonth));
    const recordedDates: string[] = Array.from(new Set(monthLogs.map(l => l.Date).filter(Boolean) as string[])).sort();

    // First working day in the month with logs (or monthStart fallback)
    const firstWorkingDay = recordedDates.length > 0 ? recordedDates[0] : monthStart;

    // Working days included in MTD up to selectedDay
    const workingDaysIncluded = recordedDates.filter(d => d <= dayToUse).length;
    const totalWorkingDaysInMonth = recordedDates.length;

    // Format display strings
    const formatFriendly = (isoDate: string, includeYear = true) => {
      if (!isoDate || isoDate.length < 10) return isoDate;
      const parts = isoDate.split('-');
      const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      return d.toLocaleDateString('default', {
        month: 'short',
        day: 'numeric',
        ...(includeYear ? { year: 'numeric' } : {})
      });
    };

    const formattedSelectedDay = formatFriendly(dayToUse, true);
    const formattedFirstWorkingDay = formatFriendly(firstWorkingDay, false);
    const isToday = dayToUse === getPresentDay();
    const isFullMonth = dayToUse >= monthEnd || (recordedDates.length > 0 && dayToUse >= recordedDates[recordedDates.length - 1]);

    return {
      targetYearMonth,
      monthName,
      monthStart,
      monthEnd,
      firstWorkingDay,
      formattedFirstWorkingDay,
      selectedDay: dayToUse,
      formattedSelectedDay,
      workingDaysIncluded,
      totalWorkingDaysInMonth,
      isToday,
      isFullMonth,
      recordedDates
    };
  }, [selectedDay, safeLogs]);

  // Steppers for previous / next working day
  const handlePrevDay = () => {
    const list = currentMonthInfo.recordedDates;
    const curIdx = list.indexOf(selectedDay);
    if (curIdx > 0) {
      handleSelectDay(list[curIdx - 1]);
    } else {
      const [y, m, d] = selectedDay.split('-').map(Number);
      const prevDate = new Date(y, m - 1, d - 1);
      const prevStr = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}-${String(prevDate.getDate()).padStart(2, '0')}`;
      handleSelectDay(prevStr);
    }
  };

  const handleNextDay = () => {
    const list = currentMonthInfo.recordedDates;
    const curIdx = list.indexOf(selectedDay);
    if (curIdx >= 0 && curIdx < list.length - 1) {
      handleSelectDay(list[curIdx + 1]);
    } else {
      const [y, m, d] = selectedDay.split('-').map(Number);
      const nextDate = new Date(y, m - 1, d + 1);
      const nextStr = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
      handleSelectDay(nextStr);
    }
  };

  // Synchronize and record daily actual and planned quantities in database using date
  useEffect(() => {
    let isCancelled = false;
    const syncDailyToDatabase = async () => {
      if (safeLogs.length === 0) return;
      setIsSyncingDailyDb(true);
      try {
        const dailyMap: Record<string, { date: string; factory: string; product: string; plannedQty: number; actualQty: number }> = {};
        safeLogs.forEach(log => {
          if (!log.Date || !log.Product) return;
          const key = `${log.Date}___${log.Factory || 'Central'}___${log.Product}`;
          if (!dailyMap[key]) {
            dailyMap[key] = {
              date: log.Date,
              factory: log.Factory || 'Central',
              product: log.Product,
              plannedQty: 0,
              actualQty: 0
            };
          }
          dailyMap[key].plannedQty += Number(log.Planned_QTY) || 0;
          dailyMap[key].actualQty += Number(log.Actual_QTY) || 0;
        });

        const batch = Object.values(dailyMap);
        if (batch.length > 0) {
          await recordDailyProductionBatch(batch);
        }

        const serverData = await fetchDailyProductionFromServer({
          factory: filters.factory !== 'ALL' ? filters.factory : undefined,
          month: currentMonthInfo.targetYearMonth
        });

        if (!isCancelled && serverData.success && serverData.records) {
          setDailyDbRecords(serverData.records);
        }
      } catch (err) {
        console.warn('Daily production sync notice:', err);
      } finally {
        if (!isCancelled) setIsSyncingDailyDb(false);
      }
    };

    syncDailyToDatabase();
    return () => {
      isCancelled = true;
    };
  }, [safeLogs, filters.factory, currentMonthInfo.targetYearMonth]);

  // MTD Chart Logs: Shows Month-To-Date data from 1st working day to selectedDay
  // Line and Product filters are NOT applied to this chart so all products are visible
  const mtdAllProductsLogs = useMemo(() => {
    return safeLogs.filter(l => {
      if (!l.Date) return false;
      // Must belong to current active month
      if (!l.Date.startsWith(currentMonthInfo.targetYearMonth)) return false;
      // MTD Cut-off: from 1st working day of month up to selectedDay
      if (l.Date > currentMonthInfo.selectedDay) return false;

      // Factory filter
      if (filters.factory !== 'ALL' && l.Factory !== filters.factory) return false;

      return true;
    });
  }, [safeLogs, currentMonthInfo.targetYearMonth, currentMonthInfo.selectedDay, filters.factory]);

  // MTD All Products Chart Data: Shows ALL products at once with Planned Qty, Actual Qty, and Days Behind
  const mtdAllProductsChartData = useMemo(() => {
    const grouped: Record<
      string,
      {
        product: string;
        plannedQty: number;
        actualQty: number;
        dailyActuals: Record<string, number>;
      }
    > = {};

    mtdAllProductsLogs.forEach(log => {
      const prod = log.Product || 'Other';
      if (!grouped[prod]) {
        grouped[prod] = {
          product: prod,
          plannedQty: 0,
          actualQty: 0,
          dailyActuals: {}
        };
      }
      const pQty = Number(log.Planned_QTY) || 0;
      const aQty = Number(log.Actual_QTY) || 0;
      grouped[prod].plannedQty += pQty;
      grouped[prod].actualQty += aQty;
      if (log.Date) {
        grouped[prod].dailyActuals[log.Date] = (grouped[prod].dailyActuals[log.Date] || 0) + aQty;
      }
    });

    return Object.values(grouped).map(item => {
      const qtyVariance = item.plannedQty - item.actualQty;
      const achievementPct = item.plannedQty > 0 ? Number(((item.actualQty / item.plannedQty) * 100).toFixed(1)) : 0;
      const activeDates = Object.keys(item.dailyActuals).sort();
      const nonZeroDates = activeDates.filter(d => item.dailyActuals[d] > 0);
      const recentDayDate = nonZeroDates.length > 0 ? nonZeroDates[nonZeroDates.length - 1] : '';
      const recentDayActual = recentDayDate ? item.dailyActuals[recentDayDate] : 0;
      const previousDayDate = nonZeroDates.length > 1 ? nonZeroDates[nonZeroDates.length - 2] : recentDayDate;
      const previousDayActual = previousDayDate ? item.dailyActuals[previousDayDate] : recentDayActual;
      const avgDailyActual = item.actualQty > 0 ? Math.round(item.actualQty / (nonZeroDates.length || 1)) : 0;

      let pace = recentDayActual;
      if (paceBasis === 'previous') pace = previousDayActual > 0 ? previousDayActual : recentDayActual;
      if (paceBasis === 'avg') pace = avgDailyActual > 0 ? avgDailyActual : recentDayActual;
      if (pace <= 0) pace = avgDailyActual > 0 ? avgDailyActual : Math.max(1, Math.round(item.plannedQty / (activeDates.length || 1)));

      const daysBehind = pace > 0 ? Number((qtyVariance / pace).toFixed(1)) : 0;

      return {
        product: item.product,
        plannedQty: item.plannedQty,
        actualQty: item.actualQty,
        qtyVariance,
        daysBehind,
        achievementPct,
        paceUsed: pace
      };
    }).sort((a, b) => b.plannedQty - a.plannedQty);
  }, [mtdAllProductsLogs, paceBasis]);

  // Timeline data for Daily Output vs Plan, MTD Cumulative S-Curve, and Days Behind Trend
  const mtdDailyTimelineData = useMemo(() => {
    const dateMap: Record<string, { planned: number; actual: number }> = {};

    mtdAllProductsLogs.forEach(log => {
      if (!log.Date) return;
      if (!dateMap[log.Date]) {
        dateMap[log.Date] = { planned: 0, actual: 0 };
      }
      dateMap[log.Date].planned += Number(log.Planned_QTY) || 0;
      dateMap[log.Date].actual += Number(log.Actual_QTY) || 0;
    });

    const sortedDates = Object.keys(dateMap).sort();
    if (sortedDates.length === 0) return [];

    let runningPlanned = 0;
    let runningActual = 0;
    let accumulatedDays = 0;

    return sortedDates.map(dateStr => {
      const item = dateMap[dateStr];
      runningPlanned += item.planned;
      runningActual += item.actual;
      accumulatedDays += 1;

      // Daily output variance (deficit is positive)
      const dailyVariance = item.planned - item.actual;
      const dailyAchievementPct = item.planned > 0 ? Number(((item.actual / item.planned) * 100).toFixed(1)) : 0;

      // Cumulative metrics
      const cumVariance = runningPlanned - runningActual;
      const cumAchievementPct = runningPlanned > 0 ? Number(((runningActual / runningPlanned) * 100).toFixed(1)) : 0;

      // Daily run-rate pace up to this date
      const avgPace = runningActual > 0 ? runningActual / accumulatedDays : (runningPlanned / accumulatedDays || 1);
      const cumDaysBehind = avgPace > 0 ? Number((cumVariance / avgPace).toFixed(1)) : 0;

      // Friendly display date e.g. "Sep 03" or "09-03"
      const dateParts = dateStr.split('-');
      let displayDate = dateStr;
      if (dateParts.length === 3) {
        const m = parseInt(dateParts[1], 10);
        const d = dateParts[2];
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        displayDate = `${monthNames[m - 1] || m} ${d}`;
      }

      return {
        date: dateStr,
        displayDate,
        plannedQty: item.planned,
        actualQty: item.actual,
        dailyVariance,
        dailyAchievementPct,
        cumPlanned: runningPlanned,
        cumActual: runningActual,
        cumVariance,
        cumAchievementPct,
        cumDaysBehind
      };
    });
  }, [mtdAllProductsLogs]);

  // Filter logs for this month up to selectedDay (MTD), applying factory/line/product filters
  const currentMonthLogs = useMemo(() => {
    return safeLogs.filter(l => {
      if (!l.Date || !l.Date.startsWith(currentMonthInfo.targetYearMonth)) return false;
      if (l.Date > currentMonthInfo.selectedDay) return false;
      if (filters.factory !== 'ALL' && l.Factory !== filters.factory) return false;
      if (filters.line !== 'ALL' && l.Line !== filters.line) return false;
      if (filters.product !== 'ALL' && l.Product !== filters.product) return false;
      return true;
    });
  }, [safeLogs, currentMonthInfo.targetYearMonth, currentMonthInfo.selectedDay, filters]);

  // Calculate Product-Wise Data
  const productWiseData = useMemo(() => {
    // 1. Group logs by Product
    const grouped: Record<
      string,
      {
        product: string;
        plannedQty: number;
        actualQty: number;
        factories: Set<string>;
        lines: Set<string>;
        styles: Set<string>;
        dailyActuals: Record<string, number>;
      }
    > = {};

    currentMonthLogs.forEach(log => {
      const prod = log.Product || 'Other';
      if (!grouped[prod]) {
        grouped[prod] = {
          product: prod,
          plannedQty: 0,
          actualQty: 0,
          factories: new Set(),
          lines: new Set(),
          styles: new Set(),
          dailyActuals: {}
        };
      }

      const pQty = Number(log.Planned_QTY) || 0;
      const aQty = Number(log.Actual_QTY) || 0;

      grouped[prod].plannedQty += pQty;
      grouped[prod].actualQty += aQty;
      if (log.Factory) grouped[prod].factories.add(log.Factory);
      if (log.Line) grouped[prod].lines.add(log.Line);
      if (log.Style) grouped[prod].styles.add(log.Style);

      if (log.Date) {
        grouped[prod].dailyActuals[log.Date] = (grouped[prod].dailyActuals[log.Date] || 0) + aQty;
      }
    });

    // 2. Compute Days Behind & Qty Variance for each product
    return Object.values(grouped).map(item => {
      // Qty Variance (Planned - Actual): positive = behind (shortfall), negative = ahead (surplus)
      const qtyVariance = item.plannedQty - item.actualQty;
      // Output Variance (Actual - Planned)
      const outputVariance = item.actualQty - item.plannedQty;
      const achievementPct = item.plannedQty > 0 ? Number(((item.actualQty / item.plannedQty) * 100).toFixed(1)) : 0;

      // Extract chronological daily actuals for this product
      const activeDates = Object.keys(item.dailyActuals).sort();
      const nonZeroDates = activeDates.filter(d => item.dailyActuals[d] > 0);

      const recentDayDate = nonZeroDates.length > 0 ? nonZeroDates[nonZeroDates.length - 1] : '';
      const recentDayActual = recentDayDate ? item.dailyActuals[recentDayDate] : 0;

      const previousDayDate = nonZeroDates.length > 1 ? nonZeroDates[nonZeroDates.length - 2] : recentDayDate;
      const previousDayActual = previousDayDate ? item.dailyActuals[previousDayDate] : recentDayActual;

      const activeDaysCount = nonZeroDates.length || 1;
      const avgDailyActual = item.actualQty > 0 ? Math.round(item.actualQty / activeDaysCount) : 0;

      // Pace to divide by based on selected user setting
      let paceUsed = recentDayActual;
      if (paceBasis === 'previous') {
        paceUsed = previousDayActual > 0 ? previousDayActual : recentDayActual;
      } else if (paceBasis === 'avg') {
        paceUsed = avgDailyActual > 0 ? avgDailyActual : recentDayActual;
      }

      // If pace is 0, fall back to any available pace or daily average planned
      if (paceUsed <= 0) {
        paceUsed = avgDailyActual > 0 ? avgDailyActual : Math.max(1, Math.round(item.plannedQty / (activeDates.length || 1)));
      }

      // Days Behind calculation: Qty Variance Deficit / Daily Actual pace
      // If qtyVariance > 0 => behind. If qtyVariance < 0 => ahead (negative days behind).
      const daysBehind = paceUsed > 0 ? Number((qtyVariance / paceUsed).toFixed(2)) : 0;

      return {
        product: item.product,
        plannedQty: item.plannedQty,
        actualQty: item.actualQty,
        qtyVariance, // Planned - Actual (deficit)
        outputVariance, // Actual - Planned
        achievementPct,
        recentDayDate,
        recentDayActual,
        previousDayDate,
        previousDayActual,
        avgDailyActual,
        paceUsed,
        daysBehind,
        factoriesCount: item.factories.size,
        linesCount: item.lines.size,
        stylesCount: item.styles.size,
        isBehind: qtyVariance > 0,
        isAhead: qtyVariance < 0,
        isOnTrack: qtyVariance === 0
      };
    });
  }, [currentMonthLogs, paceBasis]);

  // Filtered & Sorted Product List
  const filteredSortedProducts = useMemo(() => {
    let result = [...productWiseData];

    // Filter view
    if (viewMode === 'behind_only') {
      result = result.filter(p => p.daysBehind > 0);
    } else if (viewMode === 'on_track') {
      result = result.filter(p => p.daysBehind <= 0);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'daysBehind') {
        comparison = b.daysBehind - a.daysBehind;
      } else if (sortField === 'qtyVariance') {
        comparison = b.qtyVariance - a.qtyVariance;
      } else if (sortField === 'actual') {
        comparison = b.actualQty - a.actualQty;
      } else if (sortField === 'planned') {
        comparison = b.plannedQty - a.plannedQty;
      }
      return sortAsc ? -comparison : comparison;
    });

    return result;
  }, [productWiseData, viewMode, sortField, sortAsc]);

  // Overall totals across products
  const summaryTotals = useMemo(() => {
    const totalPlanned = productWiseData.reduce((acc, p) => acc + p.plannedQty, 0);
    const totalActual = productWiseData.reduce((acc, p) => acc + p.actualQty, 0);
    const totalVariance = totalPlanned - totalActual;
    const behindCount = productWiseData.filter(p => p.daysBehind > 0).length;
    const aheadCount = productWiseData.filter(p => p.daysBehind < 0).length;
    const maxDaysBehind = productWiseData.length > 0 ? Math.max(...productWiseData.map(p => p.daysBehind)) : 0;
    const mostCriticalProduct = productWiseData.find(p => p.daysBehind === maxDaysBehind && maxDaysBehind > 0);

    return {
      totalPlanned,
      totalActual,
      totalVariance,
      behindCount,
      aheadCount,
      totalProducts: productWiseData.length,
      maxDaysBehind: maxDaysBehind > 0 ? maxDaysBehind : 0,
      mostCriticalProduct: mostCriticalProduct ? mostCriticalProduct.product : 'None'
    };
  }, [productWiseData]);

  // Chart Data for Dual-Axis Bar + Line Chart
  const chartData = useMemo(() => {
    return filteredSortedProducts.map(item => ({
      product: item.product,
      plannedQty: item.plannedQty,
      actualQty: item.actualQty,
      qtyVariance: item.qtyVariance,
      daysBehind: item.daysBehind,
      achievementPct: item.achievementPct,
      paceUsed: item.paceUsed
    }));
  }, [filteredSortedProducts]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Product',
      'Month',
      'Planned_Qty',
      'Actual_Qty',
      'Qty_Variance_Deficit',
      'Days_Behind',
      'Achievement_Pct',
      'Recent_Day_Actual',
      'Previous_Day_Actual',
      'Daily_Avg_Actual',
      'Pace_Basis_Used',
      'Status'
    ];

    const rows = filteredSortedProducts.map(p => [
      `"${p.product}"`,
      `"${currentMonthInfo.monthName}"`,
      p.plannedQty,
      p.actualQty,
      p.qtyVariance,
      p.daysBehind,
      `${p.achievementPct}%`,
      p.recentDayActual,
      p.previousDayActual,
      p.avgDailyActual,
      paceBasis,
      p.daysBehind > 0 ? 'Behind Schedule' : p.daysBehind < 0 ? 'Ahead of Schedule' : 'On Track'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Ebony_Product_Wise_Production_Status_${currentMonthInfo.targetYearMonth}_MTD_${currentMonthInfo.selectedDay}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Title Bar */}
      <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 transition-colors">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-1.5 h-4 bg-cyan-400 rounded-full"></span>
            <h1 className="text-base font-black uppercase text-white dark:text-white light:text-slate-900 tracking-wider flex items-center gap-2">
              <Shirt className="w-4 h-4 text-cyan-400" />
              <span>Product Wise Production Status</span>
            </h1>
            <span className="text-[10px] bg-cyan-950 dark:bg-cyan-950 light:bg-cyan-100 text-cyan-400 dark:text-cyan-400 light:text-cyan-800 border border-cyan-800/60 dark:border-cyan-800/60 light:border-cyan-300 font-mono font-bold px-2 py-0.5 rounded">
              {currentMonthInfo.monthName}
            </span>
            <span className="text-[10px] bg-sky-950/80 text-sky-300 border border-sky-700/80 font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1">
              <Calendar className="w-3 h-3 text-cyan-400" />
              <span>MTD: {currentMonthInfo.formattedFirstWorkingDay} → {currentMonthInfo.formattedSelectedDay}</span>
            </span>
            {currentMonthInfo.isToday && (
              <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Present Day</span>
              </span>
            )}
            {currentMonthInfo.isFullMonth && (
              <span className="text-[10px] bg-purple-950 text-purple-300 border border-purple-800 font-mono font-bold px-2 py-0.5 rounded">
                All Month Data
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-400 light:text-slate-600 mt-1">
            Month-to-Date (MTD) manufacturing metrics calculated from {currentMonthInfo.formattedFirstWorkingDay} through {currentMonthInfo.formattedSelectedDay} ({currentMonthInfo.workingDaysIncluded} working days).
          </p>
        </div>

        {/* Global Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-stretch lg:self-auto">
          {/* Pace Basis Selector */}
          <div className="flex items-center bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 p-1 rounded-lg border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-300 text-xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 px-2">Pace:</span>
            <button
              type="button"
              onClick={() => setPaceBasis('recent')}
              className={`px-2 py-1 rounded font-bold transition cursor-pointer ${
                paceBasis === 'recent'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Calculate Days Behind using the most recent recorded day's actual output"
            >
              Recent Day
            </button>
            <button
              type="button"
              onClick={() => setPaceBasis('previous')}
              className={`px-2 py-1 rounded font-bold transition cursor-pointer ${
                paceBasis === 'previous'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Calculate Days Behind using the previous day's actual output"
            >
              Previous Day
            </button>
            <button
              type="button"
              onClick={() => setPaceBasis('avg')}
              className={`px-2 py-1 rounded font-bold transition cursor-pointer ${
                paceBasis === 'avg'
                  ? 'bg-cyan-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Calculate Days Behind using the average daily actual output"
            >
              Daily Avg
            </button>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Status CSV</span>
          </button>
        </div>
      </div>

      {/* Interactive Day Filter & MTD Controller Bar */}
      <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-cyan-500/40 dark:border-cyan-500/40 light:border-cyan-300 rounded-xl p-3.5 shadow-sm space-y-2.5 transition-colors">
        <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-3">
          {/* Day Selector with Steppers and Date Picker */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-cyan-400 dark:text-cyan-400 light:text-cyan-700 font-black uppercase tracking-wider text-xs">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <span>Day Filter (MTD):</span>
            </div>

            {/* Stepper Prev Day */}
            <button
              type="button"
              onClick={handlePrevDay}
              title="Previous recorded working day"
              className="p-1.5 rounded-lg bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 transition cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Native Date Picker */}
            <input
              type="date"
              value={selectedDay}
              onChange={e => handleSelectDay(e.target.value)}
              className="bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 border border-cyan-500/60 dark:border-cyan-500/60 light:border-cyan-400 rounded-lg px-2.5 py-1 text-white dark:text-white light:text-slate-900 font-mono font-bold text-xs focus:outline-none focus:ring-1 focus:ring-cyan-400 shadow-inner"
            />

            {/* Stepper Next Day */}
            <button
              type="button"
              onClick={handleNextDay}
              title="Next recorded working day"
              className="p-1.5 rounded-lg bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 transition cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            {/* Quick Filter Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pl-1">
              {/* Today / Present Day Button */}
              <button
                type="button"
                onClick={() => handleSelectDay(getPresentDay())}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  currentMonthInfo.isToday
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 text-slate-300 dark:text-slate-300 light:text-slate-700 hover:text-white border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300'
                }`}
                title="Select present day (default upon opening)"
              >
                <Clock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Today (Present Day)</span>
              </button>
            </div>
          </div>

          {/* MTD Summary Details Badge */}
          <div className="flex flex-wrap items-center gap-2 self-stretch xl:self-auto justify-end text-xs font-mono">
            <span className="text-slate-400 dark:text-slate-400 light:text-slate-600 text-[11px]">
              MTD Span:
            </span>
            <span className="px-2.5 py-0.5 rounded bg-cyan-950/70 text-cyan-300 border border-cyan-800 text-[11px] font-bold">
              {currentMonthInfo.formattedFirstWorkingDay} → {currentMonthInfo.formattedSelectedDay}
            </span>
            <span className="px-2.5 py-0.5 rounded bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 text-slate-300 dark:text-slate-300 light:text-slate-700 border border-slate-700 text-[11px]">
              {currentMonthInfo.workingDaysIncluded} of {currentMonthInfo.totalWorkingDaysInMonth} Working Days
            </span>
          </div>
        </div>

        {/* Clear Explanatory Notice */}
        <div className="text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-600 flex items-center gap-1.5 pt-1 border-t border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200">
          <Info className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span>
            {currentMonthInfo.isFullMonth
              ? `Displaying all month data for ${currentMonthInfo.monthName} (from ${currentMonthInfo.formattedFirstWorkingDay} through month end).`
              : `Month-To-Date (MTD) mode: visuals and analytics calculate cumulative output from ${currentMonthInfo.formattedFirstWorkingDay} (1st working day) through ${currentMonthInfo.formattedSelectedDay}.`}
          </span>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* 1. MTD Target */}
        <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3.5 rounded-xl flex flex-col justify-between shadow-sm">
          <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-400 light:text-slate-600 tracking-wider">
            Total MTD Planned
          </span>
          <div className="text-xl font-black text-white dark:text-white light:text-slate-900 mt-1">
            {summaryTotals.totalPlanned.toLocaleString()} <span className="text-xs text-slate-400 font-normal">pcs</span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-400 light:text-slate-500 mt-0.5">
            Across {summaryTotals.totalProducts} product lines
          </p>
        </div>

        {/* 2. MTD Actual */}
        <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3.5 rounded-xl flex flex-col justify-between shadow-sm">
          <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-400 light:text-slate-600 tracking-wider">
            Total MTD Actual
          </span>
          <div className="text-xl font-black text-emerald-400 mt-1">
            {summaryTotals.totalActual.toLocaleString()} <span className="text-xs text-slate-400 font-normal">pcs</span>
          </div>
          <p className="text-[10px] font-bold text-emerald-400 mt-0.5">
            {summaryTotals.totalPlanned > 0
              ? `${((summaryTotals.totalActual / summaryTotals.totalPlanned) * 100).toFixed(1)}% Realization`
              : '0.0%'}
          </p>
        </div>

        {/* 3. Overall Quantity Variance Deficit */}
        <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3.5 rounded-xl flex flex-col justify-between shadow-sm">
          <span className="text-[10px] uppercase font-black text-slate-400 dark:text-slate-400 light:text-slate-600 tracking-wider">
            Net Qty Variance
          </span>
          <div
            className={`text-xl font-black mt-1 ${
              summaryTotals.totalVariance > 0
                ? 'text-rose-400'
                : summaryTotals.totalVariance < 0
                ? 'text-emerald-400'
                : 'text-white'
            }`}
          >
            {summaryTotals.totalVariance > 0
              ? `-${summaryTotals.totalVariance.toLocaleString()} pcs`
              : `+${Math.abs(summaryTotals.totalVariance).toLocaleString()} pcs`}
          </div>
          <p className="text-[10px] font-bold mt-0.5 text-slate-400">
            {summaryTotals.totalVariance > 0 ? 'Production Shortfall' : 'Production Surplus'}
          </p>
        </div>

        {/* 4. Products Behind Target */}
        <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3.5 rounded-xl flex flex-col justify-between shadow-sm">
          <span className="text-[10px] uppercase font-black text-amber-400 tracking-wider">
            Products Behind
          </span>
          <div className="text-xl font-black text-amber-400 mt-1">
            {summaryTotals.behindCount} <span className="text-xs text-slate-400 font-normal">of {summaryTotals.totalProducts}</span>
          </div>
          <p className="text-[10px] text-emerald-400 font-bold mt-0.5">
            {summaryTotals.aheadCount} Product{summaryTotals.aheadCount === 1 ? '' : 's'} Ahead
          </p>
        </div>

        {/* 5. Max Days Behind Alert */}
        <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 p-3.5 rounded-xl flex flex-col justify-between shadow-sm col-span-2 sm:col-span-2 lg:col-span-1">
          <span className="text-[10px] uppercase font-black text-rose-400 tracking-wider">
            Max Days Behind
          </span>
          <div className="text-xl font-black text-rose-400 mt-1">
            {summaryTotals.maxDaysBehind > 0 ? `${summaryTotals.maxDaysBehind} Days` : '0.0 Days'}
          </div>
          <p className="text-[10px] text-slate-300 dark:text-slate-300 light:text-slate-600 truncate mt-0.5" title={summaryTotals.mostCriticalProduct}>
            Top lag: {summaryTotals.mostCriticalProduct}
          </p>
        </div>
      </div>

      {/* Interactive Controls & Filters Bar */}
      <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-3 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left Filter Group */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Factory Plant Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Plant:</span>
            <select
              value={filters.factory}
              onChange={e => onFilterChange({ ...filters, factory: e.target.value as any })}
              className="bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 rounded-lg px-2.5 py-1 text-white dark:text-white light:text-slate-900 text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Factory Plants</option>
              {FACTORIES.map(f => (
                <option key={f} value={f}>
                  {f} Plant
                </option>
              ))}
            </select>
          </div>

          {/* Product Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] uppercase font-bold text-slate-400">Product:</span>
            <select
              value={filters.product}
              onChange={e => onFilterChange({ ...filters, product: e.target.value })}
              className="bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 rounded-lg px-2.5 py-1 text-white dark:text-white light:text-slate-900 text-xs focus:outline-none focus:border-cyan-500"
            >
              <option value="ALL">All Products</option>
              {PRODUCT_OPTIONS.map(p => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          {/* Status View Mode Tabs */}
          <div className="flex items-center bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 p-0.5 rounded-lg border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300">
            <button
              type="button"
              onClick={() => setViewMode('all')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                viewMode === 'all' ? 'bg-sky-500 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              All Products ({productWiseData.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('behind_only')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                viewMode === 'behind_only' ? 'bg-rose-500 text-white' : 'text-slate-400 hover:text-rose-300'
              }`}
            >
              Behind Schedule ({summaryTotals.behindCount})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('on_track')}
              className={`px-2 py-0.5 rounded font-bold transition cursor-pointer ${
                viewMode === 'on_track' ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-emerald-300'
              }`}
            >
              On Track / Ahead ({summaryTotals.aheadCount})
            </button>
          </div>
        </div>

        {/* Right Sort & Reset */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase font-bold text-slate-400">Sort By:</span>
          <select
            value={sortField}
            onChange={e => setSortField(e.target.value as any)}
            className="bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 rounded-lg px-2 py-1 text-white dark:text-white light:text-slate-900 text-xs focus:outline-none"
          >
            <option value="daysBehind">Days Behind (Critical First)</option>
            <option value="qtyVariance">Quantity Variance Deficit</option>
            <option value="actual">Actual Output</option>
            <option value="planned">Planned Target</option>
          </select>

          <button
            type="button"
            onClick={() => setSortAsc(!sortAsc)}
            className="px-2 py-1 bg-[#0a101d] dark:bg-[#0a101d] light:bg-slate-100 border border-slate-700/70 dark:border-slate-700/70 light:border-slate-300 rounded-lg text-slate-300 dark:text-slate-300 light:text-slate-700 text-xs hover:text-white font-bold"
            title="Toggle sort direction"
          >
            {sortAsc ? 'Asc ↗' : 'Desc ↘'}
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedDay(getPresentDay());
              onResetFilters();
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
            title="Reset filters and restore present day"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Visual Chart: MTD Actual vs. Planned Output & Days Behind */}
      <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 border-b border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-wider">
                {mtdChartView === 'daily_output' && `Daily Output vs Plan — MTD Through ${currentMonthInfo.formattedSelectedDay} (${currentMonthInfo.monthName})`}
                {mtdChartView === 's_curve' && `MTD Cumulative S-Curve (Target vs Actual) — Through ${currentMonthInfo.formattedSelectedDay}`}
                {mtdChartView === 'days_behind_trend' && `Days Behind Schedule Trend — MTD Through ${currentMonthInfo.formattedSelectedDay}`}
                {mtdChartView === 'variance' && `Product-Wise Qty Variance Deficit & Days Behind — MTD Through ${currentMonthInfo.formattedSelectedDay}`}
                {mtdChartView === 'product_output' && `Product Output vs Plan — MTD Through ${currentMonthInfo.formattedSelectedDay}`}
              </h3>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-400 light:text-slate-500 mt-0.5">
              Filtered by Factory ({filters.factory === 'ALL' ? 'All Factories' : `${filters.factory} Plant`}) — displaying Month-to-Date data from {currentMonthInfo.formattedFirstWorkingDay} through {currentMonthInfo.formattedSelectedDay} ({currentMonthInfo.workingDaysIncluded} working days).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View mode toggle: Matching attached options exactly with amber/orange pill styling */}
            <div className="flex flex-wrap items-center bg-[#070e1b] dark:bg-[#070e1b] light:bg-slate-100 p-1 rounded-xl border border-slate-700/70 text-xs shadow-inner gap-1">
              <button
                type="button"
                onClick={() => setMtdChartView('daily_output')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  mtdChartView === 'daily_output'
                    ? 'bg-[#f59e0b] text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Daily Output vs Plan
              </button>
              <button
                type="button"
                onClick={() => setMtdChartView('s_curve')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  mtdChartView === 's_curve'
                    ? 'bg-[#f59e0b] text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                MTD Cumulative S-Curve
              </button>
              <button
                type="button"
                onClick={() => setMtdChartView('days_behind_trend')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  mtdChartView === 'days_behind_trend'
                    ? 'bg-[#f59e0b] text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Days Behind Trend
              </button>
              <button
                type="button"
                onClick={() => setMtdChartView('variance')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  mtdChartView === 'variance'
                    ? 'bg-[#f59e0b] text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Qty Variance Deficit
              </button>
              <button
                type="button"
                onClick={() => setMtdChartView('product_output')}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                  mtdChartView === 'product_output'
                    ? 'bg-[#f59e0b] text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/40'
                }`}
              >
                Product Output vs Plan
              </button>
            </div>

            {/* Dynamic Legend Items based on Active Tab */}
            <div className="flex items-center gap-3 text-[11px] font-mono">
              {mtdChartView === 'daily_output' && (
                <>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block"></span>
                    <span>Planned Output</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
                    <span>Actual Output</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-3 h-0.5 bg-amber-400 inline-block"></span>
                    <span>Realization %</span>
                  </span>
                </>
              )}

              {mtdChartView === 's_curve' && (
                <>
                  <span className="flex items-center gap-1.5 text-sky-400">
                    <span className="w-3 h-0.5 bg-sky-400 inline-block"></span>
                    <span>Cum Target S-Curve</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-3 h-0.5 bg-emerald-400 inline-block"></span>
                    <span>Cum Actual S-Curve</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-3 h-0.5 border-t border-dashed border-amber-400 inline-block"></span>
                    <span>Realization Rate</span>
                  </span>
                </>
              )}

              {mtdChartView === 'days_behind_trend' && (
                <>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-3 h-0.5 bg-amber-400 inline-block"></span>
                    <span>Days Behind Schedule</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/60 inline-block"></span>
                    <span>Deficit Gap</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <span className="w-3 h-0.5 border-t border-dashed border-slate-400 inline-block"></span>
                    <span>Baseline (0d)</span>
                  </span>
                </>
              )}

              {mtdChartView === 'variance' && (
                <>
                  <span className="flex items-center gap-1.5 text-rose-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block"></span>
                    <span>Qty Deficit (Backlog)</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
                    <span>Ahead of Plan</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-3 h-0.5 bg-amber-400 inline-block"></span>
                    <span>Days Behind</span>
                  </span>
                </>
              )}

              {mtdChartView === 'product_output' && (
                <>
                  <span className="flex items-center gap-1.5 text-slate-300">
                    <span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block"></span>
                    <span>Planned Output</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-emerald-400">
                    <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 inline-block"></span>
                    <span>Actual Output</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-amber-400">
                    <span className="w-3 h-0.5 bg-amber-400 inline-block"></span>
                    <span>Days Behind</span>
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Visual Chart Area */}
        <div className="h-80 w-full pt-2">
          {/* 1. Daily Output vs Plan View */}
          {mtdChartView === 'daily_output' && (
            mtdDailyTimelineData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No daily production logs found for {currentMonthInfo.monthName}.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mtdDailyTimelineData} margin={{ top: 15, right: 35, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2b44" vertical={false} />
                  <XAxis dataKey="displayDate" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis
                    yAxisId="left"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    label={{
                      value: 'Daily Output (Pcs)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#94a3b8',
                      fontSize: 10
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f59e0b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val}%`}
                    label={{
                      value: 'Realization %',
                      angle: 90,
                      position: 'insideRight',
                      fill: '#f59e0b',
                      fontSize: 10
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      if (!data) return null;
                      return (
                        <div className="bg-[#0d1625] border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs text-slate-100 min-w-[220px] space-y-1.5">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1 font-bold text-white">
                            <span>{data.date}</span>
                            <span className={data.dailyAchievementPct >= 100 ? 'text-emerald-400' : 'text-amber-400'}>
                              {data.dailyAchievementPct}% Realized
                            </span>
                          </div>
                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between text-sky-300">
                              <span className="text-slate-400">Planned Output:</span>
                              <span>{data.plannedQty.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-emerald-400 font-bold">
                              <span>Actual Output:</span>
                              <span>{data.actualQty.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-amber-300 pt-1 border-t border-slate-800">
                              <span className="text-slate-400">Daily Output Variance:</span>
                              <span className={data.dailyVariance > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                {data.dailyVariance > 0
                                  ? `-${data.dailyVariance.toLocaleString()} pcs (Deficit)`
                                  : `+${Math.abs(data.dailyVariance).toLocaleString()} pcs (Surplus)`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine yAxisId="right" y={100} stroke="#64748b" strokeDasharray="3 3" />
                  <Bar yAxisId="left" dataKey="plannedQty" name="Planned Output" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="actualQty" name="Actual Output" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="dailyAchievementPct"
                    name="Realization %"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 6, fill: '#f59e0b' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )
          )}

          {/* 2. MTD Cumulative S-Curve View */}
          {mtdChartView === 's_curve' && (
            mtdDailyTimelineData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No cumulative production logs found for {currentMonthInfo.monthName}.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mtdDailyTimelineData} margin={{ top: 15, right: 35, left: 10, bottom: 25 }}>
                  <defs>
                    <linearGradient id="sCurvePlannedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="sCurveActualGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2b44" vertical={false} />
                  <XAxis dataKey="displayDate" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis
                    yAxisId="left"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    label={{
                      value: 'Cumulative Output (Pcs)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#94a3b8',
                      fontSize: 10
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f59e0b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val}%`}
                    label={{
                      value: 'Realization %',
                      angle: 90,
                      position: 'insideRight',
                      fill: '#f59e0b',
                      fontSize: 10
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      if (!data) return null;
                      return (
                        <div className="bg-[#0d1625] border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs text-slate-100 min-w-[240px] space-y-1.5">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1 font-bold text-white">
                            <span>{data.date} (Cumulative)</span>
                            <span className={data.cumAchievementPct >= 100 ? 'text-emerald-400' : 'text-amber-400'}>
                              {data.cumAchievementPct}% Target Realized
                            </span>
                          </div>
                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between text-sky-300">
                              <span className="text-slate-400">Cumulative Target:</span>
                              <span>{data.cumPlanned.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-emerald-400 font-bold">
                              <span>Cumulative Actual:</span>
                              <span>{data.cumActual.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-amber-300 pt-1 border-t border-slate-800">
                              <span className="text-slate-400">Cumulative Variance Gap:</span>
                              <span className={data.cumVariance > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                {data.cumVariance > 0
                                  ? `-${data.cumVariance.toLocaleString()} pcs (Deficit)`
                                  : `+${Math.abs(data.cumVariance).toLocaleString()} pcs (Surplus)`}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine yAxisId="right" y={100} stroke="#64748b" strokeDasharray="3 3" />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="cumPlanned"
                    name="Cumulative Target S-Curve"
                    stroke="#38bdf8"
                    strokeWidth={3}
                    fill="url(#sCurvePlannedGrad)"
                    dot={false}
                    activeDot={{ r: 6, fill: '#38bdf8' }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="cumActual"
                    name="Cumulative Actual S-Curve"
                    stroke="#10b981"
                    strokeWidth={3}
                    fill="url(#sCurveActualGrad)"
                    dot={false}
                    activeDot={{ r: 6, fill: '#10b981' }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="cumAchievementPct"
                    name="Cumulative Realization %"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )
          )}

          {/* 3. Days Behind Trend View */}
          {mtdChartView === 'days_behind_trend' && (
            mtdDailyTimelineData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No schedule trajectory data available for {currentMonthInfo.monthName}.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mtdDailyTimelineData} margin={{ top: 15, right: 35, left: 10, bottom: 25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2b44" vertical={false} />
                  <XAxis dataKey="displayDate" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis
                    yAxisId="left"
                    stroke="#f59e0b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val}d`}
                    label={{
                      value: 'Days Behind Schedule',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#f59e0b',
                      fontSize: 10
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f43f5e"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    label={{
                      value: 'Cumulative Deficit Gap (Pcs)',
                      angle: 90,
                      position: 'insideRight',
                      fill: '#f43f5e',
                      fontSize: 10
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      if (!data) return null;
                      return (
                        <div className="bg-[#0d1625] border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs text-slate-100 min-w-[240px] space-y-1.5">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1 font-bold text-white">
                            <span>{data.date}</span>
                            <span className={data.cumDaysBehind > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                              {data.cumDaysBehind > 0
                                ? `${data.cumDaysBehind} Days Behind`
                                : data.cumDaysBehind < 0
                                ? `${Math.abs(data.cumDaysBehind)} Days Ahead`
                                : 'On Schedule'}
                            </span>
                          </div>
                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between text-sky-300">
                              <span className="text-slate-400">Cumulative Target:</span>
                              <span>{data.cumPlanned.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-emerald-400 font-bold">
                              <span>Cumulative Actual:</span>
                              <span>{data.cumActual.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-rose-300 pt-1 border-t border-slate-800 font-bold">
                              <span className="text-slate-400">Cumulative Deficit Gap:</span>
                              <span>{data.cumVariance > 0 ? `-${data.cumVariance.toLocaleString()} pcs` : `+${Math.abs(data.cumVariance).toLocaleString()} pcs`}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine yAxisId="left" y={0} stroke="#64748b" strokeDasharray="3 3" />
                  <Bar yAxisId="right" dataKey="cumVariance" name="Cumulative Deficit Gap" fill="#f43f5e" opacity={0.35} radius={[3, 3, 0, 0]} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="cumDaysBehind"
                    name="Days Behind Schedule"
                    stroke="#f59e0b"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 6, fill: '#f59e0b' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )
          )}

          {/* 4. Product-Wise Qty Variance Deficit View (Kept as requested) */}
          {mtdChartView === 'variance' && (
            mtdAllProductsChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No product production logs found for {currentMonthInfo.monthName}.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mtdAllProductsChartData} margin={{ top: 15, right: 35, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2b44" vertical={false} />
                  <XAxis
                    dataKey="product"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    label={{
                      value: 'Qty Variance Deficit (Pcs)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#94a3b8',
                      fontSize: 10
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f59e0b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val}d`}
                    label={{
                      value: 'Days Behind Schedule',
                      angle: 90,
                      position: 'insideRight',
                      fill: '#f59e0b',
                      fontSize: 10
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      if (!data) return null;
                      return (
                        <div className="bg-[#0d1625] border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs text-slate-100 min-w-[220px] space-y-1.5">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1 font-bold text-white">
                            <span>{data.product}</span>
                            <span className={data.daysBehind > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                              {data.daysBehind > 0
                                ? `${data.daysBehind} Days Behind`
                                : data.daysBehind < 0
                                ? `${Math.abs(data.daysBehind)} Days Ahead`
                                : 'On Track'}
                            </span>
                          </div>
                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between text-sky-300">
                              <span className="text-slate-400">Planned Output:</span>
                              <span>{data.plannedQty.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-emerald-400 font-bold">
                              <span>Actual Output:</span>
                              <span>{data.actualQty.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-amber-300 pt-1 border-t border-slate-800">
                              <span className="text-slate-400">Output Variance:</span>
                              <span className={data.qtyVariance > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                {data.qtyVariance > 0
                                  ? `-${data.qtyVariance.toLocaleString()} pcs (Deficit)`
                                  : `+${Math.abs(data.qtyVariance).toLocaleString()} pcs (Surplus)`}
                              </span>
                            </div>
                            <div className="flex justify-between text-cyan-300">
                              <span className="text-slate-400">Daily Actual Pace:</span>
                              <span>{data.paceUsed.toLocaleString()} pcs/day</span>
                            </div>
                            <div className="flex justify-between text-purple-300 pt-1 border-t border-slate-800 font-bold">
                              <span>Realization Rate:</span>
                              <span>{data.achievementPct}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine yAxisId="left" y={0} stroke="#475569" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="right" y={0} stroke="#f59e0b" strokeDasharray="3 3" />
                  <Bar yAxisId="left" dataKey="qtyVariance" name="Qty Variance Deficit" radius={[4, 4, 0, 0]}>
                    {mtdAllProductsChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.daysBehind > 0 ? '#f43f5e' : entry.daysBehind < 0 ? '#10b981' : '#38bdf8'}
                      />
                    ))}
                  </Bar>
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="daysBehind"
                    name="Days Behind"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 6, fill: '#f59e0b' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )
          )}

          {/* 5. Product Output vs Plan View */}
          {mtdChartView === 'product_output' && (
            mtdAllProductsChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-xs">
                No product production logs found for {currentMonthInfo.monthName}.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={mtdAllProductsChartData} margin={{ top: 15, right: 35, left: 10, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1c2b44" vertical={false} />
                  <XAxis
                    dataKey="product"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
                    label={{
                      value: 'Production Output (Pcs)',
                      angle: -90,
                      position: 'insideLeft',
                      fill: '#94a3b8',
                      fontSize: 10
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#f59e0b"
                    fontSize={11}
                    tickLine={false}
                    tickFormatter={val => `${val}d`}
                    label={{
                      value: 'Days Behind Schedule',
                      angle: 90,
                      position: 'insideRight',
                      fill: '#f59e0b',
                      fontSize: 10
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const data = payload[0]?.payload;
                      if (!data) return null;
                      return (
                        <div className="bg-[#0d1625] border border-slate-700/80 rounded-xl p-3 shadow-xl text-xs text-slate-100 min-w-[220px] space-y-1.5">
                          <div className="flex items-center justify-between border-b border-slate-800 pb-1 font-bold text-white">
                            <span>{data.product}</span>
                            <span className={data.daysBehind > 0 ? 'text-rose-400' : 'text-emerald-400'}>
                              {data.daysBehind > 0
                                ? `${data.daysBehind} Days Behind`
                                : data.daysBehind < 0
                                ? `${Math.abs(data.daysBehind)} Days Ahead`
                                : 'On Track'}
                            </span>
                          </div>
                          <div className="space-y-1 font-mono text-[11px]">
                            <div className="flex justify-between text-sky-300">
                              <span className="text-slate-400">Planned Output:</span>
                              <span>{data.plannedQty.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-emerald-400 font-bold">
                              <span>Actual Output:</span>
                              <span>{data.actualQty.toLocaleString()} pcs</span>
                            </div>
                            <div className="flex justify-between text-amber-300 pt-1 border-t border-slate-800">
                              <span className="text-slate-400">Output Variance:</span>
                              <span className={data.qtyVariance > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                                {data.qtyVariance > 0
                                  ? `-${data.qtyVariance.toLocaleString()} pcs (Deficit)`
                                  : `+${Math.abs(data.qtyVariance).toLocaleString()} pcs (Surplus)`}
                              </span>
                            </div>
                            <div className="flex justify-between text-cyan-300">
                              <span className="text-slate-400">Daily Actual Pace:</span>
                              <span>{data.paceUsed.toLocaleString()} pcs/day</span>
                            </div>
                            <div className="flex justify-between text-purple-300 pt-1 border-t border-slate-800 font-bold">
                              <span>Realization Rate:</span>
                              <span>{data.achievementPct}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine yAxisId="left" y={0} stroke="#475569" strokeDasharray="3 3" />
                  <ReferenceLine yAxisId="right" y={0} stroke="#f59e0b" strokeDasharray="3 3" />
                  <Bar yAxisId="left" dataKey="plannedQty" name="Planned Output" fill="#0284c7" radius={[4, 4, 0, 0]} />
                  <Bar yAxisId="left" dataKey="actualQty" name="Actual Output" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="daysBehind"
                    name="Days Behind"
                    stroke="#f59e0b"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 6, fill: '#f59e0b' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )
          )}
        </div>

        {/* Explanatory Caption */}
        <div className="p-2.5 rounded-lg bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-50 border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-600 flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 flex-1 min-w-[280px]">
            <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              {mtdChartView === 'daily_output' && (
                <>
                  <strong>Daily Output vs Plan:</strong> Compares day-to-day planned target volume with actual output produced in {currentMonthInfo.monthName}. The line tracks daily realization percentage.
                </>
              )}
              {mtdChartView === 's_curve' && (
                <>
                  <strong>MTD Cumulative S-Curve:</strong> Visualizes the classic cumulative production trajectory curve. Tracks running cumulative planned target volume versus actual realized progress across the month.
                </>
              )}
              {mtdChartView === 'days_behind_trend' && (
                <>
                  <strong>Days Behind Trend:</strong> Dynamic schedule deficit tracking across time. Days Behind = Cumulative Variance Deficit &divide; Average Daily Run Rate. Values above 0 represent operational schedule backlogs.
                </>
              )}
              {mtdChartView === 'variance' && (
                <>
                  <strong>Quantity Variance Deficit:</strong> Product-wise backlog deficit analysis across {mtdAllProductsChartData.length} products. Quantity Variance Deficit = Planned Qty - Actual Qty. Days Behind = Deficit &divide; Selected Daily Pace ({paceBasis === 'recent' ? 'Recent Day' : paceBasis === 'previous' ? 'Previous Day' : 'Daily Average'}).
                </>
              )}
              {mtdChartView === 'product_output' && (
                <>
                  <strong>Product Output vs Plan:</strong> Multi-product comparison displaying planned targets against actual output with schedule Days Behind index across {currentMonthInfo.monthName}.
                </>
              )}
            </span>
          </div>

          {/* Database recording status badge */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-[#121c2e] border border-cyan-800/50 text-cyan-300 text-[10px] font-mono shrink-0">
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>DB Records: {dailyDbRecords.length > 0 ? `${dailyDbRecords.length} Daily Logged` : 'Active'}</span>
            <button
              type="button"
              onClick={() => setShowDailyBreakdown(!showDailyBreakdown)}
              className="text-cyan-400 hover:text-white underline font-sans font-bold cursor-pointer ml-1"
            >
              {showDailyBreakdown ? 'Hide Daily Table' : 'View Daily Log'}
            </button>
          </div>
        </div>
      </div>

      {/* Daily Production Database Visuals & Logged Table */}
      {showDailyBreakdown && (
        <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-cyan-700/60 rounded-xl p-4 shadow-sm space-y-3 animate-fade-in">
          <div className="flex items-center justify-between border-b border-[#1c2b44] pb-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-cyan-400" />
              <h3 className="text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-wider">
                Daily Actual &amp; Planned Quantities (Recorded in Database by Date)
              </h3>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {dailyDbRecords.length} records in daily database storage
            </div>
          </div>

          <div className="overflow-x-auto max-h-72 border border-[#1c2b44] rounded-lg">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#0a101d] text-[10px] uppercase font-bold text-slate-400 sticky top-0 border-b border-[#1c2b44]">
                <tr>
                  <th className="p-2.5">Date</th>
                  <th className="p-2.5">Factory</th>
                  <th className="p-2.5">Product</th>
                  <th className="p-2.5 text-right">Planned Qty</th>
                  <th className="p-2.5 text-right">Actual Qty</th>
                  <th className="p-2.5 text-right">Variance</th>
                  <th className="p-2.5 text-center">Realization</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1c2b44]/60 font-mono text-[11px]">
                {dailyDbRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-slate-500 font-sans">
                      Loading daily production database records...
                    </td>
                  </tr>
                ) : (
                  dailyDbRecords.slice(0, 30).map((r, idx) => {
                    const variance = (Number(r.actualQty) || 0) - (Number(r.plannedQty) || 0);
                    const pct = r.plannedQty > 0 ? Math.round(((Number(r.actualQty) || 0) / Number(r.plannedQty)) * 100) : 0;
                    return (
                      <tr key={`${r.date}_${r.factory}_${r.product}_${idx}`} className="hover:bg-slate-800/30">
                        <td className="p-2 text-cyan-300">{r.date}</td>
                        <td className="p-2">{r.factory}</td>
                        <td className="p-2 font-bold text-white font-sans">{r.product}</td>
                        <td className="p-2 text-right">{Number(r.plannedQty).toLocaleString()}</td>
                        <td className="p-2 text-right text-emerald-400 font-bold">{Number(r.actualQty).toLocaleString()}</td>
                        <td className={`p-2 text-right font-bold ${variance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {variance >= 0 ? `+${variance}` : variance}
                        </td>
                        <td className="p-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] ${pct >= 100 ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'}`}>
                            {pct}%
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
      )}

      {/* Comprehensive Product-Wise Breakdown Table */}
      <div className="bg-[#121c2e] dark:bg-[#121c2e] light:bg-white border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-xs font-black uppercase text-white dark:text-white light:text-slate-900 tracking-wider">
              Product-Wise Schedule Variance Master Breakdown (MTD)
            </h3>
            <p className="text-[11px] text-slate-400 dark:text-slate-400 light:text-slate-500">
              Detailed Month-to-Date metrics from {currentMonthInfo.formattedFirstWorkingDay} through {currentMonthInfo.formattedSelectedDay} ({currentMonthInfo.workingDaysIncluded} working days)
            </p>
          </div>
          <span className="text-xs font-mono text-cyan-400 font-bold">
            {filteredSortedProducts.length} Product Record(s)
          </span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200">
          <table className="w-full text-left text-xs whitespace-nowrap">
            <thead className="bg-[#0d1625] dark:bg-[#0d1625] light:bg-slate-100 text-slate-400 dark:text-slate-400 light:text-slate-700 text-[10px] uppercase font-black tracking-wider border-b border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200">
              <tr>
                <th className="p-3">Product Name</th>
                <th className="p-3 text-right">MTD Planned Qty</th>
                <th className="p-3 text-right text-emerald-400">MTD Actual Qty</th>
                <th className="p-3 text-right">Achievement %</th>
                <th className="p-3 text-right">MTD Qty Variance (Deficit)</th>
                <th className="p-3 text-right font-bold text-amber-400">Days Behind</th>
                <th className="p-3 text-center">Schedule Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1c2b44]/60 dark:divide-[#1c2b44]/60 light:divide-slate-200 font-mono text-[11px]">
              {filteredSortedProducts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500 font-sans">
                    No products match the selected filters for {currentMonthInfo.monthName}.
                  </td>
                </tr>
              ) : (
                filteredSortedProducts.map(p => (
                  <tr
                    key={p.product}
                    className="hover:bg-slate-800/40 dark:hover:bg-slate-800/40 light:hover:bg-slate-50 text-slate-300 dark:text-slate-300 light:text-slate-800 transition"
                  >
                    <td className="p-3 font-sans font-bold text-white dark:text-white light:text-slate-900 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                      <span>{p.product}</span>
                    </td>
                    <td className="p-3 text-right">{p.plannedQty.toLocaleString()}</td>
                    <td className="p-3 text-right font-bold text-emerald-400">{p.actualQty.toLocaleString()}</td>
                    <td className="p-3 text-right">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          p.achievementPct >= 100
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : p.achievementPct >= 85
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {p.achievementPct}%
                      </span>
                    </td>
                    <td
                      className={`p-3 text-right font-bold ${
                        p.qtyVariance > 0
                          ? 'text-rose-400'
                          : p.qtyVariance < 0
                          ? 'text-emerald-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {p.qtyVariance > 0
                        ? `+${p.qtyVariance.toLocaleString()}`
                        : `${p.qtyVariance.toLocaleString()}`}
                    </td>
                    <td className="p-3 text-right font-bold text-sm">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          p.daysBehind > 1.5
                            ? 'bg-rose-950/80 text-rose-400 border border-rose-800'
                            : p.daysBehind > 0
                            ? 'bg-amber-950/80 text-amber-400 border border-amber-800'
                            : p.daysBehind < 0
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {p.daysBehind > 0
                          ? `${p.daysBehind} d behind`
                          : p.daysBehind < 0
                          ? `${Math.abs(p.daysBehind)} d ahead`
                          : 'On Track'}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {p.daysBehind > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-400 bg-rose-950/40 px-2 py-0.5 rounded-full border border-rose-800/50">
                          <ArrowDownRight className="w-3 h-3" />
                          <span>Lagging</span>
                        </span>
                      ) : p.daysBehind < 0 ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-800/50">
                          <ArrowUpRight className="w-3 h-3" />
                          <span>Leading</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-400 bg-sky-950/40 px-2 py-0.5 rounded-full border border-sky-800/50">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Synchronized</span>
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
