import React, { useState, useEffect } from 'react';
import { Sliders, X, Check, RotateCcw, Clock, Calculator } from 'lucide-react';

interface HoursAdjustmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  styleNumber: string;
  productName: string;
  presentTMs: number;
  shiftHours: number;
  currentAdjustment?: number;
  currentReason?: string;
  smv?: number;
  actualQty?: number;
  onApply: (adjustmentHours: number, reason?: string) => void;
}

export const HoursAdjustmentModal: React.FC<HoursAdjustmentModalProps> = ({
  isOpen,
  onClose,
  styleNumber,
  productName,
  presentTMs,
  shiftHours,
  currentAdjustment = 0,
  currentReason = '',
  smv = 0,
  actualQty = 0,
  onApply
}) => {
  const [sign, setSign] = useState<'+' | '-'>(currentAdjustment < 0 ? '-' : '+');
  const [hoursInput, setHoursInput] = useState<string>(
    currentAdjustment !== 0 ? Math.abs(currentAdjustment).toString() : ''
  );
  const [description, setDescription] = useState<string>(currentReason || '');

  useEffect(() => {
    if (isOpen) {
      setSign(currentAdjustment < 0 ? '-' : '+');
      setHoursInput(currentAdjustment !== 0 ? Math.abs(currentAdjustment).toString() : '');
      setDescription(currentReason || '');
    }
  }, [isOpen, currentAdjustment, currentReason]);

  if (!isOpen) return null;

  const numHours = parseFloat(hoursInput) || 0;
  const signedAdjustment = sign === '+' ? numHours : -numHours;
  const adjustmentMinutes = signedAdjustment * 60;

  // Mathematics
  const baseWorkedMins = Math.round((Number(presentTMs) || 0) * (Number(shiftHours) || 0) * 60);
  const adjustedWorkedMins = Math.max(0, Math.round(baseWorkedMins + adjustmentMinutes));
  const producedMins = Math.round((Number(actualQty) || 0) * (Number(smv) || 0));
  const adjustedDownTime = Math.max(0, adjustedWorkedMins - producedMins);
  const adjustedEfficiency = adjustedWorkedMins > 0
    ? Number(((producedMins / adjustedWorkedMins) * 100).toFixed(1))
    : 0;

  const handleApply = () => {
    onApply(signedAdjustment, description.trim());
    onClose();
  };

  const handleReset = () => {
    setHoursInput('');
    setSign('+');
    setDescription('');
    onApply(0, '');
    onClose();
  };

  const quickPresets = [0.5, 1.0, 1.5, 2.0, 2.5, 3.0];
  const commonReasons = ['Overtime', 'Power Cut', 'Machine Breakdown', 'Late Start', 'Early Stop', 'Training'];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-[#0b1322] border border-cyan-500/50 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-[#0f1b2d] border-b border-[#1c2c47] p-3.5 sm:p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-950/90 border border-cyan-500/50 flex items-center justify-center text-cyan-400">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                  Hours Adjustments
                </h3>
                {numHours > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold border ${
                    sign === '+' 
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700/60' 
                      : 'bg-rose-950 text-rose-300 border-rose-700/60'
                  }`}>
                    {sign}{numHours}h ({sign === '+' ? `+${numHours * 60}` : `-${numHours * 60}`}m)
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400">
                Style: <strong className="text-white uppercase">{styleNumber || 'Current'}</strong> • {productName || 'SHIRT BG'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-4 sm:p-5 space-y-3.5 text-xs">
          {/* 1. Sign Selection */}
          <div>
            <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1.5">
              Adjustment Type *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setSign('+')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border font-bold text-xs transition cursor-pointer ${
                  sign === '+'
                    ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300 shadow-sm ring-1 ring-emerald-500/50'
                    : 'bg-[#121c2e] border-slate-700/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${
                  sign === '+' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}>
                  +
                </span>
                <span>PLUS (+)</span>
              </button>

              <button
                type="button"
                onClick={() => setSign('-')}
                className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border font-bold text-xs transition cursor-pointer ${
                  sign === '-'
                    ? 'bg-rose-950/90 border-rose-500 text-rose-300 shadow-sm ring-1 ring-rose-500/50'
                    : 'bg-[#121c2e] border-slate-700/80 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-black ${
                  sign === '-' ? 'bg-rose-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}>
                  -
                </span>
                <span>MINUS (-)</span>
              </button>
            </div>
          </div>

          {/* 2. Hours Amount Input */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider">
                Hours Amount *
              </label>
              {numHours > 0 && (
                <span className={`text-[10px] font-mono font-bold ${sign === '+' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {sign === '+' ? `+${numHours * 60}` : `-${numHours * 60}`} min to Worked Minutes
                </span>
              )}
            </div>

            <div className="relative">
              <div className={`absolute left-3 top-1/2 -translate-y-1/2 font-black font-mono text-sm ${
                sign === '+' ? 'text-emerald-400' : 'text-rose-400'
              }`}>
                {sign}
              </div>
              <input
                type="number"
                step="0.1"
                min="0"
                max="24"
                placeholder="0.00"
                value={hoursInput}
                onChange={e => setHoursInput(e.target.value)}
                className="w-full bg-[#121c2e] border border-cyan-500/60 rounded-xl pl-7 pr-16 py-2 text-white font-mono font-bold text-sm focus:border-cyan-400 focus:outline-none"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Hours
              </span>
            </div>

            {/* Quick Chips */}
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {quickPresets.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setHoursInput(preset.toString())}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border transition cursor-pointer ${
                    numHours === preset
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                      : 'bg-[#121c2e] border-slate-700 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {sign}{preset}h
                </button>
              ))}
            </div>
          </div>

          {/* 3. Description Option */}
          <div>
            <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
              Description / Reason (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Overtime extension, Power outage, Late line start..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full bg-[#121c2e] border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:border-cyan-400 focus:outline-none placeholder:text-slate-500"
            />
            {/* Quick reason suggestions */}
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <span className="text-[9px] text-slate-500 uppercase font-bold mr-1">Suggestions:</span>
              {commonReasons.map(reason => (
                <button
                  key={reason}
                  type="button"
                  onClick={() => setDescription(reason)}
                  className={`px-1.5 py-0.5 rounded text-[9px] font-medium border transition cursor-pointer ${
                    description === reason
                      ? 'bg-cyan-950 border-cyan-600 text-cyan-300'
                      : 'bg-[#0f1826] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Live Calculation Summary */}
          <div className="bg-[#0f1b2d] border border-[#1e304d] rounded-xl p-3 space-y-1.5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-1.5 rounded-lg bg-[#14233a] border border-slate-800">
                <span className="text-[9px] text-slate-400 uppercase font-black block">Base</span>
                <span className="font-mono font-bold text-slate-300 text-xs">{baseWorkedMins.toLocaleString()}m</span>
              </div>

              <div className={`p-1.5 rounded-lg border ${
                numHours === 0 
                  ? 'bg-[#14233a] border-slate-800 text-slate-400' 
                  : sign === '+' 
                    ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300' 
                    : 'bg-rose-950/60 border-rose-700/60 text-rose-300'
              }`}>
                <span className="text-[9px] uppercase font-black block">Adj (hrs × 60)</span>
                <span className="font-mono font-bold text-xs">
                  {numHours > 0 ? (sign === '+' ? `+${numHours * 60}m` : `-${numHours * 60}m`) : '0m'}
                </span>
              </div>

              <div className="p-1.5 rounded-lg bg-cyan-950/60 border border-cyan-700/60">
                <span className="text-[9px] text-cyan-300 uppercase font-black block">Final Worked</span>
                <span className="font-mono font-black text-cyan-200 text-xs">{adjustedWorkedMins.toLocaleString()}m</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#1c2c47]/60 text-slate-400 font-mono">
              <span>Down Time: <strong className="text-amber-400">{adjustedDownTime.toLocaleString()}m</strong></span>
              <span>Efficiency: <strong className={adjustedEfficiency >= 75 ? 'text-emerald-400' : adjustedEfficiency >= 60 ? 'text-amber-400' : 'text-rose-400'}>{adjustedEfficiency}%</strong></span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition text-xs cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Clear</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 font-bold transition text-xs cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleApply}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-600 to-sky-600 hover:from-cyan-500 hover:to-sky-500 text-white font-black shadow-md transition text-xs cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Apply</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
