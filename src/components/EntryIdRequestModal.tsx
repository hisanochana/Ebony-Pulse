import React, { useState, useEffect } from 'react';
import {
  X,
  Search,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit3,
  FileSpreadsheet,
  Clock,
  User as UserIcon,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Layers,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import { ProductionLog, User } from '../types';
import { submitChangeRequest } from '../services/googleSheetService';

interface EntryIdRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: ProductionLog[];
  currentUser: User;
  onRequestSubmitted?: () => void;
  initialEntryId?: string;
}

export const EntryIdRequestModal: React.FC<EntryIdRequestModalProps> = ({
  isOpen,
  onClose,
  logs,
  currentUser,
  onRequestSubmitted,
  initialEntryId = ''
}) => {
  const [searchEntryId, setSearchEntryId] = useState(initialEntryId);
  const [searchedId, setSearchedId] = useState(initialEntryId);
  const [matchedLog, setMatchedLog] = useState<ProductionLog | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [activeTab, setActiveTab] = useState<'AMEND' | 'DELETE'>('AMEND');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Amendment form state
  const [amendForm, setAmendForm] = useState<{
    Actual_QTY: number;
    Planned_QTY: number;
    SMV: number;
    Present_TMs: number;
    Hours_Worked: number;
    Down_Time: number;
    Supervisor: string;
    Style: string;
    Product: string;
    Brand: string;
    Remarks: string;
  }>({
    Actual_QTY: 0,
    Planned_QTY: 0,
    SMV: 0,
    Present_TMs: 0,
    Hours_Worked: 9,
    Down_Time: 0,
    Supervisor: '',
    Style: '',
    Product: '',
    Brand: '',
    Remarks: ''
  });

  useEffect(() => {
    if (initialEntryId) {
      setSearchEntryId(initialEntryId);
      handleSearch(initialEntryId);
    }
  }, [initialEntryId, isOpen]);

  const handleSearch = (idToSearch?: string) => {
    const targetId = (idToSearch !== undefined ? idToSearch : searchEntryId).trim();
    setSearchedId(targetId);
    setHasSearched(true);
    setFeedback(null);

    if (!targetId) {
      setMatchedLog(null);
      return;
    }

    const found = logs.find(
      l => String(l.Entry_ID || '').trim().toLowerCase() === targetId.toLowerCase()
    );

    if (found) {
      setMatchedLog(found);
      setAmendForm({
        Actual_QTY: Number(found.Actual_QTY) || 0,
        Planned_QTY: Number(found.Planned_QTY) || 0,
        SMV: Number(found.SMV) || 0,
        Present_TMs: Number(found.Present_TMs) || 0,
        Hours_Worked: Number(found.Hours_Worked) || 9,
        Down_Time: Number(found.Down_Time) || 0,
        Supervisor: found.Supervisor || '',
        Style: found.Style || '',
        Product: found.Product || '',
        Brand: found.Brand || '',
        Remarks: found.Remarks || ''
      });
    } else {
      setMatchedLog(null);
    }
  };

  if (!isOpen) return null;

  // Authorization check: User can only request for allocated factory
  const isAuthorized =
    matchedLog &&
    (currentUser.role === 'admin' ||
      currentUser.factory === 'ALL' ||
      matchedLog.Factory.toLowerCase() === currentUser.factory.toLowerCase());

  // Dynamic live calculation of amended values
  const revActualQty = Number(amendForm.Actual_QTY) || 0;
  const revSMV = Number(amendForm.SMV) || 0;
  const revProducedMins = Math.round(revActualQty * revSMV);
  const revPresentTMs = Number(amendForm.Present_TMs) || 0;
  const revHoursWorked = Number(amendForm.Hours_Worked) || 0;
  const revWorkedMins = Math.round(revPresentTMs * revHoursWorked * 60);
  const revEfficiency =
    revWorkedMins > 0 ? Number(((revProducedMins / revWorkedMins) * 100).toFixed(1)) : 0;

  const origActualQty = matchedLog ? Number(matchedLog.Actual_QTY) || 0 : 0;
  const origSMV = matchedLog ? Number(matchedLog.SMV) || 0 : 0;
  const origProducedMins = matchedLog ? Number(matchedLog.Produced_Minutes) || Math.round(origActualQty * origSMV) : 0;
  const origWorkedMins = matchedLog ? Number(matchedLog.Worked_Minutes) || 0 : 0;
  const origEfficiency =
    origWorkedMins > 0 ? Number(((origProducedMins / origWorkedMins) * 100).toFixed(1)) : 0;

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matchedLog) return;

    if (!isAuthorized) {
      setFeedback({
        success: false,
        message: `Unauthorized: You are assigned to ${currentUser.factory}. You can only submit requests for ${currentUser.factory} factory data.`
      });
      return;
    }

    if (!reason.trim()) {
      setFeedback({
        success: false,
        message: 'Please provide a clear reason describing why this record should be amended or deleted.'
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await submitChangeRequest({
        type: activeTab === 'DELETE' ? 'DELETE' : 'EDIT',
        entryId: matchedLog.Entry_ID,
        logSnapshot: matchedLog,
        proposedChanges: activeTab === 'AMEND' ? amendForm : null,
        reason: reason.trim(),
        requestedBy: currentUser.username,
        status: 'PENDING'
      });

      if (res.success) {
        setFeedback({
          success: true,
          message: `Request for Entry ID "${matchedLog.Entry_ID}" submitted to Administrator! Once approved, the changes will be applied to the system and updated directly in the Google Sheet.`
        });
        setReason('');
        if (onRequestSubmitted) {
          onRequestSubmitted();
        }
      } else {
        setFeedback({
          success: false,
          message: res.message || 'Failed to submit request to server.'
        });
      }
    } catch (err: any) {
      setFeedback({
        success: false,
        message: err.message || 'Network error while submitting change request.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto animate-fade-in">
      <div className="relative w-full max-w-4xl bg-[#121c2e] border border-[#1c2b44] rounded-2xl shadow-2xl p-6 text-slate-100 my-8">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-5">
          <div className="flex items-center gap-2 text-cyan-400 font-black text-xs uppercase tracking-widest mb-1">
            <span className="w-1.5 h-3.5 bg-cyan-400 rounded-full"></span>
            <FileSpreadsheet className="w-4 h-4" />
            <span>Audit & Verification Workflow</span>
          </div>
          <h2 className="text-base sm:text-lg font-black uppercase text-white tracking-wide">
            Data Delete or Amend Request by Entry ID
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Look up any shift record using its unique <strong className="text-cyan-300">Entry ID</strong>.
            Operators can request data amendments or deletions exclusively for their allocated factory (
            <span className="text-amber-300 font-semibold">{currentUser.factory}</span>). Approved
            requests automatically synchronize to the master Google Sheet.
          </p>
        </div>

        {/* Search Bar */}
        <div className="bg-[#0d1625] border border-slate-700/70 rounded-xl p-4 mb-5">
          <label className="block text-[11px] font-black uppercase tracking-wider text-slate-300 mb-2">
            Enter Entry ID
          </label>
          <form
            onSubmit={e => {
              e.preventDefault();
              handleSearch();
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchEntryId}
                onChange={e => setSearchEntryId(e.target.value)}
                placeholder="e.g. EB-20260828-BG-01, 14, or copy from table"
                className="w-full bg-[#162338] border border-slate-700 rounded-lg pl-10 pr-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none font-mono"
              />
            </div>
            <button
              type="submit"
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold px-5 py-2 rounded-lg text-xs tracking-wider uppercase transition flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <Search className="w-4 h-4" />
              <span>Find Entry</span>
            </button>
          </form>

          {/* Search hint */}
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 font-mono">
            <span>Total local records loaded: {logs.length.toLocaleString()}</span>
            <span>Your allocated factory: <span className="text-amber-400 font-sans font-bold">{currentUser.factory}</span></span>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mb-5 p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
              feedback.success
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
            }`}
          >
            {feedback.success ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            )}
            <div>
              <span className="font-bold">{feedback.success ? 'Request Sent: ' : 'Attention: '}</span>
              <span>{feedback.message}</span>
            </div>
          </div>
        )}

        {/* Search Result Display */}
        {hasSearched && !matchedLog && (
          <div className="text-center py-10 bg-[#0d1625]/60 border border-dashed border-slate-800 rounded-xl">
            <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2 opacity-80" />
            <p className="text-sm font-bold text-slate-300">No Production Entry Found</p>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              We couldn't find an entry matching &ldquo;{searchedId}&rdquo;. Please verify the Entry ID
              from the Master Sheet table.
            </p>
          </div>
        )}

        {matchedLog && (
          <div className="space-y-5">
            {/* Factory Authorization Banner */}
            {!isAuthorized ? (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-600/50 text-rose-300 text-xs flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-200 uppercase tracking-wide">
                    Factory Authorization Restricted
                  </h4>
                  <p className="text-[11px] text-rose-300/90 mt-0.5 leading-relaxed">
                    This entry is recorded under <strong>{matchedLog.Factory}</strong>. Your account is
                    allocated strictly to <strong>{currentUser.factory}</strong>. As per apparel security
                    policy, operators can only submit amendment or deletion requests for their own allocated
                    factory data.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-2.5 rounded-xl bg-cyan-950/30 border border-cyan-700/40 text-cyan-300 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                  <span>
                    Verified Entry for <strong>{matchedLog.Factory}</strong> factory &mdash; You are authorized to submit change requests for this record.
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-cyan-900/60 font-mono font-bold">
                  {matchedLog.Entry_ID}
                </span>
              </div>
            )}

            {/* Current Recorded Snapshot Card */}
            <div className="bg-[#0d1625] border border-slate-800 rounded-xl p-4">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                    Recorded Shift Data Under ID: {matchedLog.Entry_ID}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-slate-400 font-mono">Date: {matchedLog.Date}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
                    Line {matchedLog.Line}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-xs">
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Factory</span>
                  <span className="font-bold text-white">{matchedLog.Factory}</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Style</span>
                  <span className="font-bold text-cyan-300 font-mono">{matchedLog.Style}</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Product</span>
                  <span className="font-medium text-slate-200">{matchedLog.Product}</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Brand</span>
                  <span className="font-medium text-slate-200">{matchedLog.Brand}</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">SMV</span>
                  <span className="font-bold text-white font-mono">{matchedLog.SMV}</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Actual QTY</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">{matchedLog.Actual_QTY}</span>
                </div>

                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Planned QTY</span>
                  <span className="font-mono text-slate-300">{matchedLog.Planned_QTY}</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Present TMs</span>
                  <span className="font-mono text-white">{matchedLog.Present_TMs}</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Hours Worked</span>
                  <span className="font-mono text-white">{matchedLog.Hours_Worked}h</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Worked Mins</span>
                  <span className="font-mono text-slate-300">{matchedLog.Worked_Minutes}m</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Produced Mins</span>
                  <span className="font-mono text-cyan-300">{matchedLog.Produced_Minutes}m</span>
                </div>
                <div className="p-2 bg-[#121c2e] rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase font-black block">Efficiency</span>
                  <span className="font-mono text-emerald-400 font-bold">{origEfficiency}%</span>
                </div>
              </div>

              {matchedLog.Remarks && (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-500">Remarks: </span>
                  <span>{matchedLog.Remarks}</span>
                </div>
              )}
            </div>

            {/* Action Tabs: AMEND vs DELETE */}
            <div className="border border-slate-700/80 rounded-xl p-5 bg-[#0d1625]">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-800 pb-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('AMEND')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeTab === 'AMEND'
                      ? 'bg-cyan-500 text-white shadow-md shadow-cyan-950'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Request Data Amendment</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('DELETE')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeTab === 'DELETE'
                      ? 'bg-rose-600 text-white shadow-md shadow-rose-950'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Request Full Deletion</span>
                </button>
              </div>

              <form onSubmit={handleSubmitRequest} className="space-y-4">
                {activeTab === 'AMEND' ? (
                  <>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                          Actual QTY (Output)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={amendForm.Actual_QTY}
                          onChange={e =>
                            setAmendForm({ ...amendForm, Actual_QTY: Number(e.target.value) || 0 })
                          }
                          disabled={!isAuthorized}
                          className="w-full bg-[#162338] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-emerald-300 font-mono font-bold focus:border-cyan-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                          Planned QTY (Target)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={amendForm.Planned_QTY}
                          onChange={e =>
                            setAmendForm({ ...amendForm, Planned_QTY: Number(e.target.value) || 0 })
                          }
                          disabled={!isAuthorized}
                          className="w-full bg-[#162338] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                          SMV
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={amendForm.SMV}
                          onChange={e =>
                            setAmendForm({ ...amendForm, SMV: Number(e.target.value) || 0 })
                          }
                          disabled={!isAuthorized}
                          className="w-full bg-[#162338] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                          Present TMs
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={amendForm.Present_TMs}
                          onChange={e =>
                            setAmendForm({ ...amendForm, Present_TMs: Number(e.target.value) || 0 })
                          }
                          disabled={!isAuthorized}
                          className="w-full bg-[#162338] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                          Hours Worked
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          max="24"
                          value={amendForm.Hours_Worked}
                          onChange={e =>
                            setAmendForm({ ...amendForm, Hours_Worked: Number(e.target.value) || 0 })
                          }
                          disabled={!isAuthorized}
                          className="w-full bg-[#162338] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:border-cyan-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                          Downtime (Minutes)
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={amendForm.Down_Time}
                          onChange={e =>
                            setAmendForm({ ...amendForm, Down_Time: Number(e.target.value) || 0 })
                          }
                          disabled={!isAuthorized}
                          className="w-full bg-[#162338] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-amber-300 font-mono focus:border-cyan-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                          Supervisor
                        </label>
                        <input
                          type="text"
                          value={amendForm.Supervisor}
                          onChange={e => setAmendForm({ ...amendForm, Supervisor: e.target.value })}
                          disabled={!isAuthorized}
                          className="w-full bg-[#162338] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">
                          Style
                        </label>
                        <input
                          type="text"
                          value={amendForm.Style}
                          onChange={e => setAmendForm({ ...amendForm, Style: e.target.value })}
                          disabled={!isAuthorized}
                          className="w-full bg-[#162338] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-cyan-300 font-mono focus:border-cyan-500 focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Live Recalculation Preview Box */}
                    <div className="p-3 bg-[#162338]/80 border border-cyan-800/40 rounded-xl">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-cyan-400 mb-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Dynamic Recalculation Preview with Proposed Changes</span>
                      </div>
                      <div className="grid grid-cols-3 gap-3 text-xs">
                        <div className="p-2 rounded bg-[#0d1625] border border-slate-800">
                          <span className="text-[10px] text-slate-500 block">Produced Minutes</span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-slate-400 line-through text-[11px]">{origProducedMins}m</span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="text-cyan-300 font-bold">{revProducedMins}m</span>
                          </div>
                        </div>

                        <div className="p-2 rounded bg-[#0d1625] border border-slate-800">
                          <span className="text-[10px] text-slate-500 block">Worked Minutes</span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-slate-400 line-through text-[11px]">{origWorkedMins}m</span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="text-white font-bold">{revWorkedMins}m</span>
                          </div>
                        </div>

                        <div className="p-2 rounded bg-[#0d1625] border border-slate-800">
                          <span className="text-[10px] text-slate-500 block">Calculated Efficiency</span>
                          <div className="flex items-center gap-1.5 font-mono">
                            <span className="text-slate-400 line-through text-[11px]">{origEfficiency}%</span>
                            <ArrowRight className="w-3 h-3 text-slate-600" />
                            <span className="text-emerald-400 font-bold">{revEfficiency}%</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="p-4 bg-rose-950/20 border border-rose-900/40 rounded-xl space-y-2 text-xs text-rose-200">
                    <div className="flex items-center gap-2 font-bold text-rose-300">
                      <Trash2 className="w-4 h-4 text-rose-400" />
                      <span>Entire Entry Deletion Request</span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Submitting this request will propose the permanent removal of record{' '}
                      <strong className="text-white font-mono">{matchedLog.Entry_ID}</strong> ({matchedLog.Date}, {matchedLog.Factory} Line {matchedLog.Line}, Style {matchedLog.Style}).
                    </p>
                    <p className="text-[11px] text-rose-400 font-semibold">
                      Once the Central Administrator approves this request, this entry will be deleted from the system and erased from the connected Google Sheet.
                    </p>
                  </div>
                )}

                {/* Reason Input */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-300 mb-1">
                    Reason for Request (Required for Central Admin Audit Trail) *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    disabled={!isAuthorized}
                    placeholder={
                      activeTab === 'AMEND'
                        ? 'e.g. End of shift recount verified 480 pieces instead of 450; SMV updated according to GSD sheet.'
                        : 'e.g. Duplicate entry submitted by mistake during shift transition.'
                    }
                    className="w-full bg-[#162338] border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder:text-slate-500 focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Submission Button */}
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-lg text-xs text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmitting || !isAuthorized}
                    className={`px-6 py-2 rounded-lg text-xs font-bold tracking-wider uppercase transition flex items-center gap-2 cursor-pointer shadow-lg ${
                      !isAuthorized
                        ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
                        : activeTab === 'DELETE'
                        ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-950'
                        : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950'
                    }`}
                  >
                    {activeTab === 'DELETE' ? (
                      <Trash2 className="w-4 h-4" />
                    ) : (
                      <Edit3 className="w-4 h-4" />
                    )}
                    <span>
                      {isSubmitting
                        ? 'Sending to Admin...'
                        : activeTab === 'DELETE'
                        ? 'Submit Deletion Request to Admin'
                        : 'Submit Amendment Request to Admin'}
                    </span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
