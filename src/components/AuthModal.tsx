import React, { useState, useEffect, useRef } from 'react';
import { X, Lock, User as UserIcon, ShieldAlert, CheckCircle2, Factory, UserCheck, RefreshCw, KeyRound, ArrowLeft, Check, Shield, Clock, AlertCircle } from 'lucide-react';
import { FactoryName, User, UserRole } from '../types';
import { fetchServerUsers, resetServerUserPassword, saveGoogleUserToServer } from '../services/googleSheetService';
import { signInWithGooglePopup } from '../services/firebaseAuth';

function parseJwtPayload(token: string): any {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

const GOOGLE_DEVICE_USER_KEY = 'ebony_google_user_v1';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
  registeredUsers: User[];
  onRegisterUser: (newUser: User, password: string) => boolean | Promise<boolean>;
  userPasswords: Record<string, string>;
  preventClose?: boolean;
}

export type AllocatedRoleSelection =
  | 'Bulugolla Ops'
  | 'Kurunegala Ops'
  | 'Werapola Ops'
  | 'All Factory Ops'
  | 'Viewer'
  | 'Admin';

interface RoleSelectionConfig {
  id: AllocatedRoleSelection;
  label: string;
  role: UserRole;
  factory: FactoryName | 'ALL';
}

const ALLOCATED_ROLES: RoleSelectionConfig[] = [
  {
    id: 'Bulugolla Ops',
    label: 'Bulugolla Ops (Operator)',
    role: 'operator',
    factory: 'Bulugolla'
  },
  {
    id: 'Kurunegala Ops',
    label: 'Kurunegala Ops (Operator)',
    role: 'operator',
    factory: 'Kurunegala'
  },
  {
    id: 'Werapola Ops',
    label: 'Werapola Ops (Operator)',
    role: 'operator',
    factory: 'Werapola'
  },
  {
    id: 'All Factory Ops',
    label: 'All Factory Ops (Multi-Plant)',
    role: 'operator',
    factory: 'ALL'
  },
  {
    id: 'Viewer',
    label: 'Viewer (Read-Only)',
    role: 'viewer',
    factory: 'ALL'
  },
  {
    id: 'Admin',
    label: 'Admin (System Administrator)',
    role: 'admin',
    factory: 'ALL'
  }
];

const RECENT_USER_KEY = 'ebony_recent_login_username_v1';
const RECENT_PASS_KEY = 'ebony_recent_login_password_v1';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
  registeredUsers,
  onRegisterUser,
  userPasswords,
  preventClose = false
}) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER' | 'FORGOT_PASSWORD' | 'GOOGLE_SSO' | 'GOOGLE_PROFILE' | 'PENDING_APPROVAL'>('LOGIN');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [selectedRoleOption, setSelectedRoleOption] = useState<AllocatedRoleSelection>('Kurunegala Ops');
  const [rememberDetails, setRememberDetails] = useState<boolean>(true);
  const [recentUsername, setRecentUsername] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  // Device-detected verified Google user
  const [detectedGoogleUser, setDetectedGoogleUser] = useState<{
    email: string;
    name: string;
    factory: FactoryName | 'ALL';
    role: UserRole;
    picture?: string;
  } | null>(null);

  // Pending approval account info
  const [pendingGoogleAccount, setPendingGoogleAccount] = useState<{
    email: string;
    name: string;
    factory: FactoryName | 'ALL';
    role: UserRole;
    picture?: string;
  } | null>(null);
  const [isCheckingApproval, setIsCheckingApproval] = useState<boolean>(false);

  // Profile configuration form for Google sign-in
  const [googleProfileForm, setGoogleProfileForm] = useState<{
    email: string;
    name: string;
    factory: FactoryName | 'ALL';
    role: UserRole;
    picture?: string;
  }>({
    email: '',
    name: '',
    factory: 'Kurunegala',
    role: 'operator',
    picture: ''
  });
  const [isSavingGoogleProfile, setIsSavingGoogleProfile] = useState(false);

  // Forgot / Reset Password state
  const [resetUsername, setResetUsername] = useState('');
  const [resetFactory, setResetFactory] = useState<string>('Kurunegala');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isResetting, setIsResetting] = useState(false);

  // Google Login state
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);

  // Load recently logged in user and device Google account
  useEffect(() => {
    try {
      const savedUser = localStorage.getItem(RECENT_USER_KEY);
      const savedPass = localStorage.getItem(RECENT_PASS_KEY);
      if (savedUser) {
        setRecentUsername(savedUser);
        setUsername(savedUser);
        if (savedPass) {
          setPassword(savedPass);
        }
      }
      const savedGoogle = localStorage.getItem(GOOGLE_DEVICE_USER_KEY);
      if (savedGoogle) {
        const parsed = JSON.parse(savedGoogle);
        if (parsed && parsed.email) {
          setDetectedGoogleUser(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSyncing(true);

    if (password.length < 4) {
      setErrorMessage('Password must be at least 4 characters.');
      setIsSyncing(false);
      return;
    }

    const cleanUser = username.trim().toLowerCase();
    let currentRegistered = registeredUsers;
    let currentPasswords = userPasswords;

    let foundUser = currentRegistered.find(u => u.username.toLowerCase() === cleanUser);
    let expectedPassword = foundUser ? (currentPasswords[foundUser.username] || 'admin123') : '';

    // Live verification with centralized server to support real-time multi-device approvals
    if (!foundUser || password !== expectedPassword || foundUser.status === 'pending') {
      try {
        const fresh = await fetchServerUsers();
        if (fresh.success && fresh.users) {
          currentRegistered = fresh.users;
          if (fresh.passwords) currentPasswords = fresh.passwords;
          foundUser = currentRegistered.find(u => u.username.toLowerCase() === cleanUser);
          if (foundUser) {
            expectedPassword = currentPasswords[foundUser.username] || 'admin123';
          }
        }
      } catch (err) {
        console.warn('Live server authentication verification notice:', err);
      }
    }

    setIsSyncing(false);

    if (!foundUser) {
      setErrorMessage('User not found. Please check your username or register a new account.');
      return;
    }

    if (password !== expectedPassword) {
      setErrorMessage('Incorrect password. Please verify credentials.');
      return;
    }

    if (foundUser.status === 'pending') {
      setErrorMessage('Access Pending: Your account has been registered and is awaiting Administrator approval. An Admin must grant access in the Users Sheet before you can sign in.');
      return;
    }

    if (foundUser.status === 'suspended') {
      setErrorMessage('Access Suspended: This account has been suspended by an administrator.');
      return;
    }

    // Save recent login details to remember them next time
    try {
      if (rememberDetails) {
        localStorage.setItem(RECENT_USER_KEY, foundUser.username);
        localStorage.setItem(RECENT_PASS_KEY, password);
      } else {
        localStorage.removeItem(RECENT_USER_KEY);
        localStorage.removeItem(RECENT_PASS_KEY);
      }
    } catch {
      // ignore
    }

    onLoginSuccess(foundUser);
    onClose();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsSyncing(true);

    if (!username.trim() || !password.trim()) {
      setErrorMessage('Username and password are required.');
      setIsSyncing(false);
      return;
    }

    if (password.length < 4) {
      setErrorMessage('Password must be at least 4 characters long.');
      setIsSyncing(false);
      return;
    }

    const cleanUser = username.trim().toLowerCase();
    
    // Check local and server for existing username
    let isTaken = registeredUsers.some(u => u.username.toLowerCase() === cleanUser);
    if (!isTaken) {
      try {
        const fresh = await fetchServerUsers();
        if (fresh.success && fresh.users) {
          isTaken = fresh.users.some(u => u.username.toLowerCase() === cleanUser);
        }
      } catch {
        // ignore
      }
    }

    if (isTaken) {
      setErrorMessage('Username is already taken. Please choose another username.');
      setIsSyncing(false);
      return;
    }

    const selectedConfig = ALLOCATED_ROLES.find(r => r.id === selectedRoleOption) || ALLOCATED_ROLES[0];

    const newUser: User = {
      id: `usr-${Date.now()}`,
      username: username.trim(),
      fullName: fullName.trim() || username.trim(),
      role: selectedConfig.role,
      factory: selectedConfig.factory,
      status: 'pending',
      createdAt: new Date().toISOString().split('T')[0]
    };

    try {
      await onRegisterUser(newUser, password.trim());
      setIsSyncing(false);
      setSuccessMessage(`Account "${newUser.username}" submitted and synchronized across all devices! An Administrator can now see your account on their device and grant you access.`);
      setMode('LOGIN');
      setUsername(newUser.username);
      setPassword('');
    } catch (err: any) {
      setIsSyncing(false);
      setErrorMessage(err.message || 'Failed to register account across devices.');
    }
  };

  const handleClearSavedCredentials = () => {
    try {
      localStorage.removeItem(RECENT_USER_KEY);
      localStorage.removeItem(RECENT_PASS_KEY);
    } catch {
      // ignore
    }
    setRecentUsername('');
    setUsername('');
    setPassword('');
  };

  // Official Google Sign-In with real authentication verification
  const handleGoogleSignInClick = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setErrorMessage('');
    setSuccessMessage('');
    setIsGoogleSigningIn(true);

    try {
      const googleUser = await signInWithGooglePopup();
      handleGoogleIdentityVerified(googleUser.email, googleUser.displayName, googleUser.photoURL);
    } catch (err: any) {
      console.warn('Google authentication error:', err);
      if (err.code === 'auth/popup-closed-by-user') {
        setErrorMessage('Google Sign-In was closed before completing authentication. Please try again.');
      } else if (err.code === 'auth/cancelled-popup-request') {
        // Ignored
      } else if (err.code === 'auth/popup-blocked') {
        setErrorMessage('Google Sign-In popup was blocked by browser. Please allow popups for this site.');
      } else {
        setErrorMessage(err.message || 'Failed to authenticate with Google. Please try again.');
      }
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  // When a verified Google identity is resolved
  const handleGoogleIdentityVerified = (email: string, name: string, picture?: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const isPrimaryAdmin = cleanEmail === 'admin' || cleanEmail === 'hisanochana@gmail.com';

    const existing = registeredUsers.find(
      u => (u.email && u.email.toLowerCase() === cleanEmail) ||
           u.username.toLowerCase() === cleanEmail ||
           (u.fullName && u.fullName.toLowerCase().includes(cleanEmail))
    );

    // If account was marked suspended by Central Admin
    if (existing && existing.status === 'suspended') {
      setErrorMessage(`Account Suspended: The account associated with "${cleanEmail}" has been suspended by the Central Administrator.`);
      setMode('LOGIN');
      return;
    }

    // If account exists in User Sheet and is pending approval from Central Admin
    if (existing && existing.status === 'pending' && !isPrimaryAdmin) {
      setPendingGoogleAccount({
        email: cleanEmail,
        name: existing.fullName || name || cleanEmail.split('@')[0],
        factory: existing.factory,
        role: existing.role,
        picture: existing.picture || picture || ''
      });
      setMode('PENDING_APPROVAL');
      return;
    }

    // If account is already ACTIVE / approved in the User Sheet, log in immediately
    if (existing && existing.status === 'active') {
      try {
        localStorage.setItem(GOOGLE_DEVICE_USER_KEY, JSON.stringify({
          email: cleanEmail,
          name: existing.fullName,
          factory: existing.factory,
          role: existing.role,
          picture: existing.picture || picture || ''
        }));
        localStorage.setItem(RECENT_USER_KEY, existing.username);
      } catch {}
      onLoginSuccess(existing);
      onClose();
      return;
    }

    // New Google user not yet in the User Sheet - configure profile and submit for approval
    const initialFactory: FactoryName | 'ALL' = isPrimaryAdmin ? 'ALL' : 'Kurunegala';
    const initialRole: UserRole = isPrimaryAdmin ? 'admin' : 'operator';
    const initialName = name || cleanEmail.split('@')[0];

    setGoogleProfileForm({
      email: cleanEmail,
      name: initialName,
      factory: initialFactory,
      role: initialRole,
      picture: picture || ''
    });
    setMode('GOOGLE_PROFILE');
  };

  // Direct 1-click automatic login for device-detected verified Google account
  const handleDirectDeviceLogin = async (userProfile: {
    email: string;
    name: string;
    factory: FactoryName | 'ALL';
    role: UserRole;
    picture?: string;
  }) => {
    setIsGoogleSigningIn(true);
    setErrorMessage('');
    try {
      const cleanEmail = userProfile.email.trim().toLowerCase();
      const isPrimaryAdmin = cleanEmail === 'admin' || cleanEmail === 'hisanochana@gmail.com';

      // Always verify current approval status with server database first
      const serverRes = await fetchServerUsers();
      const currentList: User[] = (serverRes.success && Array.isArray(serverRes.users)) ? serverRes.users : registeredUsers;
      const matchedUser = currentList.find(
        u => (u.email && u.email.toLowerCase() === cleanEmail) ||
             u.username.toLowerCase() === cleanEmail
      );

      if (matchedUser) {
        if (matchedUser.status === 'suspended') {
          setErrorMessage('Access Suspended: This account has been suspended by the Central Administrator.');
          return;
        }

        if (matchedUser.status === 'pending' && !isPrimaryAdmin) {
          setPendingGoogleAccount({
            email: cleanEmail,
            name: matchedUser.fullName || userProfile.name,
            factory: matchedUser.factory,
            role: matchedUser.role,
            picture: matchedUser.picture || userProfile.picture
          });
          setMode('PENDING_APPROVAL');
          return;
        }

        if (matchedUser.status === 'active') {
          try {
            localStorage.setItem(GOOGLE_DEVICE_USER_KEY, JSON.stringify(userProfile));
            localStorage.setItem(RECENT_USER_KEY, matchedUser.username);
          } catch {}
          onLoginSuccess(matchedUser);
          onClose();
          return;
        }
      }

      // If user does not exist on server, save and determine approval
      const res = await saveGoogleUserToServer({
        email: userProfile.email,
        name: userProfile.name,
        factory: userProfile.factory,
        role: userProfile.role,
        picture: userProfile.picture
      });

      const userObj: User = res.user || {
        id: `usr-google-${userProfile.email.split('@')[0]}`,
        username: userProfile.email.split('@')[0],
        email: userProfile.email,
        fullName: userProfile.name,
        role: userProfile.role,
        factory: userProfile.factory,
        status: isPrimaryAdmin ? 'active' : 'pending',
        createdAt: new Date().toISOString().split('T')[0]
      };

      if (userObj.status === 'pending' && !isPrimaryAdmin) {
        setPendingGoogleAccount({
          email: cleanEmail,
          name: userObj.fullName,
          factory: userObj.factory,
          role: userObj.role,
          picture: userObj.picture || userProfile.picture
        });
        setMode('PENDING_APPROVAL');
        return;
      }

      try {
        localStorage.setItem(GOOGLE_DEVICE_USER_KEY, JSON.stringify(userProfile));
        localStorage.setItem(RECENT_USER_KEY, userObj.username);
      } catch {}

      onLoginSuccess(userObj);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to authenticate device Google session.');
    } finally {
      setIsGoogleSigningIn(false);
    }
  };

  // Save profile and enter application or await approval
  const handleSaveGoogleProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!googleProfileForm.email) return;

    if (!googleProfileForm.name.trim()) {
      setErrorMessage('Please enter your full name or staff ID.');
      return;
    }

    setIsSavingGoogleProfile(true);
    setErrorMessage('');

    try {
      const res = await saveGoogleUserToServer({
        email: googleProfileForm.email,
        name: googleProfileForm.name.trim(),
        factory: googleProfileForm.factory,
        role: googleProfileForm.role,
        picture: googleProfileForm.picture
      });

      if (res.success && res.user) {
        const savedProfile = {
          email: googleProfileForm.email,
          name: googleProfileForm.name.trim(),
          factory: googleProfileForm.factory,
          role: googleProfileForm.role,
          picture: googleProfileForm.picture
        };
        try {
          localStorage.setItem(GOOGLE_DEVICE_USER_KEY, JSON.stringify(savedProfile));
          localStorage.setItem(RECENT_USER_KEY, res.user.username);
        } catch {}
        setDetectedGoogleUser(savedProfile);

        const isPrimaryAdmin =
          googleProfileForm.email.toLowerCase() === 'hisanochana@gmail.com' ||
          googleProfileForm.email.toLowerCase() === 'admin';

        // If newly created or status is pending approval - require Central Admin approval
        if (res.user.status === 'pending' || !isPrimaryAdmin) {
          setPendingGoogleAccount({
            email: googleProfileForm.email,
            name: googleProfileForm.name.trim(),
            factory: googleProfileForm.factory,
            role: googleProfileForm.role,
            picture: googleProfileForm.picture || ''
          });
          setMode('PENDING_APPROVAL');
          return;
        }

        // Account is authorized and active
        onLoginSuccess(res.user);
        onClose();
      } else {
        setErrorMessage(res.message || 'Failed to register and save profile details.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error communicating with Google user database service.');
    } finally {
      setIsSavingGoogleProfile(false);
    }
  };

  // Check approval status in User Sheet on demand
  const handleCheckApprovalStatus = async () => {
    setIsCheckingApproval(true);
    setErrorMessage('');
    setSuccessMessage('');
    try {
      const res = await fetchServerUsers();
      if (res.success && Array.isArray(res.users)) {
        const targetEmail = pendingGoogleAccount?.email?.trim().toLowerCase();
        const updatedUser = res.users.find(
          u => (u.email && u.email.toLowerCase() === targetEmail) ||
               u.username.toLowerCase() === targetEmail
        );
        if (updatedUser) {
          if (updatedUser.status === 'active') {
            setSuccessMessage(`Account Approved! Access granted by Central Administrator. Logging in...`);
            setTimeout(() => {
              onLoginSuccess(updatedUser);
              onClose();
            }, 800);
            return;
          } else if (updatedUser.status === 'suspended') {
            setErrorMessage('Access Denied: This account has been marked as Suspended by the Central Administrator.');
            return;
          }
        }
      }
      setErrorMessage('Account is still pending approval in the Users Sheet. Please contact your Central Administrator.');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error checking approval status.');
    } finally {
      setIsCheckingApproval(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!resetUsername.trim()) {
      setErrorMessage('Please enter your username.');
      return;
    }

    if (newPassword.length < 4) {
      setErrorMessage('New password must be at least 4 characters long.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMessage('New passwords do not match. Please re-enter.');
      return;
    }

    setIsResetting(true);

    try {
      const res = await resetServerUserPassword(resetUsername.trim(), newPassword.trim(), resetFactory);
      if (res.success) {
        setSuccessMessage(
          res.message ||
            `Password reset request for "${resetUsername.trim()}" submitted for Central Administrator approval. For security, your account remains pending until an Administrator reviews and approves this change.`
        );
        setUsername(resetUsername.trim());
        setPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setMode('LOGIN');
      } else {
        setErrorMessage(res.message || 'Could not submit password reset request. Please check your username and factory.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to communicate with password reset service.');
    } finally {
      setIsResetting(false);
    }
  };

  const selectedConfig = ALLOCATED_ROLES.find(r => r.id === selectedRoleOption) || ALLOCATED_ROLES[0];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md bg-[#121c2e] border border-[#1c2b44] rounded-xl shadow-2xl p-5 text-slate-100">
        
        {/* Close button */}
        {!preventClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer z-10"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Company Identity Branding (Small Size) */}
        <div className="flex items-center gap-2.5 mb-3.5 pb-3 border-b border-[#1c2b44]/80 pr-8">
          <div className="w-7 h-7 rounded-lg bg-white border border-slate-700/60 p-0.5 flex items-center justify-center shadow-sm overflow-hidden shrink-0">
            <img
              src="/ebony_holdings_logo.jpg"
              alt="Ebony Holdings"
              referrerPolicy="no-referrer"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-black text-white tracking-tight leading-tight">
                Ebony Holdings
              </span>
              <span className="text-[9px] font-bold text-cyan-400/90 tracking-wider uppercase px-1.5 py-0.2 rounded bg-cyan-950/60 border border-cyan-800/40">
                Apparel Portal
              </span>
            </div>
            <p className="text-[10px] text-slate-400 leading-none mt-0.5">
              Manufacturing Operations System
            </p>
          </div>
        </div>

        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 text-cyan-400 font-black text-xs uppercase tracking-widest mb-1">
            <span className="w-1 h-3 bg-cyan-400 rounded-full"></span>
            {mode === 'FORGOT_PASSWORD' ? (
              <KeyRound className="w-3.5 h-3.5" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
            <span>Apparel Portal Access</span>
          </div>
          <h2 className="text-sm font-black uppercase text-white tracking-wider">
            {mode === 'LOGIN'
              ? 'Operator Sign In'
              : mode === 'REGISTER'
              ? 'Register New User'
              : mode === 'GOOGLE_SSO'
              ? 'Google Single Sign-On'
              : 'Request Password Reset'}
          </h2>
          <p className="text-[11px] text-slate-400 mt-1">
            {mode === 'LOGIN'
              ? 'Enter your credentials to access your allocated production plant or executive overview.'
              : mode === 'REGISTER'
              ? 'Select your allocated factory plant / role to configure locked operational access.'
              : mode === 'GOOGLE_SSO'
              ? 'Sign in securely with your authorized Google account to access your plant or executive dashboard.'
              : 'Submit a password reset request for your account. An Administrator must verify and approve this change before your new password becomes active.'}
          </p>
        </div>

        {/* Recent user banner if available in login mode */}
        {mode === 'LOGIN' && recentUsername && (
          <div className="mb-3 p-2.5 rounded-lg bg-sky-950/50 border border-sky-600/40 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-sky-400 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-black block">Recent User</span>
                <span className="font-bold text-sky-200">{recentUsername}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClearSavedCredentials}
              className="text-[10px] text-slate-400 hover:text-rose-400 underline transition cursor-pointer"
            >
              Clear saved
            </button>
          </div>
        )}

        {/* Alerts */}
        {errorMessage && (
          <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* LOGIN FORM */}
        {mode === 'LOGIN' ? (
          <form onSubmit={handleLogin} className="space-y-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Username
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="e.g. kurunegala_op"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Keep details saved & Forgot password row */}
            <div className="flex items-center justify-between pt-0.5">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  id="rememberMeCheckbox"
                  checked={rememberDetails}
                  onChange={e => setRememberDetails(e.target.checked)}
                  className="rounded border-slate-700 bg-[#0d1625] text-sky-500 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="rememberMeCheckbox" className="text-[11px] text-slate-400 cursor-pointer">
                  Save credentials
                </label>
              </div>

              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setSuccessMessage('');
                  setResetUsername(username);
                  setMode('FORGOT_PASSWORD');
                }}
                className="text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline cursor-pointer"
              >
                Forgot password?
              </button>
            </div>

            <button
              type="submit"
              disabled={isSyncing}
              className="w-full bg-sky-500 hover:bg-sky-400 text-white font-bold py-2 rounded-lg text-xs tracking-wide shadow-sm shadow-sky-950 transition cursor-pointer flex items-center justify-center gap-2"
            >
              {isSyncing && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isSyncing ? 'Verifying...' : 'Sign In to Factory System'}</span>
            </button>

            {/* Divider */}
            <div className="relative my-2.5 flex items-center justify-center">
              <div className="border-t border-slate-800 w-full"></div>
              <span className="bg-[#121c2e] px-2 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                or
              </span>
              <div className="border-t border-slate-800 w-full"></div>
            </div>

            {/* Google Sign In */}
            <button
              type="button"
              onClick={handleGoogleSignInClick}
              disabled={isGoogleSigningIn}
              className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-slate-100 text-slate-800 font-semibold py-2 px-3 rounded-lg text-xs tracking-wide shadow transition cursor-pointer disabled:opacity-70"
            >
              {isGoogleSigningIn ? (
                <RefreshCw className="w-4 h-4 animate-spin text-slate-600" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span>{isGoogleSigningIn ? 'Signing in with Google...' : 'Sign in with Google'}</span>
            </button>

            <div className="pt-2 text-center text-xs text-slate-400">
              Need an operator or management account?{' '}
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setSuccessMessage('');
                  setMode('REGISTER');
                }}
                className="text-cyan-400 font-bold hover:underline cursor-pointer"
              >
                Register with Plant / Role Selection
              </button>
            </div>
          </form>
        ) : mode === 'FORGOT_PASSWORD' ? (
          /* FORGOT / RESET PASSWORD FORM */
          <form onSubmit={handleResetPassword} className="space-y-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Your Username *
              </label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  required
                  placeholder="e.g. kurunegala_op"
                  value={resetUsername}
                  onChange={e => setResetUsername(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-cyan-300 mb-1 flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5" />
                <span>Verification: Your Allocated Factory Plant *</span>
              </label>
              <select
                value={resetFactory}
                onChange={e => setResetFactory(e.target.value)}
                className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="Kurunegala">Kurunegala Factory</option>
                <option value="Bulugolla">Bulugolla Factory</option>
                <option value="Werapola">Werapola Factory</option>
                <option value="ALL">All Factories (Central / Management)</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                New Password (min 4 characters) *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="password"
                  required
                  minLength={4}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Confirm New Password *
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-500" />
                <input
                  type="password"
                  required
                  minLength={4}
                  placeholder="Re-enter new password"
                  value={confirmNewPassword}
                  onChange={e => setConfirmNewPassword(e.target.value)}
                  className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-[11px] text-cyan-300">
              <span className="font-bold">Security Requirement:</span> Password resets are queued for Central Administrator verification. Your account remains in pending state until an Admin grants approval.
            </div>

            <button
              type="submit"
              disabled={isResetting}
              className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-2 rounded-lg text-xs tracking-wide shadow-sm shadow-cyan-950 transition cursor-pointer flex items-center justify-center gap-2"
            >
              {isResetting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
              <span>{isResetting ? 'Submitting Request...' : 'Submit Reset Request for Admin Approval'}</span>
            </button>

            <div className="pt-2 text-center text-xs text-slate-400">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setSuccessMessage('');
                  setMode('LOGIN');
                }}
                className="text-slate-300 hover:text-white flex items-center justify-center gap-1.5 mx-auto font-semibold cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Sign In</span>
              </button>
            </div>
          </form>
        ) : mode === 'GOOGLE_SSO' ? (
          /* GOOGLE SINGLE SIGN-ON INTERACTION */
          <div className="space-y-4">
            <div className="text-center space-y-1.5 pb-1">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-md mx-auto">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-white">Google Account Verification</h3>
              <p className="text-[11px] text-slate-400">
                Secure device sign-in via verified Google accounts. No passwords or unverified emails permitted.
              </p>
            </div>

            {/* If Google account detected on this device */}
            {detectedGoogleUser ? (
              <div className="bg-[#0a101d] border border-cyan-500/50 rounded-xl p-3.5 space-y-3 shadow-md">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold text-cyan-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    Detected on this device
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                    {detectedGoogleUser.factory} Plant ({detectedGoogleUser.role})
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center font-bold text-white text-sm shadow-inner shrink-0">
                    {detectedGoogleUser.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">{detectedGoogleUser.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">{detectedGoogleUser.email}</div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => handleDirectDeviceLogin(detectedGoogleUser)}
                    disabled={isGoogleSigningIn}
                    className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isGoogleSigningIn ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Log In Automatically with this Account</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleGoogleIdentityVerified(detectedGoogleUser.email, detectedGoogleUser.name, detectedGoogleUser.picture)}
                    className="w-full py-1.5 px-3 rounded-lg bg-[#121c2e] hover:bg-slate-800 text-cyan-300 font-medium text-xs border border-cyan-900/60 transition cursor-pointer"
                  >
                    Edit Name, Factory Plant, or Role
                  </button>
                </div>
              </div>
            ) : null}

            {/* Real Google Authentication Button */}
            <div className="space-y-3 pt-1">
              <button
                type="button"
                onClick={handleGoogleSignInClick}
                disabled={isGoogleSigningIn}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-900 font-bold py-2.5 px-4 rounded-xl text-xs tracking-wide shadow transition cursor-pointer disabled:opacity-70"
              >
                {isGoogleSigningIn ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-700" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>{isGoogleSigningIn ? 'Connecting to Google Authentication...' : 'Sign in with your Google Account'}</span>
              </button>

              <div className="p-2.5 rounded-lg bg-sky-950/30 border border-sky-800/40 text-[11px] text-sky-300 flex items-start gap-2">
                <Shield className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
                <span>
                  Authenticates directly through Google's official sign-in screen. After Google verifies your identity, you can select your name, allocated plant, and role.
                </span>
              </div>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setSuccessMessage('');
                  setMode('LOGIN');
                }}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center justify-center gap-1.5 mx-auto underline cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Standard Sign In</span>
              </button>
            </div>
          </div>
        ) : mode === 'GOOGLE_PROFILE' ? (
          /* GOOGLE USER PROFILE SETUP & USER DATA SHEET SYNC */
          <form onSubmit={handleSaveGoogleProfile} className="space-y-3.5">
            <div className="text-center space-y-1 pb-1">
              <h3 className="text-sm font-bold text-white">Configure Google User Profile</h3>
              <p className="text-[11px] text-slate-400">
                Specify your name, allocated plant, and role. Details are saved to the User Data Sheet.
              </p>
            </div>

            {/* Verified Google Account (Read Only) */}
            <div className="p-2.5 rounded-lg bg-[#0a101d] border border-cyan-500/40 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {googleProfileForm.picture ? (
                  <img
                    src={googleProfileForm.picture}
                    alt="Google Avatar"
                    className="w-8 h-8 rounded-full border border-cyan-400/40 object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700">
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                    </svg>
                  </div>
                )}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black block">Verified Google Account</span>
                  <span className="font-mono text-xs text-white font-bold">{googleProfileForm.email}</span>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>Verified by Google</span>
              </span>
            </div>

            {/* Full Name */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Full Name / Staff ID *
              </label>
              <input
                type="text"
                required
                value={googleProfileForm.name}
                onChange={e => setGoogleProfileForm({ ...googleProfileForm, name: e.target.value })}
                placeholder="e.g. Hasantha Chana (Production Lead)"
                className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Factory Plant */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-cyan-300 mb-1 flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5" />
                <span>Allocated Factory Plant *</span>
              </label>
              <select
                value={googleProfileForm.factory}
                onChange={e => setGoogleProfileForm({ ...googleProfileForm, factory: e.target.value as any })}
                className="w-full bg-[#0d1625] border border-cyan-500/70 rounded-lg px-2.5 py-1.5 text-xs font-bold text-cyan-200 focus:border-cyan-400 focus:outline-none"
              >
                <option value="Kurunegala">Kurunegala Factory</option>
                <option value="Bulugolla">Bulugolla Factory</option>
                <option value="Werapola">Werapola Factory</option>
                <option value="ALL">All Factories (Central / Management)</option>
              </select>
            </div>

            {/* Role */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Portal Role &amp; Access Level *
              </label>
              <select
                value={googleProfileForm.role}
                onChange={e => setGoogleProfileForm({ ...googleProfileForm, role: e.target.value as UserRole })}
                className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
              >
                <option value="operator">Plant Shift Operator (Data Entry &amp; Requests)</option>
                <option value="viewer">Executive Viewer (Analytics &amp; Read-Only Reports)</option>
                <option value="admin">System Administrator (Full Management &amp; Approvals)</option>
              </select>
            </div>

            <div className="p-2.5 rounded-lg bg-cyan-950/20 border border-cyan-800/40 text-[11px] text-cyan-300">
              Saving registers your account in the company User Sheet. Central Administrator approval is required before access is granted.
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMode('LOGIN')}
                className="w-1/3 py-2 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-slate-800 text-slate-300 font-bold text-xs transition cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={isSavingGoogleProfile}
                className="w-2/3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-sm shadow-cyan-950 transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isSavingGoogleProfile && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>{isSavingGoogleProfile ? 'Submitting Details...' : 'Submit Profile for Admin Approval'}</span>
              </button>
            </div>
          </form>
        ) : mode === 'PENDING_APPROVAL' ? (
          /* GOOGLE / REGISTRATION USER PENDING APPROVAL SCREEN */
          <div className="space-y-4 animate-fade-in">
            <div className="text-center space-y-2 pb-1">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-lg shadow-amber-500/10 animate-pulse">
                <Clock className="w-7 h-7" />
              </div>
              <h3 className="text-base font-black text-white tracking-wide">
                Approval Required from Central Admin
              </h3>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                Your Google account identity has been verified and registered in the company User Sheet. Access is currently awaiting Central Administrator approval.
              </p>
            </div>

            {/* Account Summary Card */}
            <div className="bg-[#0a101d] border border-amber-500/30 rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center gap-3">
                {pendingGoogleAccount?.picture ? (
                  <img
                    src={pendingGoogleAccount.picture}
                    alt="Google Avatar"
                    className="w-10 h-10 rounded-full border border-amber-500/40 object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400">
                    {pendingGoogleAccount?.name?.substring(0, 2).toUpperCase() || 'GA'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-xs truncate">
                      {pendingGoogleAccount?.name || 'Google User'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black uppercase">
                      Pending Approval
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400 block truncate">
                    {pendingGoogleAccount?.email}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#1c2b44] text-[11px]">
                <div className="bg-[#0f172a] p-2 rounded border border-slate-800">
                  <span className="text-slate-400 text-[9px] uppercase font-bold block">Allocated Plant</span>
                  <span className="text-sky-300 font-bold">{pendingGoogleAccount?.factory || 'Kurunegala'} Plant</span>
                </div>
                <div className="bg-[#0f172a] p-2 rounded border border-slate-800">
                  <span className="text-slate-400 text-[9px] uppercase font-bold block">Assigned Role</span>
                  <span className="text-purple-300 font-bold uppercase">{pendingGoogleAccount?.role || 'operator'}</span>
                </div>
              </div>
            </div>

            {/* Governance Note */}
            <div className="p-3 rounded-lg bg-sky-950/20 border border-sky-800/40 text-xs text-sky-200/90 flex items-start gap-2">
              <Shield className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
              <span className="text-[11px] leading-relaxed">
                <strong>Manufacturing Governance:</strong> The Central Administrator approves staff in the <strong>Users Sheet</strong>. Once authorized, click <strong>"Check Approval Status Now"</strong> below to enter the dashboard immediately.
              </span>
            </div>

            {/* Actions */}
            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isCheckingApproval}
                onClick={handleCheckApprovalStatus}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-950 transition flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isCheckingApproval ? 'animate-spin' : ''}`} />
                <span>{isCheckingApproval ? 'Checking User Sheet Status...' : 'Check Approval Status Now'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setSuccessMessage('');
                  setMode('LOGIN');
                }}
                className="w-full py-2 rounded-lg bg-[#0d1625] border border-slate-700 hover:bg-slate-800 text-slate-300 font-semibold text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Sign In with Different Account</span>
              </button>
            </div>
          </div>
        ) : (
          /* REGISTRATION FORM */
          <form onSubmit={handleRegister} className="space-y-3">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Full Name / Staff ID
              </label>
              <input
                type="text"
                placeholder="e.g. Rasitha Silva (Line Supervisor)"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Username *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. rasitha_shift"
                value={username}
                onChange={e => setUsername(e.target.value)}
                className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                Password *
              </label>
              <input
                type="password"
                required
                placeholder="Minimum 4 characters"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-[#0d1625] border border-slate-700/70 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Role & Allocated Factory Plant Dropdown */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-cyan-300 mb-1 flex items-center gap-1.5">
                <Factory className="w-3.5 h-3.5" />
                <span>Select Your Allocated Factory Plant / Role *</span>
              </label>
              <select
                value={selectedRoleOption}
                onChange={e => setSelectedRoleOption(e.target.value as AllocatedRoleSelection)}
                className="w-full bg-[#0d1625] border border-cyan-500/70 rounded-lg px-2.5 py-2 text-xs font-bold text-cyan-200 focus:border-cyan-400 focus:outline-none"
              >
                {ALLOCATED_ROLES.map(opt => (
                  <option key={opt.id} value={opt.id} className="bg-[#0d1625] text-white">
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="p-2.5 rounded-lg bg-amber-950/20 border border-amber-500/30 text-amber-300 text-[11px] leading-relaxed">
              <span className="font-bold">Approval Required:</span> Direct login is disabled for new registrations. An Administrator must grant you access from the Users Sheet before your account becomes active.
            </div>

            <button
              type="submit"
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 rounded-lg text-xs tracking-wide shadow-sm shadow-emerald-950 transition cursor-pointer"
            >
              Submit Registration for Admin Approval
            </button>

            <div className="pt-1 text-center text-xs text-slate-400">
              Already registered?{' '}
              <button
                type="button"
                onClick={() => {
                  setErrorMessage('');
                  setSuccessMessage('');
                  setMode('LOGIN');
                }}
                className="text-cyan-400 font-bold hover:underline cursor-pointer"
              >
                Return to Sign In
              </button>
            </div>
          </form>
        )}

      </div>
    </div>
  );
};
