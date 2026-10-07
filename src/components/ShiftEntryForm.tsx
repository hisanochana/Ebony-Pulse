import React, { useState, useMemo, useEffect } from 'react';
import { 
  Plus, 
  Trash2, 
  Calculator, 
  CheckCircle, 
  Factory, 
  ShieldAlert, 
  Sparkles, 
  Clock, 
  FileSpreadsheet, 
  Copy, 
  Check, 
  Hash, 
  UserCheck, 
  Edit3, 
  Layers, 
  ArrowRight, 
  Info,
  Sliders
} from 'lucide-react';
import { FactoryName, User, StyleEntry, ProductionLog, DowntimeCategoryLog } from '../types';
import { 
  FACTORIES, 
  LINE_OPTIONS, 
  PRODUCT_OPTIONS, 
  BRAND_OPTIONS, 
  SUPERVISOR_OPTIONS, 
  LINE_SUPERVISOR_DATA 
} from '../data/initialData';
import { 
  calculateLineNo, 
  calculateProducedMinutes, 
  calculateWorkedMinutes, 
  calculateDownTime, 
  generateEntryId, 
  formatDate, 
  formatCurrentTimestamp, 
  formatSriLankaTimestamp, 
  formatLocalTimestamp 
} from '../utils/calculations';
import { 
  appendLogsToGoogleSheet, 
  getStoredSheetUrl, 
  getStoredAutoSync, 
  analyzeSheetUrl, 
  isSheetReadOnly, 
  isSheetConfiguredForWriting, 
  submitDowntimeLogs 
} from '../services/googleSheetService';
import { StyleDowntimeBreakdownModal } from './StyleDowntimeBreakdownModal';
import { DowntimeEntryPanel } from './DowntimeEntryPanel';
import { HoursAdjustmentModal } from './HoursAdjustmentModal';

interface ShiftEntryFormProps {
  currentUser: User | null;
  onOpenAuth: () => void;
  onSubmitLogs: (newLogs: ProductionLog[]) => void;
  onSuccessRedirect: () => void;
  onOpenSheetModal?: () => void;
  allDowntimeLogs?: DowntimeCategoryLog[];
  onDowntimeLogsUpdated?: (logs: DowntimeCategoryLog[]) => void;
  recentLogs?: ProductionLog[];
}

export const ShiftEntryForm: React.FC<ShiftEntryFormProps> = ({
  currentUser,
  onOpenAuth,
  onSubmitLogs,
  onSuccessRedirect,
  onOpenSheetModal,
  allDowntimeLogs = [],
  onDowntimeLogsUpdated,
  recentLogs = []
}) => {
  // Context state
  const defaultFactory: FactoryName = currentUser && currentUser.factory !== 'ALL'
    ? currentUser.factory
    : 'Kurunegala';

  const [factory, setFactory] = useState<FactoryName>(defaultFactory);

  // Sub-tab: Shift production entry vs Downtime category-wise entry
  const [activeSubTab, setActiveSubTab] = useState<'shift' | 'downtime'>('shift');

  // Breakdown modal state & stored breakdowns per style ID
  const [styleDowntimeBreakdowns, setStyleDowntimeBreakdowns] = useState<Record<string, DowntimeCategoryLog[]>>({});
  const [breakdownModalState, setBreakdownModalState] = useState<{
    isOpen: boolean;
    styleId: string;
    styleNumber: string;
    product: string;
    brand: string;
    downTimeMins: number;
  } | null>(null);

  // Hours Adjustment modal state
  const [hoursAdjustmentModalState, setHoursAdjustmentModalState] = useState<{
    isOpen: boolean;
    styleId: string;
    styleNumber: string;
    product: string;
    shiftHours: number;
    currentAdjustment: number;
    currentReason?: string;
    smv: number;
    actualQty: number;
  } | null>(null);

  // Line selection: dropdown or custom manual input
  const [line, setLine] = useState<string>('1');
  const [isCustomLine, setIsCustomLine] = useState<boolean>(false);
  const [customLineInput, setCustomLineInput] = useState<string>('');

  const [date, setDate] = useState<string>(formatDate(new Date()));

  // Supervisor selection: dropdown or custom manual input
  const [supervisor, setSupervisor] = useState<string>('RASITHA');
  const [isCustomSupervisor, setIsCustomSupervisor] = useState<boolean>(false);
  const [customSupervisorInput, setCustomSupervisorInput] = useState<string>('');

  // Shift TM (Workforce)
  const [planTMs, setPlanTMs] = useState<number>(14);
  const [actualTMs, setActualTMs] = useState<number>(14);
  const [presentTMs, setPresentTMs] = useState<number>(14);

  // Default shift hours template (can be applied or customized style-wise)
  const [defaultShiftHours, setDefaultShiftHours] = useState<number>(9.00);

  // Custom Product and Brand manual entry states per style row ID
  const [customProductRows, setCustomProductRows] = useState<Record<string, boolean>>({});
  const [customBrandRows, setCustomBrandRows] = useState<Record<string, boolean>>({});

  const isCustomProduct = (styleId: string, currentVal: string) => {
    if (customProductRows[styleId]) return true;
    return Boolean(currentVal && !PRODUCT_OPTIONS.includes(currentVal));
  };

  const isCustomBrand = (styleId: string, currentVal: string) => {
    if (customBrandRows[styleId]) return true;
    return Boolean(currentVal && !BRAND_OPTIONS.includes(currentVal));
  };

  // Dynamic Styles on this line - with style-wise product, shiftHours & hoursAdjustment
  const [styles, setStyles] = useState<StyleEntry[]>([
    {
      id: 'style-1',
      styleNumber: '26007L',
      product: 'SHIRT BG',
      brand: 'VANTAGE',
      smv: 19.5,
      shiftHours: 9.00,
      plannedQty: 520,
      actualQty: 500,
      downTimeMins: 0,
      remarks: 'Standard production run',
      hoursAdjustment: 0
    }
  ]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [sheetSyncFeedback, setSheetSyncFeedback] = useState<{
    status: 'synced' | 'local_only' | 'error' | 'readonly';
    message: string;
  } | null>(null);

  // Track submitted logs and entry IDs to show prominently to operator
  const [lastSubmittedLogs, setLastSubmittedLogs] = useState<ProductionLog[]>([]);
  const [submittedEntryIds, setSubmittedEntryIds] = useState<Array<{
    entryId: string;
    style: string;
    product: string;
    actualQty: number;
    downTime: number;
    lineNo: string;
  }>>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedTsv, setCopiedTsv] = useState(false);

  // Current sheet connection state
  const currentSheetUrl = getStoredSheetUrl();
  const currentAutoSync = getStoredAutoSync();
  const currentSheetReadOnly = isSheetReadOnly(currentSheetUrl);
  const currentSheetCanWrite = isSheetConfiguredForWriting(currentSheetUrl);

  // Active factory determination: if user is locked to a plant, enforce it!
  const effectiveFactory = currentUser && currentUser.factory !== 'ALL'
    ? currentUser.factory
    : factory;

  // Active Line: either custom input or selected option
  const effectiveLine = isCustomLine ? (customLineInput.trim() || '1') : line;

  // Auto-calculated Line_No (e.g. K1, B3+4, W6+7)
  const calculatedLineNo = useMemo(() => {
    return calculateLineNo(effectiveFactory, effectiveLine);
  }, [effectiveFactory, effectiveLine]);

  // Active Supervisor
  const effectiveSupervisor = isCustomSupervisor
    ? (customSupervisorInput.trim().toUpperCase() || 'SUPERVISOR')
    : supervisor;

  // Auto-suggest supervisor when Factory or Line changes (if not in custom manual supervisor mode)
  useEffect(() => {
    if (!isCustomSupervisor) {
      const lineNoToMatch = calculateLineNo(effectiveFactory, effectiveLine);
      const match = LINE_SUPERVISOR_DATA.find(
        m => m.lineNo.toUpperCase() === lineNoToMatch.toUpperCase() &&
             m.factory.toLowerCase() === effectiveFactory.toLowerCase()
      );
      if (match) {
        setSupervisor(match.supervisor);
      } else {
        // Look up by line only
        const partialMatch = LINE_SUPERVISOR_DATA.find(
          m => m.lineNo.toUpperCase().replace(/[^A-Z0-9+]/g, '') === lineNoToMatch.toUpperCase().replace(/[^A-Z0-9+]/g, '')
        );
        if (partialMatch) {
          setSupervisor(partialMatch.supervisor);
        }
      }
    }
  }, [effectiveFactory, effectiveLine, isCustomSupervisor]);

  // Live Calculations per style
  const liveStyleCalculations = useMemo(() => {
    return styles.map((style) => {
      const hours = (style.shiftHours !== undefined && style.shiftHours !== '' && !isNaN(Number(style.shiftHours)))
        ? Number(style.shiftHours)
        : defaultShiftHours;
      const smv = (style.smv !== undefined && style.smv !== '' && !isNaN(Number(style.smv)))
        ? Number(Number(style.smv).toFixed(2))
        : 0;
      const adjHours = Number(style.hoursAdjustment) || 0;
      const producedMins = calculateProducedMinutes(style.actualQty, smv);
      const workedMins = calculateWorkedMinutes(presentTMs, hours, adjHours);
      const downTime = calculateDownTime(workedMins, style.actualQty, smv);
      const eff = workedMins > 0 ? Number(((producedMins / workedMins) * 100).toFixed(1)) : 0;

      return {
        id: style.id,
        styleNumber: style.styleNumber,
        product: style.product || 'SHIRT BG',
        shiftHours: hours,
        hoursAdjustment: adjHours,
        producedMins,
        workedMins,
        downTime,
        efficiency: eff
      };
    });
  }, [styles, presentTMs, defaultShiftHours]);

  // Memoized style number suggestions from past records and authentic Ebony Holdings catalogue
  const availableStyleSuggestions = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(recentLogs)) {
      recentLogs.forEach(l => {
        if (l.Style && typeof l.Style === 'string' && l.Style.trim() && l.Style.toUpperCase() !== 'UNKNOWN') {
          set.add(l.Style.trim().toUpperCase());
        }
      });
    }
    const wellKnown = [
      'B1SHIRT BG', 'SU 3409', '861-0126-2B', '860-0126-1A', 'M 805 1225-1',
      '860-0126-1B', '666-1225-1', '861-0126-3B', 'KIMBALL60576', '970',
      '169161', '25388', '25437', '25447', '25328L', 'SU 3406', '861-0126-3A',
      '182200-801', '25465', '861-0126-4A', '26007L', '26341L', '26457L',
      'RG26010L', 'SWRPS1407', 'SU 3357', 'S4U 3319', 'SU 3358'
    ];
    wellKnown.forEach(s => set.add(s));
    return Array.from(set).sort();
  }, [recentLogs]);

  // Handlers for styles
  const addStyleRow = () => {
    setStyles(prev => [
      ...prev,
      {
        id: `style-${Date.now()}`,
        styleNumber: '',
        product: prev[prev.length - 1]?.product || 'SHIRT BG',
        brand: 'VANTAGE',
        smv: 15.0,
        shiftHours: defaultShiftHours,
        plannedQty: 300,
        actualQty: 0,
        downTimeMins: 0,
        remarks: '',
        hoursAdjustment: 0
      }
    ]);
  };

  const removeStyleRow = (id: string) => {
    if (styles.length <= 1) {
      alert('At least one style entry is required per shift.');
      return;
    }
    setStyles(prev => prev.filter(s => s.id !== id));
  };

  const updateStyle = (id: string, field: keyof StyleEntry, value: any) => {
    setStyles(prev =>
      prev.map(s => {
        if (s.id !== id) return s;
        let formattedValue = value;
        if (field === 'styleNumber' || field === 'product' || field === 'brand') {
          formattedValue = typeof value === 'string' ? value.toUpperCase() : value;
        } else if (field === 'shiftHours') {
          formattedValue = value === '' ? '' : (isNaN(Number(value)) ? 0 : Number(Number(value).toFixed(2)));
        } else if (field === 'smv') {
          formattedValue = value === '' ? '' : (isNaN(Number(value)) ? 0 : Number(Number(value).toFixed(2)));
        } else if (field === 'hoursAdjustment') {
          formattedValue = value === '' ? 0 : (isNaN(Number(value)) ? 0 : Number(Number(value).toFixed(2)));
        }
        return { ...s, [field]: formattedValue };
      })
    );
  };

  const handleOpenHoursAdjustment = (styleId: string) => {
    const targetStyle = styles.find(s => s.id === styleId) || styles[0];
    if (!targetStyle) return;
    const hours = (targetStyle.shiftHours !== undefined && targetStyle.shiftHours !== '' && !isNaN(Number(targetStyle.shiftHours)))
      ? Number(targetStyle.shiftHours)
      : defaultShiftHours;
    const smv = (targetStyle.smv !== undefined && targetStyle.smv !== '' && !isNaN(Number(targetStyle.smv)))
      ? Number(Number(targetStyle.smv).toFixed(2))
      : 0;
    const actualQty = Number(targetStyle.actualQty) || 0;
    const adj = Number(targetStyle.hoursAdjustment) || 0;

    setHoursAdjustmentModalState({
      isOpen: true,
      styleId: targetStyle.id,
      styleNumber: targetStyle.styleNumber,
      product: targetStyle.product || 'SHIRT BG',
      shiftHours: hours,
      currentAdjustment: adj,
      currentReason: targetStyle.hoursAdjustmentReason || '',
      smv,
      actualQty
    });
  };

  const handleApplyHoursAdjustment = (adjustmentHours: number, reason?: string) => {
    if (!hoursAdjustmentModalState) return;
    const targetId = hoursAdjustmentModalState.styleId;
    setStyles(prev =>
      prev.map(s => {
        if (s.id !== targetId) return s;
        return {
          ...s,
          hoursAdjustment: adjustmentHours,
          hoursAdjustmentReason: reason || ''
        };
      })
    );
  };

  const handleOpenDowntimeBreakdown = (
    styleId: string,
    styleNumber: string,
    product: string,
    brand: string,
    downTimeMins: number
  ) => {
    setBreakdownModalState({
      isOpen: true,
      styleId,
      styleNumber,
      product,
      brand,
      downTimeMins
    });
  };

  const handleSaveBreakdown = (styleId: string, logs: DowntimeCategoryLog[]) => {
    setStyleDowntimeBreakdowns(prev => ({
      ...prev,
      [styleId]: logs
    }));
    setBreakdownModalState(null);
  };

  // Helper: Distribute total shift hours across styles proportionally based on Actual Qty
  const handleAutoDistributeHours = () => {
    const totalActual = styles.reduce((acc, s) => acc + (Number(s.actualQty) || 0), 0);
    if (totalActual === 0) {
      // distribute equally
      const equalHours = Number((defaultShiftHours / styles.length).toFixed(2));
      setStyles(prev => prev.map(s => ({ ...s, shiftHours: equalHours })));
    } else {
      setStyles(prev => prev.map(s => {
        const qty = Number(s.actualQty) || 0;
        const propHours = Number(((defaultShiftHours * qty) / totalActual).toFixed(2));
        return { ...s, shiftHours: propHours };
      }));
    }
  };

  // Form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!currentUser) {
      setErrorMessage('You must be signed in as an authorized operator to submit logs.');
      onOpenAuth();
      return;
    }

    if (!date) {
      setErrorMessage('Please select a valid production date.');
      return;
    }

    if (!effectiveLine) {
      setErrorMessage('Please specify a valid sewing line number.');
      return;
    }

    if (!effectiveSupervisor) {
      setErrorMessage('Please select or enter the line supervisor name.');
      return;
    }

    // Validate styles
    for (let i = 0; i < styles.length; i++) {
      const s = styles[i];
      if (!s.styleNumber.trim()) {
        setErrorMessage(`Please enter Style Number for item #${i + 1}.`);
        return;
      }
      if (s.smv === undefined || s.smv === '' || isNaN(Number(s.smv)) || Number(s.smv) <= 0) {
        setErrorMessage(`Please enter a valid SMV (greater than 0) for Style ${s.styleNumber}.`);
        return;
      }
      if (!s.product) {
        setErrorMessage(`Please select Product Category for Style ${s.styleNumber}.`);
        return;
      }
      if (s.shiftHours === undefined || s.shiftHours === '' || isNaN(Number(s.shiftHours)) || Number(s.shiftHours) < 0) {
        setErrorMessage(`Please enter valid Shift Hours (0 or greater) for Style ${s.styleNumber}.`);
        return;
      }
    }

    setIsSubmitting(true);

    // Generate real-time timestamp matching factory timezone (Sri Lanka GMT+5:30)
    const nowTimestamp = formatCurrentTimestamp(new Date(), 'srilanka');

    const createdRecords: Array<{
      entryId: string;
      style: string;
      product: string;
      actualQty: number;
      downTime: number;
      lineNo: string;
    }> = [];

    const newLogs: ProductionLog[] = styles.map((style, idx) => {
      const entryId = generateEntryId(date, calculatedLineNo, idx);
      const hoursWorked = (style.shiftHours !== undefined && style.shiftHours !== '' && !isNaN(Number(style.shiftHours)))
        ? Number(style.shiftHours)
        : defaultShiftHours;
      const actualQty = Number(style.actualQty) || 0;
      const smv = (style.smv !== undefined && style.smv !== '' && !isNaN(Number(style.smv)))
        ? Number(Number(style.smv).toFixed(2))
        : 0;
      const adjHours = Number(style.hoursAdjustment) || 0;
      const producedMins = calculateProducedMinutes(actualQty, smv);
      const workedMins = calculateWorkedMinutes(presentTMs, hoursWorked, adjHours);
      
      // Formula: Down_Time = Total Worked Minutes - (Actual Output Qty * SMV)
      const downTime = calculateDownTime(workedMins, actualQty, smv);

      const formattedProduct = (style.product || 'SHIRT BG').trim().toUpperCase();
      const formattedBrand = (style.brand || 'VANTAGE').trim().toUpperCase();
      const formattedStyle = style.styleNumber.trim().toUpperCase();
      const numHoursWorked = Number(Number(hoursWorked).toFixed(2));

      createdRecords.push({
        entryId,
        style: formattedStyle,
        product: formattedProduct,
        actualQty,
        downTime,
        lineNo: calculatedLineNo
      });

      let remarksText = style.remarks || 'Standard production run';
      if (adjHours !== 0 && !remarksText.includes('Hours Adj:')) {
        const signStr = adjHours > 0 ? `+${adjHours}` : `${adjHours}`;
        const minStr = adjHours > 0 ? `+${adjHours * 60}` : `${adjHours * 60}`;
        const reasonTag = style.hoursAdjustmentReason?.trim() ? ` - ${style.hoursAdjustmentReason.trim()}` : '';
        remarksText = `[Hours Adj: ${signStr}h (${minStr}m)${reasonTag}] ${remarksText}`;
      }

      return {
        Entry_ID: entryId,
        Timestamp: nowTimestamp,
        Date: date,
        Factory: effectiveFactory,
        Line: effectiveLine,
        Line_No: calculatedLineNo,
        Supervisor: effectiveSupervisor,
        Style: formattedStyle,
        Product: formattedProduct,
        Brand: formattedBrand,
        SMV: smv,
        Planned_QTY: Number(style.plannedQty) || 0,
        Actual_QTY: actualQty,
        Produced_Minutes: producedMins,
        Plan_TMs: Number(planTMs) || 0,
        Actual_TMs: Number(actualTMs) || 0,
        Present_TMs: Number(presentTMs) || 0,
        Hours_Worked: numHoursWorked,
        Worked_Minutes: workedMins,
        Down_Time: downTime,
        Remarks: remarksText,
        User: currentUser.username,
        Hours_Adjustment: adjHours !== 0 ? adjHours : undefined,
        Hours_Adjustment_Reason: style.hoursAdjustmentReason?.trim() || undefined
      };
    });

    // 1. Update React state immediately - this refreshes the Live Dashboard and Master Sheet automatically!
    onSubmitLogs(newLogs);
    setSubmittedEntryIds(createdRecords);
    setLastSubmittedLogs(newLogs);

    // Collect any code-wise downtime breakdowns recorded for these styles and bond them to Entry_ID
    const breakdownsToSave: DowntimeCategoryLog[] = [];
    styles.forEach((st, idx) => {
      const bList = styleDowntimeBreakdowns[st.id];
      if (bList && bList.length > 0) {
        const assignedEntryId = newLogs[idx]?.Entry_ID || '';
        bList.forEach(b => {
          breakdownsToSave.push({
            ...b,
            entryId: assignedEntryId,
            factory: effectiveFactory,
            line: effectiveLine,
            supervisor: effectiveSupervisor,
            date: date,
            user: currentUser.username
          });
        });
      }
    });

    if (breakdownsToSave.length > 0) {
      submitDowntimeLogs(breakdownsToSave).catch(err => {
        console.warn('Failed to sync downtime breakdowns:', err);
      });
      if (onDowntimeLogsUpdated) {
        onDowntimeLogsUpdated([...allDowntimeLogs, ...breakdownsToSave]);
      }
    }

    // 2. Automatically save rows to connected Google Sheet
    const sheetUrl = getStoredSheetUrl();
    const autoSync = getStoredAutoSync();

    if (sheetUrl && autoSync) {
      appendLogsToGoogleSheet(newLogs, currentUser.username, sheetUrl)
        .then(res => {
          if (res.success) {
            setSheetSyncFeedback({
              status: 'synced',
              message: `Saved directly to Google Sheet (${res.count} rows added) and updated Live Dashboard automatically!`
            });
          } else if (res.isReadOnly) {
            setSheetSyncFeedback({
              status: 'readonly',
              message: res.message
            });
          } else {
            setSheetSyncFeedback({
              status: 'error',
              message: `Updated Live Dashboard. Google Sheet notice: ${res.message}`
            });
          }
        })
        .catch(err => {
          setSheetSyncFeedback({
            status: 'error',
            message: `Updated Live Dashboard. Google Sheet sync error: ${err.message}`
          });
        });
    } else {
      setSheetSyncFeedback({
        status: 'local_only',
        message: 'Saved to Live Dashboard & Local Master Sheet! (Link your Google Sheet via the top navigation to auto-save to cloud spreadsheet).'
      });
    }

    setIsSubmitting(false);
    setSubmitSuccess(true);
  };

  const handleCopySingleId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyAllIds = () => {
    const allIds = submittedEntryIds.map(r => r.entryId).join('\n');
    navigator.clipboard.writeText(allIds);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2500);
  };

  const handleCopyTsvRows = () => {
    if (!lastSubmittedLogs.length) return;
    const tsv = lastSubmittedLogs.map(log => [
      log.Entry_ID,
      log.Timestamp,
      log.Date,
      log.Factory,
      log.Line,
      log.Line_No,
      log.Supervisor,
      log.Style,
      log.Product,
      log.Brand,
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
      log.Remarks,
      log.User
    ].join('\t')).join('\n');

    navigator.clipboard.writeText(tsv);
    setCopiedTsv(true);
    setTimeout(() => setCopiedTsv(false), 2500);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4">

      {/* Operator Status Bento Banner */}
      <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0d1625] border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Factory className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black uppercase text-white tracking-widest">Daily Production Shift Entry</h2>
              <span className="text-[10px] bg-cyan-500/20 text-cyan-300 font-bold px-1.5 py-0.5 rounded border border-cyan-500/30">
                22-Field Master Model
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {currentUser ? (
                <>
                  Logged in as <strong className="text-slate-200">{currentUser.fullName}</strong> ({currentUser.username}) • Assigned Plant:{' '}
                  <strong className="text-cyan-400 font-bold">
                    {currentUser.factory === 'ALL' ? 'All Plants (Admin Unrestricted)' : `${currentUser.factory} Plant (Locked)`}
                  </strong>
                </>
              ) : (
                <span className="text-amber-400 font-medium">
                  Not signed in. Please sign in to authenticate production submissions.
                </span>
              )}
            </p>
          </div>
        </div>

        {!currentUser && (
          <button
            onClick={onOpenAuth}
            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-sm shadow-sky-950 transition"
          >
            Sign In / Switch Operator
          </button>
        )}
      </div>

      {/* Sub-Area Tabs: Shift Production vs Downtime Category Data Entry */}
      <div className="flex items-center gap-2 p-1 bg-[#121c2e] border border-[#1c2b44] rounded-xl">
        <button
          type="button"
          onClick={() => setActiveSubTab('shift')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition ${
            activeSubTab === 'shift'
              ? 'bg-sky-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Factory className="w-3.5 h-3.5" />
          <span>Daily Production Shift Entry</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-200 border border-sky-800">
            {styles.length} Style{styles.length > 1 ? 's' : ''}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('downtime')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-bold transition ${
            activeSubTab === 'downtime'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Downtime Category Data Entry</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-200 border border-amber-800 font-mono">
            {allDowntimeLogs.length} Logged
          </span>
        </button>
      </div>

      {activeSubTab === 'downtime' ? (
        <DowntimeEntryPanel
          currentUser={currentUser}
          recentLogs={recentLogs}
          downtimeLogs={allDowntimeLogs}
          onDowntimeLogsUpdated={onDowntimeLogsUpdated || (() => {})}
        />
      ) : (
        <>
          {/* Submission Success Alert with Prominent Entry IDs */}
      {submitSuccess ? (
        <div className="p-6 rounded-xl bg-[#121c2e] border border-emerald-500/40 space-y-4 shadow-xl animate-fade-in">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 mx-auto">
              <CheckCircle className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black uppercase text-white tracking-wider">
              Shift Production Successfully Logged!
            </h3>
            <p className="text-xs text-slate-300 max-w-lg mx-auto">
              {styles.length} record(s) logged to the Master Sheet with style-wise product categories, shift hours, Line_No ({calculatedLineNo}), and automated Downtime calculation.
            </p>
          </div>

          {/* Prominent Generated Entry ID(s) Box */}
          <div className="bg-[#0d1625] border border-emerald-500/50 rounded-xl p-4 max-w-2xl mx-auto shadow-inner space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1c2b44] pb-2.5">
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-black uppercase text-white tracking-wider">
                  Generated Production Entry ID(s)
                </span>
                <span className="text-[10px] bg-cyan-950 text-cyan-300 font-mono font-bold px-1.5 py-0.5 rounded border border-cyan-800">
                  {submittedEntryIds.length} Record{submittedEntryIds.length > 1 ? 's' : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyAllIds}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1c2b44] hover:bg-slate-700 text-cyan-300 text-xs font-bold transition self-start sm:self-auto"
              >
                {copiedAll ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedAll ? 'All IDs Copied!' : 'Copy All Entry IDs'}</span>
              </button>
            </div>

            <div className="space-y-2">
              {submittedEntryIds.map((item, idx) => (
                <div 
                  key={idx}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-[#121c2e] border border-slate-700/60 hover:border-cyan-500/50 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-5 h-5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono text-[10px] font-bold flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-black text-emerald-400 tracking-wide">
                          {item.entryId}
                        </span>
                        <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                          Line {item.lineNo}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>Style: <strong className="text-white">{item.style}</strong></span>
                        <span>•</span>
                        <span>Product: <strong className="text-cyan-300">{item.product}</strong></span>
                        <span>•</span>
                        <span>Qty: <strong className="text-emerald-300">{item.actualQty.toLocaleString()} pcs</strong></span>
                        <span>•</span>
                        <span>Downtime: <strong className="text-amber-300">{item.downTime} min</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSubTab('downtime');
                        setSubmitSuccess(false);
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-300 hover:text-amber-200 text-xs font-bold transition cursor-pointer"
                      title="Log downtime category breakdown for this entry"
                    >
                      <Clock className="w-3.5 h-3.5 text-amber-400" />
                      <span>Log Downtime</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopySingleId(item.entryId)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#0d1625] border border-slate-700 hover:border-cyan-500 text-slate-300 hover:text-white text-xs font-mono font-medium transition cursor-pointer"
                    >
                      {copiedId === item.entryId ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          <span>Copy ID</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {sheetSyncFeedback && sheetSyncFeedback.status !== 'synced' && (
            <div className={`p-3 rounded-lg max-w-2xl mx-auto text-xs flex flex-col sm:flex-row items-center justify-between gap-2.5 border ${
              sheetSyncFeedback.status === 'readonly'
                ? 'bg-amber-500/15 text-amber-200 border-amber-500/30'
                : sheetSyncFeedback.status === 'error'
                  ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
            }`}>
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>{sheetSyncFeedback.message}</span>
              </div>
            </div>
          )}

          {/* Quick 1-Click Copy 22-Column Row for Google Sheet */}
          {lastSubmittedLogs.length > 0 && (
            <div className="max-w-2xl mx-auto p-2.5 rounded-lg bg-[#0d1625] border border-slate-700/60 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
              <div className="text-slate-300 text-[11px]">
                <span>Want to paste directly into Google Sheet cell A?</span>
              </div>
              <button
                type="button"
                onClick={handleCopyTsvRows}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1c2b44] hover:bg-[#253959] text-cyan-300 hover:text-white border border-cyan-500/30 text-xs font-bold transition"
              >
                {copiedTsv ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedTsv ? '22 Columns Copied (Ready to Paste)!' : 'Copy 22-Column Row (Paste into Sheet)'}</span>
              </button>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setActiveSubTab('downtime');
                setSubmitSuccess(false);
              }}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-sm shadow-amber-950 transition cursor-pointer flex items-center gap-1.5"
            >
              <Clock className="w-4 h-4" />
              <span>Go to Downtime Log</span>
            </button>
            <button
              onClick={() => {
                setSubmitSuccess(false);
                setSheetSyncFeedback(null);
                setSubmittedEntryIds([]);
                setLastSubmittedLogs([]);
                // Reset quantities for fresh entry
                setStyles(prev => prev.map(s => ({ ...s, actualQty: 0, downTimeMins: 0 })));
              }}
              className="px-4 py-2 rounded-lg bg-[#0d1625] border border-[#1c2b44] hover:bg-slate-800 text-white text-xs font-bold transition cursor-pointer"
            >
              Log Another Shift
            </button>
            <button
              onClick={onSuccessRedirect}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold shadow-sm shadow-sky-950 transition cursor-pointer flex items-center gap-1.5"
            >
              <span>View Master Sheet (22 Columns)</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Validation Alert */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 01. FACTORY & LINE CONTEXT */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[#1c2b44] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-1 h-3.5 bg-sky-500 rounded-full"></span>
                <h3 className="text-xs font-black uppercase text-white tracking-widest">1. Factory & Line Context</h3>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {/* Factory */}
              <div>
                <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
                  Factory Location {currentUser && currentUser.factory !== 'ALL' && <span className="text-amber-400">(Locked)</span>}
                </label>
                <select
                  value={effectiveFactory}
                  disabled={currentUser?.factory !== 'ALL' && !!currentUser}
                  onChange={e => setFactory(e.target.value as FactoryName)}
                  className={`w-full bg-[#0d1625] border rounded-lg px-2.5 py-1.5 font-bold text-white focus:outline-none text-xs ${
                    currentUser?.factory !== 'ALL' && !!currentUser
                      ? 'border-amber-600/50 text-amber-300 bg-slate-900/60 cursor-not-allowed'
                      : 'border-slate-700/70 focus:border-cyan-500'
                  }`}
                >
                  {FACTORIES.map(f => (
                    <option key={f} value={f}>{f} Plant</option>
                  ))}
                </select>
                <p className="text-[9px] text-slate-500 mt-1 font-mono">
                  Prefix: {effectiveFactory.charAt(0).toUpperCase()}
                </p>
              </div>

              {/* Line: Dropdown + Custom Manual Input option */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 text-[10px] font-black uppercase tracking-wider">
                    Sewing Line *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomLine(prev => !prev);
                      if (!isCustomLine && !customLineInput) {
                        setCustomLineInput(line);
                      }
                    }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>{isCustomLine ? 'Select Dropdown' : '+ Custom Line'}</span>
                  </button>
                </div>

                {isCustomLine ? (
                  <input
                    type="text"
                    required
                    placeholder="Enter custom line (e.g. 11, 12, 20)..."
                    value={customLineInput}
                    onChange={e => setCustomLineInput(e.target.value)}
                    className="w-full bg-[#0d1625] border border-cyan-500/70 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-cyan-400 focus:outline-none text-xs"
                  />
                ) : (
                  <select
                    value={line}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setIsCustomLine(true);
                      } else {
                        setLine(e.target.value);
                      }
                    }}
                    className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-cyan-500 focus:outline-none text-xs"
                  >
                    {LINE_OPTIONS.map(l => (
                      <option key={l} value={l}>Line {l}</option>
                    ))}
                    <option value="__custom__">+ Enter Custom Line...</option>
                  </select>
                )}
                <p className="text-[9px] text-slate-500 mt-1">
                  Supports combo lines (e.g. 3+4, 6+7) or custom lines
                </p>
              </div>

              {/* Date */}
              <div>
                <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">Production Date *</label>
                <input
                  type="date"
                  required
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none text-xs"
                />
              </div>

              {/* Line Supervisor: Dropdown + Manual Add option */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-slate-400 text-[10px] font-black uppercase tracking-wider">
                    Line Supervisor *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomSupervisor(prev => !prev);
                      if (!isCustomSupervisor && !customSupervisorInput) {
                        setCustomSupervisorInput(supervisor);
                      }
                    }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
                  >
                    <UserCheck className="w-3 h-3" />
                    <span>{isCustomSupervisor ? 'Pick Dropdown' : '+ Manual Add'}</span>
                  </button>
                </div>

                {isCustomSupervisor ? (
                  <input
                    type="text"
                    required
                    placeholder="Type supervisor name manually..."
                    value={customSupervisorInput}
                    onChange={e => setCustomSupervisorInput(e.target.value.toUpperCase())}
                    className="w-full bg-[#0d1625] border border-cyan-500/70 rounded-lg px-2.5 py-1.5 text-white uppercase focus:border-cyan-400 focus:outline-none font-bold text-xs"
                  />
                ) : (
                  <select
                    value={supervisor}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setIsCustomSupervisor(true);
                      } else {
                        setSupervisor(e.target.value);
                      }
                    }}
                    className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-cyan-500 focus:outline-none text-xs uppercase"
                  >
                    {SUPERVISOR_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                    <option value="__custom__">+ Type Custom Name...</option>
                  </select>
                )}
                <p className="text-[9px] text-slate-500 mt-1">
                  Select from roster or manually enter name
                </p>
              </div>
            </div>
          </div>

          {/* 02. SHIFT ATTENDANCE & WORKFORCE */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-[#1c2b44] pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-1 h-3.5 bg-sky-500 rounded-full"></span>
                <h3 className="text-xs font-black uppercase text-white tracking-widest">2. Shift Attendance & Workforce</h3>
              </div>
              <div className="text-[10px] text-slate-400 font-bold">
                Attendance Rate:{' '}
                <strong className="text-emerald-400">
                  {planTMs > 0 ? ((presentTMs / planTMs) * 100).toFixed(1) : 100}%
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">Plan TMs (Target Workforce)</label>
                <input
                  type="number"
                  min={1}
                  value={planTMs}
                  onChange={e => setPlanTMs(Number(e.target.value))}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">Actual TMs (Reported Workforce)</label>
                <input
                  type="number"
                  min={1}
                  value={actualTMs}
                  onChange={e => setActualTMs(Number(e.target.value))}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">Present TMs (Attended / Worked)</label>
                <input
                  type="number"
                  min={1}
                  value={presentTMs}
                  onChange={e => setPresentTMs(Number(e.target.value))}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono font-bold focus:border-cyan-500 focus:outline-none text-xs"
                />
              </div>
            </div>
          </div>

          {/* 03. STYLE VOLUMES, PER-STYLE PRODUCT CATEGORY & SHIFT HOURS */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-4 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-[#1c2b44] pb-2.5 gap-2">
              <div className="flex items-center gap-2">
                <span className="w-1 h-3.5 bg-sky-500 rounded-full"></span>
                <div>
                  <h3 className="text-xs font-black uppercase text-white tracking-widest">
                    3. Style-Wise Product Category, Shift Hours & Volume
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Hours Adjustments Button */}
                <button
                  type="button"
                  onClick={() => handleOpenHoursAdjustment(styles[0]?.id || '')}
                  title="Hours Adjustments: Select + or - amount to adjust worked minutes (hours × 60)"
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition cursor-pointer ${
                    styles.some(s => s.hoursAdjustment && s.hoursAdjustment !== 0)
                      ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500 shadow-sm hover:bg-emerald-900'
                      : 'bg-[#0d1625] text-cyan-300 border-cyan-500/50 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Hours Adjustments</span>
                  {styles.some(s => s.hoursAdjustment && s.hoursAdjustment !== 0) && (
                    <span className="text-[9px] bg-emerald-500 text-slate-950 px-1 py-0.2 rounded font-black font-mono">
                      {styles.reduce((acc, s) => acc + (Number(s.hoursAdjustment) || 0), 0) > 0 ? '+' : ''}
                      {styles.reduce((acc, s) => acc + (Number(s.hoursAdjustment) || 0), 0)}h
                    </span>
                  )}
                </button>

                {styles.length > 1 && (
                  <button
                    type="button"
                    onClick={handleAutoDistributeHours}
                    title="Distribute 9.0 shift hours proportionally by Actual Qty across all styles"
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#0d1625] border border-cyan-500/40 text-cyan-300 hover:text-white hover:bg-slate-800 transition text-[11px] font-bold"
                  >
                    <Calculator className="w-3.5 h-3.5" />
                    <span>Auto-Distribute Hours</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={addStyleRow}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white transition text-[11px] font-bold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Style Row</span>
                </button>
              </div>
            </div>

            {/* STYLES LIST WITH PER-STYLE PRODUCT CATEGORY & SHIFT HOURS */}
            <div className="space-y-3">
              {styles.map((style, index) => {
                const calc = liveStyleCalculations[index] || {
                  workedMins: 0,
                  producedMins: 0,
                  downTime: 0,
                  efficiency: 0
                };

                return (
                  <div
                    key={style.id}
                    className="p-3.5 rounded-xl bg-[#0d1625] border border-[#1c2b44] hover:border-slate-700 space-y-3 transition"
                  >
                    <div className="flex justify-between items-center text-xs border-b border-[#1c2b44]/70 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded bg-cyan-950 border border-cyan-600/50 flex items-center justify-center text-[10px] font-bold text-cyan-400">
                          {index + 1}
                        </span>
                        <span className="font-bold text-white uppercase tracking-wider text-xs">
                          Style #{index + 1}: {style.styleNumber || 'New Style'}
                        </span>
                        <span className="text-[10px] bg-slate-800 text-cyan-300 px-2 py-0.5 rounded font-mono font-medium">
                          {style.product || 'SHIRT BG'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono">
                          <span className="text-slate-400">
                            Worked: <strong className="text-slate-200">{calc.workedMins}m</strong>
                          </span>
                          <span className="text-slate-400">
                            Produced: <strong className="text-cyan-400">{calc.producedMins}m</strong>
                          </span>
                          <span className="text-slate-400">
                            Downtime: <strong className="text-amber-400">{calc.downTime}m</strong>
                          </span>
                        </div>

                        {styles.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeStyleRow(style.id)}
                            className="text-slate-500 hover:text-rose-400 p-1 transition"
                            title="Remove style row"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Style-wise configuration grid: Product Category, Shift Hours, Style No, Brand, SMV, Planned, Actual */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5 text-xs">
                      {/* 1. Product Category (Style-wise) */}
                      <div className="col-span-2 sm:col-span-1 lg:col-span-2">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-cyan-400 text-[10px] font-black uppercase tracking-wider">
                            Product Category *
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const willBeCustom = !isCustomProduct(style.id, style.product);
                              setCustomProductRows(prev => ({
                                ...prev,
                                [style.id]: willBeCustom
                              }));
                            }}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                          >
                            {isCustomProduct(style.id, style.product) ? 'Pick from List' : '+ Custom'}
                          </button>
                        </div>
                        {isCustomProduct(style.id, style.product) ? (
                          <input
                            type="text"
                            required
                            placeholder="CUSTOM PRODUCT"
                            value={style.product}
                            onChange={e => updateStyle(style.id, 'product', e.target.value.toUpperCase())}
                            className="w-full bg-[#121c2e] border border-cyan-500/70 rounded-lg px-2.5 py-1.5 text-white font-bold uppercase focus:border-cyan-400 focus:outline-none text-xs"
                          />
                        ) : (
                          <select
                            value={style.product || 'SHIRT BG'}
                            onChange={e => {
                              if (e.target.value === '__custom__') {
                                setCustomProductRows(prev => ({ ...prev, [style.id]: true }));
                              } else {
                                updateStyle(style.id, 'product', e.target.value.toUpperCase());
                              }
                            }}
                            className="w-full bg-[#121c2e] border border-cyan-500/50 rounded-lg px-2 py-1.5 text-white font-bold focus:border-cyan-400 focus:outline-none text-xs uppercase"
                          >
                            {PRODUCT_OPTIONS.map(p => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                            <option value="__custom__">+ Enter Custom Product...</option>
                          </select>
                        )}
                      </div>

                      {/* 2. Shift Hours (Style-wise) */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-cyan-400 text-[10px] font-black uppercase tracking-wider">
                            Shift Hours *
                          </label>
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="24"
                          required
                          placeholder="0.00"
                          value={style.shiftHours !== undefined ? style.shiftHours : ''}
                          onChange={e => {
                            const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                            updateStyle(style.id, 'shiftHours', val);
                          }}
                          className="w-full bg-[#121c2e] border border-cyan-500/50 rounded-lg px-2.5 py-1.5 text-cyan-300 font-mono font-bold focus:border-cyan-400 focus:outline-none text-xs"
                        />

                        {/* Button called "Hours Adjustments" */}
                        <button
                          type="button"
                          onClick={() => handleOpenHoursAdjustment(style.id)}
                          className={`mt-1.5 w-full flex items-center justify-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-bold border transition cursor-pointer ${
                            style.hoursAdjustment && style.hoursAdjustment !== 0
                              ? (style.hoursAdjustment > 0
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/80 hover:bg-emerald-900 shadow-sm'
                                  : 'bg-rose-950/80 text-rose-300 border-rose-500/80 hover:bg-rose-900 shadow-sm')
                              : 'bg-[#152238] text-cyan-300 border-cyan-700/60 hover:bg-cyan-950/70 hover:border-cyan-400'
                          }`}
                          title="Hours Adjustments: Add (+) or minus (-) hours to adjust worked minutes"
                        >
                          <Sliders className="w-3 h-3 text-cyan-400 shrink-0" />
                          <span className="truncate">
                            {style.hoursAdjustment && style.hoursAdjustment !== 0
                              ? `Adj: ${style.hoursAdjustment > 0 ? `+${style.hoursAdjustment}` : style.hoursAdjustment}h (${style.hoursAdjustment > 0 ? `+${style.hoursAdjustment * 60}` : style.hoursAdjustment * 60}m)`
                              : 'Hours Adjustments'}
                          </span>
                        </button>
                      </div>

                      {/* 3. Style Number */}
                      <div>
                        <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
                          Style Number *
                        </label>
                        <input
                          type="text"
                          required
                          list="style-suggestions-list"
                          placeholder="e.g. 26007L, SU 3409"
                          value={style.styleNumber}
                          onChange={e => updateStyle(style.id, 'styleNumber', e.target.value.toUpperCase())}
                          className="w-full bg-[#121c2e] border border-slate-700/70 rounded-lg px-2 py-1.5 text-white font-bold uppercase focus:border-cyan-500 focus:outline-none text-xs"
                        />
                      </div>

                      {/* 4. Brand */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider">
                            Brand *
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              const willBeCustom = !isCustomBrand(style.id, style.brand);
                              setCustomBrandRows(prev => ({
                                ...prev,
                                [style.id]: willBeCustom
                              }));
                            }}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer"
                          >
                            {isCustomBrand(style.id, style.brand) ? 'Pick from List' : '+ Custom'}
                          </button>
                        </div>
                        {isCustomBrand(style.id, style.brand) ? (
                          <input
                            type="text"
                            required
                            placeholder="CUSTOM BRAND"
                            value={style.brand}
                            onChange={e => updateStyle(style.id, 'brand', e.target.value.toUpperCase())}
                            className="w-full bg-[#121c2e] border border-slate-700/70 rounded-lg px-2 py-1.5 text-white font-medium uppercase focus:border-cyan-500 focus:outline-none text-xs"
                          />
                        ) : (
                          <select
                            value={style.brand || 'VANTAGE'}
                            onChange={e => {
                              if (e.target.value === '__custom__') {
                                setCustomBrandRows(prev => ({ ...prev, [style.id]: true }));
                              } else {
                                updateStyle(style.id, 'brand', e.target.value.toUpperCase());
                              }
                            }}
                            className="w-full bg-[#121c2e] border border-slate-700/70 rounded-lg px-2 py-1.5 text-white font-medium focus:border-cyan-500 focus:outline-none text-xs uppercase"
                          >
                            {BRAND_OPTIONS.map(b => (
                              <option key={b} value={b}>{b}</option>
                            ))}
                            <option value="__custom__">+ Enter Custom Brand...</option>
                          </select>
                        )}
                      </div>

                      {/* 5. SMV */}
                      <div>
                        <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">SMV (Mins) *</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          required
                          placeholder="0.00"
                          value={style.smv !== undefined ? style.smv : ''}
                          onChange={e => {
                            const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                            updateStyle(style.id, 'smv', val);
                          }}
                          className="w-full bg-[#121c2e] border border-slate-700/70 rounded-lg px-2 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none text-xs"
                        />
                      </div>

                      {/* 6. Planned Qty */}
                      <div>
                        <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">Planned Qty</label>
                        <input
                          type="number"
                          min="0"
                          value={style.plannedQty}
                          onChange={e => updateStyle(style.id, 'plannedQty', Number(e.target.value))}
                          className="w-full bg-[#121c2e] border border-slate-700/70 rounded-lg px-2 py-1.5 text-slate-300 font-mono focus:border-cyan-500 focus:outline-none text-xs"
                        />
                      </div>

                      {/* 7. Actual Qty */}
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-emerald-400 text-[10px] font-black uppercase tracking-wider mb-1">Actual Qty *</label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={style.actualQty}
                          onChange={e => updateStyle(style.id, 'actualQty', Number(e.target.value))}
                          className="w-full bg-[#121c2e] border border-emerald-500/60 rounded-lg px-2 py-1.5 text-emerald-300 font-bold font-mono focus:border-emerald-400 focus:outline-none text-xs"
                        />
                      </div>
                    </div>

                    {/* Real-time Downtime & Efficiency metrics for this style */}
                    <div className="pt-2 border-t border-[#1c2b44]/50 flex flex-wrap items-center justify-between gap-2 text-[11px] bg-[#121c2e]/60 p-2 rounded-lg">
                      <div className="flex flex-wrap items-center gap-3 font-mono">
                        <span className="text-slate-400 flex items-center gap-1.5">
                          Worked Minutes: <strong className="text-white">{calc.workedMins.toLocaleString()} min</strong>
                          {style.hoursAdjustment !== undefined && style.hoursAdjustment !== 0 && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono ${
                              style.hoursAdjustment > 0
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-600/70'
                                : 'bg-rose-950 text-rose-300 border border-rose-600/70'
                            }`}>
                              {style.hoursAdjustment > 0 ? `+${style.hoursAdjustment}h (+${style.hoursAdjustment * 60}m)` : `${style.hoursAdjustment}h (${style.hoursAdjustment * 60}m)`}
                            </span>
                          )}
                        </span>
                        <span className="text-slate-400">
                          Produced Minutes: <strong className="text-cyan-400">{calc.producedMins.toLocaleString()} min</strong>
                        </span>
                        <span className="text-slate-400 flex items-center gap-1">
                          Calculated Down Time: 
                          <strong className="text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.5 rounded font-bold">
                            {calc.downTime.toLocaleString()} mins
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-slate-400 text-[10px]">Projected Efficiency:</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                          calc.efficiency >= 75
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                            : calc.efficiency >= 60
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                        }`}>
                          {calc.efficiency}%
                        </span>

                        {/* Hours Adjustments button in metrics bar */}
                        <button
                          type="button"
                          onClick={() => handleOpenHoursAdjustment(style.id)}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border transition cursor-pointer ${
                            style.hoursAdjustment && style.hoursAdjustment !== 0
                              ? (style.hoursAdjustment > 0
                                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600/80 hover:bg-emerald-900 shadow-sm'
                                  : 'bg-rose-950/80 text-rose-300 border-rose-600/80 hover:bg-rose-900 shadow-sm')
                              : 'bg-[#0d1625] text-cyan-300 border-cyan-700/50 hover:bg-cyan-950/40 hover:border-cyan-400'
                          }`}
                          title="Hours Adjustments: Adjust worked minutes"
                        >
                          <Sliders className="w-3 h-3 text-cyan-400" />
                          <span>
                            {style.hoursAdjustment && style.hoursAdjustment !== 0
                              ? `Hours Adj (${style.hoursAdjustment > 0 ? `+${style.hoursAdjustment}` : style.hoursAdjustment}h)`
                              : 'Hours Adjustments'}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleOpenDowntimeBreakdown(style.id, style.styleNumber, style.product, style.brand, calc.downTime)}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border transition ${
                            (styleDowntimeBreakdowns[style.id] && styleDowntimeBreakdowns[style.id].length > 0)
                              ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/80 hover:bg-emerald-900'
                              : 'bg-[#0d1625] text-amber-300 border-amber-600/50 hover:bg-amber-950/40 hover:border-amber-500'
                          }`}
                          title="Add code-wise downtime breakdown for this style"
                        >
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>
                            {(styleDowntimeBreakdowns[style.id] && styleDowntimeBreakdowns[style.id].length > 0)
                              ? `Codes (${styleDowntimeBreakdowns[style.id].reduce((sum, b) => sum + b.downtimeMinutes, 0)}m)`
                              : `Breakdown Codes (${calc.downTime}m)`}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Categorized Code Badges for this style if entered */}
                    {styleDowntimeBreakdowns[style.id] && styleDowntimeBreakdowns[style.id].length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1.5 border-t border-slate-800 text-[10px] bg-[#0d1625]/40 px-2 py-1 rounded">
                        <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Categorized Codes:</span>
                        {styleDowntimeBreakdowns[style.id].map((b, bIdx) => (
                          <span key={bIdx} className="px-1.5 py-0.5 rounded bg-[#121c2e] text-cyan-300 border border-cyan-800/60 font-mono">
                            <strong>{b.categoryCode || b.downtimeCategory.split(' ')[0]}:</strong> {b.downtimeMinutes}m
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Datalist for style suggestions */}
              <datalist id="style-suggestions-list">
                {availableStyleSuggestions.map(st => (
                  <option key={st} value={st} />
                ))}
              </datalist>
            </div>

            {/* LIVE SHIFT TOTALS & DOWNTIME SUMMARY */}
            <div className="bg-[#0d1625] border border-[#1c2b44] rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-400 text-[11px] font-bold uppercase tracking-wider">
                  <Calculator className="w-3.5 h-3.5" />
                  <span>Shift Metrics & Downtime Formula Verification</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  Formula: Down_Time = Worked_Minutes - (Actual_QTY × SMV)
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs pt-1">
                <div className="p-2 rounded bg-[#121c2e] border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Total Actual Output</span>
                  <span className="text-emerald-400 font-mono font-bold text-sm">
                    {styles.reduce((acc, s) => acc + (Number(s.actualQty) || 0), 0).toLocaleString()} pcs
                  </span>
                </div>

                <div className="p-2 rounded bg-[#121c2e] border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Line Produced Mins</span>
                  <span className="text-cyan-400 font-mono font-bold text-sm">
                    {liveStyleCalculations.reduce((acc, c) => acc + c.producedMins, 0).toLocaleString()} min
                  </span>
                </div>

                <div className="p-2 rounded bg-[#121c2e] border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Line Worked Mins</span>
                  <span className="text-slate-300 font-mono font-bold text-sm">
                    {liveStyleCalculations.reduce((acc, c) => acc + c.workedMins, 0).toLocaleString()} min
                  </span>
                </div>

                <div className="p-2 rounded bg-[#121c2e] border border-amber-900/50">
                  <span className="text-[10px] text-amber-400 uppercase font-black block">Shift Down Time</span>
                  <span className="text-amber-400 font-mono font-bold text-sm">
                    {liveStyleCalculations.reduce((acc, c) => acc + c.downTime, 0).toLocaleString()} min
                  </span>
                </div>

                <div className="p-2 rounded bg-[#121c2e] border border-emerald-500/40">
                  <span className="text-[10px] text-emerald-400 uppercase font-black block">Line Efficiency</span>
                  <span className="text-emerald-300 font-mono font-bold text-sm">
                    {(() => {
                      const p = liveStyleCalculations.reduce((acc, c) => acc + c.producedMins, 0);
                      const w = liveStyleCalculations.reduce((acc, c) => acc + c.workedMins, 0);
                      return w > 0 ? `${((p / w) * 100).toFixed(1)}%` : '0.0%';
                    })()}
                  </span>
                </div>
              </div>
            </div>

            {/* SUBMIT BUTTON & SHEET SYNC INDICATOR */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[#1c2b44]">
              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                {getStoredSheetUrl() ? null : (
                  <span className="flex items-center gap-1.5 text-slate-400">
                    <FileSpreadsheet className="w-3.5 h-3.5 text-amber-400" />
                    <span>Google Sheet not linked. Entries save to Live Dashboard.</span>
                    {onOpenSheetModal && (
                      <button
                        type="button"
                        onClick={onOpenSheetModal}
                        className="text-cyan-400 hover:underline font-bold ml-1"
                      >
                        Link Sheet
                      </button>
                    )}
                  </span>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-sm shadow-sky-950 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Logging to Master Sheet...' : `Submit & Save ${styles.length} Style Log(s)`}</span>
              </button>
            </div>

          </div>

        </form>
      )}
      </>
      )}

      {/* Style Downtime Breakdown Modal */}
      {breakdownModalState && breakdownModalState.isOpen && (
        <StyleDowntimeBreakdownModal
          isOpen={breakdownModalState.isOpen}
          onClose={() => setBreakdownModalState(null)}
          styleNumber={breakdownModalState.styleNumber}
          product={breakdownModalState.product}
          brand={breakdownModalState.brand}
          factory={effectiveFactory}
          line={effectiveLine}
          supervisor={effectiveSupervisor}
          totalStyleDowntimeMinutes={breakdownModalState.downTimeMins}
          existingBreakdowns={styleDowntimeBreakdowns[breakdownModalState.styleId] || []}
          onSaveBreakdown={(logs) => handleSaveBreakdown(breakdownModalState.styleId, logs)}
        />
      )}

      {/* Hours Adjustment Modal */}
      {hoursAdjustmentModalState && hoursAdjustmentModalState.isOpen && (
        <HoursAdjustmentModal
          isOpen={hoursAdjustmentModalState.isOpen}
          onClose={() => setHoursAdjustmentModalState(null)}
          styleNumber={hoursAdjustmentModalState.styleNumber}
          productName={hoursAdjustmentModalState.product}
          presentTMs={presentTMs}
          shiftHours={hoursAdjustmentModalState.shiftHours}
          currentAdjustment={hoursAdjustmentModalState.currentAdjustment}
          currentReason={hoursAdjustmentModalState.currentReason}
          smv={hoursAdjustmentModalState.smv}
          actualQty={hoursAdjustmentModalState.actualQty}
          onApply={handleApplyHoursAdjustment}
        />
      )}
    </div>
  );
};
