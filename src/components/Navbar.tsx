import React, { useState } from 'react';
import {
  LogOut,
  User as UserIcon,
  Lock,
  ShieldCheck,
  Shield,
  Sun,
  Moon,
  Clock,
  X,
  RefreshCw,
  Check,
  LayoutGrid
} from 'lucide-react';
import { User, UserRole } from '../types';
import { useTheme } from '../context/ThemeContext';
import { requestServerRoleChange } from '../services/googleSheetService';

export type NavTabType =
  | 'HUB'
  | 'DASHBOARD'
  | 'PRODUCTION_STATUS'
  | 'ENTRY_FORM'
  | 'MASTER_SHEET'
  | 'APPS_SCRIPT'
  | 'WAREHOUSE'
  | 'OTHER';

interface NavbarProps {
  activeTab: NavTabType;
  setActiveTab: (tab: NavTabType) => void;
  currentUser: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenSheetModal?: () => void;
  isSheetConfigured?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onOpenAuth,
  onLogout,
  onOpenSheetModal,
  isSheetConfigured
}) => {
  const { theme, toggleTheme } = useTheme();

  // Role Checks
  const isOperator = currentUser?.role === 'operator';
  const isViewer = currentUser?.role === 'viewer';

  // Role Change Request state
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [requestedRole, setRequestedRole] = useState<UserRole>('supervisor');
  const [roleReason, setRoleReason] = useState('');
  const [isSubmittingRole, setIsSubmittingRole] = useState(false);
  const [roleNotice, setRoleNotice] = useState<string | null>(null);

  const handleSubmitRoleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    setIsSubmittingRole(true);
    try {
      const res = await requestServerRoleChange(currentUser.username, requestedRole, roleReason);
      if (res.success) {
        currentUser.pendingRoleChange = {
          requestedRole,
          requestedAt: new Date().toISOString(),
          reason: roleReason
        };
        setRoleNotice(`Role change request to "${requestedRole}" submitted for Central Administrator approval.`);
        setTimeout(() => {
          setIsRoleModalOpen(false);
          setRoleNotice(null);
        }, 2200);
      } else {
        alert(res.message || 'Failed to submit role change request.');
      }
    } catch (err: any) {
      alert(`Error submitting request: ${err.message}`);
    } finally {
      setIsSubmittingRole(false);
    }
  };

  return (
    <header className="border-b border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 bg-[#0b1320]/95 dark:bg-[#0b1320]/95 light:bg-white/95 backdrop-blur-md sticky top-0 z-40 px-4 py-3 sm:px-6 transition-colors">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        
        {/* Logo & Identity - Clicking opens Portal Hub */}
        <div
          onClick={() => setActiveTab('HUB')}
          className="flex items-center gap-3 cursor-pointer select-none group"
          title="Return to Portal Hub"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-700/60 p-1 flex items-center justify-center shadow-md overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
            <img
              src="/ebony_holdings_logo.jpg"
              alt="Ebony Holdings (Pvt) Ltd."
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white dark:text-white light:text-slate-900 tracking-tighter group-hover:text-cyan-400 transition-colors">
                Ebony Holdings
              </h1>
              <span className="bg-cyan-950 dark:bg-cyan-950 light:bg-cyan-100 text-cyan-400 dark:text-cyan-400 light:text-cyan-800 border border-cyan-800/80 dark:border-cyan-800/80 light:border-cyan-300 text-[10px] font-black uppercase px-2 py-0.5 rounded tracking-widest">
                Apparel Live
              </span>
            </div>
            <p className="text-[10px] text-slate-400 dark:text-slate-400 light:text-slate-600 font-medium leading-none mt-1">
              Integrated Executive Manufacturing Intelligence
            </p>
          </div>
        </div>

        {/* Navigation Tabs & Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
          
          {/* Top Navigation - Portal Hub Button */}
          <div className="flex items-center bg-[#0e1726] dark:bg-[#0e1726] light:bg-slate-100 p-1 rounded-xl border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-300 text-xs font-bold">
            <button
              id="nav-tab-hub"
              type="button"
              onClick={() => setActiveTab('HUB')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'HUB'
                  ? 'bg-sky-500 text-white font-black shadow-md shadow-sky-950'
                  : 'text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-slate-200 dark:hover:text-white light:hover:text-slate-900 hover:bg-[#121c2e] dark:hover:bg-[#121c2e] light:hover:bg-slate-200'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Portal Hub</span>
            </button>
          </div>

          {/* Theme Toggle Button (Dark / Light) */}
          <button
            id="btn-theme-toggle"
            type="button"
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-300 bg-[#0e1726] dark:bg-[#0e1726] light:bg-slate-100 text-slate-300 dark:text-slate-300 light:text-slate-700 hover:text-white dark:hover:text-white light:hover:text-slate-900 transition shadow-sm text-xs font-bold"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Light</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-sky-400" />
                <span className="hidden sm:inline">Dark</span>
              </>
            )}
          </button>

          {/* User Auth Section */}
          <div className="flex items-center gap-2">
            {currentUser ? (
              <div className="flex items-center gap-2 bg-[#121c2e] dark:bg-[#121c2e] light:bg-slate-100 border border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-300 rounded-xl px-2.5 py-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-slate-900 dark:bg-slate-900 light:bg-white border border-slate-800 dark:border-slate-800 light:border-slate-300 px-2.5 py-1 rounded-full text-[10px] font-bold text-emerald-400 dark:text-emerald-400 light:text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    <span>
                      {currentUser.factory === 'ALL'
                        ? 'All Plants'
                        : `${currentUser.factory} Plant`}
                    </span>
                  </div>
                  <div className="bg-slate-800 dark:bg-slate-800 light:bg-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-300 dark:text-slate-300 light:text-slate-700 flex items-center gap-1.5">
                    <span className="capitalize">{currentUser.role}</span>: {currentUser.username}
                  </div>

                  {currentUser.role !== 'admin' && (
                    currentUser.pendingRoleChange ? (
                      <span
                        className="bg-amber-500/10 border border-amber-500/40 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0"
                        title={`Requested: ${currentUser.pendingRoleChange.requestedRole} - Awaiting Administrator approval`}
                      >
                        <Clock className="w-2.5 h-2.5 animate-pulse text-amber-400" />
                        <span>Role Change Pending</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsRoleModalOpen(true)}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 hover:underline px-1 cursor-pointer font-semibold shrink-0"
                        title="Submit request to change role"
                      >
                        Request Role Change
                      </button>
                    )
                  )}
                </div>

                <button
                  id="btn-logout"
                  onClick={onLogout}
                  title="Sign Out"
                  className="p-1 rounded-lg text-slate-400 dark:text-slate-400 light:text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                id="btn-open-auth"
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm shadow-sky-950 transition"
              >
                <UserIcon className="w-3.5 h-3.5" />
                <span>Sign In / Register</span>
              </button>
            )}
          </div>

        </div>

      </div>

      {/* Role Change Request Modal */}
      {isRoleModalOpen && currentUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in text-slate-100">
          <div className="relative w-full max-w-sm bg-[#121c2e] border border-[#1c2b44] rounded-xl shadow-2xl p-5 space-y-4">
            <button
              type="button"
              onClick={() => {
                setIsRoleModalOpen(false);
                setRoleNotice(null);
              }}
              className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold text-xs uppercase tracking-wider">
                <Shield className="w-4 h-4 text-cyan-400" />
                <span>Role Change Request</span>
              </div>
              <h3 className="text-sm font-black text-white">Request Permission Level</h3>
              <p className="text-[11px] text-slate-400">
                All role change requests require Central Administrator approval before new privileges are granted.
              </p>
            </div>

            {roleNotice && (
              <div className="p-2.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{roleNotice}</span>
              </div>
            )}

            <form onSubmit={handleSubmitRoleRequest} className="space-y-3">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Current Role
                </label>
                <div className="px-3 py-1.5 rounded-lg bg-[#0d1625] border border-slate-700/60 text-xs font-bold text-slate-300 capitalize">
                  {currentUser.role} ({currentUser.username})
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Desired Role *
                </label>
                <select
                  value={requestedRole}
                  onChange={e => setRequestedRole(e.target.value as UserRole)}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="operator">Plant Shift Operator (Data Entry)</option>
                  <option value="supervisor">Line Supervisor (Supervision &amp; Downtime)</option>
                  <option value="manager">Plant Manager (Factory Approvals &amp; Targets)</option>
                  <option value="viewer">Executive Viewer (Read-Only)</option>
                  <option value="admin">System Administrator (Full Management)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                  Reason for Request
                </label>
                <textarea
                  rows={2}
                  value={roleReason}
                  onChange={e => setRoleReason(e.target.value)}
                  placeholder="e.g. Assigned to line supervisor duty at Kurunegala"
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none resize-none"
                />
              </div>

              <div className="p-2 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-[10px] text-cyan-300">
                Once submitted, a Central Administrator will review and approve your role change in the Admin Management Portal.
              </div>

              <div className="flex items-center gap-2 pt-1 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsRoleModalOpen(false)}
                  className="w-1/3 py-2 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRole}
                  className="w-2/3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-sm shadow-cyan-950 transition cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {isSubmittingRole && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSubmittingRole ? 'Submitting...' : 'Submit Request'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};

