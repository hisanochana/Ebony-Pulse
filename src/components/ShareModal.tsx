import React, { useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  X,
  ExternalLink,
  ShieldCheck,
  Globe,
  Sparkles,
  Users,
  Eye,
  KeyRound
} from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHARED_APP_URL = 'https://ais-pre-an7ecnqglscc5oobcappwr-319186798892.asia-southeast1.run.app';

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  // Use current web origin if on live domain, otherwise use the shared Cloud Run URL
  const currentUrl = typeof window !== 'undefined' && window.location.origin.includes('.run.app')
    ? window.location.href
    : SHARED_APP_URL;

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(currentUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = currentUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (e) {
      console.error('Failed to copy', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#121c2e] border border-[#1c2b44] rounded-2xl shadow-2xl p-6 text-slate-100 overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
              <span>Share Application Link</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Public Access
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Anyone with this link can open the application instantly without a Google account.
            </p>
          </div>
        </div>

        {/* Shareable Link Box */}
        <div className="p-3.5 bg-[#0a101d] rounded-xl border border-slate-700/80 mb-4 space-y-2">
          <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-cyan-400" />
              Direct Standalone Web Link
            </span>
            <span className="text-emerald-400 font-semibold normal-case">No Google sign-in required</span>
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={currentUrl}
              className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-cyan-300 select-all focus:outline-none focus:border-cyan-500"
            />
            <button
              type="button"
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition shrink-0 cursor-pointer shadow-md ${
                copied
                  ? 'bg-emerald-600 text-white shadow-emerald-950'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-950'
              }`}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span>{copied ? 'Copied!' : 'Copy Link'}</span>
            </button>
          </div>
        </div>

        {/* Key Points */}
        <div className="space-y-2.5 mb-5">
          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Open Without Google Account</span>
              <span className="text-slate-400 text-[11px]">
                Visitors can open this URL directly in Chrome, Safari, Edge, Firefox, or on mobile devices. They do not need to sign into Google or AI Studio.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <Eye className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Instant Guest Viewer Mode</span>
              <span className="text-slate-400 text-[11px]">
                Visitors can click <strong>&quot;Continue as Guest Viewer&quot;</strong> on the sign-in screen to view dashboards, charts, MTD metrics, and download CSVs with zero registration.
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-xs">
            <KeyRound className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-white block">Pre-Configured Demo Credentials</span>
              <span className="text-slate-400 text-[11px]">
                If anyone wants to test operator shift logging or admin tools, built-in username/password logins are provided on the screen (no Google account needed):
              </span>
              <div className="grid grid-cols-2 gap-1.5 mt-2 font-mono text-[10px]">
                <div className="p-1.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300">
                  <span className="text-slate-400 block font-sans">Viewer:</span>
                  User: <strong className="text-cyan-300">viewer</strong> / Pass: <strong className="text-cyan-300">view123</strong>
                </div>
                <div className="p-1.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300">
                  <span className="text-slate-400 block font-sans">Kurunegala Op:</span>
                  User: <strong className="text-cyan-300">kurunegala_op</strong> / Pass: <strong className="text-cyan-300">kg123</strong>
                </div>
                <div className="p-1.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300">
                  <span className="text-slate-400 block font-sans">Bulugolla Op:</span>
                  User: <strong className="text-cyan-300">bulugolla_op</strong> / Pass: <strong className="text-cyan-300">bg123</strong>
                </div>
                <div className="p-1.5 rounded bg-slate-800/80 border border-slate-700 text-slate-300">
                  <span className="text-slate-400 block font-sans">Admin:</span>
                  User: <strong className="text-cyan-300">admin</strong> / Pass: <strong className="text-cyan-300">admin123</strong>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 hover:underline"
          >
            <span>Open standalone preview</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
