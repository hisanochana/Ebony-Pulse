import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  Layers,
  Table,
  Users,
  Clock,
  ExternalLink,
  ShieldCheck,
  ArrowRight,
  LogIn
} from 'lucide-react';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { ProductionLog, DowntimeCategoryLog, User } from '../types';
import { publishAllMasterTablesToFirestore } from '../services/firestoreSync';
import { auth } from '../services/firebase';
import { signInWithGooglePopup } from '../services/firebaseAuth';
import firebaseConfig from '../../firebase-applet-config.json';

interface FirestoreSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: ProductionLog[];
  downtimeLogs: DowntimeCategoryLog[];
  users: User[];
  currentUser: User | null;
}

export const FirestoreSyncModal: React.FC<FirestoreSyncModalProps> = ({
  isOpen,
  onClose,
  logs = [],
  downtimeLogs = [],
  users = [],
  currentUser
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState<string>('');
  const [syncProgress, setSyncProgress] = useState<number>(0);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
    prodCount?: number;
    dtCount?: number;
    userCount?: number;
  } | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, u => {
      setFirebaseUser(u);
    });
    return () => unsubscribe();
  }, []);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await signInWithGooglePopup();
    } catch (err: any) {
      console.warn('Google sign in notice:', err);
      setAuthError(err.message || 'Failed to authenticate with Google');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleStartSync = async () => {
    setAuthError(null);
    // If not signed in to Firebase Auth, prompt Google Sign-In first
    if (!auth.currentUser) {
      setIsAuthenticating(true);
      try {
        await signInWithGooglePopup();
      } catch (err: any) {
        setIsAuthenticating(false);
        setAuthError(err.message || 'Google authentication required to publish to Firestore');
        return;
      }
      setIsAuthenticating(false);
    }

    setIsSyncing(true);
    setSyncResult(null);
    setSyncProgress(5);
    setSyncStep('Connecting to Firestore Database...');

    try {
      const res = await publishAllMasterTablesToFirestore({
        logs,
        downtimeLogs,
        users,
        onProgress: (step, percent) => {
          setSyncStep(step);
          setSyncProgress(percent);
        }
      });

      setSyncResult({
        success: res.success,
        message: res.message,
        prodCount: res.productionLogsCount,
        dtCount: res.downtimeLogsCount,
        userCount: res.usersCount
      });
    } catch (err: any) {
      setSyncResult({
        success: false,
        message: err.message || 'Failed to sync with Firestore database'
      });
    } finally {
      setIsSyncing(false);
      setSyncProgress(100);
    }
  };

  const firestoreConsoleUrl = `https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${firebaseConfig.firestoreDatabaseId}/data`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#121c2e] border border-cyan-500/40 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#0d1625] border-b border-[#1c2b44] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black uppercase text-white tracking-wider">
                  Publish to Firebase Firestore
                </h3>
                <span className="text-[10px] bg-emerald-950 text-emerald-300 font-mono font-bold px-1.5 py-0.5 rounded border border-emerald-800">
                  CONNECTED
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Deploy and publish your master tables directly into the provisioned Firestore database.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Cloud Database Information Box */}
          <div className="p-3.5 rounded-xl bg-[#0a101d] border border-slate-700/60 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Firebase Cloud Project:</span>
              <span className="font-mono font-bold text-amber-400">{firebaseConfig.projectId}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Firestore Database ID:</span>
              <span className="font-mono font-bold text-cyan-300 text-[11px] truncate max-w-[340px]" title={firebaseConfig.firestoreDatabaseId}>
                {firebaseConfig.firestoreDatabaseId}
              </span>
            </div>
            {firebaseConfig.databaseURL && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Realtime Database (RTDB):</span>
                <span className="font-mono font-bold text-emerald-300 text-[11px] truncate max-w-[340px]" title={firebaseConfig.databaseURL}>
                  {firebaseConfig.databaseURL}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
              <span className="text-slate-400">Security Rules:</span>
              <span className="text-emerald-400 font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Deployed &amp; Hardened
              </span>
            </div>
          </div>

          {/* Master Tables Overview to Publish */}
          <div className="space-y-2">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Master Tables Staged for Publishing
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Table 1: Production Logs */}
              <div className="p-3 rounded-xl bg-[#0a101d] border border-[#1c2b44] flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <Table className="w-4 h-4 text-sky-400" />
                  <span className="text-xs font-bold text-white">productionLogs</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-black text-sky-400">{logs.length.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400">22-col rows</span>
                </div>
              </div>

              {/* Table 2: Downtime Logs */}
              <div className="p-3 rounded-xl bg-[#0a101d] border border-[#1c2b44] flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-white">downtimeLogs</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-black text-amber-400">{downtimeLogs.length.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400">category logs</span>
                </div>
              </div>

              {/* Table 3: Users */}
              <div className="p-3 rounded-xl bg-[#0a101d] border border-[#1c2b44] flex flex-col justify-between">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  <span className="text-xs font-bold text-white">users</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-black text-purple-400">{users.length.toLocaleString()}</span>
                  <span className="text-[10px] text-slate-400">user accounts</span>
                </div>
              </div>
            </div>
          </div>

          {/* Authentication & Authorization Status */}
          <div className="space-y-1.5">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-400">
              Firebase Security &amp; Authorization
            </h4>
            {firebaseUser ? (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between text-xs text-emerald-300">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <span className="text-white font-bold">Authorized with Google: </span>
                    <span className="font-mono text-emerald-300">{firebaseUser.email}</span>
                  </div>
                </div>
                <span className="text-[10px] bg-emerald-900/60 text-emerald-300 px-2 py-0.5 rounded font-mono font-bold border border-emerald-700">
                  Ready to Publish
                </span>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-start gap-2.5 text-amber-300">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <p className="font-bold text-white">Google Authentication Required</p>
                    <p className="text-[11px] text-amber-200/80">
                      Sign in with your Google account to grant write permissions to your Firestore database.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={handleGoogleSignIn}
                  className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs shrink-0 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                >
                  {isAuthenticating ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LogIn className="w-3.5 h-3.5" />
                  )}
                  <span>Sign in with Google</span>
                </button>
              </div>
            )}

            {authError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/50 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{authError}</span>
              </div>
            )}
          </div>

          {/* Sync Progress Bar */}
          {isSyncing && (
            <div className="p-4 rounded-xl bg-[#0d1625] border border-cyan-500/40 space-y-2.5 animate-fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="text-cyan-300 font-bold flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>{syncStep}</span>
                </span>
                <span className="font-mono text-cyan-400 font-black">{syncProgress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300 rounded-full"
                  style={{ width: `${syncProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Sync Result Alert */}
          {syncResult && (
            <div
              className={`p-4 rounded-xl border text-xs flex items-start gap-3 animate-fade-in ${
                syncResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
              }`}
            >
              {syncResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <h5 className="font-black uppercase tracking-wider text-white">
                  {syncResult.success ? 'Publishing Completed Successfully' : 'Publishing Warning'}
                </h5>
                <p className="text-slate-300">{syncResult.message}</p>
                {syncResult.success && (
                  <div className="pt-2">
                    <a
                      href={firestoreConsoleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition text-xs shadow-sm"
                    >
                      <span>View Master Tables in Firebase Console</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#0d1625] border-t border-[#1c2b44] flex flex-col sm:flex-row items-center justify-between gap-3">
          <a
            href={firestoreConsoleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-400 hover:text-cyan-400 flex items-center gap-1.5 transition"
          >
            <span>Open Firebase Console</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#0a101d] border border-slate-700 hover:bg-slate-800 text-slate-300 text-xs font-bold transition cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              disabled={isSyncing}
              onClick={handleStartSync}
              className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white text-xs font-bold shadow-md shadow-amber-950 transition cursor-pointer flex items-center gap-2"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Publishing Master Tables...</span>
                </>
              ) : (
                <>
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Publish Master Tables to Firestore</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
