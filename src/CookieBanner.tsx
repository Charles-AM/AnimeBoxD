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
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200/70 bg-white/95 px-4 py-4 shadow-2xl backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/95 sm:bottom-4 sm:left-auto sm:right-4 sm:max-w-sm sm:rounded-2xl sm:border"
    >
      <p className="text-lg font-bold leading-tight text-slate-900 dark:text-white">
        🍪 Quick heads-up
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        AnimeBoxD uses cookies to keep you signed in, save your library, and remember your settings. No tracking or ads — just the essentials that make the app work.
      </p>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        Read our{" "}
        <a
          href="/privacy.html"
          className="font-semibold text-teal-600 underline underline-offset-2 dark:text-teal-400"
          target="_blank"
          rel="noopener noreferrer"
        >
          Privacy Policy
        </a>{" "}
        to learn more.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <button
          onClick={() => choose("accepted")}
          className="flex-1 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-400"
        >
          Accept all
        </button>
        <button
          onClick={() => choose("essential")}
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Essential only
        </button>
      </div>
    </div>
  );
}
