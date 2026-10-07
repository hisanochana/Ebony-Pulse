import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import {
  getFirestore,
  doc,
  getDocFromServer,
  collection,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  QueryConstraint
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize singleton Firebase App
export const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

/* CRITICAL: The app will break without specifying firestoreDatabaseId */
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Firebase Realtime Database (RTDB) instance configured with the asia-southeast1 databaseURL
export const rtdb = getDatabase(
  app,
  firebaseConfig.databaseURL || 'https://factory-performance-default-rtdb.asia-southeast1.firebasedatabase.app'
);

// Operation types for strict Firestore error handling
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Standard error handler conforming to FirestoreErrorInfo specification
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo: currentUser?.providerData?.map((provider) => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Validates connection to Firestore on boot as required by system guidelines
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('Firebase Firestore connection verified successfully.');
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase Firestore client is offline or network is limited.');
    } else {
      console.info('Firebase Firestore initial handshake completed.');
    }
    return false;
  }
}

// Automatically test connection on boot
testFirestoreConnection();

/**
 * Typed Firestore helper utilities with built-in error handling
 */
export const firestoreService = {
  async getDocument<T>(collectionName: string, id: string): Promise<T | null> {
    const docPath = `${collectionName}/${id}`;
    try {
      const snap = await getDoc(doc(db, collectionName, id));
      if (!snap.exists()) return null;
      return { id: snap.id, ...snap.data() } as T;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, docPath);
    }
  },

  async listDocuments<T>(
    collectionName: string,
    ...queryConstraints: QueryConstraint[]
  ): Promise<T[]> {
    try {
      const q = queryConstraints.length > 0
        ? query(collection(db, collectionName), ...queryConstraints)
        : collection(db, collectionName);
      const snap = await getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, collectionName);
    }
  },

  async setDocument<T extends Record<string, unknown>>(
    collectionName: string,
    id: string,
    data: T
  ): Promise<void> {
    const docPath = `${collectionName}/${id}`;
    try {
      await setDoc(doc(db, collectionName, id), data, { merge: true });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, docPath);
    }
  },

  async updateDocument(
    collectionName: string,
    id: string,
    data: Record<string, unknown>
  ): Promise<void> {
    const docPath = `${collectionName}/${id}`;
    try {
      await updateDoc(doc(db, collectionName, id), data);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, docPath);
    }
  },

  async deleteDocument(collectionName: string, id: string): Promise<void> {
    const docPath = `${collectionName}/${id}`;
    try {
      await deleteDoc(doc(db, collectionName, id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, docPath);
    }
  },

  subscribeToCollection<T>(
    collectionName: string,
    onData: (data: T[]) => void,
    onError?: (error: Error) => void
  ) {
    return onSnapshot(
      collection(db, collectionName),
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
        onData(list);
      },
      (error) => {
        if (onError) onError(error);
        handleFirestoreError(error, OperationType.LIST, collectionName);
      }
    );
  }
};
