import {
  collection,
  doc,
  writeBatch,
  getDocs,
  setDoc,
  deleteDoc,
  serverTimestamp
} from 'firebase/firestore';
import { ref as rtdbRef, set as rtdbSet } from 'firebase/database';
import { db, rtdb, auth, handleFirestoreError, OperationType } from './firebase';
import { ProductionLog, DowntimeCategoryLog, User } from '../types';

export interface FirestoreSyncStatus {
  isSyncing: boolean;
  lastSyncedAt: string | null;
  productionLogsCount: number;
  downtimeLogsCount: number;
  usersCount: number;
  error: string | null;
}

/**
 * Publishes the master production shift logs (22 columns) to Firestore in batched writes.
 * Firestore batches support up to 500 operations per batch.
 */
export async function publishProductionLogsToFirestore(
  logs: ProductionLog[],
  onProgress?: (progress: { current: number; total: number }) => void
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!logs || logs.length === 0) {
    return { success: true, count: 0 };
  }

  const collectionPath = 'productionLogs';
  const BATCH_SIZE = 400; // Under Firestore 500 limit for safety
  let count = 0;

  try {
    for (let i = 0; i < logs.length; i += BATCH_SIZE) {
      const chunk = logs.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const log of chunk) {
        const docId = log.Entry_ID || `ENT-${i + count + 1}`;
        const ref = doc(db, collectionPath, docId);

        // Sanitize payload matching isValidProductionLog in firestore.rules
        const payload: Record<string, any> = {
          Entry_ID: String(log.Entry_ID || docId),
          Date: String(log.Date || new Date().toISOString().slice(0, 10)),
          Factory: String(log.Factory || 'Kurunegala'),
          Line: String(log.Line || '1'),
          Line_No: String(log.Line_No || 'K1'),
          Supervisor: String(log.Supervisor || 'RASITHA'),
          Style: String(log.Style || 'UNKNOWN'),
          Product: String(log.Product || 'SHIRT BG'),
          Brand: String(log.Brand || 'VANTAGE'),
          SMV: Number(log.SMV) || 0,
          Planned_QTY: Number(log.Planned_QTY) || 0,
          Actual_QTY: Number(log.Actual_QTY) || 0,
          Produced_Minutes: Number(log.Produced_Minutes) || 0,
          Plan_TMs: Number(log.Plan_TMs) || 14,
          Actual_TMs: Number(log.Actual_TMs) || 14,
          Present_TMs: Number(log.Present_TMs) || 14,
          Hours_Worked: Number(log.Hours_Worked) || 9,
          Worked_Minutes: Number(log.Worked_Minutes) || 0,
          Down_Time: Number(log.Down_Time) || 0,
          Remarks: String(log.Remarks || ''),
          User: String(log.User || auth.currentUser?.email || 'admin')
        };

        batch.set(ref, payload, { merge: true });
        count++;
      }

      await batch.commit();
      if (onProgress) {
        onProgress({ current: Math.min(i + BATCH_SIZE, logs.length), total: logs.length });
      }
    }

    return { success: true, count };
  } catch (error) {
    console.error('Error publishing production logs to Firestore:', error);
    return {
      success: false,
      count,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Publishes category-wise downtime breakdown logs to Firestore.
 */
export async function publishDowntimeLogsToFirestore(
  downtimeLogs: DowntimeCategoryLog[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!downtimeLogs || downtimeLogs.length === 0) {
    return { success: true, count: 0 };
  }

  const collectionPath = 'downtimeLogs';
  const BATCH_SIZE = 400;
  let count = 0;

  try {
    for (let i = 0; i < downtimeLogs.length; i += BATCH_SIZE) {
      const chunk = downtimeLogs.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const d of chunk) {
        const docId = d.id || `DT-${Date.now()}-${count}`;
        const ref = doc(db, collectionPath, docId);

        const payload: Record<string, any> = {
          id: String(docId),
          entryId: String(d.entryId || ''),
          date: String(d.date || new Date().toISOString().slice(0, 10)),
          factory: String(d.factory || 'Kurunegala'),
          line: String(d.line || 'Line 01'),
          supervisor: String(d.supervisor || ''),
          product: String(d.product || ''),
          brand: String(d.brand || ''),
          style: String(d.style || ''),
          category: String(d.downtimeCategory || d.categoryCode || 'Uncategorized'),
          reasonCode: String(d.categoryCode || 'GEN-01'),
          reason: String(d.downtimeCategory || 'Downtime issue'),
          minutes: Number(d.downtimeMinutes) || 0,
          remarks: String(d.remarks || '')
        };

        batch.set(ref, payload, { merge: true });
        count++;
      }

      await batch.commit();
    }

    return { success: true, count };
  } catch (error) {
    console.error('Error publishing downtime logs to Firestore:', error);
    return {
      success: false,
      count,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Publishes registered users and roles to Firestore.
 */
export async function publishUsersToFirestore(
  users: User[]
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!users || users.length === 0) {
    return { success: true, count: 0 };
  }

  const collectionPath = 'users';
  let count = 0;

  try {
    const batch = writeBatch(db);
    for (const u of users) {
      const docId = u.id || `usr-${u.username}`;
      const ref = doc(db, collectionPath, docId);

      const payload: Record<string, any> = {
        id: String(docId),
        username: String(u.username),
        fullName: String(u.fullName || u.username),
        role: u.role || 'operator',
        factory: String(u.factory || 'ALL'),
        status: u.status || 'active',
        createdAt: String(u.createdAt || new Date().toISOString().slice(0, 10))
      };

      if (u.email) payload.email = String(u.email);
      batch.set(ref, payload, { merge: true });
      count++;
    }

    await batch.commit();
    return { success: true, count };
  } catch (error) {
    console.error('Error publishing users to Firestore:', error);
    return {
      success: false,
      count,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Master 1-click sync to publish all master tables to Firestore database.
 */
export async function publishAllMasterTablesToFirestore(params: {
  logs: ProductionLog[];
  downtimeLogs: DowntimeCategoryLog[];
  users: User[];
  onProgress?: (step: string, percent: number) => void;
}): Promise<{
  success: boolean;
  productionLogsCount: number;
  downtimeLogsCount: number;
  usersCount: number;
  message: string;
}> {
  try {
    if (params.onProgress) params.onProgress('Syncing Master Production Logs (22 Columns)...', 25);
    const prodRes = await publishProductionLogsToFirestore(params.logs, progress => {
      if (params.onProgress) {
        const pct = 10 + Math.round((progress.current / progress.total) * 40);
        params.onProgress(`Publishing Production Logs (${progress.current}/${progress.total})...`, pct);
      }
    });

    if (params.onProgress) params.onProgress('Syncing Downtime Master Table...', 60);
    const dtRes = await publishDowntimeLogsToFirestore(params.downtimeLogs);

    if (params.onProgress) params.onProgress('Syncing Users & Roles Master Table...', 85);
    const userRes = await publishUsersToFirestore(params.users);

    // Also mirror latest state to Firebase Realtime Database (RTDB)
    try {
      if (params.onProgress) params.onProgress('Syncing to Firebase Realtime Database (RTDB)...', 95);
      await syncToRealtimeDatabase({
        logs: params.logs,
        downtimeLogs: params.downtimeLogs,
        users: params.users
      });
    } catch (rtdbErr) {
      console.warn('Realtime Database mirror notice:', rtdbErr);
    }

    if (params.onProgress) params.onProgress('Finalizing Database sync...', 100);

    const isSuccess = prodRes.success && dtRes.success && userRes.success;
    return {
      success: isSuccess,
      productionLogsCount: prodRes.count,
      downtimeLogsCount: dtRes.count,
      usersCount: userRes.count,
      message: isSuccess
        ? `Successfully published ${prodRes.count.toLocaleString()} Production Records, ${dtRes.count} Downtime Records, and ${userRes.count} User Accounts to Firebase (Firestore & Realtime Database)!`
        : `Published with partial status: ${prodRes.error || dtRes.error || userRes.error || 'Check console logs'}`
    };
  } catch (err: any) {
    return {
      success: false,
      productionLogsCount: 0,
      downtimeLogsCount: 0,
      usersCount: 0,
      message: err.message || 'Error publishing master tables to Firestore'
    };
  }
}

/**
 * Synchronizes key master tables to Firebase Realtime Database (RTDB).
 */
export async function syncToRealtimeDatabase(data: {
  logs: ProductionLog[];
  downtimeLogs: DowntimeCategoryLog[];
  users: User[];
}): Promise<{ success: boolean; message?: string }> {
  try {
    const metaRef = rtdbRef(rtdb, 'meta');
    await rtdbSet(metaRef, {
      lastSyncedAt: new Date().toISOString(),
      productionLogsCount: data.logs.length,
      downtimeLogsCount: data.downtimeLogs.length,
      usersCount: data.users.length,
      databaseUrl: 'https://factory-performance-default-rtdb.asia-southeast1.firebasedatabase.app',
      syncedBy: auth.currentUser?.email || 'Anonymous Operator'
    });

    // Sync users to RTDB
    const usersMap: Record<string, any> = {};
    data.users.forEach(u => {
      const key = (u.id || u.username || 'user').replace(/[.#$[\]]/g, '_');
      usersMap[key] = {
        id: u.id,
        username: u.username,
        fullName: u.fullName || '',
        role: u.role,
        factory: u.factory,
        status: u.status
      };
    });
    await rtdbSet(rtdbRef(rtdb, 'users'), usersMap);

    // Sync recent production logs to RTDB (last 100 for fast real-time monitoring)
    const logsMap: Record<string, any> = {};
    data.logs.slice(-100).forEach(l => {
      const id = String(l.Entry_ID || Math.random().toString(36).substring(2, 9)).replace(/[.#$[\]]/g, '_');
      logsMap[id] = l;
    });
    await rtdbSet(rtdbRef(rtdb, 'recentProductionLogs'), logsMap);

    return { success: true };
  } catch (err: any) {
    console.warn('Realtime Database sync warning:', err);
    return { success: false, message: err.message };
  }
}

/**
 * Fetches all production logs stored in Firestore.
 */
export async function fetchProductionLogsFromFirestore(): Promise<ProductionLog[]> {
  const collectionPath = 'productionLogs';
  try {
    const snap = await getDocs(collection(db, collectionPath));
    return snap.docs.map(d => d.data() as ProductionLog);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

/**
 * Fetches all downtime category logs from Firestore.
 */
export async function fetchDowntimeLogsFromFirestore(): Promise<DowntimeCategoryLog[]> {
  const collectionPath = 'downtimeLogs';
  try {
    const snap = await getDocs(collection(db, collectionPath));
    return snap.docs.map(d => d.data() as DowntimeCategoryLog);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}

/**
 * Fetches all users from Firestore.
 */
export async function fetchUsersFromFirestore(): Promise<User[]> {
  const collectionPath = 'users';
  try {
    const snap = await getDocs(collection(db, collectionPath));
    return snap.docs.map(d => d.data() as User);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, collectionPath);
  }
}
