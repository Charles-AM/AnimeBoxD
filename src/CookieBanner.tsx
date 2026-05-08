import { useState } from "react";

const CONSENT_KEY = "animeboxd_cookie_consent";

export type CookieConsent = "accepted" | "essential";

export function getStoredConsent(): CookieConsent | null {
  const val = localStorage.getItem(CONSENT_KEY);
  if (val === "accepted" || val === "essential") return val;
  return null;
}

export function CookieBanner({ onConsent }: { onConsent: (choice: CookieConsent) => void }) {
  const [visible, setVisible] = useState(() => getStoredConsent() === null);

  if (!visible) return null;

  const choose = (choice: CookieConsent) => {
    localStorage.setItem(CONSENT_KEY, choice);
    setVisible(false);
    onConsent(choice);
  };

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/70 bg-white/97 px-4 py-3 shadow-2xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/97 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-xs sm:rounded-2xl sm:border"
    >
      <div className="flex items-start justify-between gap-3 sm:block">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">🍪 Quick heads-up</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            We use cookies to keep you signed in and save your settings. No ads or tracking.{" "}
            <a href="/privacy.html" className="font-semibold text-teal-600 underline underline-offset-2 dark:text-teal-400" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
          </p>
        </div>
        <div className="mt-2 flex shrink-0 gap-2 sm:mt-2.5">
          <button
            onClick={() => choose("accepted")}
            className="shrink-0 rounded-lg bg-teal-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-teal-400"
          >
            Accept
          </button>
          <button
            onClick={() => choose("essential")}
            className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Essential only
          </button>
        </div>
      </div>
    </div>
  );
}
