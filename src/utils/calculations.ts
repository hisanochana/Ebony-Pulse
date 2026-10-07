import { FactoryName, StyleEntry, ProductionLog } from '../types';

/**
 * Creates Line_No automatically using the first letter of the Factory name and Line
 * e.g., 'Kurunegala' + '1' -> 'K1'
 *       'Bulugolla' + '3+4' -> 'B3+4'
 *       'Werapola' + '6+7' -> 'W6+7'
 */
export function calculateLineNo(factory: string, line: string): string {
  if (!factory) return line || '';
  const firstLetter = factory.trim().charAt(0).toUpperCase();
  const cleanLine = line.trim();
  if (cleanLine.toUpperCase().startsWith(firstLetter)) {
    return cleanLine.toUpperCase();
  }
  return `${firstLetter}${cleanLine}`;
}

/**
 * Calculates proportional hours worked for multiple styles running on the same line in a shift.
 * If Total Actual Qty > 0:
 *   Style Hours = Total Shift Hours * (Style Actual Qty / Total Line Actual Qty)
 * Else:
 *   Style Hours = Total Shift Hours / Styles Count
 */
export function calculateProportionalHours(
  totalShiftHours: number,
  styles: { actualQty: number }[]
): number[] {
  if (!styles.length) return [];
  const totalActualQty = styles.reduce((acc, s) => acc + (Number(s.actualQty) || 0), 0);

  return styles.map(s => {
    const qty = Number(s.actualQty) || 0;
    if (totalActualQty > 0) {
      return Number(((totalShiftHours * qty) / totalActualQty).toFixed(2));
    }
    return Number((totalShiftHours / styles.length).toFixed(2));
  });
}

/**
 * Produced Minutes = Actual_QTY * SMV
 */
export function calculateProducedMinutes(actualQty: number, smv: number): number {
  return Math.round((Number(actualQty) || 0) * (Number(smv) || 0));
}

/**
 * Worked Minutes = (Present_TMs * Hours_Worked * 60) + (Hours_Adjustment * 60)
 * User can select + or - amount.
 * - If minus: multiplies by 60 and minuses from worked minutes.
 * - If plus: multiplies by 60 and adds to worked minutes.
 */
export function calculateWorkedMinutes(
  presentTMs: number, 
  hoursWorked: number, 
  hoursAdjustment: number = 0
): number {
  const baseMinutes = (Number(presentTMs) || 0) * (Number(hoursWorked) || 0) * 60;
  const adjHours = Number(hoursAdjustment) || 0;
  const adjMinutes = adjHours * 60;
  const total = baseMinutes + adjMinutes;
  return Math.max(0, Number(total.toFixed(1)));
}

/**
 * Resolves the true total worked minutes for a production line.
 * In garment manufacturing: Total Line Worked Minutes = Present_TMs * Hours_Worked * 60 + (Hours_Adjustment * 60).
 *
 * Anomaly Protection:
 * If a row in the Google Sheet or CSV was populated with single-operator shift minutes
 * (e.g. 540 min for a 9-hr shift) instead of total line minutes (e.g. 68 * 9 * 60 = 36,720 min),
 * or if Worked_Minutes was left blank/0, this automatically calculates the mathematically
 * accurate total line worked minutes so efficiency displays correctly (e.g. 62% instead of 4210%).
 */
export function getEffectiveWorkedMinutes(log: {
  Worked_Minutes?: number | string;
  Present_TMs?: number | string;
  Actual_TMs?: number | string;
  Plan_TMs?: number | string;
  Hours_Worked?: number | string;
  Hours_Adjustment?: number | string;
}): number {
  const presTM = Number(log.Present_TMs) || Number(log.Actual_TMs) || Number(log.Plan_TMs) || 0;
  const hrs = Number(log.Hours_Worked) || 0;
  const adjHours = Number(log.Hours_Adjustment) || 0;
  const rawWorked = Number(log.Worked_Minutes) || 0;
  const expectedLineTotal = presTM > 0 && hrs > 0 
    ? Math.max(0, Math.round(presTM * hrs * 60 + (adjHours * 60))) 
    : 0;

  // Case 1: Worked_Minutes is missing, NaN, or <= 0
  if (!rawWorked || rawWorked <= 0) {
    return expectedLineTotal;
  }

  // Case 2: Present TMs > 1 and rawWorked was entered as single-operator shift minutes
  // (e.g. 540 min for 9 hours when there are 68 operators)
  if (presTM > 1 && hrs > 0) {
    const singleWorkerMins = hrs * 60;
    // If rawWorked is approximately single-person shift duration or far below line total
    if (rawWorked <= singleWorkerMins * 1.5 || rawWorked < expectedLineTotal * 0.25) {
      return expectedLineTotal;
    }
  }

  return rawWorked;
}

/**
 * Resolves the true produced minutes for a production log: Actual_QTY * SMV
 */
export function getEffectiveProducedMinutes(log: {
  Produced_Minutes?: number | string;
  Actual_QTY?: number | string;
  SMV?: number | string;
}): number {
  const rawProd = Number(log.Produced_Minutes) || 0;
  const actualQty = Number(log.Actual_QTY) || 0;
  const smv = Number(log.SMV) || 0;

  if (rawProd > 0) {
    return rawProd;
  }
  if (actualQty > 0 && smv > 0) {
    return Math.round(actualQty * smv);
  }
  return 0;
}

/**
 * Normalizes a production log ensuring Worked_Minutes, Produced_Minutes,
 * and Down_Time are mathematically sound and free from single-operator scaling errors.
 */
export function normalizeProductionLog(log: ProductionLog): ProductionLog {
  const effectiveWorked = getEffectiveWorkedMinutes(log);
  const effectiveProduced = getEffectiveProducedMinutes(log);
  const actualQty = Number(log.Actual_QTY) || 0;
  const smv = Number(log.SMV) || 0;
  
  // Calculate proper down time: Total Worked Minutes - (Actual Output Qty * SMV)
  let downTime = Number(log.Down_Time);
  if (isNaN(downTime) || downTime <= 0 || (effectiveWorked > (Number(log.Worked_Minutes) || 0) && downTime === 0)) {
    downTime = Math.max(0, Math.round(effectiveWorked - (actualQty * smv)));
  }

  return {
    ...log,
    Worked_Minutes: effectiveWorked,
    Produced_Minutes: effectiveProduced,
    Down_Time: downTime
  };
}

/**
 * Calculate efficiency = (produced minutes / Worked minutes) * 100
 */
export function calculateEfficiency(producedMinutes: number, workedMinutes: number): number {
  if (!workedMinutes || workedMinutes <= 0) return 0;
  return Number(((Number(producedMinutes) / Number(workedMinutes)) * 100).toFixed(1));
}

/**
 * Multi-Style Shift Aggregation Rule:
 * 1. When a line has ONE style: take its produced minutes, worked minutes, and efficiency directly.
 * 2. When a line has MORE THAN ONE style:
 *    - Create produced minutes using actual qty and SMV (Actual_QTY * SMV) and get line total produced minutes.
 *    - For worked minutes: worked hours multiplied by present TM (* 60).
 *    - TM count: line has a fixed count for all day. Do NOT sum TM style-wise (which is wrong),
 *      and do NOT divide TM style-wise (which is wrong).
 *    - Line Efficiency: (Line Total Produced Minutes / Line Total Worked Minutes) * 100.
 *    (e.g., 2026-08-28 Bulugolla Line 1: 24,362 prod min / 40,200 worked min = 60.6% ~ 61%).
 */
export interface MultiStyleAggregatedLine {
  date: string;
  factory: string;
  line: string;
  lineNo: string;
  supervisor: string;
  styles: string[];
  products: string[];
  brands: string[];
  totalPlannedQty: number;
  totalActualQty: number;
  totalProducedMinutes: number;
  totalWorkedMinutes: number;
  fixedPresentTMs: number;
  fixedPlanTMs: number;
  fixedActualTMs: number;
  // Aliases kept for compatibility
  avgPresentTMs: number;
  avgPlanTMs: number;
  avgActualTMs: number;
  totalHoursWorked: number;
  sumEfficiency: number;
  lineEfficiency: number;
  downTimeMinutes: number;
  logsCount: number;
}

export function aggregateMultiStyleLineLogs(logs: ProductionLog[]): MultiStyleAggregatedLine[] {
  const lineShiftMap = new Map<string, ProductionLog[]>();

  logs.forEach(log => {
    // Group key: Date + Factory + Line
    const date = (log.Date || '').trim();
    const factory = (log.Factory || '').trim();
    const line = (log.Line || '').trim();
    const key = `${date}__${factory}__${line}`;
    if (!lineShiftMap.has(key)) {
      lineShiftMap.set(key, []);
    }
    lineShiftMap.get(key)!.push(log);
  });

  const results: MultiStyleAggregatedLine[] = [];

  lineShiftMap.forEach((groupLogs) => {
    const first = groupLogs[0];
    const stylesSet = new Set<string>();
    const productsSet = new Set<string>();
    const brandsSet = new Set<string>();

    let totalPlannedQty = 0;
    let totalActualQty = 0;
    let totalProducedMinutes = 0;

    groupLogs.forEach(l => {
      if (l.Style) stylesSet.add(l.Style.trim());
      if (l.Product) productsSet.add(l.Product.trim());
      if (l.Brand) brandsSet.add(l.Brand.trim());

      totalPlannedQty += Number(l.Planned_QTY) || 0;
      totalActualQty += Number(l.Actual_QTY) || 0;
      totalProducedMinutes += getEffectiveProducedMinutes(l);
    });

    // Line has a fixed count for all day (not summed style-wise, not divided style-wise)
    const presentTMsList = groupLogs.map(l => Number(l.Present_TMs) || 0).filter(n => n > 0);
    const planTMsList = groupLogs.map(l => Number(l.Plan_TMs) || 0).filter(n => n > 0);
    const actualTMsList = groupLogs.map(l => Number(l.Actual_TMs) || 0).filter(n => n > 0);

    const fixedPresentTM = presentTMsList.length > 0 ? presentTMsList[0] : (Number(first.Present_TMs) || 0);
    const fixedPlanTM = planTMsList.length > 0 ? planTMsList[0] : (Number(first.Plan_TMs) || 0);
    const fixedActualTM = actualTMsList.length > 0 ? actualTMsList[0] : (Number(first.Actual_TMs) || 0);

    let lineWorkedMinutes = 0;
    let lineWorkedHours = 0;
    let finalEfficiency = 0;

    if (groupLogs.length === 1) {
      // 1. One line has one style: take directly
      const single = groupLogs[0];
      lineWorkedMinutes = getEffectiveWorkedMinutes(single);
      lineWorkedHours = Number(single.Hours_Worked) || (lineWorkedMinutes > 0 && fixedPresentTM > 0 ? Number((lineWorkedMinutes / (fixedPresentTM * 60)).toFixed(2)) : 9.0);
      finalEfficiency = calculateEfficiency(totalProducedMinutes, lineWorkedMinutes);
    } else {
      // 2. One line has more than one style:
      // Create produced minutes using actual qty and smv and get line total produced minutes.
      // For worked minutes: worked hours multiplied by present TM (* 60).
      // Line has a fixed count for all day.
      const activeLogs = groupLogs.filter(l => (Number(l.Actual_QTY) || 0) > 0);
      
      if (activeLogs.length > 0) {
        const sumActiveHours = activeLogs.reduce((acc, l) => acc + (Number(l.Hours_Worked) || 0), 0);
        const maxActiveHours = Math.max(...activeLogs.map(l => Number(l.Hours_Worked) || 0));

        // If hours were split/distributed style-wise (standard shift <= 12.5 hrs):
        if (sumActiveHours <= 12.5) {
          lineWorkedHours = Number(sumActiveHours.toFixed(2));
        } else {
          // If the shift hours (e.g. 9 or 10 hrs) was entered on each row:
          lineWorkedHours = maxActiveHours > 0 ? maxActiveHours : 9.0;
        }
      } else {
        const maxAllHours = Math.max(...groupLogs.map(l => Number(l.Hours_Worked) || 0));
        lineWorkedHours = maxAllHours > 0 ? maxAllHours : 9.0;
      }

      lineWorkedMinutes = Math.round(lineWorkedHours * fixedPresentTM * 60);
      if (lineWorkedMinutes <= 0) {
        lineWorkedMinutes = Math.max(...groupLogs.map(l => getEffectiveWorkedMinutes(l)));
      }

      finalEfficiency = lineWorkedMinutes > 0
        ? Number(((totalProducedMinutes / lineWorkedMinutes) * 100).toFixed(1))
        : 0;
    }

    const downTimeMinutes = Math.max(0, Math.round(lineWorkedMinutes - totalProducedMinutes));

    results.push({
      date: first.Date,
      factory: first.Factory,
      line: first.Line,
      lineNo: first.Line_No || calculateLineNo(first.Factory, first.Line),
      supervisor: first.Supervisor,
      styles: Array.from(stylesSet),
      products: Array.from(productsSet),
      brands: Array.from(brandsSet),
      totalPlannedQty,
      totalActualQty,
      totalProducedMinutes,
      totalWorkedMinutes: lineWorkedMinutes,
      fixedPresentTMs: fixedPresentTM,
      fixedPlanTMs: fixedPlanTM,
      fixedActualTMs: fixedActualTM,
      avgPresentTMs: fixedPresentTM,
      avgPlanTMs: fixedPlanTM,
      avgActualTMs: fixedActualTM,
      totalHoursWorked: lineWorkedHours,
      sumEfficiency: finalEfficiency,
      lineEfficiency: finalEfficiency,
      downTimeMinutes,
      logsCount: groupLogs.length
    });
  });

  return results;
}

export interface MultiStyleShiftInfo {
  count: number;
  sumEfficiency: number;
  lineEfficiency: number;
  fixedPresentTMs: number;
  fixedPlanTMs: number;
  avgPresentTMs: number;
  avgPlanTMs: number;
  shiftWorkedMinutes: number;
  shiftProducedMinutes: number;
  shiftHoursWorked: number;
  styles: string[];
}

/**
 * Creates a fast lookup map for any line-shift with multiple styles.
 * Key: `${log.Date}__${log.Factory}__${log.Line}`
 */
export function getMultiStyleShiftMap(logs: ProductionLog[]): Map<string, MultiStyleShiftInfo> {
  const aggregated = aggregateMultiStyleLineLogs(logs);
  const map = new Map<string, MultiStyleShiftInfo>();

  aggregated.forEach(agg => {
    const key = `${agg.date}__${agg.factory}__${agg.line}`;
    map.set(key, {
      count: agg.logsCount,
      sumEfficiency: agg.lineEfficiency,
      lineEfficiency: agg.lineEfficiency,
      fixedPresentTMs: agg.fixedPresentTMs,
      fixedPlanTMs: agg.fixedPlanTMs,
      avgPresentTMs: agg.fixedPresentTMs,
      avgPlanTMs: agg.fixedPlanTMs,
      shiftWorkedMinutes: agg.totalWorkedMinutes,
      shiftProducedMinutes: agg.totalProducedMinutes,
      shiftHoursWorked: agg.totalHoursWorked,
      styles: agg.styles
    });
  });

  return map;
}

/**
 * Aggregates any collection of production logs into executive summary metrics,
 * strictly applying the multi-style rule:
 * - Line total produced minutes from actual qty and SMV
 * - Worked minutes from worked hours multiplied by fixed line TM
 * - Line has a fixed count for all day (not summed style-wise, not divided style-wise)
 */
export function calculateAggregatedMetrics(logs: ProductionLog[]) {
  const aggregatedShifts = aggregateMultiStyleLineLogs(logs);

  let totalPlan = 0;
  let totalActual = 0;
  let totalProdMinutes = 0;
  let totalWorkedMinutes = 0;
  let totalPlanTM = 0;
  let totalPresentTM = 0;
  let totalDownTimeMinutes = 0;
  let multiStyleShiftsCount = 0;

  aggregatedShifts.forEach(shift => {
    totalPlan += shift.totalPlannedQty;
    totalActual += shift.totalActualQty;
    totalProdMinutes += shift.totalProducedMinutes;
    totalWorkedMinutes += shift.totalWorkedMinutes;
    totalPlanTM += (shift.fixedPlanTMs || shift.avgPlanTMs || 0);
    totalPresentTM += (shift.fixedPresentTMs || shift.avgPresentTMs || 0);
    totalDownTimeMinutes += shift.downTimeMinutes;
    if (shift.logsCount > 1) {
      multiStyleShiftsCount++;
    }
  });

  const lineEfficiency = totalWorkedMinutes > 0
    ? Number(((totalProdMinutes / totalWorkedMinutes) * 100).toFixed(1))
    : 0;

  const targetRealization = totalPlan > 0
    ? Number(((totalActual / totalPlan) * 100).toFixed(1))
    : 100;

  const laborAttendance = totalPlanTM > 0
    ? Number(((totalPresentTM / totalPlanTM) * 100).toFixed(1))
    : 100;

  const pcsPerOp = totalPresentTM > 0
    ? Number((totalActual / totalPresentTM).toFixed(1))
    : 0;

  const lostHours = Math.max(0, Math.round((totalWorkedMinutes - totalProdMinutes) / 60));
  const downtimeHours = Math.round(totalDownTimeMinutes / 60);

  return {
    shiftsCount: aggregatedShifts.length,
    rawLogsCount: logs.length,
    multiStyleShiftsCount,
    totalPlan,
    totalActual,
    totalProdMinutes,
    totalWorkedMinutes,
    totalPlanTM: Math.round(totalPlanTM),
    totalPresentTM: Math.round(totalPresentTM),
    totalDownTimeMinutes,
    lineEfficiency,
    targetRealization,
    laborAttendance,
    pcsPerOp,
    lostHours,
    downtimeHours
  };
}

/**
 * Down Time Calculation:
 * Down Time = Total Worked Minutes - (Actual Output Qty * Standard Minute Value [SMV])
 */
export function calculateDownTime(workedMinutes: number, actualQty: number, smv: number): number {
  const producedMinutes = calculateProducedMinutes(actualQty, smv);
  return Math.max(0, Math.round(workedMinutes - producedMinutes));
}

/**
 * Generates an Entry ID in the format: EBH-YYMMDD-LINE-INDEX
 */
export function generateEntryId(dateStr?: string, lineNo?: string, index?: number): string {
  let y = '';
  let m = '';
  let d = '';

  // Extract directly from YYYY-MM-DD without UTC Date shifting
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    const parts = dateStr.trim().split('-');
    y = parts[0].slice(-2);
    m = parts[1];
    d = parts[2];
  } else {
    const date = dateStr ? new Date(dateStr) : new Date();
    y = String(date.getFullYear()).slice(-2);
    m = String(date.getMonth() + 1).padStart(2, '0');
    d = String(date.getDate()).padStart(2, '0');
  }

  const cleanLine = (lineNo || 'LN').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const suffix = index !== undefined ? String(index + 1).padStart(2, '0') : String(Math.floor(100 + Math.random() * 900));
  return `EBH-${y}${m}${d}-${cleanLine}-${suffix}`;
}

/**
 * Formats a date to YYYY-MM-DD using local calendar date (avoids UTC day-shift)
 */
export function formatDate(date: Date | string): string {
  if (!date) return '';
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
      return date.trim();
    }
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Formats a Date into standard YYYY-MM-DD HH:mm:ss in Sri Lanka Standard Time (Asia/Colombo / GMT+5:30)
 * All Ebony Holdings plants (Kurunegala, Bulugolla, Werapola) operate on Sri Lanka time.
 */
export function formatSriLankaTimestamp(d: Date = new Date()): string {
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
    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
    return `${getPart('year')}-${getPart('month')}-${getPart('day')} ${getPart('hour')}:${getPart('minute')}:${getPart('second')}`;
  } catch {
    // Fallback: manually offset UTC by +5.5 hours (+330 minutes)
    try {
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const slDate = new Date(utc + (330 * 60000));
      return formatLocalTimestamp(slDate);
    } catch {
      return formatLocalTimestamp(d);
    }
  }
}

/**
 * Formats a Date into standard YYYY-MM-DD HH:mm:ss using device local time
 */
export function formatLocalTimestamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Primary timestamp generator: supports 'device', 'srilanka', or 'utc'
 */
export function formatCurrentTimestamp(d: Date = new Date(), mode: 'srilanka' | 'device' | 'utc' = 'device'): string {
  if (mode === 'srilanka') {
    return formatSriLankaTimestamp(d);
  }
  if (mode === 'utc') {
    return d.toISOString().replace('T', ' ').substring(0, 19);
  }
  return formatLocalTimestamp(d);
}

/**
 * Exports production logs into CSV matching all 22 exact headers
 */
export function exportToCSV(logs: ProductionLog[], customFilename?: string): void {
  const headers = [
    'Entry_ID',
    'Timestamp',
    'Date',
    'Factory',
    'Line',
    'Line_No',
    'Supervisor',
    'Style',
    'Product',
    'Brand',
    'SMV',
    'Planned_QTY',
    'Actual_QTY',
    'Produced_Minutes',
    'Plan_TMs',
    'Actual_TMs',
    'Present_TMs',
    'Hours_Worked',
    'Worked_Minutes',
    'Down_Time',
    'Remarks',
    'User'
  ];

  const rows = logs.map(log => [
    log.Entry_ID,
    log.Timestamp,
    log.Date,
    log.Factory,
    log.Line,
    log.Line_No,
    `"${(log.Supervisor || '').replace(/"/g, '""')}"`,
    `"${(log.Style || '').replace(/"/g, '""')}"`,
    `"${(log.Product || '').replace(/"/g, '""')}"`,
    `"${(log.Brand || '').replace(/"/g, '""')}"`,
    log.SMV,
    log.Planned_QTY,
    log.Actual_QTY,
    log.Produced_Minutes,
    log.Plan_TMs,
    log.Actual_TMs,
    log.Present_TMs,
    log.Hours_Worked,
    log.Worked_Minutes,
    log.Down_Time,
    `"${(log.Remarks || '').replace(/"/g, '""')}"`,
    `"${(log.User || '').replace(/"/g, '""')}"`
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  const downloadName = customFilename || `Ebony_Holdings_Production_Master_${new Date().toISOString().split('T')[0]}.csv`;
  link.setAttribute('download', downloadName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generic CSV exporter for custom sheets (Factory, Products, Users, Lines)
 */
export function exportGenericTableToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const formattedRows = rows.map(r =>
    r.map(val => {
      if (typeof val === 'string' && (val.includes(',') || val.includes('"') || val.includes('\n'))) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',')
  );

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...formattedRows].join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
