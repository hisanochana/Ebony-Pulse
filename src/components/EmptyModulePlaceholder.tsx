import React from 'react';
import { ArrowLeft, Boxes, Layers, Clock, AlertCircle } from 'lucide-react';

interface EmptyModulePlaceholderProps {
  moduleName: 'Warehouse' | 'Other';
  onBackToHub: () => void;
  currentUserRole?: string;
}

export const EmptyModulePlaceholder: React.FC<EmptyModulePlaceholderProps> = ({
  moduleName,
  onBackToHub
}) => {
  const isWarehouse = moduleName === 'Warehouse';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Top Navigation Bar */}
      <div className="bg-[#0e1726] border border-[#1c2b44] rounded-xl p-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToHub}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#142136] hover:bg-[#1a2b47] text-slate-300 hover:text-white border border-[#223553] text-xs font-bold transition cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5 text-amber-400" />
            <span>Portal Hub</span>
          </button>
          <div className="h-4 w-px bg-slate-700/60 hidden sm:block"></div>
          <div className="flex items-center gap-2">
            {isWarehouse ? (
              <Boxes className="w-4 h-4 text-amber-400" />
            ) : (
              <Layers className="w-4 h-4 text-purple-400" />
            )}
            <span className="text-xs font-black uppercase text-white tracking-wider">
              {isWarehouse ? 'Warehouse Division' : 'Other Operations Division'}
            </span>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
          Module In Development
        </span>
      </div>

      {/* Main Empty State Content */}
      <div className="p-8 sm:p-12 rounded-2xl bg-[#0e1726]/80 border border-[#1c2b44] flex flex-col items-center justify-center text-center shadow-xl">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-400 mb-4 shadow-inner">
          {isWarehouse ? (
            <Boxes className="w-8 h-8 text-amber-400" />
          ) : (
            <Layers className="w-8 h-8 text-purple-400" />
          )}
        </div>

        <h2 className="text-xl font-black text-white tracking-tight mb-2">
          {isWarehouse ? 'Warehouse Management System' : 'Auxiliary & Other Services'}
        </h2>

        <p className="text-xs sm:text-sm text-slate-400 max-w-lg mb-6 leading-relaxed">
          {isWarehouse
            ? 'This module is reserved for raw materials intake, fabric roll inspection, trims tracking, and finished goods packing & export dispatch. Currently remaining empty as configured.'
            : 'This module is reserved for plant engineering utilities, steam boiler & pneumatic maintenance, quality assurance labs, and general administrative services. Currently remaining empty as configured.'}
        </p>

        <div className="p-3.5 rounded-xl bg-[#0a101d] border border-slate-800/80 max-w-md w-full mb-6 text-left">
          <div className="flex items-start gap-2.5 text-xs text-slate-300">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <span className="font-bold text-white block">Operational Status</span>
              <p className="text-[11px] text-slate-400">
                Shift logging and production tracking are currently handled in the{' '}
                <strong className="text-emerald-400">Factory</strong> division, and executive analytics under{' '}
                <strong className="text-cyan-400">Head Office</strong>.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onBackToHub}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white font-bold text-xs shadow-lg shadow-sky-950 transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Portal Hub</span>
        </button>
      </div>
    </div>
  );
};
