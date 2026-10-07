import React, { useState, useEffect } from 'react';
import { Navbar, NavTabType } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { ProductionStatusPage } from './components/ProductionStatusPage';
import { ShiftEntryForm } from './components/ShiftEntryForm';
import { MasterDataTable } from './components/MasterDataTable';
import { AppsScriptModal } from './components/AppsScriptModal';
import { AuthModal } from './components/AuthModal';
import { SheetConnectionModal } from './components/SheetConnectionModal';
import { PortalHub } from './components/PortalHub';
import { EmptyModulePlaceholder } from './components/EmptyModulePlaceholder';
import {
  ArrowLeft,
  Building2,
  Factory,
  BarChart3,
  Shirt,
  Table,
  Code2
} from 'lucide-react';
import { ProductionLog, User, FilterState, UserStatus, UserRole, FactoryName, DowntimeCategoryLog } from './types';
import { INITIAL_LOGS, INITIAL_USERS, USER_PASSWORDS } from './data/initialData';
import {
  getStoredSheetUrl,
  fetchServerSheetConfig,
  fetchLogsFromGoogleSheet,
  PERMANENT_DEFAULT_SHEET_URL,
  fetchServerUsers,
  registerServerUser,
  updateServerUserDetails,
  deleteServerUser,
  syncServerUsers,
  deleteLogsFromGoogleSheet,
  updateLogToGoogleSheet,
  fetchDowntimeLogs,
  approveServerPasswordReset,
  rejectServerPasswordReset,
  approveServerRoleChange,
  rejectServerRoleChange
} from './services/googleSheetService';
import { normalizeProductionLog } from './utils/calculations';
import { signOutFromGoogle } from './services/firebaseAuth';

export default function App() {
  // Local persistence keys (v4 loads full 4,067+ authentic records including September 2026 MTD and synchronizes with Google Sheet)
  const LOGS_STORAGE_KEY = 'ebony_production_logs_v4';
  const USERS_STORAGE_KEY = 'ebony_users_v1';
  const PASSWORDS_STORAGE_KEY = 'ebony_passwords_v1';
  const ACTIVE_USER_STORAGE_KEY = 'ebony_active_user_v1';

  // State: Logs (ensures all existing or newly ingested records are normalized)
  const [logs, setLogs] = useState<ProductionLog[]>(() => {
    try {
      localStorage.removeItem('ebony_production_logs_v1');
      localStorage.removeItem('ebony_production_logs_v2');
      localStorage.removeItem('ebony_production_logs_v3');
      const saved = localStorage.getItem(LOGS_STORAGE_KEY);
      if (saved) {
        const raw = JSON.parse(saved);
        if (Array.isArray(raw) && raw.length >= INITIAL_LOGS.length) {
          return raw.map(normalizeProductionLog);
        }
      }
      return INITIAL_LOGS;
    } catch {
      return INITIAL_LOGS;
    }
  });

  // State: Downtime Category Breakdown Logs
  const DOWNTIME_STORAGE_KEY = 'ebony_downtime_logs_v2';
  const [downtimeLogs, setDowntimeLogs] = useState<DowntimeCategoryLog[]>(() => {
    try {
      // Purge legacy storage key with mock records
      localStorage.removeItem('ebony_downtime_logs_v1');
      const saved = localStorage.getItem(DOWNTIME_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const mockBrands = ['van heusen', 'ralph lauren', 'tommy hilfiger', 'arrow'];
          const mockStyles = ['VH-9920-F', 'RL-5501-SLIM', 'TH-TR-402', 'ARW-7740'];
          const cleaned = parsed.filter(d => {
            const b = (d.brand || '').trim().toLowerCase();
            const s = (d.style || '').trim().toUpperCase();
            return !mockBrands.some(mb => b.includes(mb)) && !mockStyles.includes(s);
          });
          if (cleaned.length > 0) return cleaned;
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(DOWNTIME_STORAGE_KEY, JSON.stringify(downtimeLogs || []));
    } catch (e) {}
  }, [downtimeLogs]);

  // Initial fetch of downtime logs from server proxy
  useEffect(() => {
    let isCancelled = false;
    async function loadInitialDowntimes() {
      try {
        const res = await fetchDowntimeLogs();
        if (!isCancelled && res.success && Array.isArray(res.downtimeLogs) && res.downtimeLogs.length > 0) {
          const mockBrands = ['van heusen', 'ralph lauren', 'tommy hilfiger', 'arrow'];
          const mockStyles = ['VH-9920-F', 'RL-5501-SLIM', 'TH-TR-402', 'ARW-7740'];
          const sanitized = res.downtimeLogs.filter(d => {
            const b = (d.brand || '').trim().toLowerCase();
            const s = (d.style || '').trim().toUpperCase();
            return !mockBrands.some(mb => b.includes(mb)) && !mockStyles.includes(s);
          });
          setDowntimeLogs(sanitized);
        }
      } catch (err) {
        console.warn('Initial downtime logs fetch notice:', err);
      }
    }
    loadInitialDowntimes();
    return () => {
      isCancelled = true;
    };
  }, []);

  // State: Registered Users
  const [registeredUsers, setRegisteredUsers] = useState<User[]>(() => {
    try {
      const saved = localStorage.getItem(USERS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : INITIAL_USERS;
    } catch {
      return INITIAL_USERS;
    }
  });

  // State: Passwords
  const [userPasswords, setUserPasswords] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem(PASSWORDS_STORAGE_KEY);
      return saved ? JSON.parse(saved) : USER_PASSWORDS;
    } catch {
      return USER_PASSWORDS;
    }
  });

  // State: Active User (starts null if unauthenticated, or restored from localStorage)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  // State: Active View (Defaults to Portal Hub directory)
  const [activeTab, setActiveTab] = useState<NavTabType>('HUB');

  // State: Filters
  const [filters, setFilters] = useState<FilterState>({
    startDate: '',
    endDate: '',
    factory: 'ALL',
    line: 'ALL',
    product: 'ALL'
  });

  // State: Modals
  // If user is not logged in, prompt sign in / sign up modal
  const [isAuthOpen, setIsAuthOpen] = useState(() => {
    try {
      const saved = localStorage.getItem(ACTIVE_USER_STORAGE_KEY);
      return !saved;
    } catch {
      return true;
    }
  });
  const [isSheetModalOpen, setIsSheetModalOpen] = useState(false);
  const [sheetUrl, setSheetUrl] = useState(getStoredSheetUrl());

  // Enforce role-based routing when currentUser changes or activeTab is chosen
  useEffect(() => {
    if (!currentUser) {
      setIsAuthOpen(true);
      return;
    }

    // Role-specific constraints:
    // 1. Viewer: can access HUB, DASHBOARD, PRODUCTION_STATUS, WAREHOUSE, OTHER. Cannot submit shift logs or edit scripts.
    if (currentUser.role === 'viewer') {
      if (activeTab === 'ENTRY_FORM' || activeTab === 'APPS_SCRIPT') {
        setActiveTab('HUB');
      }
    }
    // 2. Factory operators: cannot access executive dashboards or apps script.
    else if (currentUser.role === 'operator') {
      if (activeTab === 'DASHBOARD' || activeTab === 'PRODUCTION_STATUS' || activeTab === 'APPS_SCRIPT') {
        setActiveTab('ENTRY_FORM');
      }
    }
  }, [currentUser, activeTab]);

  // Initialize and synchronize with permanent Google Sheet config on mount
  useEffect(() => {
    let isMounted = true;
    async function initPermanentSheetSync() {
      // 1. Fetch server config to guarantee permanent URL is loaded for all users
      const config = await fetchServerSheetConfig();
      if (isMounted && config.sheetUrl) {
        setSheetUrl(config.sheetUrl);
      }

      // 2. Fetch latest live logs from connected Google Sheet Apps Script
      try {
        const targetUrl = config.sheetUrl || PERMANENT_DEFAULT_SHEET_URL;
        const liveResult = await fetchLogsFromGoogleSheet(targetUrl);
        if (isMounted && liveResult.success && liveResult.logs && liveResult.logs.length > 0) {
          setLogs(liveResult.logs);
        }
      } catch (err) {
        console.warn('Initial live sheet sync notice:', err);
      }
    }

    initPermanentSheetSync();
    return () => {
      isMounted = false;
    };
  }, []);

  // Multi-device User Synchronization:
  // Continuously synchronize registered users and access statuses across all devices
  useEffect(() => {
    let isCancelled = false;

    async function syncUsers() {
      try {
        const res = await fetchServerUsers();
        if (!isCancelled && res.success && res.users && res.users.length > 0) {
          setRegisteredUsers(res.users);
          if (res.passwords) {
            setUserPasswords(res.passwords);
          }
          // If currentUser is logged in, keep their role/status updated in real-time
          if (currentUser) {
            const updatedMe = res.users.find(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
            if (updatedMe && (updatedMe.status !== currentUser.status || updatedMe.role !== currentUser.role || updatedMe.factory !== currentUser.factory)) {
              setCurrentUser(updatedMe);
            }
          }
        }
      } catch (err) {
        console.warn('Background user sync notice:', err);
      }
    }

    // Initial sync
    syncUsers();

    // Periodic polling every 4 seconds to detect newly registered users from other devices
    const interval = setInterval(syncUsers, 4000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [currentUser]);

  useEffect(() => {
    // Keep sheetUrl updated when modal opens or closes
    setSheetUrl(getStoredSheetUrl());
  }, [isSheetModalOpen]);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs));
    } catch (e) {
      console.error('Failed to save logs to localStorage', e);
    }
  }, [logs]);

  useEffect(() => {
    try {
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(registeredUsers));
    } catch (e) {
      console.error('Failed to save users to localStorage', e);
    }
  }, [registeredUsers]);

  useEffect(() => {
    try {
      localStorage.setItem(PASSWORDS_STORAGE_KEY, JSON.stringify(userPasswords));
    } catch (e) {
      console.error('Failed to save passwords to localStorage', e);
    }
  }, [userPasswords]);

  useEffect(() => {
    try {
      if (currentUser) {
        localStorage.setItem(ACTIVE_USER_STORAGE_KEY, JSON.stringify(currentUser));
      } else {
        localStorage.removeItem(ACTIVE_USER_STORAGE_KEY);
      }
    } catch (e) {
      console.error('Failed to save current user to localStorage', e);
    }
  }, [currentUser]);

  // Handlers with cross-device backend synchronization
  const handleRegisterUser = (newUser: User, pass: string): boolean => {
    setRegisteredUsers(prev => {
      const filtered = prev.filter(u => u.username.toLowerCase() !== newUser.username.toLowerCase());
      return [...filtered, newUser];
    });
    setUserPasswords(prev => ({ ...prev, [newUser.username]: pass }));
    // Synchronize directly with backend server so all other devices see this user immediately
    registerServerUser(newUser, pass).catch(err => {
      console.warn('Error registering user on server:', err);
    });
    return true;
  };

  const handleUpdateUserStatus = (username: string, status: UserStatus) => {
    setRegisteredUsers(prev =>
      prev.map(u => (u.username === username ? { ...u, status } : u))
    );
    if (currentUser?.username === username) {
      setCurrentUser(prev => (prev ? { ...prev, status } : null));
    }
    // Update server so applicant on another device gets immediate access
    updateServerUserDetails(username, undefined, undefined, status).catch(err => {
      console.warn('Error updating user status on server:', err);
    });
  };

  const handleUpdateUserRole = (username: string, role: UserRole) => {
    setRegisteredUsers(prev =>
      prev.map(u => (u.username === username ? { ...u, role } : u))
    );
    if (currentUser?.username === username) {
      setCurrentUser(prev => (prev ? { ...prev, role } : null));
    }
    updateServerUserDetails(username, { role }).catch(err => {
      console.warn('Error updating user role on server:', err);
    });
  };

  const handleUpdateUserFactory = (username: string, factory: FactoryName | 'ALL') => {
    setRegisteredUsers(prev =>
      prev.map(u => (u.username === username ? { ...u, factory } : u))
    );
    if (currentUser?.username === username) {
      setCurrentUser(prev => (prev ? { ...prev, factory } : null));
    }
    updateServerUserDetails(username, { factory }).catch(err => {
      console.warn('Error updating user factory on server:', err);
    });
  };

  const handleApprovePasswordReset = async (username: string) => {
    try {
      const res = await approveServerPasswordReset(username);
      if (res.success) {
        setRegisteredUsers(prev =>
          prev.map(u => {
            if (u.username.toLowerCase() === username.toLowerCase()) {
              const copy = { ...u, status: 'active' as UserStatus };
              delete copy.pendingPasswordReset;
              return copy;
            }
            return u;
          })
        );
        const fresh = await fetchServerUsers();
        if (fresh.success && fresh.passwords) {
          setUserPasswords(fresh.passwords);
        }
      }
    } catch (err) {
      console.warn('Error approving password reset:', err);
    }
  };

  const handleRejectPasswordReset = async (username: string) => {
    try {
      const res = await rejectServerPasswordReset(username);
      if (res.success) {
        setRegisteredUsers(prev =>
          prev.map(u => {
            if (u.username.toLowerCase() === username.toLowerCase()) {
              const copy = { ...u };
              delete copy.pendingPasswordReset;
              return copy;
            }
            return u;
          })
        );
      }
    } catch (err) {
      console.warn('Error rejecting password reset:', err);
    }
  };

  const handleApproveRoleChange = async (username: string) => {
    try {
      const res = await approveServerRoleChange(username);
      if (res.success) {
        setRegisteredUsers(prev =>
          prev.map(u => {
            if (u.username.toLowerCase() === username.toLowerCase() && u.pendingRoleChange) {
              const newRole = u.pendingRoleChange.requestedRole;
              const copy = { ...u, role: newRole };
              delete copy.pendingRoleChange;
              return copy;
            }
            return u;
          })
        );
      }
    } catch (err) {
      console.warn('Error approving role change:', err);
    }
  };

  const handleRejectRoleChange = async (username: string) => {
    try {
      const res = await rejectServerRoleChange(username);
      if (res.success) {
        setRegisteredUsers(prev =>
          prev.map(u => {
            if (u.username.toLowerCase() === username.toLowerCase()) {
              const copy = { ...u };
              delete copy.pendingRoleChange;
              return copy;
            }
            return u;
          })
        );
      }
    } catch (err) {
      console.warn('Error rejecting role change:', err);
    }
  };

  const handleDeleteUser = (username: string) => {
    if (username === 'admin') {
      alert('Central Administrator account cannot be removed.');
      return;
    }
    if (window.confirm(`Are you sure you want to remove user "${username}"?`)) {
      setRegisteredUsers(prev => prev.filter(u => u.username !== username));
      setUserPasswords(prev => {
        const copy = { ...prev };
        delete copy[username];
        return copy;
      });
      if (currentUser?.username === username) {
        setCurrentUser(null);
      }
      deleteServerUser(username).catch(err => {
        console.warn('Error deleting user from server:', err);
      });
    }
  };

  const handleCreateUserDirect = (newUser: User, pass: string) => {
    setRegisteredUsers(prev => {
      const filtered = prev.filter(u => u.username.toLowerCase() !== newUser.username.toLowerCase());
      return [...filtered, newUser];
    });
    setUserPasswords(prev => ({ ...prev, [newUser.username]: pass }));
    registerServerUser(newUser, pass).catch(err => {
      console.warn('Error creating user on server:', err);
    });
  };

  const handleUpdateUserDetails = (
    originalUsername: string,
    updatedUser: { fullName: string; role: UserRole; factory: FactoryName | 'ALL'; status: UserStatus },
    newPassword?: string
  ) => {
    setRegisteredUsers(prev =>
      prev.map(u => (u.username === originalUsername ? { ...u, ...updatedUser } : u))
    );

    if (newPassword && newPassword.trim()) {
      setUserPasswords(prev => ({
        ...prev,
        [originalUsername]: newPassword.trim()
      }));
    }

    if (currentUser?.username === originalUsername) {
      setCurrentUser(prev => (prev ? { ...prev, ...updatedUser } : null));
    }

    updateServerUserDetails(originalUsername, updatedUser, newPassword, updatedUser.status).catch(err => {
      console.warn('Error updating user details on server:', err);
    });
  };

  const handleUpdateUserPassword = async (username: string, newPass: string) => {
    if (currentUser?.role !== 'admin') {
      throw new Error('Security Restriction: Only Central Administrator is authorized to edit user passwords.');
    }
    const cleanPass = newPass.trim();
    if (!cleanPass || cleanPass.length < 4) {
      throw new Error('Password must be at least 4 characters long.');
    }
    setUserPasswords(prev => ({
      ...prev,
      [username]: cleanPass
    }));
    const res = await updateServerUserDetails(username, undefined, cleanPass);
    if (!res.success) {
      throw new Error(res.message || 'Failed to update user password on server.');
    }
  };

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setActiveTab('HUB'); // Landing page after login screen with 4 tiles
  };

  const handleLogout = () => {
    signOutFromGoogle().catch(() => {});
    setCurrentUser(null);
    setIsAuthOpen(true);
  };

  const handleAppendLogs = (newLogs: ProductionLog[]) => {
    setLogs(prev => [...newLogs.map(normalizeProductionLog), ...prev]);
  };

  const handleDeleteLog = (entryId: string) => {
    setLogs(prev => prev.filter(l => l.Entry_ID !== entryId));
    deleteLogsFromGoogleSheet({ entryId, user: currentUser?.username || 'admin' }).catch(err => {
      console.warn('Error deleting log from Google Sheet:', err);
    });
  };

  const handleUpdateLog = (updatedLog: ProductionLog) => {
    setLogs(prev => prev.map(l => (l.Entry_ID === updatedLog.Entry_ID ? normalizeProductionLog(updatedLog) : l)));
    updateLogToGoogleSheet(updatedLog, currentUser?.username || 'admin').catch(err => {
      console.warn('Error updating log in Google Sheet:', err);
    });
  };

  const handleDeleteLogsByDateRange = (startDate: string, endDate: string, factory?: string) => {
    setLogs(prev => prev.filter(log => {
      const d = log.Date;
      const inRange = (!startDate || d >= startDate) && (!endDate || d <= endDate);
      const inFactory = !factory || factory === 'ALL' || log.Factory === factory;
      // Keep logs that are NOT in the deleted range
      return !(inRange && inFactory);
    }));
    deleteLogsFromGoogleSheet({ startDate, endDate, factory, user: currentUser?.username || 'admin' }).catch(err => {
      console.warn('Error batch deleting logs from Google Sheet:', err);
    });
  };

  const handleResetFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      factory: 'ALL',
      line: 'ALL',
      product: 'ALL'
    });
  };

  return (
    <div className="min-h-screen bg-[#0b1320] dark:bg-[#0b1320] light:bg-slate-50 text-slate-100 dark:text-slate-100 light:text-slate-900 font-sans selection:bg-cyan-500 selection:text-white flex flex-col transition-colors">
      {/* Primary Navigation */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onOpenAuth={() => setIsAuthOpen(true)}
        onLogout={handleLogout}
        onOpenSheetModal={() => setIsSheetModalOpen(true)}
        isSheetConfigured={Boolean(sheetUrl)}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-4 lg:p-6 space-y-4">
        {/* 1. PORTAL HUB (Landing directory after login) */}
        {activeTab === 'HUB' && (
          <PortalHub
            currentUser={currentUser}
            onSelectHeadOffice={() => {
              if (currentUser?.role === 'operator') {
                setActiveTab('MASTER_SHEET');
              } else {
                setActiveTab('DASHBOARD');
              }
            }}
            onSelectFactory={() => setActiveTab('ENTRY_FORM')}
            onSelectWarehouse={() => setActiveTab('WAREHOUSE')}
            onSelectOther={() => setActiveTab('OTHER')}
            logsCount={logs.length}
            downtimeCount={downtimeLogs.length}
            usersCount={registeredUsers.length}
          />
        )}

        {/* 2. HEAD OFFICE SUITE (All management pages mapped under Head Office) */}
        {(activeTab === 'DASHBOARD' ||
          activeTab === 'PRODUCTION_STATUS' ||
          activeTab === 'MASTER_SHEET' ||
          activeTab === 'APPS_SCRIPT') && (
          <div className="space-y-4">
            {/* Head Office Header Bar */}
            <div className="bg-[#0e1726] border border-[#1c2b44] rounded-xl p-2.5 flex flex-wrap items-center justify-between gap-3 shadow-md">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('HUB')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#142136] hover:bg-[#1a2b47] text-slate-300 hover:text-white border border-[#223553] text-xs font-bold transition cursor-pointer"
                  title="Return to Portal Hub"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Portal Hub</span>
                </button>
                <div className="h-4 w-px bg-slate-700/60 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-black uppercase text-white tracking-wider">
                    Head Office Suite
                  </span>
                </div>
              </div>

              {/* Head Office Sub-Navigation */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {currentUser?.role !== 'operator' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveTab('DASHBOARD')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        activeTab === 'DASHBOARD'
                          ? 'bg-cyan-500 text-white font-black shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-[#121c2e]'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      <span>Executive Dashboard</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab('PRODUCTION_STATUS')}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                        activeTab === 'PRODUCTION_STATUS'
                          ? 'bg-sky-500 text-white font-black shadow-md'
                          : 'text-slate-400 hover:text-white hover:bg-[#121c2e]'
                      }`}
                    >
                      <Shirt className="w-3.5 h-3.5" />
                      <span>Production Status</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={() => setActiveTab('MASTER_SHEET')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    activeTab === 'MASTER_SHEET'
                      ? 'bg-sky-500 text-white font-black shadow-md'
                      : 'text-slate-400 hover:text-white hover:bg-[#121c2e]'
                  }`}
                >
                  <Table className="w-3.5 h-3.5" />
                  <span>Master Records Table</span>
                </button>

                {currentUser && currentUser.role !== 'operator' && currentUser.role !== 'viewer' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('APPS_SCRIPT')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeTab === 'APPS_SCRIPT'
                        ? 'bg-purple-500 text-white font-black shadow-md'
                        : 'text-slate-400 hover:text-white hover:bg-[#121c2e]'
                    }`}
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    <span>Apps Script Config</span>
                  </button>
                )}
              </div>
            </div>

            {/* Render Head Office Tab */}
            {activeTab === 'DASHBOARD' && (
              <Dashboard
                logs={logs}
                filters={filters}
                onFilterChange={setFilters}
                onResetFilters={handleResetFilters}
                downtimeLogs={downtimeLogs}
              />
            )}

            {activeTab === 'PRODUCTION_STATUS' && (
              <ProductionStatusPage
                logs={logs}
                filters={filters}
                onFilterChange={setFilters}
                onResetFilters={handleResetFilters}
              />
            )}

            {activeTab === 'MASTER_SHEET' && (
              <MasterDataTable
                logs={logs}
                onDeleteLog={handleDeleteLog}
                onDeleteLogsByDateRange={handleDeleteLogsByDateRange}
                currentUser={currentUser}
                onOpenSheetModal={() => setIsSheetModalOpen(true)}
                users={registeredUsers}
                userPasswords={userPasswords}
                onUpdateUserStatus={handleUpdateUserStatus}
                onUpdateUserRole={handleUpdateUserRole}
                onUpdateUserFactory={handleUpdateUserFactory}
                onDeleteUser={handleDeleteUser}
                onCreateUser={handleCreateUserDirect}
                onUpdateUserDetails={handleUpdateUserDetails}
                onUpdateUserPassword={handleUpdateUserPassword}
                onApprovePasswordReset={handleApprovePasswordReset}
                onRejectPasswordReset={handleRejectPasswordReset}
                onApproveRoleChange={handleApproveRoleChange}
                onRejectRoleChange={handleRejectRoleChange}
                onUpdateLog={handleUpdateLog}
                allDowntimeLogs={downtimeLogs}
                onDowntimeLogsUpdated={setDowntimeLogs}
              />
            )}

            {activeTab === 'APPS_SCRIPT' && currentUser?.role !== 'operator' && currentUser?.role !== 'viewer' && (
              <AppsScriptModal onOpenSheetModal={() => setIsSheetModalOpen(true)} />
            )}
          </div>
        )}

        {/* 3. FACTORY DIVISION: Daily Shift Log */}
        {activeTab === 'ENTRY_FORM' && currentUser?.role !== 'viewer' && (
          <div className="space-y-4">
            {/* Factory Shift Operations Bar */}
            <div className="bg-[#0e1726] border border-[#1c2b44] rounded-xl p-2.5 flex items-center justify-between shadow-md">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('HUB')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#142136] hover:bg-[#1a2b47] text-slate-300 hover:text-white border border-[#223553] text-xs font-bold transition cursor-pointer"
                  title="Return to Portal Hub"
                >
                  <ArrowLeft className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Portal Hub</span>
                </button>
                <div className="h-4 w-px bg-slate-700/60 hidden sm:block"></div>
                <div className="flex items-center gap-2">
                  <Factory className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-black uppercase text-white tracking-wider">
                    Factory Operations • Daily Shift Log
                  </span>
                </div>
              </div>
              <div className="text-xs text-slate-400 font-medium hidden sm:block">
                Allocated Plant:{' '}
                <span className="text-emerald-300 font-bold">
                  {currentUser?.factory === 'ALL' ? 'Central Multi-Plant' : `${currentUser?.factory} Plant`}
                </span>
              </div>
            </div>

            <ShiftEntryForm
              currentUser={currentUser}
              onOpenAuth={() => setIsAuthOpen(true)}
              onSubmitLogs={handleAppendLogs}
              onSuccessRedirect={() => setActiveTab('MASTER_SHEET')}
              onOpenSheetModal={() => setIsSheetModalOpen(true)}
              allDowntimeLogs={downtimeLogs}
              onDowntimeLogsUpdated={setDowntimeLogs}
              recentLogs={logs}
            />
          </div>
        )}

        {/* 4. WAREHOUSE DIVISION (Empty Module) */}
        {activeTab === 'WAREHOUSE' && (
          <EmptyModulePlaceholder
            moduleName="Warehouse"
            onBackToHub={() => setActiveTab('HUB')}
            currentUserRole={currentUser?.role}
          />
        )}

        {/* 5. OTHER DIVISION (Empty Module) */}
        {activeTab === 'OTHER' && (
          <EmptyModulePlaceholder
            moduleName="Other"
            onBackToHub={() => setActiveTab('HUB')}
            currentUserRole={currentUser?.role}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#1c2b44] dark:border-[#1c2b44] light:border-slate-200 bg-[#0d1625] dark:bg-[#0d1625] light:bg-white py-3.5 px-6 text-center text-xs text-slate-400 dark:text-slate-400 light:text-slate-500 transition-colors">
        <p className="font-medium">
          Ebony Holdings (Pvt) Ltd • Integrated Executive Manufacturing Intelligence • Bento Grid Operations Portal
        </p>
      </footer>

      {/* Google Sheet Live Connection Modal (Admin & Manager only) */}
      {currentUser?.role === 'admin' && (
        <SheetConnectionModal
          isOpen={isSheetModalOpen}
          onClose={() => setIsSheetModalOpen(false)}
          logs={logs}
          onLogsUpdated={(updatedLogs) => setLogs(updatedLogs.map(normalizeProductionLog))}
        />
      )}

      {/* Authentication & Plant Allocation Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => {
          if (currentUser) {
            setIsAuthOpen(false);
          }
        }}
        onLoginSuccess={handleLoginSuccess}
        registeredUsers={registeredUsers}
        onRegisterUser={handleRegisterUser}
        userPasswords={userPasswords}
        preventClose={!currentUser}
      />
    </div>
  );
}
