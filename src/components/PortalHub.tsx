import React from 'react';
import {
  Building2,
  Factory,
  Boxes,
  Layers
} from 'lucide-react';
import { User } from '../types';

interface PortalHubProps {
  currentUser: User | null;
  onSelectHeadOffice: () => void;
  onSelectFactory: () => void;
  onSelectWarehouse: () => void;
  onSelectOther: () => void;
  logsCount?: number;
  downtimeCount?: number;
  usersCount?: number;
}

export const PortalHub: React.FC<PortalHubProps> = ({
  currentUser,
  onSelectHeadOffice,
  onSelectFactory,
  onSelectWarehouse,
  onSelectOther
}) => {
  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto py-4">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0d1627] via-[#111e33] to-[#0a1221] border border-[#1c2b44] p-6 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400">
                Ebony Pulse
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Welcome, {currentUser?.username || 'User'}
            </h1>
          </div>

          {/* User Badge Info */}
          <div className="flex items-center gap-3 bg-[#090f1b]/80 border border-slate-700/60 p-3 rounded-xl shrink-0">
            <div className="space-y-0.5 text-right">
              <div className="flex items-center justify-end gap-1.5">
                <span className="text-xs font-black text-white capitalize">
                  {currentUser?.role || 'Guest'}
                </span>
                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 font-bold border border-cyan-800">
                  {currentUser?.factory === 'ALL' ? 'Central HQ' : currentUser?.factory}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                {currentUser?.username ? `@${currentUser.username}` : 'Unauthenticated'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4 Division Tiles: Name and Icon only */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        
        {/* TILE 1: HEAD OFFICE */}
        <button
          type="button"
          onClick={onSelectHeadOffice}
          className="group relative rounded-2xl bg-[#0e1726] border border-[#1c2b44] hover:border-cyan-400 p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-xl hover:shadow-cyan-950/40 hover:-translate-y-1 cursor-pointer"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 group-hover:bg-cyan-500/20 group-hover:border-cyan-400 transition-all shadow-md mb-4">
            <Building2 className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <span className="text-base sm:text-lg font-black text-white group-hover:text-cyan-300 transition-colors tracking-tight">
            Head Office
          </span>
        </button>

        {/* TILE 2: FACTORY */}
        <button
          type="button"
          onClick={onSelectFactory}
          className="group relative rounded-2xl bg-[#0e1726] border border-[#1c2b44] hover:border-emerald-400 p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-xl hover:shadow-emerald-950/40 hover:-translate-y-1 cursor-pointer"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 group-hover:bg-emerald-500/20 group-hover:border-emerald-400 transition-all shadow-md mb-4">
            <Factory className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <span className="text-base sm:text-lg font-black text-white group-hover:text-emerald-300 transition-colors tracking-tight">
            Factory
          </span>
        </button>

        {/* TILE 3: WAREHOUSE */}
        <button
          type="button"
          onClick={onSelectWarehouse}
          className="group relative rounded-2xl bg-[#0e1726] border border-[#1c2b44] hover:border-amber-400 p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-xl hover:shadow-amber-950/40 hover:-translate-y-1 cursor-pointer"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 group-hover:bg-amber-500/20 group-hover:border-amber-400 transition-all shadow-md mb-4">
            <Boxes className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <span className="text-base sm:text-lg font-black text-white group-hover:text-amber-300 transition-colors tracking-tight">
            Warehouse
          </span>
        </button>

        {/* TILE 4: OTHER */}
        <button
          type="button"
          onClick={onSelectOther}
          className="group relative rounded-2xl bg-[#0e1726] border border-[#1c2b44] hover:border-purple-400 p-6 sm:p-8 flex flex-col items-center justify-center text-center transition-all duration-200 hover:shadow-xl hover:shadow-purple-950/40 hover:-translate-y-1 cursor-pointer"
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 group-hover:scale-110 group-hover:bg-purple-500/20 group-hover:border-purple-400 transition-all shadow-md mb-4">
            <Layers className="w-8 h-8 sm:w-10 sm:h-10" />
          </div>
          <span className="text-base sm:text-lg font-black text-white group-hover:text-purple-300 transition-colors tracking-tight">
            Other
          </span>
        </button>

      </div>
    </div>
  );
};
