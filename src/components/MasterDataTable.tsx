import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Download,
  Trash2,
  Table,
  FileSpreadsheet,
  Factory,
  Shirt,
  Users,
  Layers,
  ArrowUpDown,
  Sparkles,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  UserPlus,
  Shield,
  UserCheck,
  ShieldAlert,
  X,
  Key,
  UserX,
  Clock,
  Check,
  Calendar,
  Eye,
  EyeOff,
  KeyRound,
  Edit,
  FileEdit,
  MessageSquare,
  Send,
  RefreshCw,
  AlertTriangle,
  CheckCheck,
  Filter,
  Wrench,
  Database
} from 'lucide-react';
import { ProductionLog, FactoryName, User, UserStatus, UserRole, DataChangeRequest } from '../types';
import {
  exportToCSV,
  exportGenericTableToCSV,
  getEffectiveWorkedMinutes,
  getEffectiveProducedMinutes,
  calculateAggregatedMetrics,
  getMultiStyleShiftMap
} from '../utils/calculations';
import { FACTORIES, INITIAL_USERS } from '../data/initialData';
import {
  fetchChangeRequests,
  submitChangeRequest,
  reviewChangeRequest,
  deleteLogsFromGoogleSheet,
  updateLogToGoogleSheet,
  approveServerPasswordReset,
  rejectServerPasswordReset,
  approveServerRoleChange,
  rejectServerRoleChange
} from '../services/googleSheetService';
import { EntryIdRequestModal } from './EntryIdRequestModal';
import { DowntimeCategoryLog } from '../types';
import { getDowntimeCodeBadge, DOWNTIME_CODE_LIST } from '../data/downtimeCodes';
import { deleteDowntimeLog, updateDowntimeLog } from '../services/googleSheetService';

export type MasterSheetTab = 'LOGS' | 'DOWNTIME' | 'FACTORIES' | 'PRODUCTS' | 'USERS' | 'LINES';

interface MasterDataTableProps {
  logs: ProductionLog[];
  onDeleteLog: (entryId: string) => void;
  onDeleteLogsByDateRange?: (startDate: string, endDate: string, factory?: string) => void;
  currentUser: User | null;
  onOpenSheetModal?: () => void;
  users?: User[];
  userPasswords?: Record<string, string>;
  onUpdateUserStatus?: (username: string, status: UserStatus) => void;
  onUpdateUserRole?: (username: string, role: UserRole) => void;
  onUpdateUserFactory?: (username: string, factory: FactoryName | 'ALL') => void;
  onDeleteUser?: (username: string) => void;
  onCreateUser?: (newUser: User, pass: string) => void;
  onUpdateUserDetails?: (
    originalUsername: string,
    updatedUser: { fullName: string; role: UserRole; factory: FactoryName | 'ALL'; status: UserStatus },
    newPassword?: string
  ) => void;
  onUpdateUserPassword?: (username: string, newPassword: string) => Promise<void> | void;
  onApprovePasswordReset?: (username: string) => Promise<void> | void;
  onRejectPasswordReset?: (username: string) => Promise<void> | void;
  onApproveRoleChange?: (username: string) => Promise<void> | void;
  onRejectRoleChange?: (username: string) => Promise<void> | void;
  onUpdateLog?: (updatedLog: ProductionLog) => void;
  allDowntimeLogs?: DowntimeCategoryLog[];
  onDowntimeLogsUpdated?: (updated: DowntimeCategoryLog[]) => void;
  onOpenFirestoreModal?: () => void;
}

export const MasterDataTable: React.FC<MasterDataTableProps> = ({
  logs = [],
  onDeleteLog,
  onDeleteLogsByDateRange,
  currentUser,
  onOpenSheetModal,
  onOpenFirestoreModal,
  users = INITIAL_USERS,
  userPasswords = {},
  onUpdateUserStatus,
  onUpdateUserRole,
  onUpdateUserFactory,
  onDeleteUser,
  onCreateUser,
  onUpdateUserDetails,
  onUpdateUserPassword,
  onApprovePasswordReset,
  onRejectPasswordReset,
  onApproveRoleChange,
  onRejectRoleChange,
  onUpdateLog,
  allDowntimeLogs = [],
  onDowntimeLogsUpdated
}) => {
  const [activeSheet, setActiveSheet] = useState<MasterSheetTab>('LOGS');
  const safeLogs = useMemo(() => (Array.isArray(logs) ? logs : []), [logs]);

  // Role Checks & Plant Restrictions
  const isAdmin = currentUser?.role === 'admin';
  const userPlantRestriction = (currentUser?.role === 'operator' && currentUser.factory !== 'ALL')
    ? currentUser.factory
    : null;

  // Logs sheet filters (plant lock, date range, search)
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFactory, setSelectedFactory] = useState<string>(userPlantRestriction || 'ALL');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Date Range Batch Delete State (Admin Only)
  const [isDateRangeDeleteOpen, setIsDateRangeDeleteOpen] = useState(false);
  const [deleteStartDate, setDeleteStartDate] = useState('');
  const [deleteEndDate, setDeleteEndDate] = useState('');
  const [deleteFactory, setDeleteFactory] = useState<string>('ALL');
  const [batchDeleteNotice, setBatchDeleteNotice] = useState<string | null>(null);

  // Downtime Sheet State & Filters
  const [downtimeSearch, setDowntimeSearch] = useState('');
  const [downtimeFactoryFilter, setDowntimeFactoryFilter] = useState<string>(userPlantRestriction || 'ALL');
  const [downtimeStartDate, setDowntimeStartDate] = useState('');
  const [downtimeEndDate, setDowntimeEndDate] = useState('');
  const [downtimeCategoryFilter, setDowntimeCategoryFilter] = useState<string>('ALL');
  const [downtimeConfirmDeleteId, setDowntimeConfirmDeleteId] = useState<string | null>(null);
  const [downtimeDeleteNotice, setDowntimeDeleteNotice] = useState<string | null>(null);
  const [downtimeCurrentPage, setDowntimeCurrentPage] = useState<number>(1);
  const DOWNTIME_PAGE_SIZE = 50;

  // Downtime Incident Amend State
  const [amendDowntimeTarget, setAmendDowntimeTarget] = useState<DowntimeCategoryLog | null>(null);
  const [isDowntimeAmendModalOpen, setIsDowntimeAmendModalOpen] = useState(false);
  const [downtimeAmendForm, setDowntimeAmendForm] = useState<Partial<DowntimeCategoryLog>>({});
  const [isSavingDowntimeAmend, setIsSavingDowntimeAmend] = useState(false);

  // Secondary search queries for the separate sheets
  const [factorySearch, setFactorySearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [lineSearch, setLineSearch] = useState('');

  // User Management State (Grant access, change role, remove user)
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | 'active' | 'pending' | 'suspended'>('ALL');
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('operator');
  const [newFactory, setNewFactory] = useState<FactoryName | 'ALL'>('Kurunegala');
  const [newStatus, setNewStatus] = useState<UserStatus>('active');
  const [userActionNotice, setUserActionNotice] = useState<string | null>(null);

  // Edit User Details & Password Modal (Admin)
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('operator');
  const [editFactory, setEditFactory] = useState<FactoryName | 'ALL'>('Kurunegala');
  const [editStatus, setEditStatus] = useState<UserStatus>('active');
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  // Inline Password Edit State for Central Admin
  const [editingPasswordUsername, setEditingPasswordUsername] = useState<string | null>(null);
  const [editingPasswordValue, setEditingPasswordValue] = useState<string>('');
  const [isSavingInlinePassword, setIsSavingInlinePassword] = useState<boolean>(false);

  const toggleShowPassword = (username: string) => {
    setShowPasswords(prev => ({ ...prev, [username]: !prev[username] }));
  };

  // Production Log Change Requests State
  const [changeRequests, setChangeRequests] = useState<DataChangeRequest[]>([]);
  const [isRequestsModalOpen, setIsRequestsModalOpen] = useState(false);
  const [requestFilter, setRequestFilter] = useState<'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'>('PENDING');
  const [selectedRequestForReview, setSelectedRequestForReview] = useState<DataChangeRequest | null>(null);
  const [adminReviewNotes, setAdminReviewNotes] = useState('');
  const [adminEditedValues, setAdminEditedValues] = useState<Partial<ProductionLog>>({});

  // Factory Data Ops Request Modals
  const [isDeleteRequestModalOpen, setIsDeleteRequestModalOpen] = useState(false);
  const [isAmendRequestModalOpen, setIsAmendRequestModalOpen] = useState(false);
  const [isEntryIdRequestModalOpen, setIsEntryIdRequestModalOpen] = useState(false);
  const [lookupEntryId, setLookupEntryId] = useState('');
  const [targetLogForRequest, setTargetLogForRequest] = useState<ProductionLog | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [amendFormData, setAmendFormData] = useState<Partial<ProductionLog>>({});
  const [requestNotice, setRequestNotice] = useState<string | null>(null);

  // Direct Log Edit State (Admin)
  const [isDirectEditOpen, setIsDirectEditOpen] = useState(false);
  const [directEditLog, setDirectEditLog] = useState<ProductionLog | null>(null);

  // Load change requests
  const refreshChangeRequests = async () => {
    try {
      const res = await fetchChangeRequests();
      if (res.success && Array.isArray(res.requests)) {
        setChangeRequests(res.requests);
      }
    } catch (e) {
      console.warn('Error loading change requests:', e);
    }
  };

  useEffect(() => {
    refreshChangeRequests();
    const interval = setInterval(refreshChangeRequests, 12000);
    return () => clearInterval(interval);
  }, []);

  const pendingRequestsCount = useMemo(() => {
    return (changeRequests || []).filter(r => r && r.status === 'PENDING').length;
  }, [changeRequests]);

  const pendingRequestsMap = useMemo(() => {
    const map = new Map<string, DataChangeRequest>();
    (changeRequests || []).forEach(r => {
      if (r && r.status === 'PENDING') {
        map.set(r.entryId, r);
      }
    });
    return map;
  }, [changeRequests]);

  // -------------------------------------------------------------
  // 1. PRODUCTION LOGS FILTERING & AGGREGATES
  // -------------------------------------------------------------
  const filteredLogs = useMemo(() => {
    return safeLogs.filter(log => {
      // Factory Filter: if a specific factory is chosen, strictly filter by it
      const targetFactory = selectedFactory !== 'ALL' ? selectedFactory : (userPlantRestriction || 'ALL');
      if (targetFactory !== 'ALL') {
        const logFactory = (log.Factory || '').trim().toLowerCase();
        const expFactory = targetFactory.trim().toLowerCase();
        if (logFactory !== expFactory) return false;
      }
      if (startDateFilter) {
        const logDate = (log.Date || '').trim();
        if (logDate && logDate < startDateFilter.trim()) return false;
      }
      if (endDateFilter) {
        const logDate = (log.Date || '').trim();
        if (logDate && logDate > endDateFilter.trim()) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          log.Entry_ID.toLowerCase().includes(q) ||
          log.Style.toLowerCase().includes(q) ||
          log.Supervisor.toLowerCase().includes(q) ||
          log.Product.toLowerCase().includes(q) ||
          log.Brand.toLowerCase().includes(q) ||
          log.Line_No.toLowerCase().includes(q) ||
          log.User.toLowerCase().includes(q) ||
          log.Remarks.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [logs, selectedFactory, userPlantRestriction, startDateFilter, endDateFilter, searchQuery]);

  // Multi-style shift map for all logs (maps Date__Factory__Line to aggregated line data)
  const multiStyleShiftMap = useMemo(() => {
    return getMultiStyleShiftMap(logs);
  }, [logs]);

  const logAggregates = useMemo(() => {
    const agg = calculateAggregatedMetrics(filteredLogs);
    return {
      count: filteredLogs.length,
      shiftsCount: agg.shiftsCount,
      multiStyleShiftsCount: agg.multiStyleShiftsCount,
      totalActual: agg.totalActual,
      totalProdMin: agg.totalProdMinutes,
      totalWorkMin: agg.totalWorkedMinutes,
      totalDT: agg.totalDownTimeMinutes,
      efficiency: agg.lineEfficiency.toFixed(1)
    };
  }, [filteredLogs]);

  // -------------------------------------------------------------
  // 2. FACTORIES SHEET DATA
  // -------------------------------------------------------------
  const factoryRecords = useMemo(() => {
    // Collect all factories (from FACTORIES enum union with existing logs)
    const factorySet = new Set<string>(FACTORIES);
    safeLogs.forEach(l => {
      if (l.Factory) factorySet.add(l.Factory);
    });

    const list = Array.from(factorySet).map(factoryName => {
      const plantLogs = safeLogs.filter(l => l.Factory === factoryName);
      const linesSet = new Set<string>();
      const superSet = new Set<string>();
      const productsSet = new Set<string>();

      plantLogs.forEach(l => {
        if (l.Line_No) linesSet.add(l.Line_No);
        if (l.Supervisor) superSet.add(l.Supervisor);
        if (l.Product) productsSet.add(l.Product);
      });

      const plantMetrics = calculateAggregatedMetrics(plantLogs);
      const prefix = factoryName.charAt(0).toUpperCase();
      const variance = plantMetrics.totalActual - plantMetrics.totalPlan;
      const fulfillmentPct = plantMetrics.totalPlan > 0 ? ((plantMetrics.totalActual / plantMetrics.totalPlan) * 100).toFixed(1) : '100.0';

      return {
        factory: factoryName,
        prefix,
        activeLines: Array.from(linesSet).sort(),
        supervisors: Array.from(superSet).sort(),
        products: Array.from(productsSet).sort(),
        shiftsCount: plantMetrics.shiftsCount,
        plannedQty: plantMetrics.totalPlan,
        actualQty: plantMetrics.totalActual,
        variance,
        fulfillmentPct,
        producedMins: plantMetrics.totalProdMinutes,
        workedMins: plantMetrics.totalWorkedMinutes,
        efficiency: plantMetrics.lineEfficiency,
        attendance: plantMetrics.laborAttendance
      };
    });

    if (!factorySearch.trim()) return list;
    const q = factorySearch.toLowerCase();
    return list.filter(
      f =>
        f.factory.toLowerCase().includes(q) ||
        f.prefix.toLowerCase().includes(q) ||
        f.supervisors.some(s => s.toLowerCase().includes(q))
    );
  }, [logs, factorySearch]);

  const handleExportFactorySheet = () => {
    const headers = [
      'Factory_Plant',
      'Code_Prefix',
      'Active_Lines_Count',
      'Active_Lines_List',
      'Total_Shifts_Logged',
      'Total_Planned_QTY',
      'Total_Actual_QTY',
      'Variance_QTY',
      'Fulfillment_Pct',
      'Produced_Minutes',
      'Worked_Minutes',
      'Efficiency_Pct',
      'Attendance_Pct',
      'Supervisors'
    ];
    const rows = factoryRecords.map(f => [
      f.factory,
      f.prefix,
      f.activeLines.length,
      f.activeLines.join(' | '),
      f.shiftsCount,
      f.plannedQty,
      f.actualQty,
      f.variance,
      `${f.fulfillmentPct}%`,
      f.producedMins,
      f.workedMins,
      `${f.efficiency}%`,
      `${f.attendance}%`,
      f.supervisors.join(' | ')
    ]);
    exportGenericTableToCSV('Ebony_Holdings_Factory_Master_Sheet', headers, rows);
  };

  // -------------------------------------------------------------
  // 3. PRODUCTS SHEET DATA
  // -------------------------------------------------------------
  const productRecords = useMemo(() => {
    const productMap = new Map<string, ProductionLog[]>();
    logs.forEach(l => {
      const prod = l.Product || 'Unassigned';
      if (!productMap.has(prod)) productMap.set(prod, []);
      productMap.get(prod)!.push(l);
    });

    const list = Array.from(productMap.entries()).map(([productName, pLogs]) => {
      const brandsSet = new Set<string>();
      const stylesSet = new Set<string>();
      let plannedQty = 0;
      let actualQty = 0;
      let producedMins = 0;
      let workedMins = 0;
      let smvTotal = 0;

      pLogs.forEach(l => {
        if (l.Brand) brandsSet.add(l.Brand);
        if (l.Style) stylesSet.add(l.Style);
        plannedQty += Number(l.Planned_QTY) || 0;
        actualQty += Number(l.Actual_QTY) || 0;
        producedMins += getEffectiveProducedMinutes(l);
        workedMins += getEffectiveWorkedMinutes(l);
        smvTotal += Number(l.SMV) || 0;
      });

      const avgSmv = pLogs.length > 0 ? (smvTotal / pLogs.length).toFixed(1) : '0.0';
      const variance = actualQty - plannedQty;
      const fulfillmentPct = plannedQty > 0 ? ((actualQty / plannedQty) * 100).toFixed(1) : '100.0';
      const efficiency = workedMins > 0 ? ((producedMins / workedMins) * 100).toFixed(1) : '0.0';

      return {
        product: productName,
        brands: Array.from(brandsSet).sort(),
        stylesCount: stylesSet.size,
        avgSmv: Number(avgSmv),
        shiftsCount: pLogs.length,
        plannedQty,
        actualQty,
        variance,
        fulfillmentPct,
        producedMins,
        workedMins,
        efficiency: Number(efficiency)
      };
    }).sort((a, b) => b.actualQty - a.actualQty);

    if (!productSearch.trim()) return list;
    const q = productSearch.toLowerCase();
    return list.filter(
      p =>
        p.product.toLowerCase().includes(q) ||
        p.brands.some(b => b.toLowerCase().includes(q))
    );
  }, [logs, productSearch]);

  const handleExportProductsSheet = () => {
    const headers = [
      'Product_Category',
      'Associated_Brands',
      'Unique_Styles_Count',
      'Average_SMV_Minutes',
      'Total_Shifts_Logged',
      'Total_Planned_QTY',
      'Total_Actual_QTY',
      'Variance_QTY',
      'Fulfillment_Pct',
      'Produced_Minutes',
      'Worked_Minutes',
      'Production_Efficiency_Pct'
    ];
    const rows = productRecords.map(p => [
      p.product,
      p.brands.join(' | '),
      p.stylesCount,
      p.avgSmv,
      p.shiftsCount,
      p.plannedQty,
      p.actualQty,
      p.variance,
      `${p.fulfillmentPct}%`,
      p.producedMins,
      p.workedMins,
      `${p.efficiency}%`
    ]);
    exportGenericTableToCSV('Ebony_Holdings_Products_Master_Sheet', headers, rows);
  };

  // -------------------------------------------------------------
  // 4. USERS SHEET DATA
  // -------------------------------------------------------------
  const userRecords = useMemo(() => {
    // Merge users list from registeredUsers and any user in logs
    const userMap = new Map<string, User>();
    users.forEach(u => userMap.set(u.username, u));

    // Discover any additional users present in logs
    logs.forEach(l => {
      if (l.User && !userMap.has(l.User)) {
        userMap.set(l.User, {
          id: `usr-${l.User}`,
          username: l.User,
          fullName: `${l.User.toUpperCase()} (Operator)`,
          role: 'operator',
          factory: (l.Factory as FactoryName) || 'ALL',
          createdAt: l.Date || '2026-01-01'
        });
      }
    });

    const list = Array.from(userMap.values()).map(u => {
      const userLogs = safeLogs.filter(l => l.User === u.username);
      let lastDate = '';

      userLogs.forEach(l => {
        if (!lastDate || l.Date > lastDate) {
          lastDate = l.Date;
        }
      });

      return {
        username: u.username,
        fullName: u.fullName,
        factoryLock: u.factory,
        role: u.role,
        shiftsCount: userLogs.length,
        lastDate: lastDate || u.createdAt || 'N/A',
        status: (u.status || 'active') as UserStatus,
        pendingPasswordReset: u.pendingPasswordReset,
        pendingRoleChange: u.pendingRoleChange
      };
    }).sort((a, b) => {
      // Prioritize pending approvals (new accounts, password resets, role changes) at top
      const aNeedsAction = a.status === 'pending' || !!a.pendingPasswordReset || !!a.pendingRoleChange;
      const bNeedsAction = b.status === 'pending' || !!b.pendingPasswordReset || !!b.pendingRoleChange;
      if (aNeedsAction && !bNeedsAction) return -1;
      if (bNeedsAction && !aNeedsAction) return 1;
      return b.shiftsCount - a.shiftsCount;
    });

    let filtered = list;
    if (userStatusFilter !== 'ALL') {
      filtered = filtered.filter(u => u.status === userStatusFilter);
    }

    if (!userSearch.trim()) return filtered;
    const q = userSearch.toLowerCase();
    return filtered.filter(
      u =>
        u.username.toLowerCase().includes(q) ||
        u.fullName.toLowerCase().includes(q) ||
        u.factoryLock.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, logs, userSearch, userStatusFilter]);

  // Counts for user status badges
  const userCounts = useMemo(() => {
    let pending = 0;
    let active = 0;
    let suspended = 0;
    let pendingPasswordResets = 0;
    let pendingRoleChanges = 0;
    users.forEach(u => {
      const s = u.status || 'active';
      if (s === 'pending') pending++;
      else if (s === 'suspended') suspended++;
      else active++;
      if (u.pendingPasswordReset) pendingPasswordResets++;
      if (u.pendingRoleChange) pendingRoleChanges++;
    });
    return {
      total: users.length,
      pending,
      active,
      suspended,
      pendingPasswordResets,
      pendingRoleChanges
    };
  }, [users]);

  // Handlers for user management actions
  const handleApprovePasswordResetAction = async (targetUsername: string) => {
    try {
      if (onApprovePasswordReset) {
        await onApprovePasswordReset(targetUsername);
      } else {
        await approveServerPasswordReset(targetUsername);
      }
      setUserActionNotice(`Password reset approved for user "${targetUsername}". New password is now active.`);
      setTimeout(() => setUserActionNotice(null), 4000);
    } catch (err: any) {
      alert(`Error approving password reset: ${err.message}`);
    }
  };

  const handleRejectPasswordResetAction = async (targetUsername: string) => {
    try {
      if (onRejectPasswordReset) {
        await onRejectPasswordReset(targetUsername);
      } else {
        await rejectServerPasswordReset(targetUsername);
      }
      setUserActionNotice(`Password reset request rejected for user "${targetUsername}".`);
      setTimeout(() => setUserActionNotice(null), 4000);
    } catch (err: any) {
      alert(`Error rejecting password reset: ${err.message}`);
    }
  };

  const handleApproveRoleChangeAction = async (targetUsername: string) => {
    try {
      if (onApproveRoleChange) {
        await onApproveRoleChange(targetUsername);
      } else {
        await approveServerRoleChange(targetUsername);
      }
      setUserActionNotice(`Role change approved for user "${targetUsername}".`);
      setTimeout(() => setUserActionNotice(null), 4000);
    } catch (err: any) {
      alert(`Error approving role change: ${err.message}`);
    }
  };

  const handleRejectRoleChangeAction = async (targetUsername: string) => {
    try {
      if (onRejectRoleChange) {
        await onRejectRoleChange(targetUsername);
      } else {
        await rejectServerRoleChange(targetUsername);
      }
      setUserActionNotice(`Role change request rejected for user "${targetUsername}".`);
      setTimeout(() => setUserActionNotice(null), 4000);
    } catch (err: any) {
      alert(`Error rejecting role change: ${err.message}`);
    }
  };

  const handleQuickGrantAccess = (username: string) => {
    if (onUpdateUserStatus) {
      onUpdateUserStatus(username, 'active');
      setUserActionNotice(`Access successfully granted to user "${username}". They can now log in.`);
      setTimeout(() => setUserActionNotice(null), 4000);
    }
  };

  const handleQuickSuspendUser = (username: string) => {
    if (username === 'admin') {
      alert('Central Administrator cannot be suspended.');
      return;
    }
    if (onUpdateUserStatus) {
      onUpdateUserStatus(username, 'suspended');
      setUserActionNotice(`Account "${username}" suspended. Access revoked.`);
      setTimeout(() => setUserActionNotice(null), 4000);
    }
  };

  const handleCreateNewUserSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      alert('Username and password are required.');
      return;
    }
    const cleanUser = newUsername.trim().toLowerCase();
    if (users.some(u => u.username.toLowerCase() === cleanUser)) {
      alert('Username already exists. Please choose a unique username.');
      return;
    }

    const newUserObj: User = {
      id: `usr-${Date.now()}`,
      username: newUsername.trim(),
      fullName: newFullName.trim() || newUsername.trim(),
      role: newRole,
      factory: newFactory,
      status: newStatus,
      createdAt: new Date().toISOString().split('T')[0]
    };

    if (onCreateUser) {
      onCreateUser(newUserObj, newPassword);
      setUserActionNotice(`User "${newUserObj.username}" successfully created with role "${newRole}" and status "${newStatus}".`);
      setTimeout(() => setUserActionNotice(null), 4000);
    }

    // Reset form
    setNewUsername('');
    setNewFullName('');
    setNewPassword('');
    setNewRole('operator');
    setNewFactory('Kurunegala');
    setNewStatus('active');
    setIsAddUserOpen(false);
  };

  // User Edit Handlers (Admin can edit any user's details and password)
  const handleOpenEditUserModal = (user: User) => {
    setEditingUser(user);
    setEditFullName(user.fullName || user.username);
    setEditPassword(userPasswords[user.username] || '');
    setEditRole(user.role);
    setEditFactory(user.factory);
    setEditStatus(user.status || 'active');
    setShowEditPassword(false);
    setIsEditUserOpen(true);
  };

  const handleSaveUserEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    if (onUpdateUserDetails) {
      onUpdateUserDetails(
        editingUser.username,
        {
          fullName: editFullName.trim() || editingUser.username,
          role: editRole,
          factory: editFactory,
          status: editStatus
        },
        editPassword.trim() || undefined
      );
      setUserActionNotice(`User "${editingUser.username}" profile & password updated successfully.`);
      setTimeout(() => setUserActionNotice(null), 4000);
    }
    setIsEditUserOpen(false);
    setEditingUser(null);
  };

  const handleSaveInlinePassword = async (targetUsername: string, newPass: string) => {
    if (!isAdmin) {
      alert('Security Policy: Only Central Administrator is authorized to edit and save user passwords.');
      return;
    }
    const clean = newPass.trim();
    if (!clean || clean.length < 4) {
      alert('Password must be at least 4 characters long.');
      return;
    }
    setIsSavingInlinePassword(true);
    try {
      if (onUpdateUserPassword) {
        await onUpdateUserPassword(targetUsername, clean);
      } else if (onUpdateUserDetails) {
        const targetUser = users.find(u => u.username === targetUsername);
        if (targetUser) {
          onUpdateUserDetails(
            targetUsername,
            {
              fullName: targetUser.fullName,
              role: targetUser.role,
              factory: targetUser.factory,
              status: targetUser.status || 'active'
            },
            clean
          );
        }
      }
      setUserActionNotice(`Password for user "${targetUsername}" successfully updated and saved in User Sheet.`);
      setTimeout(() => setUserActionNotice(null), 4000);
      setEditingPasswordUsername(null);
    } catch (err: any) {
      alert(err.message || 'Failed to save password.');
    } finally {
      setIsSavingInlinePassword(false);
    }
  };

  const handleExportUsersSheet = () => {
    const headers = [
      'Username',
      'Full_Name',
      'Password',
      'Assigned_Plant_Lock',
      'Access_Role',
      'Total_Shifts_Logged',
      'Last_Active_Date',
      'Authorization_Status'
    ];
    const rows = userRecords.map(u => [
      u.username,
      u.fullName,
      userPasswords[u.username] || '******',
      u.factoryLock,
      u.role === 'admin' ? 'Central Executive Admin' : u.role === 'manager' ? 'Plant Manager' : u.role === 'supervisor' ? 'Line Supervisor' : 'Plant Shift Operator',
      u.shiftsCount,
      u.lastDate,
      u.status
    ]);
    exportGenericTableToCSV('Ebony_Holdings_Users_Master_Sheet', headers, rows);
  };

  // Factory Data Ops: Request Delete / Amend Handlers
  const handleOpenDeleteRequestModal = (log: ProductionLog) => {
    setTargetLogForRequest(log);
    setRequestReason('');
    setIsDeleteRequestModalOpen(true);
  };

  const handleOpenAmendRequestModal = (log: ProductionLog) => {
    setTargetLogForRequest(log);
    setRequestReason('');
    setAmendFormData({
      Date: log.Date,
      Factory: log.Factory,
      Line: log.Line,
      Supervisor: log.Supervisor,
      Style: log.Style,
      Product: log.Product,
      Brand: log.Brand,
      SMV: log.SMV,
      Planned_QTY: log.Planned_QTY,
      Actual_QTY: log.Actual_QTY,
      Plan_TMs: log.Plan_TMs,
      Actual_TMs: log.Actual_TMs,
      Present_TMs: log.Present_TMs,
      Hours_Worked: log.Hours_Worked,
      Remarks: log.Remarks
    });
    setIsAmendRequestModalOpen(true);
  };

  const handleSubmitDeleteRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLogForRequest) return;
    if (!requestReason.trim()) {
      alert('Please provide a specific reason for requesting deletion.');
      return;
    }
    try {
      const res = await submitChangeRequest({
        type: 'DELETE',
        entryId: targetLogForRequest.Entry_ID,
        logSnapshot: targetLogForRequest,
        reason: requestReason.trim(),
        requestedBy: currentUser?.username || 'operator',
        status: 'PENDING'
      });
      if (res.success) {
        setRequestNotice(`Deletion request for ${targetLogForRequest.Entry_ID} submitted to Central Admin.`);
        setTimeout(() => setRequestNotice(null), 5000);
        setIsDeleteRequestModalOpen(false);
        setTargetLogForRequest(null);
        refreshChangeRequests();
      } else {
        alert(res.message || 'Failed to submit deletion request.');
      }
    } catch (err: any) {
      alert(err.message || 'Error submitting request.');
    }
  };

  const handleSubmitAmendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetLogForRequest) return;
    if (!requestReason.trim()) {
      alert('Please state the reason why this production log is being amended/corrected.');
      return;
    }
    try {
      const res = await submitChangeRequest({
        type: 'EDIT',
        entryId: targetLogForRequest.Entry_ID,
        logSnapshot: targetLogForRequest,
        proposedChanges: amendFormData,
        reason: requestReason.trim(),
        requestedBy: currentUser?.username || 'operator',
        status: 'PENDING'
      });
      if (res.success) {
        setRequestNotice(`Amendment request for ${targetLogForRequest.Entry_ID} submitted to Central Admin.`);
        setTimeout(() => setRequestNotice(null), 5000);
        setIsAmendRequestModalOpen(false);
        setTargetLogForRequest(null);
        refreshChangeRequests();
      } else {
        alert(res.message || 'Failed to submit amendment request.');
      }
    } catch (err: any) {
      alert(err.message || 'Error submitting request.');
    }
  };

  // Admin Review Handlers
  const handleOpenReviewRequest = (req: DataChangeRequest) => {
    setSelectedRequestForReview(req);
    setAdminReviewNotes('');
    setAdminEditedValues(req.proposedChanges ? { ...req.proposedChanges } : {});
    setIsRequestsModalOpen(true);
  };

  const handleApproveDeleteRequest = async (req: DataChangeRequest) => {
    if (!confirm(`Are you sure you want to approve deletion of entry ${req.entryId}? This will delete the entry from the system and Google Sheet.`)) return;
    try {
      // 1. Delete from local state
      onDeleteLog(req.entryId);
      // 2. Delete from Google Sheet
      await deleteLogsFromGoogleSheet({ entryId: req.entryId, user: currentUser?.username || 'admin' });
      // 3. Mark request approved
      await reviewChangeRequest(req.id, 'APPROVED', currentUser?.username || 'admin', adminReviewNotes || 'Approved deletion');
      await refreshChangeRequests();
      setSelectedRequestForReview(null);
      setRequestNotice(`Entry ${req.entryId} has been deleted from Google Sheet and local system.`);
      setTimeout(() => setRequestNotice(null), 5000);
    } catch (err: any) {
      alert(`Error approving deletion: ${err.message}`);
    }
  };

  const handleApproveAmendRequest = async (req: DataChangeRequest) => {
    try {
      const smv = Number(adminEditedValues.SMV ?? req.proposedChanges?.SMV ?? req.logSnapshot.SMV) || 0;
      const actQty = Number(adminEditedValues.Actual_QTY ?? req.proposedChanges?.Actual_QTY ?? req.logSnapshot.Actual_QTY) || 0;
      const prodMins = Math.round(actQty * smv);
      const presTMs = Number(adminEditedValues.Present_TMs ?? req.proposedChanges?.Present_TMs ?? req.logSnapshot.Present_TMs) || 0;
      const hrs = Number(adminEditedValues.Hours_Worked ?? req.proposedChanges?.Hours_Worked ?? req.logSnapshot.Hours_Worked) || 0;
      const workedMins = Number((presTMs * hrs * 60).toFixed(2));
      const dt = adminEditedValues.Down_Time !== undefined
        ? Number(adminEditedValues.Down_Time)
        : Math.max(0, Math.round(workedMins - prodMins));

      const updatedLog: ProductionLog = {
        ...req.logSnapshot,
        ...(req.proposedChanges || {}),
        ...adminEditedValues,
        SMV: smv,
        Actual_QTY: actQty,
        Produced_Minutes: prodMins,
        Present_TMs: presTMs,
        Hours_Worked: hrs,
        Worked_Minutes: workedMins,
        Down_Time: dt
      };

      // 1. Update in local state
      if (onUpdateLog) {
        onUpdateLog(updatedLog);
      }
      // 2. Update in Google Sheet
      await updateLogToGoogleSheet(updatedLog, currentUser?.username || 'admin');
      // 3. Mark request approved
      await reviewChangeRequest(req.id, 'APPROVED', currentUser?.username || 'admin', adminReviewNotes || 'Approved amendment');
      await refreshChangeRequests();
      setSelectedRequestForReview(null);
      setRequestNotice(`Entry ${req.entryId} amended and resubmitted to Google Sheet successfully.`);
      setTimeout(() => setRequestNotice(null), 5000);
    } catch (err: any) {
      alert(`Error approving amendment: ${err.message}`);
    }
  };

  const handleRejectRequest = async (req: DataChangeRequest) => {
    try {
      await reviewChangeRequest(req.id, 'REJECTED', currentUser?.username || 'admin', adminReviewNotes || 'Rejected by Admin');
      await refreshChangeRequests();
      setSelectedRequestForReview(null);
      setRequestNotice(`Change request for ${req.entryId} was rejected.`);
      setTimeout(() => setRequestNotice(null), 5000);
    } catch (err: any) {
      alert(`Error rejecting request: ${err.message}`);
    }
  };

  // Direct Log Edit Handlers (Admin)
  const handleOpenDirectEditLog = (log: ProductionLog) => {
    setDirectEditLog({ ...log });
    setIsDirectEditOpen(true);
  };

  const handleSaveDirectEditLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directEditLog) return;
    try {
      const smv = Number(directEditLog.SMV) || 0;
      const actQty = Number(directEditLog.Actual_QTY) || 0;
      const prodMins = Math.round(actQty * smv);
      const presTMs = Number(directEditLog.Present_TMs) || 0;
      const hrs = Number(directEditLog.Hours_Worked) || 0;
      const workedMins = Number((presTMs * hrs * 60).toFixed(2));
      const dt = directEditLog.Down_Time !== undefined
        ? Number(directEditLog.Down_Time)
        : Math.max(0, Math.round(workedMins - prodMins));

      const normalized: ProductionLog = {
        ...directEditLog,
        SMV: smv,
        Actual_QTY: actQty,
        Produced_Minutes: prodMins,
        Present_TMs: presTMs,
        Hours_Worked: hrs,
        Worked_Minutes: workedMins,
        Down_Time: dt
      };

      if (onUpdateLog) {
        onUpdateLog(normalized);
      }
      await updateLogToGoogleSheet(normalized, currentUser?.username || 'admin');
      setIsDirectEditOpen(false);
      setDirectEditLog(null);
      setRequestNotice(`Production log entry ${normalized.Entry_ID} updated and synced to Google Sheet.`);
      setTimeout(() => setRequestNotice(null), 5000);
    } catch (err: any) {
      alert(`Error saving log: ${err.message}`);
    }
  };

  // -------------------------------------------------------------
  // 5. LINES SHEET DATA
  // -------------------------------------------------------------
  const lineRecords = useMemo(() => {
    const linesMap = new Map<string, ProductionLog[]>();
    logs.forEach(l => {
      const key = l.Line_No || `${l.Factory.charAt(0).toUpperCase()}${l.Line}`;
      if (!linesMap.has(key)) linesMap.set(key, []);
      linesMap.get(key)!.push(l);
    });

    const list = Array.from(linesMap.entries()).map(([lineNo, lLogs]) => {
      const factory = lLogs[0]?.Factory || 'Unknown';
      const baseLine = lLogs[0]?.Line || lineNo;
      const supervisorsSet = new Set<string>();
      const productsSet = new Set<string>();

      lLogs.forEach(l => {
        if (l.Supervisor) supervisorsSet.add(l.Supervisor);
        if (l.Product) productsSet.add(l.Product);
      });

      const lineMetrics = calculateAggregatedMetrics(lLogs);
      const avgPresentTMs = lineMetrics.shiftsCount > 0 ? (lineMetrics.totalPresentTM / lineMetrics.shiftsCount).toFixed(1) : '0';

      return {
        lineNo,
        factory,
        baseLine,
        supervisors: Array.from(supervisorsSet).sort(),
        products: Array.from(productsSet).sort(),
        shiftsCount: lineMetrics.shiftsCount,
        totalActual: lineMetrics.totalActual,
        avgPresentTMs: Number(avgPresentTMs),
        producedMins: lineMetrics.totalProdMinutes,
        workedMins: lineMetrics.totalWorkedMinutes,
        efficiency: lineMetrics.lineEfficiency
      };
    }).sort((a, b) => a.lineNo.localeCompare(b.lineNo, undefined, { numeric: true }));

    if (!lineSearch.trim()) return list;
    const q = lineSearch.toLowerCase();
    return list.filter(
      l =>
        l.lineNo.toLowerCase().includes(q) ||
        l.factory.toLowerCase().includes(q) ||
        l.supervisors.some(s => s.toLowerCase().includes(q)) ||
        l.products.some(p => p.toLowerCase().includes(q))
    );
  }, [logs, lineSearch]);

  const handleExportLinesSheet = () => {
    const headers = [
      'Line_No',
      'Factory_Plant',
      'Base_Line_ID',
      'Operating_Supervisors',
      'Manufactured_Products',
      'Total_Shift_Records',
      'Total_Actual_Output_QTY',
      'Average_Present_TMs',
      'Produced_Minutes',
      'Worked_Minutes',
      'Line_Efficiency_Pct'
    ];
    const rows = lineRecords.map(l => [
      l.lineNo,
      l.factory,
      l.baseLine,
      l.supervisors.join(' | '),
      l.products.join(' | '),
      l.shiftsCount,
      l.totalActual,
      l.avgPresentTMs,
      l.producedMins,
      l.workedMins,
      `${l.efficiency}%`
    ]);
    exportGenericTableToCSV('Ebony_Holdings_Lines_Master_Sheet', headers, rows);
  };

  const handleDelete = (id: string) => {
    onDeleteLog(id);
    setConfirmDeleteId(null);
  };

  // Safe downtime records
  const safeDowntimeRecords = useMemo(() => {
    return Array.isArray(allDowntimeLogs) ? allDowntimeLogs : [];
  }, [allDowntimeLogs]);

  // Filtered downtime records
  const filteredDowntimeRecords = useMemo(() => {
    return safeDowntimeRecords.filter(item => {
      if (!item) return false;

      // Factory filter (plant lock for operators or dropdown selection)
      if (userPlantRestriction && item.factory !== userPlantRestriction) {
        return false;
      }
      if (downtimeFactoryFilter !== 'ALL' && item.factory !== downtimeFactoryFilter) {
        return false;
      }

      // Date range filter
      if (downtimeStartDate && item.date < downtimeStartDate) {
        return false;
      }
      if (downtimeEndDate && item.date > downtimeEndDate) {
        return false;
      }

      // Category code filter
      if (downtimeCategoryFilter !== 'ALL') {
        const itemCode = (item.categoryCode || item.downtimeCategory || '').toUpperCase();
        if (!itemCode.includes(downtimeCategoryFilter.toUpperCase())) {
          return false;
        }
      }

      // Text search filter
      if (downtimeSearch.trim()) {
        const q = downtimeSearch.toLowerCase();
        const matches =
          (item.entryId || '').toLowerCase().includes(q) ||
          (item.line || '').toLowerCase().includes(q) ||
          (item.supervisor || '').toLowerCase().includes(q) ||
          (item.product || '').toLowerCase().includes(q) ||
          (item.style || '').toLowerCase().includes(q) ||
          (item.brand || '').toLowerCase().includes(q) ||
          (item.downtimeCategory || '').toLowerCase().includes(q) ||
          (item.categoryCode || '').toLowerCase().includes(q) ||
          (item.remarks || '').toLowerCase().includes(q) ||
          (item.user || '').toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [
    safeDowntimeRecords,
    userPlantRestriction,
    downtimeFactoryFilter,
    downtimeStartDate,
    downtimeEndDate,
    downtimeCategoryFilter,
    downtimeSearch
  ]);

  // Downtime summary statistics
  const downtimeMetrics = useMemo(() => {
    let totalMinutes = 0;
    const catMap: Record<string, number> = {};
    const plantMap: Record<string, number> = {};

    filteredDowntimeRecords.forEach(r => {
      const mins = Number(r.downtimeMinutes) || 0;
      totalMinutes += mins;
      const cat = r.categoryCode || r.downtimeCategory || 'Other';
      catMap[cat] = (catMap[cat] || 0) + mins;
      const f = r.factory || 'Unknown';
      plantMap[f] = (plantMap[f] || 0) + mins;
    });

    const totalHours = Number((totalMinutes / 60).toFixed(1));
    return {
      totalRecords: filteredDowntimeRecords.length,
      totalMinutes,
      totalHours,
      categoriesCount: Object.keys(catMap).length
    };
  }, [filteredDowntimeRecords]);

  // Downtime export to CSV
  const handleExportDowntimeCSV = () => {
    const headers = [
      'Record_ID',
      'Entry_ID',
      'Date',
      'Factory',
      'Line',
      'Supervisor',
      'Product',
      'Brand',
      'Style',
      'Category_Code',
      'Downtime_Category',
      'Downtime_Minutes',
      'Hours',
      'Remarks',
      'User',
      'Created_At'
    ];

    const rows = filteredDowntimeRecords.map(item => [
      item.id,
      item.entryId || '',
      item.date,
      item.factory,
      item.line,
      item.supervisor || '',
      item.product || '',
      item.brand || '',
      item.style || '',
      item.categoryCode || '',
      item.downtimeCategory || '',
      item.downtimeMinutes,
      Number((item.downtimeMinutes / 60).toFixed(2)),
      item.remarks || '',
      item.user || '',
      item.createdAt || ''
    ]);

    let filename = `Ebony_Holdings_Downtime_Master_${new Date().toISOString().split('T')[0]}`;
    if (downtimeStartDate && downtimeEndDate) {
      filename = `Ebony_Holdings_Downtime_${downtimeStartDate}_to_${downtimeEndDate}`;
    }
    exportGenericTableToCSV(filename, headers, rows);
  };

  // Downtime delete handler
  const handleDeleteDowntime = async (id: string) => {
    try {
      await deleteDowntimeLog(id);
      if (onDowntimeLogsUpdated) {
        const updated = safeDowntimeRecords.filter(d => d.id !== id);
        onDowntimeLogsUpdated(updated);
      }
      setDowntimeDeleteNotice('Downtime record deleted successfully.');
      setTimeout(() => setDowntimeDeleteNotice(null), 3000);
    } catch (err: any) {
      alert('Failed to delete downtime record: ' + err.message);
    } finally {
      setDowntimeConfirmDeleteId(null);
    }
  };

  const handleOpenDowntimeAmend = (item: DowntimeCategoryLog) => {
    setAmendDowntimeTarget(item);
    setDowntimeAmendForm({
      date: item.date,
      factory: item.factory,
      line: item.line,
      supervisor: item.supervisor || '',
      product: item.product || '',
      brand: item.brand || '',
      style: item.style || '',
      categoryCode: item.categoryCode || '',
      downtimeCategory: item.downtimeCategory || '',
      downtimeMinutes: item.downtimeMinutes,
      remarks: item.remarks || ''
    });
    setIsDowntimeAmendModalOpen(true);
  };

  const handleSaveDowntimeAmend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amendDowntimeTarget) return;
    setIsSavingDowntimeAmend(true);
    try {
      const mins = Number(downtimeAmendForm.downtimeMinutes) || 0;
      const rawCat = downtimeAmendForm.downtimeCategory || amendDowntimeTarget.downtimeCategory;
      const rawCode = downtimeAmendForm.categoryCode || (rawCat ? rawCat.split(' ')[0] : amendDowntimeTarget.categoryCode);

      const updates: Partial<DowntimeCategoryLog> = {
        ...downtimeAmendForm,
        categoryCode: rawCode,
        downtimeCategory: rawCat,
        downtimeMinutes: mins
      };

      const res = await updateDowntimeLog(amendDowntimeTarget.id, updates);
      if (res.success) {
        if (onDowntimeLogsUpdated) {
          const updated = safeDowntimeRecords.map(d =>
            d.id === amendDowntimeTarget.id ? { ...d, ...updates, ...(res.record || {}) } : d
          );
          onDowntimeLogsUpdated(updated);
        }
        setIsDowntimeAmendModalOpen(false);
        setAmendDowntimeTarget(null);
        setDowntimeDeleteNotice(`Downtime incident #${amendDowntimeTarget.id} amended and synced successfully.`);
        setTimeout(() => setDowntimeDeleteNotice(null), 4000);
      } else {
        alert(res.message || 'Failed to update downtime incident record.');
      }
    } catch (err: any) {
      alert('Error amending downtime record: ' + err.message);
    } finally {
      setIsSavingDowntimeAmend(false);
    }
  };

  const matchingDateRangeCount = useMemo(() => {
    if (!deleteStartDate && !deleteEndDate) return 0;
    return safeLogs.filter(l => {
      const d = l.Date;
      const inRange = (!deleteStartDate || d >= deleteStartDate) && (!deleteEndDate || d <= deleteEndDate);
      const inFactory = deleteFactory === 'ALL' || l.Factory === deleteFactory;
      return inRange && inFactory;
    }).length;
  }, [safeLogs, deleteStartDate, deleteEndDate, deleteFactory]);

  const handleConfirmDateRangeDelete = () => {
    if (matchingDateRangeCount === 0) return;
    if (onDeleteLogsByDateRange) {
      onDeleteLogsByDateRange(deleteStartDate, deleteEndDate, deleteFactory);
    } else {
      logs.forEach(l => {
        const d = l.Date;
        const inRange = (!deleteStartDate || d >= deleteStartDate) && (!deleteEndDate || d <= deleteEndDate);
        const inFactory = deleteFactory === 'ALL' || l.Factory === deleteFactory;
        if (inRange && inFactory) {
          onDeleteLog(l.Entry_ID);
        }
      });
    }
    setBatchDeleteNotice(`Deleted ${matchingDateRangeCount} records successfully.`);
    setTimeout(() => {
      setBatchDeleteNotice(null);
      setIsDateRangeDeleteOpen(false);
      setDeleteStartDate('');
      setDeleteEndDate('');
    }, 1200);
  };

  // Sheet definition list for navigation tabs - restricted to Admin only!
  const sheets = isAdmin
    ? [
        { id: 'LOGS' as MasterSheetTab, label: 'Production Logs', icon: Table, count: logs.length, badge: '22 COLS' },
        { id: 'DOWNTIME' as MasterSheetTab, label: 'Downtime Sheet', icon: Wrench, count: safeDowntimeRecords.length, badge: 'DT LOGS' },
        { id: 'FACTORIES' as MasterSheetTab, label: 'Factory Sheet', icon: Factory, count: factoryRecords.length, badge: 'PLANTS' },
        { id: 'PRODUCTS' as MasterSheetTab, label: 'Products Sheet', icon: Shirt, count: productRecords.length, badge: 'ITEMS' },
        { id: 'USERS' as MasterSheetTab, label: 'Users Sheet', icon: Users, count: userRecords.length, badge: userCounts.pending > 0 ? `${userCounts.pending} PENDING` : 'STAFF' },
        { id: 'LINES' as MasterSheetTab, label: 'Lines Sheet', icon: Layers, count: lineRecords.length, badge: 'LINES' }
      ]
    : [
        { id: 'LOGS' as MasterSheetTab, label: 'Production Logs', icon: Table, count: filteredLogs.length, badge: '22 COLS' },
        { id: 'DOWNTIME' as MasterSheetTab, label: 'Downtime Sheet', icon: Wrench, count: filteredDowntimeRecords.length, badge: 'DT LOGS' }
      ];

  return (
    <div className="space-y-4">
      
      {/* ------------------------------------------------------------- */}
      {/* WORKBOOK TAB BAR (Separate sheets navigation)                  */}
      {/* ------------------------------------------------------------- */}
      <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-2.5 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          {sheets.map(sheet => {
            const Icon = sheet.icon;
            const isActive = activeSheet === sheet.id;
            return (
              <button
                key={sheet.id}
                type="button"
                onClick={() => setActiveSheet(sheet.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  isActive
                    ? 'bg-sky-500 text-white shadow-sm shadow-sky-950 font-black'
                    : 'bg-[#0d1625] text-slate-400 hover:text-white hover:bg-[#1a2840] border border-[#1c2b44]'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-sky-400'}`} />
                <span>{sheet.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded font-mono font-bold ${
                    isActive ? 'bg-sky-900/60 text-sky-200' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {sheet.count}
                </span>
                {sheet.id === 'USERS' && userCounts.pending > 0 && (
                  <span className="text-[9px] bg-amber-400 text-slate-950 font-black px-1.5 py-0.2 rounded-full animate-pulse shadow-sm">
                    {userCounts.pending} Pending
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {currentUser?.role === 'admin' && onOpenSheetModal && (
            <button
              type="button"
              onClick={onOpenSheetModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0d1625] border border-emerald-500/40 hover:bg-[#1a2840] text-emerald-300 text-xs font-bold transition cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Google Sheet Live Sync</span>
            </button>
          )}
        </div>
      </div>

      {/* ============================================================= */}
      {/* 1. PRODUCTION LOGS SHEET (22 Columns)                         */}
      {/* ============================================================= */}
      {activeSheet === 'LOGS' && (
        <div className="space-y-4">
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-3.5 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-sky-500 rounded-full"></span>
                  <Table className="w-4 h-4 text-sky-400" />
                  <h2 className="text-xs font-black uppercase text-white tracking-widest">
                    Production Logs Master Sheet
                  </h2>
                  <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-700/60 font-mono font-bold px-1.5 py-0.5 rounded">
                    22 MASTER COLUMNS
                  </span>
                  {userPlantRestriction && (
                    <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-700/60 font-bold px-2 py-0.5 rounded">
                      Allocated: {userPlantRestriction} Plant
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    let customFilename = `Ebony_Holdings_Production_Master_${new Date().toISOString().split('T')[0]}.csv`;
                    if (startDateFilter && endDateFilter) {
                      customFilename = `Ebony_Holdings_Production_Master_${startDateFilter}_to_${endDateFilter}.csv`;
                    } else if (startDateFilter) {
                      customFilename = `Ebony_Holdings_Production_Master_from_${startDateFilter}.csv`;
                    } else if (endDateFilter) {
                      customFilename = `Ebony_Holdings_Production_Master_until_${endDateFilter}.csv`;
                    }
                    exportToCSV(filteredLogs, customFilename);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-950 transition w-full sm:w-auto cursor-pointer"
                  title="Export filtered logs to CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Logs CSV (22 Cols)</span>
                  {(startDateFilter || endDateFilter) && (
                    <span className="text-[10px] bg-emerald-700/80 px-1.5 py-0.2 rounded font-mono ml-0.5">
                      {filteredLogs.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLookupEntryId('');
                    setIsEntryIdRequestModalOpen(true);
                  }}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-sm shadow-cyan-950 transition w-full sm:w-auto cursor-pointer"
                  title="Look up an Entry ID to review recorded shift fields and submit amendment or deletion request"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Request Amend / Delete (By Entry ID)</span>
                </button>

                {isAdmin ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsRequestsModalOpen(true);
                        setRequestFilter('PENDING');
                      }}
                      className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition w-full sm:w-auto cursor-pointer shadow-sm ${
                        pendingRequestsCount > 0
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-black animate-pulse'
                          : 'bg-[#0d1625] hover:bg-slate-800 text-amber-300 border border-amber-500/40'
                      }`}
                      title="Review Operator Change and Deletion Requests"
                    >
                      <Clock className="w-3.5 h-3.5" />
                      <span>Review Requests ({pendingRequestsCount})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsDateRangeDeleteOpen(true)}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm shadow-rose-950 transition w-full sm:w-auto cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete by Date Range</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (filteredLogs.length > 0) {
                        handleOpenAmendRequestModal(filteredLogs[0]);
                      } else {
                        alert('No logs available to request modification.');
                      }
                    }}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-sm shadow-sky-950 transition w-full sm:w-auto cursor-pointer"
                    title="Request Admin to delete or amend a production log"
                  >
                    <FileEdit className="w-3.5 h-3.5" />
                    <span>Request Amend / Delete</span>
                  </button>
                )}
              </div>
            </div>

            {/* Change Request Alerts & Banners */}
            {requestNotice && (
              <div className="p-3 rounded-lg bg-cyan-950/80 border border-cyan-500/60 text-cyan-200 text-xs flex items-center justify-between gap-2 shadow-sm animate-fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{requestNotice}</span>
                </div>
                <button onClick={() => setRequestNotice(null)} className="text-cyan-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {isAdmin && pendingRequestsCount > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
                  <div>
                    <span className="font-black text-amber-300 uppercase tracking-wide">
                      {pendingRequestsCount} Factory Data Ops Request{pendingRequestsCount > 1 ? 's' : ''} Awaiting Review
                    </span>
                    <p className="text-slate-300 text-[11px] mt-0.5">
                      Factory operators have submitted deletion and amendment requests with reasons and corrected values.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsRequestsModalOpen(true);
                    setRequestFilter('PENDING');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shrink-0 self-start sm:self-auto cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Review Operator Requests ({pendingRequestsCount})</span>
                </button>
              </div>
            )}

            {/* Filters Bar: Search, Plant, Date Range */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 pt-1 text-xs">
              <div className="relative lg:col-span-4">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search Style, Supervisor, Line, Remarks..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none text-xs"
                />
              </div>

              <div className="lg:col-span-3">
                <select
                  value={selectedFactory}
                  onChange={e => setSelectedFactory(e.target.value)}
                  className={`w-full bg-[#0d1625] border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none ${
                    selectedFactory !== 'ALL'
                      ? 'border-cyan-500/80 text-cyan-300 font-bold'
                      : 'border-slate-700/70 text-white focus:border-cyan-500'
                  }`}
                >
                  <option value="ALL">All Factory Plants</option>
                  {FACTORIES.map(f => (
                    <option key={f} value={f}>{f} Plant</option>
                  ))}
                </select>
              </div>

              {/* Date Range: From Date & To Date */}
              <div className="lg:col-span-5 flex items-center gap-2">
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 whitespace-nowrap">From:</span>
                  <input
                    type="date"
                    value={startDateFilter}
                    onChange={e => setStartDateFilter(e.target.value)}
                    className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2 py-1.5 text-white focus:border-cyan-500 focus:outline-none text-xs"
                    title="Filter logs starting from this date"
                  />
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[10px] uppercase font-bold text-slate-400 whitespace-nowrap">To:</span>
                  <input
                    type="date"
                    value={endDateFilter}
                    onChange={e => setEndDateFilter(e.target.value)}
                    className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2 py-1.5 text-white focus:border-cyan-500 focus:outline-none text-xs"
                    title="Filter logs up to this date"
                  />
                </div>
              </div>
            </div>

            {/* Quick Date Presets Toolbar & Status */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80 text-[11px]">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-cyan-400" />
                  Date Range:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    setStartDateFilter(todayStr);
                    setEndDateFilter(todayStr);
                  }}
                  className="px-2 py-0.5 rounded bg-[#0d1625] hover:bg-[#1c2b44] text-cyan-300 hover:text-white border border-slate-700/60 transition cursor-pointer text-[10px] font-bold"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const end = d.toISOString().split('T')[0];
                    d.setDate(d.getDate() - 7);
                    const start = d.toISOString().split('T')[0];
                    setStartDateFilter(start);
                    setEndDateFilter(end);
                  }}
                  className="px-2 py-0.5 rounded bg-[#0d1625] hover:bg-[#1c2b44] text-cyan-300 hover:text-white border border-slate-700/60 transition cursor-pointer text-[10px] font-bold"
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const d = new Date();
                    const end = d.toISOString().split('T')[0];
                    d.setDate(d.getDate() - 30);
                    const start = d.toISOString().split('T')[0];
                    setStartDateFilter(start);
                    setEndDateFilter(end);
                  }}
                  className="px-2 py-0.5 rounded bg-[#0d1625] hover:bg-[#1c2b44] text-cyan-300 hover:text-white border border-slate-700/60 transition cursor-pointer text-[10px] font-bold"
                >
                  Last 30 Days
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const now = new Date();
                    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                    const end = now.toISOString().split('T')[0];
                    setStartDateFilter(start);
                    setEndDateFilter(end);
                  }}
                  className="px-2 py-0.5 rounded bg-[#0d1625] hover:bg-[#1c2b44] text-cyan-300 hover:text-white border border-slate-700/60 transition cursor-pointer text-[10px] font-bold"
                >
                  This Month
                </button>
                {(startDateFilter || endDateFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setStartDateFilter('');
                      setEndDateFilter('');
                    }}
                    className="px-2 py-0.5 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 transition cursor-pointer text-[10px] font-bold"
                  >
                    Clear Dates
                  </button>
                )}
              </div>

              <div className="text-slate-400 text-[11px]">
                {(startDateFilter || endDateFilter) ? (
                  <span className="text-cyan-300 font-medium">
                    Filtered Range: <span className="font-mono font-bold text-white">{startDateFilter || 'Earliest'}</span> to <span className="font-mono font-bold text-white">{endDateFilter || 'Latest'}</span> (<span className="text-emerald-400 font-bold">{filteredLogs.length}</span> records for export)
                  </span>
                ) : (
                  <span>All dates active (<span className="text-emerald-400 font-bold">{filteredLogs.length}</span> records total)</span>
                )}
              </div>
            </div>
          </div>

          {/* 22-Column Master Table */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto max-h-[620px] scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#0d1625] text-slate-400 text-[10px] uppercase font-black tracking-wider sticky top-0 z-10 border-b border-[#1c2b44]">
                  <tr>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">#</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">Entry ID</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">Timestamp</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">Date</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">Factory</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">Line</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-cyan-400">Line No</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">Supervisor</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-white">Style</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">Product</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">Brand</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right">SMV</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right">Planned Qty</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right text-emerald-400">Actual Qty</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right text-cyan-400">Prod Mins</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right">Plan TMs</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right">Act TMs</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right">Present TMs</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right text-cyan-400">Hours Worked</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right">Worked Mins</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right text-emerald-400">Efficiency</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625] text-right">Down Time</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">Remarks</th>
                    <th className="p-2.5 border-r border-[#1c2b44] bg-[#0d1625]">User</th>
                    <th className="p-2.5 text-center bg-[#0d1625] min-w-[120px]">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b44]/60 font-mono text-[11px]">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={25} className="p-8 text-center text-slate-500 font-sans">
                        No production records match your filter criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log, index) => {
                      const shiftKey = `${log.Date}__${log.Factory}__${log.Line}`;
                      const shiftInfo = multiStyleShiftMap.get(shiftKey);
                      const isMultiStyle = !!(shiftInfo && shiftInfo.count > 1);
                      const pMins = getEffectiveProducedMinutes(log);
                      const wMins = getEffectiveWorkedMinutes(log);
                      const styleEff = wMins > 0 ? ((pMins / wMins) * 100).toFixed(1) : '0.0';

                      return (
                        <tr key={log.Entry_ID || index} className="hover:bg-slate-800/40 text-slate-300 transition">
                          <td className="p-2.5 text-slate-500 font-mono text-[10px] border-r border-slate-800/80">{index + 1}</td>
                          <td className="p-2.5 text-sky-400 font-bold border-r border-slate-800/80">{log.Entry_ID}</td>
                          <td className="p-2.5 text-slate-400 border-r border-slate-800/80">{log.Timestamp || '-'}</td>
                          <td className="p-2.5 text-slate-200 border-r border-slate-800/80">{log.Date}</td>
                          <td className="p-2.5 text-white font-semibold border-r border-slate-800/80">{log.Factory}</td>
                          <td className="p-2.5 text-slate-300 border-r border-slate-800/80">{log.Line}</td>
                          <td className="p-2.5 font-bold text-cyan-400 border-r border-slate-800/80">{log.Line_No}</td>
                          <td className="p-2.5 text-slate-200 border-r border-slate-800/80">{log.Supervisor}</td>
                          <td className="p-2.5 font-bold text-white border-r border-slate-800/80">
                            <div className="flex items-center gap-1.5">
                              <span>{log.Style || '-'}</span>
                              {isMultiStyle && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] bg-purple-950 text-purple-300 border border-purple-600/60 font-mono font-bold whitespace-nowrap"
                                  title={`Multi-Style Line (${shiftInfo.count} styles). Line efficiency: ${shiftInfo.lineEfficiency}%, Fixed Line TM: ${shiftInfo.fixedPresentTMs}`}
                                >
                                  Multi-Style
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="p-2.5 text-slate-300 border-r border-slate-800/80">{log.Product}</td>
                          <td className="p-2.5 text-slate-300 border-r border-slate-800/80">{log.Brand}</td>
                          <td className="p-2.5 text-right text-slate-300 border-r border-slate-800/80">{log.SMV}</td>
                          <td className="p-2.5 text-right text-slate-400 border-r border-slate-800/80">{log.Planned_QTY}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-400 border-r border-slate-800/80">{log.Actual_QTY}</td>
                          <td className="p-2.5 text-right font-bold text-cyan-400 border-r border-slate-800/80">{log.Produced_Minutes}</td>
                          <td className="p-2.5 text-right text-slate-400 border-r border-slate-800/80">{log.Plan_TMs}</td>
                          <td className="p-2.5 text-right text-slate-400 border-r border-slate-800/80">{log.Actual_TMs}</td>
                          <td className="p-2.5 text-right font-bold text-slate-200 border-r border-slate-800/80">
                            <div>{log.Present_TMs}</div>
                            {isMultiStyle && (
                              <div
                                className="text-[9px] text-cyan-400 font-sans font-medium"
                                title={`Line has a fixed count of ${shiftInfo.fixedPresentTMs} TMs for all day (not divided or summed style-wise)`}
                              >
                                Fixed: {shiftInfo.fixedPresentTMs}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-bold text-cyan-400 border-r border-slate-800/80">
                            {log.Hours_Worked}
                            {log.Hours_Adjustment !== undefined && log.Hours_Adjustment !== 0 && (
                              <span 
                                title={`Hours Adjustment: ${log.Hours_Adjustment > 0 ? `+${log.Hours_Adjustment}` : log.Hours_Adjustment} hrs (${log.Hours_Adjustment > 0 ? `+${log.Hours_Adjustment * 60}` : log.Hours_Adjustment * 60} mins)${log.Hours_Adjustment_Reason ? ` - ${log.Hours_Adjustment_Reason}` : ''}`}
                                className={`ml-1 text-[9px] font-mono px-1 py-0.5 rounded border inline-block ${
                                  log.Hours_Adjustment > 0 
                                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60' 
                                    : 'bg-rose-950/80 text-rose-300 border-rose-700/60'
                                }`}
                              >
                                {log.Hours_Adjustment > 0 ? `+${log.Hours_Adjustment}h` : `${log.Hours_Adjustment}h`}
                              </span>
                            )}
                          </td>
                          <td className="p-2.5 text-right text-slate-300 border-r border-slate-800/80">{log.Worked_Minutes}</td>
                          <td className="p-2.5 text-right font-bold border-r border-slate-800/80">
                            {isMultiStyle ? (
                              <div title={`Multi-style Line: Line efficiency is ${shiftInfo.lineEfficiency}% (Produced Mins: ${shiftInfo.shiftProducedMinutes.toLocaleString()} / Worked Mins: ${shiftInfo.shiftWorkedMinutes.toLocaleString()} [${shiftInfo.fixedPresentTMs} TMs × ${shiftInfo.shiftHoursWorked} hrs]) | Style: ${styleEff}%`}>
                                <div className="text-emerald-400 font-mono text-xs">{shiftInfo.lineEfficiency}%</div>
                                <div className="text-[9px] text-purple-400 font-sans font-medium">Line Eff</div>
                              </div>
                            ) : (
                              <div className="text-emerald-400 font-mono">{styleEff}%</div>
                            )}
                          </td>
                          <td className="p-2.5 text-right text-rose-400 border-r border-slate-800/80">{log.Down_Time}</td>
                          <td className="p-2.5 text-slate-300 font-sans border-r border-slate-800/80 max-w-xs truncate" title={log.Remarks}>
                            {log.Remarks || '-'}
                          </td>
                          <td className="p-2.5 text-purple-300 font-sans border-r border-slate-800/80">{log.User}</td>
                          <td className="p-2.5 text-center">
                            {(() => {
                              const pendingReq = pendingRequestsMap.get(log.Entry_ID);
                              if (pendingReq) {
                                return (
                                  <div className="flex items-center justify-center gap-1">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                        pendingReq.type === 'DELETE'
                                          ? 'bg-rose-950/80 text-rose-300 border-rose-600/60'
                                          : 'bg-sky-950/80 text-sky-300 border-sky-600/60'
                                      }`}
                                      title={`Requested by ${pendingReq.requestedBy}: ${pendingReq.reason}`}
                                    >
                                      {pendingReq.type === 'DELETE' ? 'Del Req' : 'Amend Req'}
                                    </span>
                                    {isAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => handleOpenReviewRequest(pendingReq)}
                                        className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 hover:bg-amber-400 text-[10px] font-black transition shadow-sm cursor-pointer"
                                        title="Review operator request"
                                      >
                                        Review
                                      </button>
                                    )}
                                  </div>
                                );
                              }

                              if (isAdmin) {
                                return confirmDeleteId === log.Entry_ID ? (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      onClick={() => handleDelete(log.Entry_ID)}
                                      className="p-1 rounded bg-rose-600 hover:bg-rose-500 text-white transition text-[10px]"
                                      title="Confirm delete"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={() => setConfirmDeleteId(null)}
                                      className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 transition text-[10px]"
                                      title="Cancel"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center justify-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenDirectEditLog(log)}
                                      className="p-1 rounded text-slate-400 hover:text-sky-300 hover:bg-sky-950/40 transition cursor-pointer"
                                      title="Edit log entry & resubmit to Google Sheet"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(log.Entry_ID)}
                                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                                      title="Delete entry from system and Google Sheet"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                );
                              }

                              // Factory Data Ops (Operators / Non-Admins)
                              return (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLookupEntryId(log.Entry_ID);
                                      setIsEntryIdRequestModalOpen(true);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-700/60 text-[10px] font-bold transition flex items-center gap-0.5 cursor-pointer"
                                    title="Request Admin to amend/correct this log"
                                  >
                                    <FileEdit className="w-3 h-3" />
                                    <span>Amend</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setLookupEntryId(log.Entry_ID);
                                      setIsEntryIdRequestModalOpen(true);
                                    }}
                                    className="px-1.5 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-[10px] font-bold transition flex items-center gap-0.5 cursor-pointer"
                                    title="Request Admin to delete this log"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Del</span>
                                  </button>
                                </div>
                              );
                            })()}
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
      )}

      {/* ============================================================= */}
      {/* 2. FACTORY MASTER SHEET                                       */}
      {/* ============================================================= */}
      {activeSheet === 'FACTORIES' && (
        <div className="space-y-4">
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-3.5 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-sky-500 rounded-full"></span>
                  <Factory className="w-4 h-4 text-sky-400" />
                  <h2 className="text-xs font-black uppercase text-white tracking-widest">
                    Factory Plants Master Sheet
                  </h2>
                  <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-700/60 font-mono font-bold px-1.5 py-0.5 rounded">
                    PLANT DIRECTORY & METRICS
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Aggregated operations data by factory plant: active lines, capacity, produced minutes, and plant efficiencies.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleExportFactorySheet}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-950 transition w-full sm:w-auto cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Factory Sheet CSV</span>
                </button>
              </div>
            </div>

            {/* Factory Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1c2b44] text-xs">
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Manufacturing Plants</span>
                <span className="text-white font-mono font-bold text-sm">{factoryRecords.length} Plants</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Total Output</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  {factoryRecords.reduce((acc, f) => acc + f.actualQty, 0).toLocaleString()} pcs
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Total Lines Active</span>
                <span className="text-cyan-400 font-mono font-bold text-sm">
                  {new Set(factoryRecords.flatMap(f => f.activeLines)).size} Lines
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Company Avg Efficiency</span>
                <span className="text-white font-mono font-bold text-sm">
                  {factoryRecords.length > 0
                    ? (
                        factoryRecords.reduce((acc, f) => acc + f.efficiency, 0) / factoryRecords.length
                      ).toFixed(1)
                    : '0.0'}%
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="relative pt-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search Factory Plant, Prefix, or Supervisor..."
                value={factorySearch}
                onChange={e => setFactorySearch(e.target.value)}
                className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none text-xs"
              />
            </div>
          </div>

          {/* Factory Table */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#0d1625] text-slate-400 text-[10px] uppercase font-black tracking-wider border-b border-[#1c2b44]">
                  <tr>
                    <th className="p-3 border-r border-[#1c2b44]">Plant</th>
                    <th className="p-3 border-r border-[#1c2b44]">Prefix</th>
                    <th className="p-3 border-r border-[#1c2b44]">Active Lines</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Shifts Logged</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Planned QTY</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right text-emerald-400">Actual QTY</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Variance</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Fulfillment</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right text-cyan-400">Produced Mins</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Worked Mins</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Efficiency</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Attendance</th>
                    <th className="p-3">Supervisors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b44]/60 font-mono text-[11px]">
                  {factoryRecords.length === 0 ? (
                    <tr>
                      <td colSpan={13} className="p-8 text-center text-slate-500 font-sans">
                        No factories match your search query.
                      </td>
                    </tr>
                  ) : (
                    factoryRecords.map(f => (
                      <tr key={f.factory} className="hover:bg-slate-800/40 text-slate-300 transition">
                        <td className="p-3 border-r border-slate-800/80 font-sans font-bold text-white flex items-center gap-2">
                          <Factory className="w-3.5 h-3.5 text-sky-400" />
                          <span>{f.factory} Plant</span>
                        </td>
                        <td className="p-3 border-r border-slate-800/80">
                          <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 font-bold">
                            {f.prefix}
                          </span>
                        </td>
                        <td className="p-3 border-r border-slate-800/80 font-sans">
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {f.activeLines.map(line => (
                              <span key={line} className="px-1.5 py-0.5 rounded bg-[#0d1625] text-cyan-300 border border-cyan-800/50 text-[10px] font-mono font-bold">
                                {line}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-white font-bold">{f.shiftsCount}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-slate-400">{f.plannedQty.toLocaleString()}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 font-bold text-emerald-400">{f.actualQty.toLocaleString()}</td>
                        <td className={`p-3 text-right border-r border-slate-800/80 font-bold ${f.variance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {f.variance >= 0 ? `+${f.variance.toLocaleString()}` : f.variance.toLocaleString()}
                        </td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-slate-300">{f.fulfillmentPct}%</td>
                        <td className="p-3 text-right border-r border-slate-800/80 font-bold text-cyan-400">{f.producedMins.toLocaleString()}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-slate-400">{f.workedMins.toLocaleString()}</td>
                        <td className="p-3 text-right border-r border-slate-800/80">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            f.efficiency >= 75
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : f.efficiency >= 60
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}>
                            {f.efficiency}%
                          </span>
                        </td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-emerald-400 font-bold">{f.attendance}%</td>
                        <td className="p-3 font-sans text-slate-300 text-[10px] max-w-xs truncate" title={f.supervisors.join(', ')}>
                          {f.supervisors.join(', ') || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 3. PRODUCTS MASTER SHEET                                      */}
      {/* ============================================================= */}
      {activeSheet === 'PRODUCTS' && (
        <div className="space-y-4">
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-3.5 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-sky-500 rounded-full"></span>
                  <Shirt className="w-4 h-4 text-sky-400" />
                  <h2 className="text-xs font-black uppercase text-white tracking-widest">
                    Products & Garment Categories Master Sheet
                  </h2>
                  <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-700/60 font-mono font-bold px-1.5 py-0.5 rounded">
                    GARMENT CATEGORIES & SMV
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Itemized performance across apparel categories: style count, average SMV, volume shares, and category efficiency.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleExportProductsSheet}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-950 transition w-full sm:w-auto cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Products Sheet CSV</span>
                </button>
              </div>
            </div>

            {/* Product Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1c2b44] text-xs">
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Active Categories</span>
                <span className="text-white font-mono font-bold text-sm">{productRecords.length} Categories</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Top Volume Category</span>
                <span className="text-cyan-400 font-sans font-bold text-sm truncate block">
                  {productRecords[0]?.product || 'N/A'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Average SMV (Company)</span>
                <span className="text-white font-mono font-bold text-sm">
                  {productRecords.length > 0
                    ? (
                        productRecords.reduce((acc, p) => acc + p.avgSmv, 0) / productRecords.length
                      ).toFixed(1)
                    : '0.0'} min
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Total Garments Produced</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  {productRecords.reduce((acc, p) => acc + p.actualQty, 0).toLocaleString()} pcs
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="relative pt-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search Product Category, Brand (e.g. VANTAGE, PRIMARK)..."
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none text-xs"
              />
            </div>
          </div>

          {/* Products Table */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#0d1625] text-slate-400 text-[10px] uppercase font-black tracking-wider border-b border-[#1c2b44]">
                  <tr>
                    <th className="p-3 border-r border-[#1c2b44]">Product Category</th>
                    <th className="p-3 border-r border-[#1c2b44]">Brands</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Unique Styles</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right text-cyan-400">Avg SMV</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Shifts Run</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Planned QTY</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right text-emerald-400">Actual QTY</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Fulfillment</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right text-cyan-400">Produced Mins</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Worked Mins</th>
                    <th className="p-3 text-right">Efficiency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b44]/60 font-mono text-[11px]">
                  {productRecords.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-slate-500 font-sans">
                        No product categories match your search query.
                      </td>
                    </tr>
                  ) : (
                    productRecords.map(p => (
                      <tr key={p.product} className="hover:bg-slate-800/40 text-slate-300 transition">
                        <td className="p-3 border-r border-slate-800/80 font-sans font-bold text-white flex items-center gap-2">
                          <Shirt className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{p.product}</span>
                        </td>
                        <td className="p-3 border-r border-slate-800/80 font-sans">
                          <div className="flex flex-wrap gap-1">
                            {p.brands.map(b => (
                              <span key={b} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] font-semibold">
                                {b}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-white font-bold">{p.stylesCount}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-cyan-400 font-bold">{p.avgSmv} min</td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-slate-400">{p.shiftsCount}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-slate-400">{p.plannedQty.toLocaleString()}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 font-bold text-emerald-400">{p.actualQty.toLocaleString()}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-slate-300">{p.fulfillmentPct}%</td>
                        <td className="p-3 text-right border-r border-slate-800/80 font-bold text-cyan-400">{p.producedMins.toLocaleString()}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-slate-400">{p.workedMins.toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            p.efficiency >= 75
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : p.efficiency >= 60
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}>
                            {p.efficiency}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 4. USERS MASTER SHEET - ACCESS & ROLE MANAGEMENT              */}
      {/* ============================================================= */}
      {activeSheet === 'USERS' && (
        <div className="space-y-4">

          {/* Feedback banner */}
          {userActionNotice && (
            <div className="p-3 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between shadow-sm animate-fade-in">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{userActionNotice}</span>
              </div>
              <button onClick={() => setUserActionNotice(null)} className="text-slate-400 hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* User Management Header */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-3.5 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-sky-500 rounded-full"></span>
                  <Users className="w-4 h-4 text-sky-400" />
                  <h2 className="text-xs font-black uppercase text-white tracking-widest">
                    Users & Personnel Master Sheet
                  </h2>
                  <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-700/60 font-mono font-bold px-1.5 py-0.5 rounded">
                    ACCESS GRANTS, ROLES & FACTORY LOCKS
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Approve newly registered accounts, grant access, assign factory locks, configure roles, and monitor shift logging metrics.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(true)}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold shadow-sm shadow-sky-950 transition cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>+ Register New User</span>
                </button>
                <button
                  type="button"
                  onClick={handleExportUsersSheet}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-950 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Users Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1c2b44] text-xs">
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Total Accounts</span>
                <span className="text-white font-mono font-bold text-sm">{userCounts.total} Users</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-emerald-500/30">
                <span className="text-emerald-400 text-[9px] block uppercase font-black tracking-wider">Active & Authorized</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">{userCounts.active} Active</span>
              </div>
              <div className={`p-2.5 rounded-lg bg-[#0d1625] border ${userCounts.pending > 0 ? 'border-amber-500/60 bg-amber-500/5' : 'border-[#1c2b44]'}`}>
                <span className="text-amber-400 text-[9px] block uppercase font-black tracking-wider flex items-center gap-1">
                  Pending Approval
                  {userCounts.pending > 0 && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>}
                </span>
                <span className="text-amber-300 font-mono font-bold text-sm">{userCounts.pending} Awaiting Grant</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-rose-500/30">
                <span className="text-rose-400 text-[9px] block uppercase font-black tracking-wider">Suspended Accounts</span>
                <span className="text-rose-300 font-mono font-bold text-sm">{userCounts.suspended} Suspended</span>
              </div>
            </div>

            {/* Admin Action Alert: New Registrations Pending Approval */}
            {userCounts.pending > 0 && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-sm animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
                  <div>
                    <span className="font-black text-amber-300 uppercase tracking-wide">
                      {userCounts.pending} New User Registration{userCounts.pending > 1 ? 's' : ''} Awaiting Admin Grant
                    </span>
                    <p className="text-slate-300 text-[11px] mt-0.5">
                      New users cannot log in until you approve them. Review each account below and click <span className="font-bold text-emerald-300">"Grant Access"</span> to activate their login permissions.
                    </p>
                  </div>
                </div>
                {userStatusFilter !== 'pending' && (
                  <button
                    type="button"
                    onClick={() => setUserStatusFilter('pending')}
                    className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shrink-0 self-start sm:self-auto cursor-pointer flex items-center gap-1.5 shadow-sm"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Filter Pending ({userCounts.pending})</span>
                  </button>
                )}
              </div>
            )}

            {/* Filters: Status Tabs + Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                <button
                  type="button"
                  onClick={() => setUserStatusFilter('ALL')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    userStatusFilter === 'ALL'
                      ? 'bg-sky-500 text-white shadow-sm'
                      : 'bg-[#0d1625] text-slate-400 hover:text-white border border-[#1c2b44]'
                  }`}
                >
                  All ({userCounts.total})
                </button>
                <button
                  type="button"
                  onClick={() => setUserStatusFilter('pending')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer ${
                    userStatusFilter === 'pending'
                      ? 'bg-amber-500 text-slate-950 font-black shadow-sm'
                      : 'bg-[#0d1625] text-amber-400 hover:text-amber-300 border border-amber-500/30'
                  }`}
                >
                  <span>Pending Approval ({userCounts.pending})</span>
                  {userCounts.pending > 0 && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setUserStatusFilter('active')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    userStatusFilter === 'active'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-[#0d1625] text-emerald-400 hover:text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  Active ({userCounts.active})
                </button>
                <button
                  type="button"
                  onClick={() => setUserStatusFilter('suspended')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                    userStatusFilter === 'suspended'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-[#0d1625] text-rose-400 hover:text-rose-300 border border-rose-500/30'
                  }`}
                >
                  Suspended ({userCounts.suspended})
                </button>
              </div>

              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search Username, Full Name, Plant..."
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1 text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none text-xs"
                />
              </div>
            </div>
          </div>

          {/* Add User Modal Dialog */}
          {isAddUserOpen && (
            <div className="bg-[#121c2e] border-2 border-sky-500/50 rounded-xl p-4 shadow-2xl space-y-4 animate-fade-in max-w-2xl mx-auto">
              <div className="flex items-center justify-between border-b border-[#1c2b44] pb-2.5">
                <div className="flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-sky-400" />
                  <h3 className="text-xs font-black uppercase text-white tracking-widest">
                    Register & Provision New User
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddUserOpen(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleCreateNewUserSubmit} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
                      Username *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. nishadi_op"
                      value={newUsername}
                      onChange={e => setNewUsername(e.target.value.toLowerCase().trim())}
                      className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
                      Full Personnel Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Nishadi Perera"
                      value={newFullName}
                      onChange={e => setNewFullName(e.target.value)}
                      className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
                      Initial Password *
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="e.g. pass123"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
                      Access Role *
                    </label>
                    <select
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as UserRole)}
                      className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="operator">Plant Shift Operator</option>
                      <option value="supervisor">Line Supervisor</option>
                      <option value="manager">Plant Manager</option>
                      <option value="admin">Central Executive Admin</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
                      Assigned Plant Lock *
                    </label>
                    <select
                      value={newFactory}
                      onChange={e => setNewFactory(e.target.value as FactoryName | 'ALL')}
                      className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="Kurunegala">Kurunegala Plant</option>
                      <option value="Bulugolla">Bulugolla Plant</option>
                      <option value="Werapola">Werapola Plant</option>
                      <option value="ALL">All Plants (Unrestricted Admin)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] font-black uppercase tracking-wider mb-1">
                      Authorization Status *
                    </label>
                    <select
                      value={newStatus}
                      onChange={e => setNewStatus(e.target.value as UserStatus)}
                      className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-white font-bold focus:border-cyan-500 focus:outline-none"
                    >
                      <option value="active">Active & Authorized Immediately</option>
                      <option value="pending">Pending Approval</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-[#1c2b44]">
                  <button
                    type="button"
                    onClick={() => setIsAddUserOpen(false)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold shadow-sm shadow-sky-950 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Save & Provision User</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Pending Approval Notice Banner for Central Admin */}
          {userCounts.pending > 0 && (
            <div className="bg-amber-950/40 border border-amber-500/50 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 text-amber-200 shadow-md">
              <div className="flex items-center gap-2.5">
                <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
                <div>
                  <span className="text-xs font-black uppercase tracking-wide text-white block">
                    {userCounts.pending} User Account(s) Awaiting Approval
                  </span>
                  <span className="text-[11px] text-amber-300/80">
                    Accounts signed in via Google or registered are pending Central Administrator authorization.
                  </span>
                </div>
              </div>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 font-mono font-bold px-2 py-1 rounded border border-amber-500/40 shrink-0">
                Click "Grant Access" below to authorize
              </span>
            </div>
          )}

          {/* Users Management Table */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#0d1625] text-slate-400 text-[10px] uppercase font-black tracking-wider border-b border-[#1c2b44]">
                  <tr>
                    <th className="p-3 border-r border-[#1c2b44]">Personnel / Full Name</th>
                    <th className="p-3 border-r border-[#1c2b44]">Username / Email</th>
                    <th className="p-3 border-r border-[#1c2b44] text-amber-400">Password (Central Admin Edit)</th>
                    <th className="p-3 border-r border-[#1c2b44]">Status & Grant Access</th>
                    <th className="p-3 border-r border-[#1c2b44]">Role Assignment</th>
                    <th className="p-3 border-r border-[#1c2b44]">Assigned Plant Lock</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Shifts Logged</th>
                    <th className="p-3 border-r border-[#1c2b44]">Last Active</th>
                    <th className="p-3 text-center min-w-[120px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b44]/60 font-mono text-[11px]">
                  {userRecords.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-500 font-sans">
                        No user accounts match the current filter or search criteria.
                      </td>
                    </tr>
                  ) : (
                    userRecords.map(u => {
                      const isCurrentUser = currentUser?.username === u.username;
                      const isSuperAdmin = u.username === 'admin';
                      const isPwVisible = !!showPasswords[u.username];

                      return (
                        <tr 
                          key={u.username} 
                          className={`hover:bg-slate-800/40 text-slate-300 transition ${
                            u.status === 'pending' ? 'bg-amber-950/20' : ''
                          }`}
                        >
                          {/* Personnel */}
                          <td className="p-3 border-r border-slate-800/80 font-sans font-bold text-white flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-[10px] uppercase font-bold shrink-0">
                              {u.username.substring(0, 2)}
                            </div>
                            <div>
                              <span>{u.fullName}</span>
                              {isCurrentUser && (
                                <span className="ml-1.5 text-[9px] bg-purple-900/60 text-purple-300 border border-purple-700/50 px-1 py-0.2 rounded font-mono">
                                  You
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Username */}
                          <td className="p-3 border-r border-slate-800/80 text-purple-300 font-bold">{u.username}</td>

                          {/* Password (Central Admin Editable with Save Option) */}
                          <td className="p-3 border-r border-slate-800/80 font-mono">
                            {editingPasswordUsername === u.username ? (
                              <div className="flex items-center gap-1.5 py-0.5">
                                <input
                                  type="text"
                                  autoFocus
                                  value={editingPasswordValue}
                                  onChange={e => setEditingPasswordValue(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSaveInlinePassword(u.username, editingPasswordValue);
                                    } else if (e.key === 'Escape') {
                                      setEditingPasswordUsername(null);
                                    }
                                  }}
                                  placeholder="New password (min 4 chars)"
                                  className="bg-[#0a101d] border border-amber-500 text-amber-300 text-xs px-2 py-1 rounded font-mono font-bold w-36 focus:outline-none focus:ring-1 focus:ring-amber-400"
                                />
                                <button
                                  type="button"
                                  disabled={isSavingInlinePassword}
                                  onClick={() => handleSaveInlinePassword(u.username, editingPasswordValue)}
                                  className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] flex items-center gap-1 shadow-sm transition cursor-pointer"
                                  title="Save password immediately to User Sheet"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Save</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingPasswordUsername(null)}
                                  className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-amber-300 font-bold text-xs">
                                  {isPwVisible ? (userPasswords[u.username] || '******') : '••••••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleShowPassword(u.username)}
                                  className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                                  title={isPwVisible ? 'Hide password' : 'Show password'}
                                >
                                  {isPwVisible ? (
                                    <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                  ) : (
                                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                </button>
                                {isAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingPasswordUsername(u.username);
                                      setEditingPasswordValue(userPasswords[u.username] || '');
                                    }}
                                    className="px-2 py-0.5 rounded bg-amber-950/60 hover:bg-amber-900 text-amber-300 border border-amber-600/50 text-[10px] font-bold flex items-center gap-1 transition cursor-pointer ml-1 shadow-xs"
                                    title="Central Admin: Edit and save password for this user"
                                  >
                                    <KeyRound className="w-3 h-3 text-amber-400" />
                                    <span>Edit</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </td>

                          {/* Status & Grant Access Action */}
                          <td className="p-3 border-r border-slate-800/80 font-sans">
                            <div className="flex items-center gap-2">
                              {u.status === 'pending' && (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black flex items-center gap-1">
                                    <Clock className="w-3 h-3" />
                                    <span>Pending</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickGrantAccess(u.username)}
                                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-black shadow-sm transition flex items-center gap-1 cursor-pointer"
                                    title="Grant access immediately"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Grant Access</span>
                                  </button>
                                </div>
                              )}

                              {u.status === 'active' && (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>Authorized</span>
                                  </span>
                                  {!isSuperAdmin && (
                                    <button
                                      type="button"
                                      onClick={() => handleQuickSuspendUser(u.username)}
                                      className="text-slate-500 hover:text-rose-400 text-[10px] font-medium transition ml-1 cursor-pointer"
                                      title="Suspend access"
                                    >
                                      Suspend
                                    </button>
                                  )}
                                </div>
                              )}

                              {u.status === 'suspended' && (
                                <div className="flex items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[10px] font-bold flex items-center gap-1">
                                    <ShieldAlert className="w-3 h-3" />
                                    <span>Suspended</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickGrantAccess(u.username)}
                                    className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-bold shadow-sm transition cursor-pointer"
                                  >
                                    Reactivate
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Pending Password Reset Request Approval Card */}
                            {u.pendingPasswordReset && (
                              <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/40 text-[10px] space-y-1 shadow-xs">
                                <div className="flex items-center gap-1 text-amber-300 font-bold">
                                  <KeyRound className="w-3 h-3 text-amber-400" />
                                  <span>Password Reset Requested</span>
                                </div>
                                <div className="text-[10px] text-slate-300">
                                  Requested on: {new Date(u.pendingPasswordReset.requestedAt).toLocaleDateString()}
                                </div>
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleApprovePasswordResetAction(u.username)}
                                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition cursor-pointer flex items-center gap-1"
                                    title="Approve requested password and activate user"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Approve Password</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectPasswordResetAction(u.username)}
                                    className="px-2 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/50 font-medium transition cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Pending Role Change Request Approval Card */}
                            {u.pendingRoleChange && (
                              <div className="mt-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/40 text-[10px] space-y-1 shadow-xs">
                                <div className="flex items-center gap-1 text-purple-300 font-bold">
                                  <Shield className="w-3 h-3 text-purple-400" />
                                  <span>Requested Role: <span className="capitalize">{u.pendingRoleChange.requestedRole}</span></span>
                                </div>
                                {u.pendingRoleChange.reason && (
                                  <div className="text-[9px] text-slate-400 truncate max-w-[200px]" title={u.pendingRoleChange.reason}>
                                    Reason: {u.pendingRoleChange.reason}
                                  </div>
                                )}
                                <div className="flex items-center gap-1.5 pt-0.5">
                                  <button
                                    type="button"
                                    onClick={() => handleApproveRoleChangeAction(u.username)}
                                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition cursor-pointer flex items-center gap-1"
                                    title="Approve role change"
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Approve Role</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRejectRoleChangeAction(u.username)}
                                    className="px-2 py-0.5 rounded bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/50 font-medium transition cursor-pointer"
                                  >
                                    Reject
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Role Assignment Dropdown */}
                          <td className="p-3 border-r border-slate-800/80 font-sans">
                            <select
                              value={u.role}
                              disabled={isSuperAdmin}
                              onChange={e => {
                                const newR = e.target.value as UserRole;
                                if (onUpdateUserRole) {
                                  onUpdateUserRole(u.username, newR);
                                  setUserActionNotice(`Role changed to "${newR}" for user "${u.username}".`);
                                  setTimeout(() => setUserActionNotice(null), 3500);
                                }
                              }}
                              className={`bg-[#0d1625] border border-slate-700/80 rounded px-2 py-1 text-[11px] font-bold focus:outline-none focus:border-cyan-500 ${
                                u.role === 'admin'
                                  ? 'text-amber-300 border-amber-500/40'
                                  : u.role === 'manager'
                                    ? 'text-purple-300'
                                    : u.role === 'supervisor'
                                      ? 'text-cyan-300'
                                      : 'text-slate-300'
                              } ${isSuperAdmin ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                            >
                              <option value="operator">Plant Shift Operator</option>
                              <option value="supervisor">Line Supervisor</option>
                              <option value="manager">Plant Manager</option>
                              <option value="admin">Central Executive Admin</option>
                            </select>
                          </td>

                          {/* Assigned Plant Lock Dropdown */}
                          <td className="p-3 border-r border-slate-800/80 font-sans">
                            <select
                              value={u.factoryLock}
                              disabled={isSuperAdmin}
                              onChange={e => {
                                const newF = e.target.value as FactoryName | 'ALL';
                                if (onUpdateUserFactory) {
                                  onUpdateUserFactory(u.username, newF);
                                  setUserActionNotice(`Assigned plant lock updated to "${newF}" for user "${u.username}".`);
                                  setTimeout(() => setUserActionNotice(null), 3500);
                                }
                              }}
                              className={`bg-[#0d1625] border border-slate-700/80 rounded px-2 py-1 text-[11px] font-bold focus:outline-none focus:border-cyan-500 ${
                                u.factoryLock === 'ALL'
                                  ? 'text-purple-300'
                                  : 'text-sky-300'
                              } ${isSuperAdmin ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                            >
                              <option value="Kurunegala">Kurunegala Plant (Locked)</option>
                              <option value="Bulugolla">Bulugolla Plant (Locked)</option>
                              <option value="Werapola">Werapola Plant (Locked)</option>
                              <option value="ALL">All Plants (Unrestricted)</option>
                            </select>
                          </td>

                          {/* Shifts Logged */}
                          <td className="p-3 text-right border-r border-slate-800/80 font-bold text-white">{u.shiftsCount}</td>

                          {/* Last Active Date */}
                          <td className="p-3 border-r border-slate-800/80 text-slate-300">{u.lastDate}</td>

                          {/* Actions: Edit Details & Password, Delete User */}
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const fullUserObj = users.find(usr => usr.username === u.username) || {
                                    id: `usr_${u.username}`,
                                    username: u.username,
                                    fullName: u.fullName,
                                    role: u.role,
                                    factory: u.factoryLock,
                                    status: u.status,
                                    createdAt: new Date().toISOString()
                                  };
                                  handleOpenEditUserModal(fullUserObj);
                                }}
                                className="px-2 py-1 rounded bg-sky-950/70 hover:bg-sky-900 text-sky-300 border border-sky-700/60 text-[10px] font-bold transition flex items-center gap-1 cursor-pointer"
                                title={`Edit user "${u.username}" details and password`}
                              >
                                <Edit className="w-3 h-3" />
                                <span>Edit</span>
                              </button>

                              {!isSuperAdmin && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to remove user "${u.username}"?`)) {
                                      if (onDeleteUser) {
                                        onDeleteUser(u.username);
                                      }
                                    }
                                  }}
                                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-950/40 transition cursor-pointer"
                                  title={`Remove user "${u.username}"`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
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
      )}

      {/* ============================================================= */}
      {/* 5. LINES MASTER SHEET                                         */}
      {/* ============================================================= */}
      {activeSheet === 'LINES' && (
        <div className="space-y-4">
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-3.5 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-sky-500 rounded-full"></span>
                  <Layers className="w-4 h-4 text-sky-400" />
                  <h2 className="text-xs font-black uppercase text-white tracking-widest">
                    Sewing Lines Master Sheet
                  </h2>
                  <span className="text-[10px] bg-sky-950 text-sky-400 border border-sky-700/60 font-mono font-bold px-1.5 py-0.5 rounded">
                    LINES DIRECTORY & RUNNING EFFICIENCY
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Line identifiers (e.g. K1, B3+4, W6+7), assigned supervisors, standard earned minutes, and line performance benchmarks.
                </p>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleExportLinesSheet}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-950 transition w-full sm:w-auto cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Lines Sheet CSV</span>
                </button>
              </div>
            </div>

            {/* Lines Summary KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-[#1c2b44] text-xs">
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Operational Lines</span>
                <span className="text-white font-mono font-bold text-sm">{lineRecords.length} Lines</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Leading Line</span>
                <span className="text-cyan-400 font-mono font-bold text-sm">
                  {lineRecords[0]?.lineNo || 'N/A'} ({lineRecords[0]?.totalActual.toLocaleString()} pcs)
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Avg Operators per Line</span>
                <span className="text-white font-mono font-bold text-sm">
                  {lineRecords.length > 0
                    ? (
                        lineRecords.reduce((acc, l) => acc + l.avgPresentTMs, 0) / lineRecords.length
                      ).toFixed(1)
                    : '0.0'} TMs
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-500 text-[9px] block uppercase font-black tracking-wider">Total Output</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">
                  {lineRecords.reduce((acc, l) => acc + l.totalActual, 0).toLocaleString()} pcs
                </span>
              </div>
            </div>

            {/* Search */}
            <div className="relative pt-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search Line No (e.g. K1, B3+4), Factory, Supervisor, Product..."
                value={lineSearch}
                onChange={e => setLineSearch(e.target.value)}
                className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none text-xs"
              />
            </div>
          </div>

          {/* Lines Table */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="bg-[#0d1625] text-slate-400 text-[10px] uppercase font-black tracking-wider border-b border-[#1c2b44]">
                  <tr>
                    <th className="p-3 border-r border-[#1c2b44]">Line No</th>
                    <th className="p-3 border-r border-[#1c2b44]">Factory Plant</th>
                    <th className="p-3 border-r border-[#1c2b44]">Operating Supervisors</th>
                    <th className="p-3 border-r border-[#1c2b44]">Primary Products</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Shifts Recorded</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right text-emerald-400">Total Actual Output</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Avg Team (TMs)</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right text-cyan-400">Produced Mins</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Worked Mins</th>
                    <th className="p-3 text-right">Line Efficiency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b44]/60 font-mono text-[11px]">
                  {lineRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="p-8 text-center text-slate-500 font-sans">
                        No sewing lines match your search query.
                      </td>
                    </tr>
                  ) : (
                    lineRecords.map(l => (
                      <tr key={l.lineNo} className="hover:bg-slate-800/40 text-slate-300 transition">
                        <td className="p-3 border-r border-slate-800/80 font-bold text-cyan-400 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-cyan-500" />
                          <span className="px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                            {l.lineNo}
                          </span>
                        </td>
                        <td className="p-3 border-r border-slate-800/80 font-sans font-medium text-white">{l.factory} Plant</td>
                        <td className="p-3 border-r border-slate-800/80 font-sans text-slate-300 max-w-xs truncate" title={l.supervisors.join(', ')}>
                          {l.supervisors.join(', ') || '-'}
                        </td>
                        <td className="p-3 border-r border-slate-800/80 font-sans text-slate-300 max-w-xs truncate" title={l.products.join(', ')}>
                          {l.products.join(', ') || '-'}
                        </td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-white font-bold">{l.shiftsCount}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 font-bold text-emerald-400">{l.totalActual.toLocaleString()}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-slate-200 font-bold">{l.avgPresentTMs}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 font-bold text-cyan-400">{l.producedMins.toLocaleString()}</td>
                        <td className="p-3 text-right border-r border-slate-800/80 text-slate-400">{l.workedMins.toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            l.efficiency >= 75
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : l.efficiency >= 60
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                              : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                          }`}>
                            {l.efficiency}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 6. DOWNTIME TRACKING SHEET (Detailed Incident Records)        */}
      {/* ============================================================= */}
      {activeSheet === 'DOWNTIME' && (
        <div className="space-y-4">
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl p-3.5 shadow-md space-y-3">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-1 h-3.5 bg-rose-500 rounded-full"></span>
                  <Wrench className="w-4 h-4 text-rose-400" />
                  <h2 className="text-xs font-black uppercase text-white tracking-widest">
                    Downtime Incident Master Sheet
                  </h2>
                  <span className="text-[10px] bg-rose-950 text-rose-400 border border-rose-700/60 font-mono font-bold px-1.5 py-0.5 rounded">
                    CATEGORY LOGS
                  </span>
                  {userPlantRestriction && (
                    <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-700/60 font-bold px-2 py-0.5 rounded">
                      Allocated: {userPlantRestriction} Plant
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Granular breakdown of production interruptions, line breakdown codes, and lost manufacturing minutes.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleExportDowntimeCSV}
                  className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm shadow-emerald-950 transition w-full sm:w-auto cursor-pointer"
                  title="Export filtered downtime incident logs to CSV"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Downtime CSV</span>
                  <span className="text-[10px] bg-emerald-700/80 px-1.5 py-0.2 rounded font-mono ml-0.5">
                    {filteredDowntimeRecords.length}
                  </span>
                </button>
              </div>
            </div>

            {/* Downtime Delete Notice Banner */}
            {downtimeDeleteNotice && (
              <div className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-500/60 text-emerald-200 text-xs flex items-center justify-between gap-2 shadow-sm animate-fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{downtimeDeleteNotice}</span>
                </div>
                <button onClick={() => setDowntimeDeleteNotice(null)} className="text-emerald-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Quick KPI Metric Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="bg-[#0b1320] border border-[#1c2b44] rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Incidents</span>
                <span className="text-lg font-black text-white font-mono">{downtimeMetrics.totalRecords}</span>
              </div>
              <div className="bg-[#0b1320] border border-[#1c2b44] rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-rose-400 block">Total Lost Minutes</span>
                <span className="text-lg font-black text-rose-400 font-mono">{downtimeMetrics.totalMinutes.toLocaleString()} m</span>
              </div>
              <div className="bg-[#0b1320] border border-[#1c2b44] rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-amber-400 block">Total Lost Hours</span>
                <span className="text-lg font-black text-amber-400 font-mono">{downtimeMetrics.totalHours} hrs</span>
              </div>
              <div className="bg-[#0b1320] border border-[#1c2b44] rounded-lg p-2.5">
                <span className="text-[10px] uppercase font-bold text-cyan-400 block">Unique Categories</span>
                <span className="text-lg font-black text-cyan-400 font-mono">{downtimeMetrics.categoriesCount}</span>
              </div>
            </div>

            {/* Interactive Filters: Plant, Date Range, Category, Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 pt-2 border-t border-[#1c2b44]">
              {/* Plant Filter */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Plant</label>
                <select
                  value={downtimeFactoryFilter}
                  onChange={e => {
                    setDowntimeFactoryFilter(e.target.value);
                    setDowntimeCurrentPage(1);
                  }}
                  disabled={!!userPlantRestriction}
                  className="w-full bg-[#0d1625] border border-[#1c2b44] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-medium disabled:opacity-60"
                >
                  <option value="ALL">All Manufacturing Plants</option>
                  {FACTORIES.map(f => (
                    <option key={f} value={f}>{f} Plant</option>
                  ))}
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">From Date</label>
                <input
                  type="date"
                  value={downtimeStartDate}
                  onChange={e => {
                    setDowntimeStartDate(e.target.value);
                    setDowntimeCurrentPage(1);
                  }}
                  className="w-full bg-[#0d1625] border border-[#1c2b44] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">To Date</label>
                <input
                  type="date"
                  value={downtimeEndDate}
                  onChange={e => {
                    setDowntimeEndDate(e.target.value);
                    setDowntimeCurrentPage(1);
                  }}
                  className="w-full bg-[#0d1625] border border-[#1c2b44] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-mono"
                />
              </div>

              {/* Category Filter */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">DT Category</label>
                <select
                  value={downtimeCategoryFilter}
                  onChange={e => {
                    setDowntimeCategoryFilter(e.target.value);
                    setDowntimeCurrentPage(1);
                  }}
                  className="w-full bg-[#0d1625] border border-[#1c2b44] rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500 font-medium"
                >
                  <option value="ALL">All Categories</option>
                  <option value="EN1">EN1 - Machine Breakdown</option>
                  <option value="EN2">EN2 - Power / Air Failure</option>
                  <option value="EN3">EN3 - Attachment / Folder Issue</option>
                  <option value="MT1">MT1 - Fabric Quality Issue</option>
                  <option value="MT2">MT2 - Trim / Accessories Delay</option>
                  <option value="MT3">MT3 - Cut Panel Shortage</option>
                  <option value="MT4">MT4 - Shade Variation</option>
                  <option value="PD1">PD1 - Feeding Delay / Bottle Neck</option>
                  <option value="PD2">PD2 - Line Setting / Style Change</option>
                  <option value="PD3">PD3 - High Absenteeism</option>
                  <option value="PD4">PD4 - Operator Retraining</option>
                  <option value="PD5">PD5 - Waiting for Work</option>
                  <option value="PD6">PD6 - Line Balancing</option>
                  <option value="QA1">QA1 - Sewing Defect Rework</option>
                  <option value="QA2">QA2 - Measurement Out of Spec</option>
                  <option value="QA3">QA3 - Quality Stop Work</option>
                  <option value="OT1">OT1 - Meeting / Training</option>
                  <option value="OT2">OT2 - Other Interruption</option>
                </select>
              </div>

              {/* Global Search */}
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-400 block mb-1">Search Fields</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    value={downtimeSearch}
                    onChange={e => {
                      setDowntimeSearch(e.target.value);
                      setDowntimeCurrentPage(1);
                    }}
                    placeholder="Search Line, Style, User, Reason..."
                    className="w-full pl-8 pr-7 py-1.5 bg-[#0d1625] border border-[#1c2b44] rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-rose-500"
                  />
                  {downtimeSearch && (
                    <button
                      type="button"
                      onClick={() => setDowntimeSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Clear Filters Reset */}
            {(downtimeSearch || downtimeStartDate || downtimeEndDate || downtimeCategoryFilter !== 'ALL' || (downtimeFactoryFilter !== 'ALL' && !userPlantRestriction)) && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-slate-400">
                  Showing <strong className="text-white font-mono">{filteredDowntimeRecords.length}</strong> matching downtime logs
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDowntimeSearch('');
                    setDowntimeStartDate('');
                    setDowntimeEndDate('');
                    setDowntimeCategoryFilter('ALL');
                    if (!userPlantRestriction) setDowntimeFactoryFilter('ALL');
                    setDowntimeCurrentPage(1);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 font-bold underline"
                >
                  Reset Downtime Filters
                </button>
              </div>
            )}
          </div>

          {/* Master Table of Downtime Incident Records */}
          <div className="bg-[#121c2e] border border-[#1c2b44] rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto max-h-[640px] relative scrollbar-thin scrollbar-thumb-slate-700">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-[#0d1625] text-slate-400 text-[10px] font-black uppercase tracking-wider border-b border-[#1c2b44] z-10 shadow-sm">
                  <tr>
                    <th className="p-3 border-r border-[#1c2b44] text-center w-12">#</th>
                    <th className="p-3 border-r border-[#1c2b44] text-center">Entry ID</th>
                    <th className="p-3 border-r border-[#1c2b44]">Date</th>
                    <th className="p-3 border-r border-[#1c2b44]">Plant</th>
                    <th className="p-3 border-r border-[#1c2b44]">Line</th>
                    <th className="p-3 border-r border-[#1c2b44]">Supervisor</th>
                    <th className="p-3 border-r border-[#1c2b44]">Product & Brand</th>
                    <th className="p-3 border-r border-[#1c2b44]">Style</th>
                    <th className="p-3 border-r border-[#1c2b44]">Downtime Code & Reason</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right text-rose-400">Lost Mins</th>
                    <th className="p-3 border-r border-[#1c2b44] text-right">Lost Hours</th>
                    <th className="p-3 border-r border-[#1c2b44]">Remarks / Cause</th>
                    <th className="p-3 border-r border-[#1c2b44]">User</th>
                    <th className="p-3 text-center w-28">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1c2b44]/60 font-mono text-[11px]">
                  {filteredDowntimeRecords.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="p-12 text-center text-slate-400 font-sans">
                        <div className="max-w-md mx-auto space-y-2">
                          <Wrench className="w-8 h-8 text-slate-600 mx-auto" />
                          <p className="font-bold text-slate-300">No Downtime Incident Records Found</p>
                          <p className="text-xs text-slate-500">
                            No downtime interruptions recorded matching your current filter criteria.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredDowntimeRecords
                      .slice((downtimeCurrentPage - 1) * DOWNTIME_PAGE_SIZE, downtimeCurrentPage * DOWNTIME_PAGE_SIZE)
                      .map((item, index) => {
                        const rowNum = (downtimeCurrentPage - 1) * DOWNTIME_PAGE_SIZE + index + 1;
                        const badgeInfo = getDowntimeCodeBadge(item.categoryCode || item.downtimeCategory);
                        const isConfirmingDelete = downtimeConfirmDeleteId === item.id;
                        const lostHrs = Number((Number(item.downtimeMinutes || 0) / 60).toFixed(2));

                        return (
                          <tr key={item.id} className="hover:bg-slate-800/40 text-slate-300 transition">
                            <td className="p-2.5 text-center border-r border-slate-800/80 text-slate-500 font-sans text-xs">
                              {rowNum}
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 text-center">
                              {item.entryId ? (
                                <span className="px-2 py-0.5 rounded bg-sky-950 text-sky-400 border border-sky-800 font-mono font-bold text-[10px]">
                                  {item.entryId}
                                </span>
                              ) : (
                                <span className="text-slate-600 text-[10px]">-</span>
                              )}
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 whitespace-nowrap text-white font-medium">
                              {item.date}
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 font-sans text-white font-medium">
                              {item.factory} Plant
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 font-bold text-cyan-400">
                              <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px]">
                                {item.line}
                              </span>
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 font-sans text-slate-300 max-w-xs truncate">
                              {item.supervisor || '-'}
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 font-sans text-slate-300">
                              <div className="font-medium text-white">{item.product || '-'}</div>
                              {item.brand && <div className="text-[10px] text-slate-400">{item.brand}</div>}
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 text-white font-bold max-w-xs truncate">
                              {item.style || '-'}
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 font-sans">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span
                                  className="px-2 py-0.5 rounded text-[10px] font-black tracking-wider text-white border"
                                  style={{ backgroundColor: badgeInfo.color + '33', borderColor: badgeInfo.color }}
                                >
                                  {badgeInfo.code}
                                </span>
                                <span className="text-xs font-semibold text-slate-200">
                                  {badgeInfo.name}
                                </span>
                                <span className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded">
                                  {badgeInfo.department}
                                </span>
                              </div>
                            </td>
                            <td className="p-2.5 text-right border-r border-slate-800/80 font-bold text-rose-400 text-sm">
                              {Number(item.downtimeMinutes).toLocaleString()} m
                            </td>
                            <td className="p-2.5 text-right border-r border-slate-800/80 font-bold text-amber-400">
                              {lostHrs} h
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 font-sans text-slate-300 max-w-xs truncate" title={item.remarks}>
                              {item.remarks || '-'}
                            </td>
                            <td className="p-2.5 border-r border-slate-800/80 font-sans text-slate-400 text-xs">
                              {item.user || '-'}
                            </td>
                            <td className="p-2.5 text-center">
                              {isConfirmingDelete ? (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteDowntime(item.id)}
                                    className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] transition cursor-pointer"
                                    title="Confirm permanent deletion"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDowntimeConfirmDeleteId(null)}
                                    className="px-1.5 py-0.5 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 text-[10px] transition cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDowntimeAmend(item)}
                                    className="p-1.5 rounded text-cyan-400 hover:text-white hover:bg-cyan-500/20 transition cursor-pointer"
                                    title="Amend / edit downtime incident details"
                                  >
                                    <FileEdit className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDowntimeConfirmDeleteId(item.id)}
                                    className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition cursor-pointer"
                                    title="Delete downtime record"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {filteredDowntimeRecords.length > DOWNTIME_PAGE_SIZE && (
              <div className="p-3 bg-[#0d1625] border-t border-[#1c2b44] flex flex-col sm:flex-row items-center justify-between gap-2 text-xs">
                <span className="text-slate-400">
                  Showing {(downtimeCurrentPage - 1) * DOWNTIME_PAGE_SIZE + 1} to{' '}
                  {Math.min(downtimeCurrentPage * DOWNTIME_PAGE_SIZE, filteredDowntimeRecords.length)} of{' '}
                  <strong className="text-white font-mono">{filteredDowntimeRecords.length}</strong> records
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setDowntimeCurrentPage(p => Math.max(1, p - 1))}
                    disabled={downtimeCurrentPage === 1}
                    className="px-2.5 py-1 rounded bg-[#121c2e] border border-[#1c2b44] text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                  >
                    Prev
                  </button>
                  <span className="px-3 py-1 font-mono text-cyan-400 font-bold">
                    Page {downtimeCurrentPage} of {Math.ceil(filteredDowntimeRecords.length / DOWNTIME_PAGE_SIZE)}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDowntimeCurrentPage(p => Math.min(Math.ceil(filteredDowntimeRecords.length / DOWNTIME_PAGE_SIZE), p + 1))}
                    disabled={downtimeCurrentPage >= Math.ceil(filteredDowntimeRecords.length / DOWNTIME_PAGE_SIZE)}
                    className="px-2.5 py-1 rounded bg-[#121c2e] border border-[#1c2b44] text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed font-bold"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Date Range Batch Delete Modal (Admin Only) */}
      {isAdmin && isDateRangeDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#121c2e] border border-rose-500/40 rounded-xl shadow-2xl p-5 text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1c2b44] pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-black text-xs uppercase tracking-wider">
                <Trash2 className="w-4 h-4" />
                <span>Delete Production Logs by Date Range</span>
              </div>
              <button
                type="button"
                onClick={() => setIsDateRangeDeleteOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Select the start and end dates to safely batch remove logs from the Master Sheet.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                  Start Date (From)
                </label>
                <input
                  type="date"
                  value={deleteStartDate}
                  onChange={e => setDeleteStartDate(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                  End Date (To)
                </label>
                <input
                  type="date"
                  value={deleteEndDate}
                  onChange={e => setDeleteEndDate(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                Filter by Factory Plant
              </label>
              <select
                value={deleteFactory}
                onChange={e => setDeleteFactory(e.target.value)}
                className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-rose-500 text-xs"
              >
                <option value="ALL">All Plants (Bulugolla, Kurunegala, Werapola)</option>
                {FACTORIES.map(f => (
                  <option key={f} value={f}>{f} Plant Only</option>
                ))}
              </select>
            </div>

            {/* Live match preview box */}
            <div className={`p-3 rounded-lg border text-xs ${
              matchingDateRangeCount > 0
                ? 'bg-rose-950/40 border-rose-600/60 text-rose-200'
                : 'bg-[#0d1625] border-[#1c2b44] text-slate-400'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span>Matching Records:</span>
                <span className="font-mono text-sm px-2 py-0.5 rounded bg-black/40">
                  {matchingDateRangeCount} records found
                </span>
              </div>
              {matchingDateRangeCount > 0 && (
                <p className="text-[11px] text-rose-300/80 mt-1">
                  Warning: Deleting these records is immediate and permanent in the Master Sheet.
                </p>
              )}
            </div>

            {batchDeleteNotice && (
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>{batchDeleteNotice}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2b44]">
              <button
                type="button"
                onClick={() => setIsDateRangeDeleteOpen(false)}
                className="px-3 py-1.5 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-[#1a2840] text-slate-300 text-xs font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={matchingDateRangeCount === 0 || !!batchDeleteNotice}
                onClick={handleConfirmDateRangeDelete}
                className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete ({matchingDateRangeCount} Records)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 6. ADMIN USER EDIT MODAL (Change Password & User Details)     */}
      {/* ============================================================= */}
      {isEditUserOpen && editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#121c2e] border border-sky-500/50 rounded-xl shadow-2xl p-5 text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1c2b44] pb-3">
              <div className="flex items-center gap-2 text-sky-400 font-black text-xs uppercase tracking-wider">
                <Edit className="w-4 h-4" />
                <span>Edit User Details & Password</span>
              </div>
              <button
                type="button"
                onClick={() => setIsEditUserOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUserEdit} className="space-y-3.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0d1625] border border-[#1c2b44]">
                <span className="text-slate-400 text-[10px] uppercase font-bold">Username</span>
                <span className="font-mono font-bold text-purple-300 text-sm">{editingUser.username}</span>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                  Full Personnel Name *
                </label>
                <input
                  type="text"
                  required
                  value={editFullName}
                  onChange={e => setEditFullName(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500 text-xs"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-400 text-[10px] uppercase font-bold">
                    User Password (Visible & Modifiable by Admin) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowEditPassword(!showEditPassword)}
                    className="text-[10px] text-sky-400 hover:text-sky-300 flex items-center gap-1 cursor-pointer"
                  >
                    {showEditPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showEditPassword ? 'Hide' : 'Reveal'}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showEditPassword ? 'text' : 'password'}
                    value={editPassword}
                    onChange={e => setEditPassword(e.target.value)}
                    placeholder="Enter new password to update"
                    className="w-full bg-[#0d1625] border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-amber-300 font-mono focus:outline-none focus:border-amber-400 text-xs font-bold"
                  />
                  <KeyRound className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-amber-400/60" />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Change this user's password here. The user will be able to log in using this new password immediately across devices.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Access Role *
                  </label>
                  <select
                    value={editRole}
                    disabled={editingUser.username === 'admin'}
                    onChange={e => setEditRole(e.target.value as UserRole)}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500 text-xs font-bold"
                  >
                    <option value="operator">Plant Shift Operator</option>
                    <option value="supervisor">Line Supervisor</option>
                    <option value="manager">Plant Manager</option>
                    <option value="admin">Central Executive Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Assigned Plant Lock *
                  </label>
                  <select
                    value={editFactory}
                    disabled={editingUser.username === 'admin'}
                    onChange={e => setEditFactory(e.target.value as FactoryName | 'ALL')}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500 text-xs font-bold"
                  >
                    <option value="Kurunegala">Kurunegala Plant</option>
                    <option value="Bulugolla">Bulugolla Plant</option>
                    <option value="Werapola">Werapola Plant</option>
                    <option value="ALL">All Plants (Unrestricted)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                  Authorization Status *
                </label>
                <select
                  value={editStatus}
                  disabled={editingUser.username === 'admin'}
                  onChange={e => setEditStatus(e.target.value as UserStatus)}
                  className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-cyan-500 text-xs font-bold"
                >
                  <option value="active">Active & Authorized</option>
                  <option value="pending">Pending Admin Approval</option>
                  <option value="suspended">Suspended (Login Blocked)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#1c2b44]">
                <button
                  type="button"
                  onClick={() => setIsEditUserOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold shadow-sm shadow-sky-950 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save User & Password</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 7. FACTORY DATA OPS: REQUEST DELETE MODAL                     */}
      {/* ============================================================= */}
      {isDeleteRequestModalOpen && targetLogForRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#121c2e] border border-rose-500/50 rounded-xl shadow-2xl p-5 text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1c2b44] pb-3">
              <div className="flex items-center gap-2 text-rose-400 font-black text-xs uppercase tracking-wider">
                <Trash2 className="w-4 h-4" />
                <span>Request Deletion of Production Log</span>
              </div>
              <button
                type="button"
                onClick={() => setIsDeleteRequestModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-lg bg-[#0d1625] border border-[#1c2b44] space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Entry ID:</span>
                <span className="font-mono font-bold text-sky-400">{targetLogForRequest.Entry_ID}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Date & Plant:</span>
                <span className="font-bold text-white">{targetLogForRequest.Date} ({targetLogForRequest.Factory} - Line {targetLogForRequest.Line})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Style & Supervisor:</span>
                <span className="text-slate-200">{targetLogForRequest.Style} / {targetLogForRequest.Supervisor}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Actual Qty Produced:</span>
                <span className="font-mono font-bold text-emerald-400">{targetLogForRequest.Actual_QTY} pcs</span>
              </div>
            </div>

            <form onSubmit={handleSubmitDeleteRequest} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-rose-300 text-[10px] uppercase font-bold mb-1">
                  Reason for Requesting Deletion *
                </label>
                <textarea
                  required
                  rows={3}
                  value={requestReason}
                  onChange={e => setRequestReason(e.target.value)}
                  placeholder="Explain why this log should be deleted (e.g., Duplicate entry entered accidentally, Wrong date selected, Shift cancelled)..."
                  className="w-full bg-[#0d1625] border border-rose-500/40 rounded-lg p-2.5 text-white focus:outline-none focus:border-rose-400 text-xs placeholder:text-slate-600"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-rose-950/20 border border-rose-800/40 text-[11px] text-rose-300">
                Notice: Central Admin will review your deletion request. Once approved, this entry will be automatically removed from the system and the connected Google Sheet.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2b44]">
                <button
                  type="button"
                  onClick={() => setIsDeleteRequestModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm shadow-rose-950 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Deletion Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 8. FACTORY DATA OPS: REQUEST AMENDMENT / EDIT MODAL           */}
      {/* ============================================================= */}
      {isAmendRequestModalOpen && targetLogForRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#121c2e] border border-sky-500/50 rounded-xl shadow-2xl p-5 text-slate-100 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[#1c2b44] pb-3">
              <div className="flex items-center gap-2 text-sky-400 font-black text-xs uppercase tracking-wider">
                <FileEdit className="w-4 h-4" />
                <span>Request Amendment / Correction for {targetLogForRequest.Entry_ID}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAmendRequestModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitAmendRequest} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-sky-300 text-[10px] uppercase font-bold mb-1">
                  Reason for Amendment / Correction *
                </label>
                <textarea
                  required
                  rows={2}
                  value={requestReason}
                  onChange={e => setRequestReason(e.target.value)}
                  placeholder="Explain why this entry needs correction (e.g., SMV was updated after sample test, actual output recounted, overtime hours omitted)..."
                  className="w-full bg-[#0d1625] border border-sky-500/50 rounded-lg p-2.5 text-white focus:outline-none focus:border-cyan-400 text-xs placeholder:text-slate-600"
                />
              </div>

              <div className="border border-[#1c2b44] rounded-lg p-3 bg-[#0d1625]/60 space-y-3">
                <div className="flex items-center gap-2 text-slate-300 font-bold text-[11px] uppercase tracking-wider border-b border-[#1c2b44] pb-1.5">
                  <span>Corrected Data Form</span>
                  <span className="text-[10px] text-slate-500 normal-case font-normal">(Modify the incorrect values below)</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Shift Date</label>
                    <input
                      type="date"
                      value={amendFormData.Date || ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Date: e.target.value })}
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Factory Plant</label>
                    <select
                      value={amendFormData.Factory || ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Factory: e.target.value as FactoryName })}
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    >
                      {FACTORIES.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Sewing Line</label>
                    <input
                      type="text"
                      value={amendFormData.Line || ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Line: e.target.value })}
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Supervisor</label>
                    <input
                      type="text"
                      value={amendFormData.Supervisor || ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Supervisor: e.target.value })}
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Style</label>
                    <input
                      type="text"
                      value={amendFormData.Style || ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Style: e.target.value })}
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">SMV (Standard Min)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={amendFormData.SMV ?? ''}
                      onChange={e => setAmendFormData({ ...amendFormData, SMV: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Planned Qty</label>
                    <input
                      type="number"
                      value={amendFormData.Planned_QTY ?? ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Planned_QTY: parseInt(e.target.value, 10) || 0 })}
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Actual Qty Produced *</label>
                    <input
                      type="number"
                      required
                      value={amendFormData.Actual_QTY ?? ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Actual_QTY: parseInt(e.target.value, 10) || 0 })}
                      className="w-full bg-[#0d1625] border border-emerald-500/50 rounded-lg px-2.5 py-1.5 text-emerald-300 font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Present TMs (Operators)</label>
                    <input
                      type="number"
                      value={amendFormData.Present_TMs ?? ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Present_TMs: parseInt(e.target.value, 10) || 0 })}
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Hours Worked (Shift)</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amendFormData.Hours_Worked ?? ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Hours_Worked: parseFloat(e.target.value) || 0 })}
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-bold"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Remarks</label>
                    <input
                      type="text"
                      value={amendFormData.Remarks || ''}
                      onChange={e => setAmendFormData({ ...amendFormData, Remarks: e.target.value })}
                      placeholder="Optional notes or remarks"
                      className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-sky-950/20 border border-sky-800/40 text-[11px] text-sky-300">
                Notice: The Central Admin will review your reason and verify the corrected numbers. Once approved, the master sheet and Google Sheet will be updated automatically.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2b44]">
                <button
                  type="button"
                  onClick={() => setIsAmendRequestModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow-sm shadow-sky-950 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Amendment Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 9. ADMIN REVIEW MODAL: PENDING CHANGE & DELETION REQUESTS     */}
      {/* ============================================================= */}
      {isAdmin && isRequestsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-[#121c2e] border border-amber-500/50 rounded-xl shadow-2xl p-5 text-slate-100 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[#1c2b44] pb-3">
              <div className="flex items-center gap-2 text-amber-400 font-black text-xs uppercase tracking-wider">
                <Clock className="w-4 h-4" />
                <span>Factory Data Ops Change & Deletion Requests</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refreshChangeRequests()}
                  className="p-1 rounded text-slate-400 hover:text-white transition cursor-pointer"
                  title="Refresh requests"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsRequestsModalOpen(false);
                    setSelectedRequestForReview(null);
                  }}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1.5">
              {(['PENDING', 'ALL', 'APPROVED', 'REJECTED'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setRequestFilter(tab)}
                  className={`px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                    requestFilter === tab
                      ? 'bg-amber-500 text-slate-950 font-black'
                      : 'bg-[#0d1625] text-slate-400 hover:text-white border border-[#1c2b44]'
                  }`}
                >
                  {tab === 'ALL' ? 'All Requests' : tab}
                  {tab === 'PENDING' && pendingRequestsCount > 0 && ` (${pendingRequestsCount})`}
                </button>
              ))}
            </div>

            {/* List and detail layout */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Requests list */}
              <div className="md:col-span-5 space-y-2 max-h-96 overflow-y-auto pr-1">
                {(changeRequests || []).filter(r => r && (requestFilter === 'ALL' || r.status === requestFilter)).length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs border border-[#1c2b44] rounded-lg bg-[#0d1625]">
                    No {requestFilter.toLowerCase()} requests found.
                  </div>
                ) : (
                  (changeRequests || [])
                    .filter(r => r && (requestFilter === 'ALL' || r.status === requestFilter))
                    .map(req => {
                      const isSelected = selectedRequestForReview?.id === req.id;
                      return (
                        <div
                          key={req.id}
                          onClick={() => handleOpenReviewRequest(req)}
                          className={`p-3 rounded-lg border text-xs cursor-pointer transition space-y-1 ${
                            isSelected
                              ? 'bg-amber-500/10 border-amber-500 text-amber-200'
                              : 'bg-[#0d1625] border-[#1c2b44] hover:border-slate-600 text-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`px-1.5 py-0.2 rounded text-[9px] font-black uppercase ${
                              req.type === 'DELETE'
                                ? 'bg-rose-950 text-rose-300 border border-rose-600/50'
                                : 'bg-sky-950 text-sky-300 border border-sky-600/50'
                            }`}>
                              {req.type === 'DELETE' ? 'Delete Request' : 'Amend Request'}
                            </span>
                            <span className={`text-[10px] font-bold ${
                              req.status === 'PENDING'
                                ? 'text-amber-400'
                                : req.status === 'APPROVED'
                                  ? 'text-emerald-400'
                                  : 'text-rose-400'
                            }`}>
                              {req.status}
                            </span>
                          </div>
                          <div className="font-mono font-bold text-white text-[11px]">{req.entryId}</div>
                          <div className="text-[10px] text-slate-400 truncate">
                            By <span className="text-purple-300 font-bold">{req.requestedBy}</span>: {req.reason}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>

              {/* Request detail and action pane */}
              <div className="md:col-span-7 p-3.5 rounded-lg bg-[#0d1625] border border-[#1c2b44] text-xs space-y-3">
                {selectedRequestForReview ? (
                  <div className="space-y-3 animate-fade-in">
                    <div className="flex items-center justify-between border-b border-[#1c2b44] pb-2">
                      <div>
                        <span className="font-bold text-white text-sm">{selectedRequestForReview.entryId}</span>
                        <span className="ml-2 text-[10px] text-slate-400">
                          Requested by <strong className="text-purple-300">{selectedRequestForReview.requestedBy}</strong>
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        selectedRequestForReview.status === 'PENDING'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : selectedRequestForReview.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}>
                        {selectedRequestForReview.status}
                      </span>
                    </div>

                    <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800 text-[11px] space-y-1">
                      <span className="text-[10px] uppercase font-bold text-amber-400 block">Operator's Stated Reason:</span>
                      <p className="text-slate-200 italic font-sans">{selectedRequestForReview.reason}</p>
                    </div>

                    {selectedRequestForReview.type === 'DELETE' ? (
                      <div className="p-3 rounded bg-rose-950/20 border border-rose-800/40 space-y-1 text-[11px]">
                        <span className="font-bold text-rose-300 uppercase text-[10px] block">Entry to be Deleted:</span>
                        <div>Plant: <strong className="text-white">{selectedRequestForReview.logSnapshot.Factory}</strong> (Line {selectedRequestForReview.logSnapshot.Line})</div>
                        <div>Date: <strong className="text-white">{selectedRequestForReview.logSnapshot.Date}</strong></div>
                        <div>Style: <strong className="text-white">{selectedRequestForReview.logSnapshot.Style}</strong> (Actual: {selectedRequestForReview.logSnapshot.Actual_QTY} pcs)</div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <span className="font-bold text-sky-400 uppercase text-[10px] block">Proposed Changes & Admin Corrections:</span>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <label className="text-[9px] text-slate-400 block uppercase">Style</label>
                            <input
                              type="text"
                              value={adminEditedValues.Style ?? selectedRequestForReview.proposedChanges?.Style ?? selectedRequestForReview.logSnapshot.Style}
                              onChange={e => setAdminEditedValues({ ...adminEditedValues, Style: e.target.value })}
                              className="w-full bg-[#121c2e] border border-slate-700 rounded p-1 text-white font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block uppercase">Actual Qty Produced</label>
                            <input
                              type="number"
                              value={adminEditedValues.Actual_QTY ?? selectedRequestForReview.proposedChanges?.Actual_QTY ?? selectedRequestForReview.logSnapshot.Actual_QTY}
                              onChange={e => setAdminEditedValues({ ...adminEditedValues, Actual_QTY: parseInt(e.target.value, 10) || 0 })}
                              className="w-full bg-[#121c2e] border border-emerald-500/60 rounded p-1 text-emerald-300 font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block uppercase">SMV</label>
                            <input
                              type="number"
                              step="0.01"
                              value={adminEditedValues.SMV ?? selectedRequestForReview.proposedChanges?.SMV ?? selectedRequestForReview.logSnapshot.SMV}
                              onChange={e => setAdminEditedValues({ ...adminEditedValues, SMV: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-[#121c2e] border border-slate-700 rounded p-1 text-cyan-300 font-bold"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block uppercase">Present TMs</label>
                            <input
                              type="number"
                              value={adminEditedValues.Present_TMs ?? selectedRequestForReview.proposedChanges?.Present_TMs ?? selectedRequestForReview.logSnapshot.Present_TMs}
                              onChange={e => setAdminEditedValues({ ...adminEditedValues, Present_TMs: parseInt(e.target.value, 10) || 0 })}
                              className="w-full bg-[#121c2e] border border-slate-700 rounded p-1 text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block uppercase">Hours Worked</label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={adminEditedValues.Hours_Worked ?? selectedRequestForReview.proposedChanges?.Hours_Worked ?? selectedRequestForReview.logSnapshot.Hours_Worked}
                              onChange={e => setAdminEditedValues({ ...adminEditedValues, Hours_Worked: parseFloat(e.target.value) || 0 })}
                              className="w-full bg-[#121c2e] border border-slate-700 rounded p-1 text-white"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] text-slate-400 block uppercase">Remarks</label>
                            <input
                              type="text"
                              value={adminEditedValues.Remarks ?? selectedRequestForReview.proposedChanges?.Remarks ?? selectedRequestForReview.logSnapshot.Remarks}
                              onChange={e => setAdminEditedValues({ ...adminEditedValues, Remarks: e.target.value })}
                              className="w-full bg-[#121c2e] border border-slate-700 rounded p-1 text-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedRequestForReview.status === 'PENDING' && (
                      <div className="space-y-2 pt-2 border-t border-[#1c2b44]">
                        <label className="block text-[10px] text-slate-400 uppercase font-bold">Admin Review Notes</label>
                        <input
                          type="text"
                          value={adminReviewNotes}
                          onChange={e => setAdminReviewNotes(e.target.value)}
                          placeholder="Optional notes to operator regarding approval or rejection..."
                          className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-2.5 py-1 text-white text-xs"
                        />
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleRejectRequest(selectedRequestForReview)}
                            className="px-3 py-1.5 rounded-lg bg-rose-950/70 hover:bg-rose-900 text-rose-300 border border-rose-800/60 text-xs font-bold transition cursor-pointer"
                          >
                            Reject Request
                          </button>
                          {selectedRequestForReview.type === 'DELETE' ? (
                            <button
                              type="button"
                              onClick={() => handleApproveDeleteRequest(selectedRequestForReview)}
                              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Approve & Delete from Google Sheet</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleApproveAmendRequest(selectedRequestForReview)}
                              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition cursor-pointer flex items-center gap-1.5"
                            >
                              <CheckCheck className="w-3.5 h-3.5" />
                              <span>Approve, Edit & Resubmit to Google Sheet</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-12 text-center text-slate-500 text-xs">
                    Select a change request from the left list to review reasons, inspect proposed values, and approve or reject.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* 10. ADMIN DIRECT LOG EDIT MODAL (Instant Sync to Google Sheet) */}
      {/* ============================================================= */}
      {isAdmin && isDirectEditOpen && directEditLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-[#121c2e] border border-sky-500/50 rounded-xl shadow-2xl p-5 text-slate-100 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-[#1c2b44] pb-3">
              <div className="flex items-center gap-2 text-sky-400 font-black text-xs uppercase tracking-wider">
                <Edit className="w-4 h-4" />
                <span>Admin Direct Edit: {directEditLog.Entry_ID}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsDirectEditOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDirectEditLog} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Shift Date</label>
                  <input
                    type="date"
                    value={directEditLog.Date}
                    onChange={e => setDirectEditLog({ ...directEditLog, Date: e.target.value })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Factory Plant</label>
                  <select
                    value={directEditLog.Factory}
                    onChange={e => setDirectEditLog({ ...directEditLog, Factory: e.target.value as FactoryName })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  >
                    {FACTORIES.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Line</label>
                  <input
                    type="text"
                    value={directEditLog.Line}
                    onChange={e => setDirectEditLog({ ...directEditLog, Line: e.target.value })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Supervisor</label>
                  <input
                    type="text"
                    value={directEditLog.Supervisor}
                    onChange={e => setDirectEditLog({ ...directEditLog, Supervisor: e.target.value })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Style</label>
                  <input
                    type="text"
                    value={directEditLog.Style}
                    onChange={e => setDirectEditLog({ ...directEditLog, Style: e.target.value })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">SMV</label>
                  <input
                    type="number"
                    step="0.01"
                    value={directEditLog.SMV}
                    onChange={e => setDirectEditLog({ ...directEditLog, SMV: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Planned Qty</label>
                  <input
                    type="number"
                    value={directEditLog.Planned_QTY}
                    onChange={e => setDirectEditLog({ ...directEditLog, Planned_QTY: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Actual Qty Produced *</label>
                  <input
                    type="number"
                    value={directEditLog.Actual_QTY}
                    onChange={e => setDirectEditLog({ ...directEditLog, Actual_QTY: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-[#0d1625] border border-emerald-500/60 rounded-lg px-2.5 py-1.5 text-emerald-300 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Present TMs</label>
                  <input
                    type="number"
                    value={directEditLog.Present_TMs}
                    onChange={e => setDirectEditLog({ ...directEditLog, Present_TMs: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Hours Worked</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={directEditLog.Hours_Worked}
                    onChange={e => setDirectEditLog({ ...directEditLog, Hours_Worked: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-cyan-300 font-bold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">Remarks</label>
                  <input
                    type="text"
                    value={directEditLog.Remarks}
                    onChange={e => setDirectEditLog({ ...directEditLog, Remarks: e.target.value })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-[11px] text-cyan-300">
                Saving will instantly update this production log in local state and resubmit the updated record to the Google Sheet.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2b44]">
                <button
                  type="button"
                  onClick={() => setIsDirectEditOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold shadow-sm shadow-sky-950 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Update & Resubmit to Google Sheet</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Entry ID Deletion & Amendment Request Modal */}
      <EntryIdRequestModal
        isOpen={isEntryIdRequestModalOpen}
        onClose={() => setIsEntryIdRequestModalOpen(false)}
        logs={logs}
        currentUser={currentUser}
        initialEntryId={lookupEntryId}
        onRequestSubmitted={() => {
          refreshChangeRequests();
          setRequestNotice('Your Entry ID change request has been submitted for Administrator review.');
        }}
      />

      {/* Amend Downtime Incident Modal */}
      {isDowntimeAmendModalOpen && amendDowntimeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-lg bg-[#121c2e] border border-[#1c2b44] rounded-xl shadow-2xl p-5 text-slate-100">
            <div className="flex items-center justify-between border-b border-[#1c2b44] pb-3 mb-4">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-cyan-950 text-cyan-400 border border-cyan-800">
                  <FileEdit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase text-white tracking-wider">
                    Amend Downtime Incident
                  </h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Incident ID: {amendDowntimeTarget.id} {amendDowntimeTarget.entryId ? `| Log: ${amendDowntimeTarget.entryId}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDowntimeAmendModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDowntimeAmend} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Date */}
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Incident Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={downtimeAmendForm.date || ''}
                    onChange={e => setDowntimeAmendForm({ ...downtimeAmendForm, date: e.target.value })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Factory */}
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Factory Plant *
                  </label>
                  <select
                    value={downtimeAmendForm.factory || 'Kurunegala'}
                    onChange={e => setDowntimeAmendForm({ ...downtimeAmendForm, factory: e.target.value as any })}
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {FACTORIES.map(f => (
                      <option key={f} value={f}>{f} Plant</option>
                    ))}
                  </select>
                </div>

                {/* Line */}
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Production Line *
                  </label>
                  <input
                    type="text"
                    required
                    value={downtimeAmendForm.line || ''}
                    onChange={e => setDowntimeAmendForm({ ...downtimeAmendForm, line: e.target.value })}
                    placeholder="e.g. Line 01"
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Supervisor */}
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Supervisor
                  </label>
                  <input
                    type="text"
                    value={downtimeAmendForm.supervisor || ''}
                    onChange={e => setDowntimeAmendForm({ ...downtimeAmendForm, supervisor: e.target.value })}
                    placeholder="Supervisor name"
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Product */}
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Product
                  </label>
                  <input
                    type="text"
                    value={downtimeAmendForm.product || ''}
                    onChange={e => setDowntimeAmendForm({ ...downtimeAmendForm, product: e.target.value })}
                    placeholder="e.g. SHIRT BG, TROUSER, UNDERWEAR KG"
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Brand */}
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Brand / Customer
                  </label>
                  <input
                    type="text"
                    value={downtimeAmendForm.brand || ''}
                    onChange={e => setDowntimeAmendForm({ ...downtimeAmendForm, brand: e.target.value })}
                    placeholder="e.g. VANTAGE, EBONY, Primark"
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>

                {/* Style */}
                <div className="sm:col-span-2">
                  <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                    Style Code / Name
                  </label>
                  <input
                    type="text"
                    value={downtimeAmendForm.style || ''}
                    onChange={e => setDowntimeAmendForm({ ...downtimeAmendForm, style: e.target.value })}
                    placeholder="e.g. B1SHIRT BG, SU 3409, KIMBALL60576"
                    className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white font-mono focus:border-cyan-500 focus:outline-none uppercase"
                  />
                </div>
              </div>

              {/* Downtime Code & Category Selection */}
              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                  Downtime Reason &amp; Code *
                </label>
                <select
                  value={downtimeAmendForm.categoryCode || (downtimeAmendForm.downtimeCategory ? downtimeAmendForm.downtimeCategory.split(' ')[0] : 'OTHER')}
                  onChange={e => {
                    const selectedItem = DOWNTIME_CODE_LIST.find(c => c.code === e.target.value);
                    if (selectedItem) {
                      setDowntimeAmendForm({
                        ...downtimeAmendForm,
                        categoryCode: selectedItem.code,
                        downtimeCategory: selectedItem.fullName
                      });
                    }
                  }}
                  className="w-full bg-[#0d1625] border border-cyan-500/60 rounded-lg px-2.5 py-2 text-xs font-bold text-cyan-200 focus:border-cyan-400 focus:outline-none"
                >
                  {DOWNTIME_CODE_LIST.map(c => (
                    <option key={c.code} value={c.code}>
                      [{c.code}] {c.name} — ({c.department})
                    </option>
                  ))}
                </select>
              </div>

              {/* Lost Downtime Minutes */}
              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                  Lost Downtime (Minutes) *
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    required
                    min={1}
                    value={downtimeAmendForm.downtimeMinutes ?? 0}
                    onChange={e => setDowntimeAmendForm({ ...downtimeAmendForm, downtimeMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full bg-[#0d1625] border border-rose-500/60 rounded-lg px-2.5 py-1.5 text-rose-400 font-bold text-sm focus:border-rose-400 focus:outline-none"
                  />
                  <span className="text-slate-400 text-xs shrink-0 font-mono">
                    = {((Number(downtimeAmendForm.downtimeMinutes) || 0) / 60).toFixed(2)} hrs
                  </span>
                </div>
              </div>

              {/* Remarks / Root Cause */}
              <div>
                <label className="block text-slate-400 text-[10px] uppercase font-bold mb-1">
                  Specific Remarks &amp; Root Cause
                </label>
                <textarea
                  rows={2}
                  value={downtimeAmendForm.remarks || ''}
                  onChange={e => setDowntimeAmendForm({ ...downtimeAmendForm, remarks: e.target.value })}
                  placeholder="Describe root cause, action taken, machine part or delay specifics..."
                  className="w-full bg-[#0d1625] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-[11px] text-cyan-300">
                Notice: Updating this record will recalculate lost hours and sync directly with both local state and connected Google Sheets.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#1c2b44]">
                <button
                  type="button"
                  onClick={() => setIsDowntimeAmendModalOpen(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDowntimeAmend}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-sm shadow-cyan-950 transition cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingDowntimeAmend && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSavingDowntimeAmend ? 'Saving Amendment...' : 'Save & Sync Downtime Amendment'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
