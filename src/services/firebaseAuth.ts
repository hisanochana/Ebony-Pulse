import {
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { auth } from './firebase';

export { auth };

// Configure Google Auth Provider
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
// Always prompt account selection so users can switch accounts or verify securely
googleProvider.setCustomParameters({
  prompt: 'select_account'
});

export interface GoogleAuthResult {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

/**
 * Triggers official Google OAuth sign-in popup.
 * Opens Google's secure sign-in window where user authenticates with their Google account.
 */
export async function signInWithGooglePopup(): Promise<GoogleAuthResult> {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user;

  if (!user.email) {
    throw new Error('Google account did not provide a verified email address.');
  }

  return {
    uid: user.uid,
    email: user.email.toLowerCase(),
    displayName: user.displayName || user.email.split('@')[0],
    photoURL: user.photoURL || undefined
  };
}

/**
 * Signs out from Firebase/Google session.
 */
export async function signOutFromGoogle(): Promise<void> {
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('Google sign out error:', err);
  }
}

/**
 * Subscribes to Firebase auth state changes.
 */
export function subscribeToAuthState(
  onUserChanged: (user: FirebaseUser | null) => void
) {
  return onAuthStateChanged(auth, onUserChanged);
}
