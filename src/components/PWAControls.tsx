import React, { useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';
import { useOnlineStatus, usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Install Vellum app"
        title="Install Vellum as a standalone app"
        className="h-7 px-2 rounded-lg inline-flex items-center gap-1.5 text-[11.5px] font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden md:inline">Install</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          aria-label="Install Vellum on iPad or iPhone"
          title="Install on iPad / iPhone"
          className="h-7 px-2 rounded-lg inline-flex items-center gap-1 text-[11.5px] font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 transition-colors whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Install</span>
        </button>

        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Install Vellum on iOS"
            onClick={() => setShowIOSGuide(false)}
            className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#161D27] border border-slate-200 dark:border-[#263142] shadow-xl p-5"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100">
                  Install on iPhone or iPad
                </h3>
                <button
                  type="button"
                  aria-label="Close install guide"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ol className="space-y-2 text-[13px] text-slate-600 dark:text-slate-300 list-decimal list-inside">
                <li>
                  Tap the <strong>Share</strong> button in Safari&apos;s toolbar.
                </li>
                <li>
                  Scroll down and tap <strong>Add to Home Screen</strong>.
                </li>
                <li>
                  Tap <strong>Add</strong> to launch Vellum full-screen offline.
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-4 w-full py-2 rounded-lg bg-slate-100 dark:bg-[#1E2736] text-[13px] font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-[#263142] transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-16 left-3 z-40 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/90 dark:bg-slate-100/95 text-white dark:text-slate-900 text-[11.5px] font-medium shadow-sm pointer-events-none"
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>Offline · Changes save locally</span>
    </div>
  );
};
