import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Film,
  Heart,
  LogOut,
  Mail,
  Monitor,
  Moon,
  PlayCircle,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Share2,
  Sparkles,
  Star,
  Sun,
  Trash2,
  Trophy,
  X
} from "lucide-react";
import { fixedAnime } from "./lib/fixedAnime";
import { getAiringToday, getAnime, getAnimeCharacters, getAnimeStaff, getAnimeThemes, getManga, getSeasonal, getTopAiring, getUpcomingAnime, searchAnime, searchManga } from "./lib/jikan";
import { loadData, saveData, setActiveUser } from "./lib/storage";
import { completeAuthSessionFromUrl, createReport, deleteCloudAccount, getCurrentSession, isSupabaseConfigured, loadAdminDashboard, loadCloudData, loadProfile, logActivityEvent, logPageView, markProfileSeen, resendSignupConfirmation, saveCloudData, sendPasswordResetEmail, signInWithEmail, signOutCloud, signUpWithEmail, updateCloudPassword, upsertProfile, userToProfileFallback } from "./lib/supabase";
import type { AdminDashboardData, AnimeDetail, AnimeSummary, AppData, LibraryEntry, LibraryStatus, MangaDetail, MangaEntry, MangaStatus, MangaSummary, Settings, ThemeMode } from "./types/anime";
import { CookieBanner } from "./CookieBanner";

type UserAccount = { id: string; name: string; avatar: string; passcode: string; email?: string; isCloud?: boolean; isAdmin?: boolean; memberSince?: string };

type AuthMode = "signin" | "signup";
type AppPage = "home" | "stuff" | "manga" | "add" | "add-manga" | "dashboard" | "explore" | "profile" | "admin" | "auth";

type Section = { key: LibraryStatus; title: string; icon: React.ReactElement };

const USER_KEY = "animeboxd_users_v1";
const DEMO_USER: UserAccount = { id: "demo", name: "Demo", avatar: "🎴", passcode: "demo123" };
const statuses: LibraryStatus[] = ["Watching", "Completed", "Plan to Watch", "On Hold", "Dropped"];
const mangaStatuses: MangaStatus[] = ["Reading", "Completed", "Plan to Read", "On Hold", "Dropped"];
const statusLabels: Record<LibraryStatus, string> = {
  Watching: "Watching",
  Completed: "Completed",
  "Plan to Watch": "Plan to Watch",
  "On Hold": "On Hold",
  Dropped: "Dropped"
};
const mangaStatusLabels: Record<MangaStatus, string> = {
  Reading: "Reading",
  Completed: "Completed",
  "Plan to Read": "Plan to Read",
  "On Hold": "On Hold",
  Dropped: "Dropped"
};

const sections: Section[] = [
  { key: "Watching", title: "Watching now", icon: <PlayCircle className="h-5 w-5" /> },
  { key: "Plan to Watch", title: "Plan to watch", icon: <BookMarked className="h-5 w-5" /> },
  { key: "Completed", title: "Completed", icon: <CheckCircle2 className="h-5 w-5" /> },
  { key: "On Hold", title: "On hold", icon: <Film className="h-5 w-5" /> },
  { key: "Dropped", title: "Dropped", icon: <Trash2 className="h-5 w-5" /> }
];

const mangaSections: { key: MangaStatus; title: string; icon: React.ReactElement }[] = [
  { key: "Reading", title: "Reading now", icon: <BookOpen className="h-5 w-5" /> },
  { key: "Plan to Read", title: "Plan to read", icon: <BookMarked className="h-5 w-5" /> },
  { key: "Completed", title: "Completed", icon: <CheckCircle2 className="h-5 w-5" /> },
  { key: "On Hold", title: "On hold", icon: <Film className="h-5 w-5" /> },
  { key: "Dropped", title: "Dropped", icon: <Trash2 className="h-5 w-5" /> }
];

const SITE_URL = "https://animeboxd.app/";
const CREDIT_TEXT = "AnimeBoxD is an independent fan project. Anime and manga titles, artwork, synopses, trademarks, studios, publishers, streaming names, and source metadata belong to their respective owners. Discovery data is provided through Jikan and MyAnimeList references; AnimeBoxD does not claim ownership of third-party content.";
const avatarOptions = ["✨", "🎴", "🍥", "🌀", "🌙", "🔥", "⚔️", "🛡️", "🧡", "💫", "🌸", "🐉", "👑", "🎧", "📚", "🦊", "👾", "⭐"];
const inactivityTimeoutMs = 30 * 60 * 1000;
const REPORT_RATE_KEY = "animeboxd_last_report_at";
const REPORT_COOLDOWN_MS = 60 * 60 * 1000;

function getAuthHashType() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.hash.replace(/^#/, "")).get("type") || "";
}

function hasAuthCallbackParams() {
  if (typeof window === "undefined") return false;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  return Boolean(
    hashParams.get("access_token") ||
    hashParams.get("refresh_token") ||
    hashParams.get("type") ||
    queryParams.get("code") ||
    queryParams.get("type") ||
    queryParams.get("error") ||
    queryParams.get("error_description")
  );
}

function friendlyAuthError(error: unknown, fallback = "Something went wrong. Please try again.") {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();
  if (normalized.includes("auth session missing") || normalized.includes("session missing")) {
    return "This sign-in link has expired or was already used. Please request a fresh email and try again.";
  }
  if (normalized.includes("invalid login credentials")) {
    return "That email or password does not look right.";
  }
  if (normalized.includes("email not confirmed") || normalized.includes("email_not_confirmed")) {
    return "Please confirm your email before signing in.";
  }
  if (normalized.includes("user already registered") || normalized.includes("already registered")) {
    return "An account already exists for this email. Sign in instead.";
  }
  if (normalized.includes("password")) {
    return "Please use a stronger password with at least 8 characters, including letters and numbers.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many")) {
    return "Too many tries right now. Please wait a minute, then try again.";
  }
  return message || fallback;
}

function normalizeUserId(value: string) {
  const trimmed = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return trimmed || "viewer";
}

function loadUsers(): UserAccount[] {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as UserAccount[];
  } catch {
    return [];
  }
}

function saveUsers(users: UserAccount[]) {
  localStorage.setItem(USER_KEY, JSON.stringify(users));
}

function findUserById(userId: string) {
  return loadUsers().find((user) => user.id === userId) || null;
}

function ensureDemoUser(users: UserAccount[]) {
  if (users.some((user) => user.id === DEMO_USER.id)) return users;
  return [...users, DEMO_USER];
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={clsx("glass-card min-w-0 rounded-2xl p-5 text-slate-900 dark:text-slate-100", className)}>{children}</div>;
}

function Button({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={clsx("button-glow inline-flex min-h-10 min-w-0 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold leading-none text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300", className)} {...props}>
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 text-sm font-medium text-slate-700 dark:text-slate-200">
      <span>{label}</span>
      {children}
    </div>
  );
}

function normalizeRating(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(10, Math.max(0.5, Math.round(value * 2) / 2));
}

function StarRating({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const rating = normalizeRating(value);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {Array.from({ length: 10 }).map((_, index) => {
          const score = index + 1;
          const fillWidth = rating >= score ? "100%" : rating >= score - 0.5 ? "50%" : "0%";
          return (
            <span key={score} className="relative h-7 w-7 shrink-0 sm:h-8 sm:w-8">
              <Star className="absolute inset-0 h-full w-full text-slate-300 dark:text-slate-700" />
              <span className="absolute inset-0 overflow-hidden" style={{ width: fillWidth }}>
                <Star className="h-7 w-7 fill-amber-400 text-amber-400 sm:h-8 sm:w-8" />
              </span>
              <button className="absolute left-0 top-0 h-full w-1/2 rounded-l-md focus:outline-none focus:ring-2 focus:ring-teal-400" onClick={() => onChange(score - 0.5)} type="button" aria-label={`Rate ${score - 0.5} out of 10`} />
              <button className="absolute right-0 top-0 h-full w-1/2 rounded-r-md focus:outline-none focus:ring-2 focus:ring-teal-400" onClick={() => onChange(score)} type="button" aria-label={`Rate ${score} out of 10`} />
            </span>
          );
        })}
        <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {rating ? `${rating}/10` : "No rating"}
        </span>
      </div>
      {rating > 0 && (
        <button className="justify-self-start text-xs font-black text-slate-500 underline decoration-slate-300 underline-offset-4 hover:text-teal-600 dark:text-slate-400" onClick={() => onChange(0)} type="button">
          Clear rating
        </button>
      )}
    </div>
  );
}

function inputClass() {
  return "w-full min-w-0 rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100";
}

function mergeAnimeToEntry(anime: AnimeSummary, existing?: LibraryEntry): LibraryEntry {
  return {
    ...anime,
    status: existing?.status || "Plan to Watch",
    rating: existing?.rating || 0,
    episodes_watched: existing?.episodes_watched || 0,
    rewatch_count: existing?.rewatch_count || 0,
    start_date: existing?.start_date || "",
    end_date: existing?.end_date || "",
    notes: existing?.notes || "",
    review: existing?.review || "",
    drop_reason: existing?.drop_reason || "",
    tags: existing?.tags || [],
    added_at: existing?.added_at || new Date().toISOString()
  };
}

function mergeMangaToEntry(manga: MangaSummary, existing?: MangaEntry): MangaEntry {
  return {
    ...manga,
    status: existing?.status || "Plan to Read",
    rating: existing?.rating || 0,
    chapters_read: existing?.chapters_read || 0,
    volumes_read: existing?.volumes_read || 0,
    start_date: existing?.start_date || "",
    end_date: existing?.end_date || "",
    notes: existing?.notes || "",
    review: existing?.review || "",
    drop_reason: existing?.drop_reason || "",
    tags: existing?.tags || [],
    added_at: existing?.added_at || new Date().toISOString()
  };
}

function useTheme(settings: Settings) {
  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = settings.theme === "Dark" || (settings.theme === "System" && prefersDark);
    document.documentElement.classList.toggle("dark", dark);
  }, [settings.theme]);
}

function AuthPage({ initialNotice, onBrowse, onLogin }: { initialNotice?: string; onBrowse?: () => void; onLogin: (payload: { user: UserAccount; data: AppData }) => void | Promise<void> }) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetSending, setResetSending] = useState(false);

  useEffect(() => {
    if (initialNotice) setNotice(initialNotice);
  }, [initialNotice]);

  useEffect(() => {
    if (isSupabaseConfigured) return;
    const nextUsers = ensureDemoUser(loadUsers());
    saveUsers(nextUsers);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const handleAuthCallback = async () => {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryParams = new URLSearchParams(window.location.search);
      const authError = hashParams.get("error_description") || hashParams.get("error") || queryParams.get("error_description") || queryParams.get("error");
      const authType = hashParams.get("type") || queryParams.get("type");
      const hasAuthPayload = hashParams.get("access_token") || hashParams.get("refresh_token") || hashParams.get("type") || queryParams.get("code") || queryParams.get("type");

      if (authError) setError(friendlyAuthError(authError.replace(/\+/g, " "), "This link could not be opened. Please request a fresh email."));
      if (authType === "recovery") {
        setMode("signin");
        setResetMode(true);
        setNotice("Opening your reset form...");
      }

      try {
        if (isSupabaseConfigured && hasAuthPayload) {
          const result = await completeAuthSessionFromUrl();
          if (!cancelled && result?.type === "recovery") {
            setMode("signin");
            setResetMode(true);
            setNotice("Set your new password below.");
          }
        }
      } catch (err) {
        if (!cancelled) setError(friendlyAuthError(err, "Could not open this reset link. Try sending a fresh one."));
      } finally {
        if (!cancelled && hasAuthPayload) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    };
    handleAuthCallback();
    return () => {
      cancelled = true;
    };
  }, []);

  const passwordMeetsRules = passcode.length >= 8 && /[A-Za-z]/.test(passcode) && /\d/.test(passcode);

  const switchMode = (nextMode: AuthMode) => {
    if (nextMode === mode) return;
    const keepEmail = mode === "signup" && nextMode === "signin" && signupEmail;
    setMode(nextMode);
    setResetMode(false);
    setName("");
    setEmail(keepEmail ? signupEmail : "");
    setPasscode("");
    setError("");
    setNotice("");
  };

  const submit = async () => {
    setError("");
    setNotice("");
    if (isSupabaseConfigured) {
      if (!email.trim() || !passcode.trim() || (mode === "signup" && !name.trim())) {
        setError(mode === "signup" ? "Add your name, email, and password." : "Add your email and password.");
        return;
      }
      if (mode === "signup" && !passwordMeetsRules) {
        setError("Use at least 8 characters with letters and numbers.");
        return;
      }
      setLoading(true);
      try {
        const response = mode === "signup"
          ? await signUpWithEmail(email.trim(), passcode.trim(), name.trim())
          : await signInWithEmail(email.trim(), passcode.trim());
        if (!response.user || !response.session) {
          setSignupEmail(email.trim());
          setPasscode("");
          setNotice("Check your email to confirm your account. After confirming, return here and sign in.");
          return;
        }
        const profile = (await loadProfile(response.user.id)) || userToProfileFallback(response.user);
        const nextData = await loadCloudData(response.user.id);
        await onLogin({
          user: { id: response.user.id, name: profile.username, avatar: profile.avatar, passcode: "", email: response.user.email, isCloud: true, isAdmin: Boolean(profile.is_admin), memberSince: profile.created_at || response.user.created_at },
          data: { ...nextData, settings: { ...nextData.settings, username: profile.username, avatar: profile.avatar, bio: profile.bio || nextData.settings.bio, isPublic: profile.is_public } }
        });
      } catch (err) {
        setError(friendlyAuthError(err, "Could not sign in right now."));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!name.trim() || !passcode.trim()) {
      setError("Please enter a name and passcode.");
      return;
    }
    const users = ensureDemoUser(loadUsers());
    const idValue = normalizeUserId(name);
    const existing = users.find((user) => user.id === idValue);

    if (mode === "signup") {
      if (existing) {
        setError("That name already exists. Sign in instead.");
        return;
      }
      const nextUser = { id: idValue, name: name.trim(), avatar: "✨", passcode: passcode.trim() };
      const nextUsers = [...users, nextUser];
      saveUsers(nextUsers);
      const nextData = loadData(nextUser.id);
      onLogin({ user: nextUser, data: { ...nextData, settings: { ...nextData.settings, username: nextUser.name, avatar: nextUser.avatar } } });
      return;
    }

    if (!existing || existing.passcode !== passcode.trim()) {
      setError("Name or passcode is incorrect.");
      return;
    }

    const nextData = loadData(existing.id);
    onLogin({ user: existing, data: { ...nextData, settings: { ...nextData.settings, username: existing.name, avatar: existing.avatar } } });
  };

  const loginDemo = () => {
    const users = ensureDemoUser(loadUsers());
    saveUsers(users);
    const nextData = loadData(DEMO_USER.id);
    onLogin({ user: DEMO_USER, data: { ...nextData, settings: { ...nextData.settings, username: DEMO_USER.name, avatar: DEMO_USER.avatar } } });
  };

  const resendVerification = async () => {
    const targetEmail = signupEmail || email.trim();
    if (!targetEmail) {
      setError("Enter your email first.");
      return;
    }
    setResending(true);
    setError("");
    try {
      await resendSignupConfirmation(targetEmail);
      setSignupEmail(targetEmail);
      setNotice("Verification email sent again. Check your inbox and spam folder.");
    } catch (err) {
      setError(friendlyAuthError(err, "Could not resend the verification email."));
    } finally {
      setResending(false);
    }
  };

  const sendResetEmail = async () => {
    const targetEmail = email.trim();
    if (!targetEmail) {
      setError("Enter your email first, then tap forgot password.");
      return;
    }
    setResetSending(true);
    setError("");
    setNotice("");
    try {
      await sendPasswordResetEmail(targetEmail);
      setNotice("Password reset email sent. Open the link, then choose a new password.");
    } catch (err) {
      setError(friendlyAuthError(err, "Could not send a reset email right now."));
    } finally {
      setResetSending(false);
    }
  };

  const updatePassword = async () => {
    setError("");
    setNotice("");
    if (!passwordMeetsRules) {
      setError("Use at least 8 characters with letters and numbers.");
      return;
    }
    setLoading(true);
    try {
      await updateCloudPassword(passcode.trim());
      await signOutCloud();
      setPasscode("");
      setResetMode(false);
      setMode("signin");
      setNotice("Password updated. Sign in with your new password.");
    } catch (err) {
      setError(friendlyAuthError(err, "Could not update your password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto grid min-h-screen w-full max-w-4xl content-start px-3 py-4 sm:content-center sm:px-4 sm:py-12">
        <Card className="grid gap-5 p-4 sm:gap-6 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Animeboxd</p>
              <h1 className="font-display text-4xl leading-tight sm:text-5xl">Welcome back</h1>
              <p className="text-sm text-slate-500">{isSupabaseConfigured ? "Your anime and manga shelf, wherever you log in." : "Pick up where you left off."}</p>
            </div>
            <Film className="h-10 w-10 shrink-0 text-teal-500" />
          </div>
          {resetMode ? (
            <div className="rounded-xl border border-teal-300 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-900 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100">
              Reset password
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold", mode === "signup" ? "border-teal-400 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300")} onClick={() => switchMode("signup")}>
                Sign up
              </button>
              <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold", mode === "signin" ? "border-teal-400 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300")} onClick={() => switchMode("signin")}>
                Sign in
              </button>
            </div>
          )}
          <div className="grid gap-4">
            {(!resetMode && (!isSupabaseConfigured || mode === "signup")) && (
              <Field label="Display name">
                <input className={inputClass()} placeholder="e.g. Mirai" value={name} onChange={(event) => setName(event.target.value)} />
              </Field>
            )}
            {isSupabaseConfigured && !resetMode && (
              <Field label="Email">
                <input className={inputClass()} type="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              </Field>
            )}
            <Field label={resetMode ? "New password" : isSupabaseConfigured ? "Password" : "Passcode"}>
              <input
                className={inputClass()}
                type="password"
                placeholder={isSupabaseConfigured ? "At least 8 characters" : "Simple passcode"}
                value={passcode}
                onChange={(event) => setPasscode(event.target.value)}
              />
            </Field>
            {isSupabaseConfigured && (mode === "signup" || resetMode) && (
              <p className={clsx("text-xs", passcode && !passwordMeetsRules ? "text-amber-600 dark:text-amber-300" : "text-slate-500")}>
                Passwords need at least 8 characters with letters and numbers.
              </p>
            )}
            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
            {notice && (
              <div className="grid gap-2 rounded-xl bg-teal-50 px-3 py-2 text-sm text-teal-800 dark:bg-teal-950/40 dark:text-teal-100">
                <p>{notice}</p>
                {isSupabaseConfigured && signupEmail && (
                  <button className="justify-self-start text-sm font-black text-teal-700 underline decoration-teal-300 underline-offset-4 disabled:opacity-50 dark:text-teal-200" onClick={resendVerification} disabled={resending} type="button">
                    {resending ? "Sending..." : "Resend verification email"}
                  </button>
                )}
              </div>
            )}
            <Button onClick={resetMode ? updatePassword : submit} disabled={loading}>{loading ? "One moment..." : resetMode ? "Update password" : mode === "signup" ? "Create account" : "Sign in"}</Button>
            {isSupabaseConfigured && mode === "signin" && !resetMode && (
              <button className="button-ghost justify-self-start" onClick={sendResetEmail} disabled={resetSending} type="button">
                {resetSending ? "Sending reset link..." : "Forgot password?"}
              </button>
            )}
            {resetMode && (
              <button className="button-ghost justify-self-start" onClick={() => { setResetMode(false); setPasscode(""); setNotice(""); setError(""); }} type="button">
                Back to sign in
              </button>
            )}
            {!isSupabaseConfigured && !resetMode && <button className="button-ghost" onClick={loginDemo}>Use demo user</button>}
            {onBrowse && !resetMode && (
              <button className="button-ghost" onClick={onBrowse} type="button">
                Continue browsing
              </button>
            )}
          </div>
        </Card>
        <div className="mt-4 border-t border-slate-200/60 pt-4 pb-2 text-center dark:border-slate-800">
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            {[{ label: "About", href: "/about.html" }, { label: "Contact", href: "/contact.html" }, { label: "Privacy", href: "/privacy.html" }, { label: "Terms", href: "/terms.html" }].map((link) => (
              <a key={link.href} className="text-sm font-semibold text-slate-500 transition hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-300" href={link.href}>{link.label}</a>
            ))}
          </nav>
          <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">© {new Date().getFullYear()} AnimeBoxD · Fan project</p>
        </div>
      </div>
    </div>
  );
}

function Header({ user, theme, isAdmin, onThemeChange, onLogout, onHome, onMyStuff, onMyManga, onDashboard, onExplore, onProfile, onAdmin, onReportIssue, activePage }: { user: { name: string; avatar: string }; theme: ThemeMode; isAdmin: boolean; onThemeChange: (value: ThemeMode) => void; onLogout: () => void; onHome: () => void; onMyStuff: () => void; onMyManga: () => void; onDashboard: () => void; onExplore: () => void; onProfile: () => void; onAdmin: () => void; onReportIssue: () => void; activePage: AppPage }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-3">
          <button className="flex min-w-0 items-center gap-2" onClick={onHome}>
            <Film className="h-7 w-7 text-teal-500" />
            <div className="min-w-0">
              <p className="truncate font-display text-xl leading-none sm:text-2xl">Animeboxd</p>
              <p className="text-[11px] text-slate-500 sm:text-xs">Personal diary</p>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <button className={clsx("rounded-full px-2 py-1 text-sm font-semibold shadow-sm", activePage === "profile" ? "bg-teal-50 text-teal-900 dark:bg-teal-400 dark:text-slate-950" : "bg-white/80 dark:bg-slate-900/70")} onClick={onProfile} type="button" aria-label="Open profile">{user.avatar}</button>
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/70 bg-white/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200" onClick={onLogout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="scrollbar-soft -mx-1 flex w-[calc(100%+0.5rem)] max-w-[calc(100%+0.5rem)] touch-pan-x items-center gap-1 overflow-x-auto overscroll-x-contain px-1 pb-1 sm:gap-1.5 lg:mx-0 lg:w-auto lg:max-w-none lg:overflow-visible lg:px-0 lg:pb-0">
          {(() => { const nb = (active: boolean) => clsx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border px-2 py-1.5 text-xs font-semibold transition sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-sm", active ? "border-teal-400 bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100" : "border-slate-200/70 bg-white/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200"); return (<>
          <button className={nb(activePage === "home")} onClick={onHome}>Home</button>
          <button className={nb(activePage === "explore")} onClick={onExplore}><Search className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Explore</button>
          <button className={nb(activePage === "stuff")} onClick={onMyStuff}><Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">My Anime</span><span className="sm:hidden">Anime</span></button>
          <button className={nb(activePage === "manga")} onClick={onMyManga}><BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span className="hidden sm:inline">My Manga</span><span className="sm:hidden">Manga</span></button>
          <button className={nb(activePage === "dashboard")} onClick={onDashboard}><span className="hidden sm:inline">Dashboard</span><span className="sm:hidden">Dash</span></button>
          {isAdmin && <button className={nb(activePage === "admin")} onClick={onAdmin}>Admin</button>}
          <button className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white/80 p-1.5 text-slate-600 transition hover:border-teal-400 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 sm:gap-1.5 sm:px-2.5 sm:py-2" onClick={onReportIssue} title="Report issue" type="button">
            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" /><span className="hidden sm:inline text-xs sm:text-sm font-semibold">Report</span>
          </button>
          </>); })()}
          {(() => { const themeOrder: ThemeMode[] = ["Dark", "Light", "System"]; const nextTheme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length]; const ThemeIcon = theme === "Dark" ? Moon : theme === "Light" ? Sun : Monitor; return (<button className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200/70 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-teal-400 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-sm" onClick={() => onThemeChange(nextTheme)} title={`Switch to ${nextTheme} mode`} type="button" aria-label={`Switch to ${nextTheme} mode`}><ThemeIcon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" /><span className="hidden sm:inline">{theme}</span></button>); })()}
          <button className={clsx("inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-2.5 py-1.5 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 sm:px-3", activePage === "profile" ? "border-teal-400 bg-teal-50 text-teal-900 dark:bg-teal-400 dark:text-slate-950" : "border-slate-200/70 bg-white/90 text-slate-700 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-200")} onClick={onProfile} type="button">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-teal-100 text-base dark:bg-slate-950/60">{user.avatar}</span>
            <span className="grid min-w-0 text-left leading-tight">
              <span className="max-w-24 truncate text-xs font-black sm:max-w-32">{user.name}</span>
              <span className="hidden text-[10px] font-semibold text-slate-500 dark:text-slate-400 sm:block">Profile</span>
            </span>
          </button>
          <button className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white/80 text-slate-700 transition hover:-translate-y-0.5 hover:border-teal-400 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 lg:inline-flex" onClick={onLogout} aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}

function PublicHeader({ theme, activePage, onThemeChange, onHome, onExplore, onMyStuff, onMyManga, onReportIssue, onAuth, onRequireSignIn }: { theme: ThemeMode; activePage: AppPage; onThemeChange: (value: ThemeMode) => void; onHome: () => void; onExplore: () => void; onMyStuff: () => void; onMyManga: () => void; onReportIssue: () => void; onAuth: () => void; onRequireSignIn: (msg: string) => void }) {
  const navBtn = (active: boolean) => clsx("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border px-2 py-1.5 text-xs font-semibold transition sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-sm", active ? "border-teal-400 bg-teal-50 text-teal-900 dark:bg-teal-950/50 dark:text-teal-100" : "border-slate-200/70 bg-white/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200");
  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
      <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-3 py-2 sm:gap-2 sm:px-4 sm:py-2.5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-3">
          <button className="flex min-w-0 items-center gap-2" onClick={onHome}>
            <Film className="h-6 w-6 shrink-0 text-teal-500 sm:h-7 sm:w-7" />
            <div className="min-w-0">
              <p className="truncate font-display text-lg leading-none sm:text-2xl">Animeboxd</p>
              <p className="hidden text-[11px] text-slate-500 sm:block sm:text-xs">Browse now. Save after sign in.</p>
            </div>
          </button>
          <Button className="shrink-0 px-3 text-xs sm:text-sm lg:hidden" onClick={onAuth}>Sign in</Button>
        </div>
        <div className="scrollbar-soft -mx-1 flex w-[calc(100%+0.5rem)] max-w-[calc(100%+0.5rem)] touch-pan-x items-center gap-1 overflow-x-auto overscroll-x-contain px-1 pb-1 sm:gap-1.5 lg:mx-0 lg:w-auto lg:max-w-none lg:overflow-visible lg:px-0 lg:pb-0">
          <button className={navBtn(activePage === "home")} onClick={onHome}>Home</button>
          <button className={navBtn(activePage === "explore")} onClick={onExplore}>
            <Search className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Explore
          </button>
          <button className={navBtn(activePage === "stuff")} onClick={onMyStuff} type="button">
            <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline sm:inline">My Anime</span>
            <span className="xs:hidden sm:hidden">Anime</span>
          </button>
          <button className={navBtn(activePage === "manga")} onClick={onMyManga} type="button">
            <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden xs:inline sm:inline">My Manga</span>
            <span className="xs:hidden sm:hidden">Manga</span>
          </button>
          <button
            className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-slate-200/70 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-teal-400 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-400 sm:inline-flex sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-sm"
            onClick={() => onRequireSignIn("Sign in or create a free account to view your personal dashboard.")}
            type="button"
          >
            Dashboard
          </button>
          <button
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white/80 p-1.5 text-slate-600 transition hover:border-teal-400 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 sm:gap-1.5 sm:px-2.5 sm:py-2"
            onClick={onReportIssue}
            title="Report issue"
            type="button"
          >
            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline text-xs sm:text-sm font-semibold">Report</span>
          </button>
          {(() => { const themeOrder: ThemeMode[] = ["Dark", "Light", "System"]; const nextTheme = themeOrder[(themeOrder.indexOf(theme) + 1) % themeOrder.length]; const ThemeIcon = theme === "Dark" ? Moon : theme === "Light" ? Sun : Monitor; return (<button className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200/70 bg-white/80 px-2 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-teal-400 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300 sm:gap-1.5 sm:px-2.5 sm:py-2 sm:text-sm" onClick={() => onThemeChange(nextTheme)} title={`Switch to ${nextTheme} mode`} type="button" aria-label={`Switch to ${nextTheme} mode`}><ThemeIcon className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" /><span className="hidden sm:inline">{theme}</span></button>); })()}
          <Button className="hidden shrink-0 px-3 text-sm lg:inline-flex" onClick={onAuth}>Sign in</Button>
        </div>
      </div>
    </header>
  );
}

function getReportCooldownRemaining() {
  const last = Number(localStorage.getItem(REPORT_RATE_KEY) || 0);
  const remaining = REPORT_COOLDOWN_MS - (Date.now() - last);
  return remaining > 0 ? remaining : 0;
}

function ReportIssueModal({ onClose, userId }: { onClose: () => void; userId?: string }) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  const submitReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (String(formData.get("website") || "").trim()) return;
    const cooldown = getReportCooldownRemaining();
    if (cooldown > 0) {
      const mins = Math.ceil(cooldown / 60000);
      setStatus("error");
      setError(`You already sent a report recently. Please wait ${mins} minute${mins === 1 ? "" : "s"} before sending another.`);
      return;
    }
    setStatus("sending");
    setError("");

    try {
      if (isSupabaseConfigured) {
        try {
          await createReport({
            userId,
            name: String(formData.get("name") || ""),
            email: String(formData.get("email") || ""),
            category: String(formData.get("category") || "Suggestion"),
            priority: String(formData.get("priority") || "Normal"),
            message: String(formData.get("message") || "")
          });
        } catch {
          // Email delivery still runs if the report table needs a schema update.
        }
      }

      const response = await fetch("https://formsubmit.co/ajax/vmb4manager@gmail.com", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          _subject: `AnimeBoxD ${formData.get("category") || "feedback"} - ${formData.get("priority") || "Normal"}`,
          _replyto: formData.get("email"),
          app: "AnimeBoxD",
          owner: "vbuilder",
          name: formData.get("name"),
          email: formData.get("email"),
          category: formData.get("category"),
          priority: formData.get("priority"),
          message: formData.get("message")
        })
      });

      if (!response.ok && !isSupabaseConfigured) throw new Error("The report could not be sent right now.");
      localStorage.setItem(REPORT_RATE_KEY, String(Date.now()));
      setStatus("sent");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "The report could not be sent right now.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/60 px-3 py-4 backdrop-blur-sm sm:px-4">
      <div className="scrollbar-soft max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl border border-white/60 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Report</p>
            <h2 className="font-display text-2xl leading-tight sm:text-3xl">Send feedback</h2>
            <p className="mt-1 text-sm text-slate-500">Send bugs, ideas, or anything that feels off.</p>
          </div>
          <button className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 text-slate-600 transition hover:border-teal-400 hover:text-teal-600 dark:border-slate-800 dark:text-slate-300" onClick={onClose} type="button" aria-label="Close report form">
            <X className="h-5 w-5" />
          </button>
        </div>

        {status === "sent" ? (
          <div className="mt-5 grid gap-3 rounded-2xl bg-teal-50 p-4 text-sm text-teal-800 dark:bg-teal-950/40 dark:text-teal-100">
            <p className="font-semibold">Thanks. vbuilder got your message.</p>
          </div>
        ) : (
          <form className="mt-5 grid gap-3" onSubmit={submitReport}>
            <input className="hidden" name="website" tabIndex={-1} autoComplete="off" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input className={inputClass()} name="name" placeholder="Your name" autoComplete="name" />
              </Field>
              <Field label="Email">
                <input className={inputClass()} name="email" type="email" placeholder="you@example.com" autoComplete="email" />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type">
                <select className={inputClass()} name="category" defaultValue="Suggestion">
                  <option>Bug</option>
                  <option>Account help</option>
                  <option>Anime or manga data</option>
                  <option>Suggestion</option>
                  <option>Concern</option>
                </select>
              </Field>
              <Field label="Priority">
                <select className={inputClass()} name="priority" defaultValue="Normal">
                  <option>Normal</option>
                  <option>Important</option>
                  <option>Urgent</option>
                </select>
              </Field>
            </div>
            <Field label="Message">
              <textarea className={clsx(inputClass(), "min-h-36 resize-y")} name="message" minLength={10} required placeholder="Tell me what happened, what device you were on, and what you expected." />
            </Field>
            <p className="text-xs leading-5 text-slate-500">
              Reports go to vbuilder at <a className="font-semibold text-teal-600 dark:text-teal-300" href="mailto:vmb4manager@gmail.com">vmb4manager@gmail.com</a> and help shape the next fixes.
            </p>
            {status === "error" && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-100">{error}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
              <button className="button-ghost" onClick={onClose} type="button">Cancel</button>
              <Button className="bg-teal-400 text-slate-950 hover:bg-teal-300" disabled={status === "sending"} type="submit">
                <Send className="h-4 w-4" /> {status === "sending" ? "Sending..." : "Send report"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, tone = "danger", requiresText, onCancel, onConfirm }: { title: string; message: string; confirmLabel: string; tone?: "danger" | "neutral"; requiresText?: string; onCancel: () => void; onConfirm: () => void | Promise<void> }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const canConfirm = !requiresText || typed.trim() === requiresText;

  const confirm = async () => {
    if (!canConfirm) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-3 py-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-950 sm:p-5">
        <h2 className="font-display text-3xl leading-tight">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{message}</p>
        {requiresText && (
          <Field label={`Type ${requiresText} to continue`}>
            <input className={inputClass()} value={typed} onChange={(event) => setTyped(event.target.value)} autoFocus />
          </Field>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className="button-ghost" onClick={onCancel} disabled={busy} type="button">Cancel</button>
          <Button className={tone === "danger" ? "bg-rose-600 hover:bg-rose-700" : ""} onClick={confirm} disabled={!canConfirm || busy}>
            {busy ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ShareSiteButton() {
  const [copied, setCopied] = useState(false);

  const share = async () => {
    const payload = {
      title: "AnimeBoxD",
      text: "Track anime and manga, keep ratings and notes, and follow live anime updates.",
      url: SITE_URL
    };
    try {
      if (navigator.share) {
        await navigator.share(payload);
      } else {
        await navigator.clipboard.writeText(SITE_URL);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      try {
        await navigator.clipboard.writeText(SITE_URL);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      } catch {
        setCopied(false);
      }
    }
  };

  return (
    <button
      className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-teal-200/80 bg-teal-50 px-2.5 py-2 text-sm font-semibold text-teal-800 transition hover:-translate-y-0.5 hover:border-teal-400 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-100 sm:gap-2 sm:px-3"
      onClick={share}
      type="button"
    >
      <Share2 className="h-4 w-4" /> <span>{copied ? "Copied" : "Share"}</span>
    </button>
  );
}

function GuestSaveModal({ onSignUp, onClose }: { onSignUp: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="text-center">
          <p className="text-4xl">🎌</p>
          <h2 className="mt-3 font-display text-3xl leading-tight">Save your library</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            You're one step away! Create a free account to save this to your anime diary, track your progress, and build your personal library.
          </p>
        </div>
        <div className="mt-5 grid gap-2">
          <Button
            className="w-full justify-center bg-teal-500 text-white hover:bg-teal-400"
            onClick={onSignUp}
          >
            <Sparkles className="h-4 w-4" /> Create a free account
          </Button>
          <button
            className="w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-900"
            onClick={onClose}
            type="button"
          >
            Keep browsing for now
          </button>
        </div>
        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
          Free · No credit card needed · Your data stays private
        </p>
      </div>
    </div>
  );
}

function SiteFooter() {
  const links = [
    { label: "About", href: "/about.html" },
    { label: "Contact", href: "/contact.html" },
    { label: "Privacy", href: "/privacy.html" },
    { label: "Terms", href: "/terms.html" }
  ];
  return (
    <footer className="w-full border-t border-slate-200/70 pt-5 pb-4 text-center dark:border-slate-800">
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4">
        <ShareSiteButton />
        <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2">
          {links.map((link) => (
            <a key={link.href} className="text-sm font-semibold text-slate-600 transition hover:text-teal-600 dark:text-slate-300 dark:hover:text-teal-300" href={link.href}>
              {link.label}
            </a>
          ))}
        </nav>
      </div>
      <p className="mx-auto mt-3 max-w-xl px-4 text-[11px] leading-5 text-slate-400 dark:text-slate-500 sm:text-xs">{CREDIT_TEXT}</p>
      <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">© {new Date().getFullYear()} AnimeBoxD · Fan project</p>
    </footer>
  );
}

function SearchPanel({ onSelect }: { onSelect: (anime: AnimeSummary) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setError("");
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchAnime(query)
        .then(setResults)
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Card>
      <div className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-2">
        <Search className="h-5 w-5 text-slate-400" />
        <input className={clsx(inputClass(), "border-0 bg-transparent px-0 focus:border-0")} placeholder="Search anime" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {loading && <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />)}</div>}
      {error && <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      {!loading && !error && query.trim().length >= 2 && !results.length && (
        <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No safe anime results found. Try another title.</p>
      )}
      {!!results.length && (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {results.map((anime) => (
            <div key={anime.mal_id} className="touch-card rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
              <img src={anime.image_url} alt="" className="aspect-[2/3] w-full rounded-lg object-cover" />
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{anime.title}</p>
              <Button className="mt-3 w-full bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={() => onSelect(anime)}><Plus className="h-4 w-4" /> Add to diary</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function SearchMangaPanel({ onSelect }: { onSelect: (manga: MangaSummary) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MangaSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setError("");
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchManga(query)
        .then(setResults)
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <Card>
      <div className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-2">
        <Search className="h-5 w-5 text-slate-400" />
        <input className={clsx(inputClass(), "border-0 bg-transparent px-0 focus:border-0")} placeholder="Search manga" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {loading && <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />)}</div>}
      {error && <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      {!loading && !error && query.trim().length >= 2 && !results.length && (
        <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No safe manga results found. Try another title.</p>
      )}
      {!!results.length && (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {results.map((manga) => (
            <div key={manga.mal_id} className="touch-card rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
              <img src={manga.image_url} alt="" className="aspect-[2/3] w-full rounded-lg object-cover" />
              <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{manga.title}</p>
              <Button className="mt-3 w-full bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={() => onSelect(manga)}><Plus className="h-4 w-4" /> Add to manga</Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function CuratedGrid({ items, onAdd }: { items: AnimeSummary[]; onAdd: (anime: AnimeSummary) => void }) {
  const safeItems = Array.isArray(items) ? items : [];
  return (
    <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-3">
      {safeItems.map((anime) => (
        <div key={anime.mal_id} className="touch-card rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
          <img src={anime.image_url} alt="" className="aspect-[2/3] w-full rounded-xl object-cover" />
          <p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{anime.title}</p>
          <p className="mt-1 text-xs text-slate-500">{anime.year || "Unknown"} • {anime.genres.slice(0, 2).join(", ")}</p>
          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600 dark:text-slate-300">{anime.synopsis}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {(anime.platforms || []).map((platform) => <span key={platform} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">{platform}</span>)}
          </div>
          <Button className="mt-3 w-full bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={() => onAdd(anime)}>
            <Plus className="h-4 w-4" /> Add to diary
          </Button>
        </div>
      ))}
    </div>
  );
}

function allKnownAnime(library: LibraryEntry[], extra: AnimeSummary[] = []) {
  const byId = new Map<number, AnimeSummary>();
  fixedAnime.forEach((anime) => byId.set(anime.mal_id, anime));
  extra.forEach((anime) => byId.set(anime.mal_id, anime));
  library.forEach((anime) => byId.set(anime.mal_id, anime));
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function allKnownManga(library: MangaEntry[], extra: MangaSummary[] = []) {
  const byId = new Map<number, MangaSummary>();
  extra.forEach((manga) => byId.set(manga.mal_id, manga));
  library.forEach((manga) => byId.set(manga.mal_id, manga));
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function isLibraryEntry(anime: AnimeSummary): anime is LibraryEntry {
  return "status" in anime && "rating" in anime && "episodes_watched" in anime;
}

function isMangaEntry(manga: MangaSummary): manga is MangaEntry {
  return "status" in manga && "rating" in manga && "chapters_read" in manga;
}

function applyAnimeStatus(entry: LibraryEntry, status: LibraryStatus): LibraryEntry {
  if (status === "Completed" && entry.total_episodes > 0) {
    return { ...entry, status, episodes_watched: entry.total_episodes };
  }
  return { ...entry, status };
}

function applyMangaStatus(entry: MangaEntry, status: MangaStatus): MangaEntry {
  if (status === "Completed") {
    return {
      ...entry,
      status,
      chapters_read: entry.total_chapters > 0 ? entry.total_chapters : entry.chapters_read,
      volumes_read: entry.total_volumes > 0 ? entry.total_volumes : entry.volumes_read
    };
  }
  return { ...entry, status };
}

function AddEntryPage({ anime, onSave, onCancel }: { anime: AnimeSummary; onSave: (entry: LibraryEntry) => void; onCancel: () => void }) {
  const [status, setStatus] = useState<LibraryStatus>("Plan to Watch");
  const [rating, setRating] = useState(0);
  const [episodesWatchedInput, setEpisodesWatchedInput] = useState("");
  const [review, setReview] = useState("");
  const [notes, setNotes] = useState("");
  const [dropReason, setDropReason] = useState("");
  const changeStatus = (nextStatus: LibraryStatus) => {
    setStatus(nextStatus);
    if (nextStatus === "Completed" && anime.total_episodes > 0) {
      setEpisodesWatchedInput(String(anime.total_episodes));
    }
  };

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-3 py-4 sm:px-4 sm:py-6">
      <Card className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Add to diary</p>
            <h2 className="break-words font-display text-3xl leading-tight sm:text-4xl">{anime.title}</h2>
          </div>
          <button className="button-ghost self-start sm:self-auto" onClick={onCancel}>Back</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr] md:grid-cols-[170px_1fr]">
          <img src={anime.image_url} alt="" className="mx-auto aspect-[2/3] w-40 rounded-xl object-cover sm:w-full" />
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Status">
                <select className={inputClass()} value={status} onChange={(event) => changeStatus(event.target.value as LibraryStatus)}>
                  {statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
                </select>
              </Field>
              <Field label="Episodes watched">
                <input
                  className={inputClass()}
                  type="number"
                  min={0}
                  placeholder="0"
                  value={episodesWatchedInput}
                  onChange={(event) => setEpisodesWatchedInput(event.target.value)}
                />
              </Field>
            </div>
            <FieldGroup label="Rating">
              <StarRating value={rating} onChange={setRating} />
            </FieldGroup>
            <Field label="Review">
              <textarea className={clsx(inputClass(), "min-h-24")} value={review} onChange={(event) => setReview(event.target.value)} />
            </Field>
            <Field label="Notes">
              <textarea className={clsx(inputClass(), "min-h-20")} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            {status === "Dropped" && (
              <Field label="Why did you drop it?">
                <textarea className={clsx(inputClass(), "min-h-20")} placeholder="Too slow, not my style, bad pacing..." value={dropReason} onChange={(event) => setDropReason(event.target.value)} />
              </Field>
            )}
            <div className="flex items-center gap-2">
              <Button className="bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={() => {
                const entry = mergeAnimeToEntry(anime);
                const episodesWatched = status === "Completed" && anime.total_episodes > 0 ? anime.total_episodes : episodesWatchedInput.trim() ? Number(episodesWatchedInput) : 0;
                onSave(applyAnimeStatus({ ...entry, status, rating, episodes_watched: episodesWatched, review, notes, drop_reason: dropReason }, status));
              }}>Save</Button>
              <button className="button-ghost" onClick={onCancel}>Cancel</button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function AddMangaPage({ manga, onSave, onCancel }: { manga: MangaSummary; onSave: (entry: MangaEntry) => void; onCancel: () => void }) {
  const [status, setStatus] = useState<MangaStatus>("Plan to Read");
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState("");
  const [notes, setNotes] = useState("");
  const [dropReason, setDropReason] = useState("");
  const changeStatus = (nextStatus: MangaStatus) => setStatus(nextStatus);

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-3 py-4 sm:px-4 sm:py-6">
      <Card className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Add to manga shelf</p>
            <h2 className="break-words font-display text-3xl leading-tight sm:text-4xl">{manga.title}</h2>
          </div>
          <button className="button-ghost self-start sm:self-auto" onClick={onCancel}>Back</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr] md:grid-cols-[170px_1fr]">
          <img src={manga.image_url} alt="" className="mx-auto aspect-[2/3] w-40 rounded-xl object-cover sm:w-full" />
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Status">
                <select className={inputClass()} value={status} onChange={(event) => changeStatus(event.target.value as MangaStatus)}>
                  {mangaStatuses.map((item) => <option key={item} value={item}>{mangaStatusLabels[item]}</option>)}
                </select>
              </Field>
            </div>
            <FieldGroup label="Rating">
              <StarRating value={rating} onChange={setRating} />
            </FieldGroup>
            <Field label="Review">
              <textarea className={clsx(inputClass(), "min-h-24")} value={review} onChange={(event) => setReview(event.target.value)} />
            </Field>
            <Field label="Notes">
              <textarea className={clsx(inputClass(), "min-h-20")} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            {status === "Dropped" && (
              <Field label="Why did you drop it?">
                <textarea className={clsx(inputClass(), "min-h-20")} placeholder="Lost interest, pacing, story direction..." value={dropReason} onChange={(event) => setDropReason(event.target.value)} />
              </Field>
            )}
            <div className="flex items-center gap-2">
              <Button className="bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={() => {
                const entry = mergeMangaToEntry(manga);
                onSave(applyMangaStatus({ ...entry, status, rating, review, notes, drop_reason: dropReason }, status));
              }}>Save</Button>
              <button className="button-ghost" onClick={onCancel}>Cancel</button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function LibraryCard({ entry, onUpdate, onRemove }: { entry: LibraryEntry; onUpdate: (entry: LibraryEntry) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(entry);
  useEffect(() => setDraft({ ...entry, review: entry.review || "" }), [entry]);
  const [expanded, setExpanded] = useState(false);
  const totalEpisodes = draft.total_episodes || Math.max(draft.episodes_watched, 1);
  const progress = Math.min(100, Math.round((draft.episodes_watched / totalEpisodes) * 100));
  return (
    <div className="touch-card grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70 sm:p-4">
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
        <img src={entry.image_url} alt="" className="h-24 w-16 rounded-lg object-cover" />
        <div className="grid gap-1">
          <p className="font-semibold text-slate-900 dark:text-white">{entry.title}</p>
          <p className="text-xs text-slate-500">{statusLabels[draft.status]} • {draft.rating || "-"}/10</p>
          <p className="text-xs text-slate-500">{draft.episodes_watched}/{totalEpisodes} episodes</p>
        </div>
        <button className="col-span-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 sm:col-span-1" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Collapse" : "Edit"}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      <div>
        <div className="mb-1 flex justify-between text-xs text-slate-500"><span>Progress</span><span>{progress}%</span></div>
        <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-2 rounded-full bg-teal-500" style={{ width: `${progress}%` }} />
        </div>
      </div>
      {draft.status === "Dropped" && draft.drop_reason && (
        <p className="rounded-xl bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">Dropped: {draft.drop_reason}</p>
      )}
      {expanded && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Status">
              <select className={inputClass()} value={draft.status} onChange={(event) => setDraft(applyAnimeStatus(draft, event.target.value as LibraryStatus))}>
                {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </Field>
            <Field label="Episodes watched">
              <input className={inputClass()} type="number" min={0} max={draft.total_episodes || undefined} value={draft.episodes_watched} onChange={(event) => setDraft({ ...draft, episodes_watched: Number(event.target.value) })} />
            </Field>
          </div>
          <FieldGroup label="Rating">
            <StarRating value={draft.rating} onChange={(rating) => setDraft({ ...draft, rating })} />
          </FieldGroup>
          <Field label="Review">
            <textarea className={clsx(inputClass(), "min-h-24")} value={draft.review} onChange={(event) => setDraft({ ...draft, review: event.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className={clsx(inputClass(), "min-h-20")} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </Field>
          {draft.status === "Dropped" && (
            <Field label="Why did you drop it?">
              <textarea className={clsx(inputClass(), "min-h-20")} value={draft.drop_reason || ""} onChange={(event) => setDraft({ ...draft, drop_reason: event.target.value })} />
            </Field>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span>Added {new Date(entry.added_at).toLocaleDateString()}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={() => { onUpdate(applyAnimeStatus({ ...draft }, draft.status)); setExpanded(false); }}>Save</Button>
              <button className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600" onClick={onRemove}><Trash2 className="h-4 w-4" /> Remove</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function MangaCard({ entry, onUpdate, onRemove }: { entry: MangaEntry; onUpdate: (entry: MangaEntry) => void; onRemove: () => void }) {
  const [draft, setDraft] = useState(entry);
  useEffect(() => setDraft({ ...entry, review: entry.review || "" }), [entry]);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="touch-card grid gap-3 rounded-2xl border border-teal-200/70 bg-white/80 p-3 shadow-sm dark:border-teal-900/50 dark:bg-slate-950/70 sm:p-4">
      <div className="grid grid-cols-[64px_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[72px_minmax(0,1fr)_auto]">
        <img src={entry.image_url} alt="" className="h-24 w-16 rounded-lg object-cover" />
        <div className="grid gap-1">
          <p className="font-semibold text-slate-900 dark:text-white">{entry.title}</p>
          <p className="text-xs text-slate-500">{mangaStatusLabels[draft.status]} • {draft.rating || "-"}/10</p>
          <p className="line-clamp-1 text-xs text-slate-500">{draft.genres.slice(0, 3).join(", ") || "Manga entry"}</p>
        </div>
        <button className="col-span-2 inline-flex items-center gap-1 text-xs font-semibold text-teal-600 sm:col-span-1" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Collapse" : "Edit"}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      {draft.status === "Dropped" && draft.drop_reason && (
        <p className="rounded-xl bg-rose-50 p-2 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">Dropped: {draft.drop_reason}</p>
      )}
      {expanded && (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Status">
              <select className={inputClass()} value={draft.status} onChange={(event) => setDraft(applyMangaStatus(draft, event.target.value as MangaStatus))}>
                {mangaStatuses.map((status) => <option key={status} value={status}>{mangaStatusLabels[status]}</option>)}
              </select>
            </Field>
          </div>
          <FieldGroup label="Rating">
            <StarRating value={draft.rating} onChange={(rating) => setDraft({ ...draft, rating })} />
          </FieldGroup>
          <Field label="Review">
            <textarea className={clsx(inputClass(), "min-h-24")} value={draft.review} onChange={(event) => setDraft({ ...draft, review: event.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className={clsx(inputClass(), "min-h-20")} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </Field>
          {draft.status === "Dropped" && (
            <Field label="Why did you drop it?">
              <textarea className={clsx(inputClass(), "min-h-20")} value={draft.drop_reason || ""} onChange={(event) => setDraft({ ...draft, drop_reason: event.target.value })} />
            </Field>
          )}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span>Added {new Date(entry.added_at).toLocaleDateString()}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={() => { onUpdate(applyMangaStatus({ ...draft }, draft.status)); setExpanded(false); }}>Save</Button>
              <button className="inline-flex items-center gap-2 text-xs font-semibold text-rose-600" onClick={onRemove}><Trash2 className="h-4 w-4" /> Remove</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactElement; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200">
        {icon}
        <h2 className="font-display text-2xl">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function AnimeRail({ title, kicker, items, onAdd }: { title: string; kicker: string; items: AnimeSummary[]; onAdd: (anime: AnimeSummary) => void }) {
  return (
    <section className="grid gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-teal-500">{kicker}</p>
          <h2 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h2>
        </div>
      </div>
      {items.length ? (
        <div className="scrollbar-soft -mx-3 flex gap-3 overflow-x-auto px-3 pb-2 sm:mx-0 sm:px-0">
          {items.slice(0, 10).map((anime) => (
            <article key={anime.mal_id} className="touch-card grid w-[230px] shrink-0 grid-cols-[72px_minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200/70 bg-white/75 p-2.5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 dark:border-slate-800 dark:bg-slate-950/70">
              <img src={anime.image_url} alt="" className="h-28 w-[72px] rounded-xl object-cover" />
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-bold text-slate-900 dark:text-white">{anime.title}</p>
                <p className="mt-1 text-xs text-slate-500">{anime.year || "TBA"} • {anime.score ? `${anime.score}/10` : "No score"}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{anime.genres.slice(0, 2).join(", ") || "Anime"}</p>
                <button className="mt-2 inline-flex items-center gap-1 rounded-full bg-teal-400 px-2.5 py-1 text-[11px] font-black text-slate-950 transition hover:bg-teal-300" onClick={() => onAdd(anime)}>
                  <Plus className="h-3 w-3" /> Save
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Card className="py-4">
          <p className="text-sm text-slate-500">Updates are still loading.</p>
        </Card>
      )}
    </section>
  );
}

function formatCompactNumber(value?: number) {
  if (!value) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function formatBroadcastShort(value?: string) {
  if (!value) return "Today";
  const dayMap: Record<string, string> = {
    Sundays: "Sun",
    Mondays: "Mon",
    Tuesdays: "Tue",
    Wednesdays: "Wed",
    Thursdays: "Thu",
    Fridays: "Fri",
    Saturdays: "Sat",
    Sunday: "Sun",
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat"
  };
  const dayMatch = value.match(/\b(Sundays?|Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?|Saturdays?)\b/);
  const timeMatch = value.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const day = dayMatch ? dayMap[dayMatch[0]] : "";
  const time = timeMatch ? timeMatch[0] : "";
  return [day, time].filter(Boolean).join(" ") || "Today";
}

function shuffleLiveItems(items: AnimeSummary[]) {
  return [...items].sort(() => Math.random() - 0.5);
}

function SeasonTracker({ trending, seasonal, upcoming, airingToday, updatedAt, loading, error, onRefresh, onAdd }: { trending: AnimeSummary[]; seasonal: AnimeSummary[]; upcoming: AnimeSummary[]; airingToday: AnimeSummary[]; updatedAt: string; loading: boolean; error: string; onRefresh: () => void; onAdd: (anime: AnimeSummary) => void }) {
  const [todayIndex, setTodayIndex] = useState(0);
  const [scoreIndex, setScoreIndex] = useState(0);
  const seasonPool = [...seasonal, ...trending];
  const uniquePool = [...new Map(seasonPool.map((anime) => [anime.mal_id, anime])).values()];
  const highestScoredPool = uniquePool.filter((anime) => anime.score).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 5);
  const highestScored = highestScoredPool[scoreIndex] || highestScoredPool[0] || trending[0] || seasonal[0];
  const mostFavorited = uniquePool.filter((anime) => anime.favorites).sort((a, b) => (b.favorites || 0) - (a.favorites || 0))[0] || trending[0] || seasonal[0];
  const todayHighlights = [...new Map(airingToday.map((anime) => [anime.mal_id, anime])).values()]
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (b.favorites || 0) - (a.favorites || 0))
    .slice(0, 5);
  const newEpisodeToday = todayHighlights[todayIndex] || todayHighlights[0];
  const comingSoon = upcoming[0];

  useEffect(() => {
    if (todayHighlights.length < 2) return;
    const timer = window.setInterval(() => {
      setTodayIndex((current) => (current + 1) % todayHighlights.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [todayHighlights.length]);

  useEffect(() => {
    if (highestScoredPool.length < 2) return;
    const timer = window.setInterval(() => {
      setScoreIndex((current) => (current + 1) % highestScoredPool.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [highestScoredPool.length]);

  useEffect(() => {
    if (todayIndex >= todayHighlights.length) setTodayIndex(0);
  }, [todayHighlights.length, todayIndex]);

  useEffect(() => {
    if (scoreIndex >= highestScoredPool.length) setScoreIndex(0);
  }, [highestScoredPool.length, scoreIndex]);

  const trackerItems = [
    highestScored && { label: highestScoredPool.length > 1 ? `Highest Scored ${scoreIndex + 1}/${highestScoredPool.length}` : "Highest Scored", anime: highestScored, stat: highestScored.score ? `${highestScored.score}/10` : "Rising", icon: <Star className="h-4 w-4" />, accent: "from-teal-400/25 to-cyan-300/10" },
    mostFavorited && { label: "Most Favorited", anime: mostFavorited, stat: formatCompactNumber(mostFavorited.favorites), icon: <Heart className="h-4 w-4" />, accent: "from-pink-300/30 to-teal-300/10" },
    newEpisodeToday && { label: todayHighlights.length > 1 ? `New Today ${todayIndex + 1}/${todayHighlights.length}` : "New Today", anime: newEpisodeToday, stat: formatBroadcastShort(newEpisodeToday.broadcast), icon: <Trophy className="h-4 w-4" />, accent: "from-amber-300/30 to-teal-300/10" },
    comingSoon && { label: "Coming Soon", anime: comingSoon, stat: comingSoon.year ? String(comingSoon.year) : "Soon", icon: <PlayCircle className="h-4 w-4" />, accent: "from-violet-300/30 to-cyan-300/10" }
  ].filter(Boolean) as { label: string; anime: AnimeSummary; stat: string; icon: React.ReactElement; accent: string }[];

  return (
    <Card className="grid gap-4 overflow-hidden border border-teal-200/60 bg-white/80 dark:border-teal-900/50 dark:bg-slate-950/70">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Live Season Tracker</p>
          <h2 className="font-display text-3xl leading-tight sm:text-4xl">A compact pulse check for the season.</h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">What is scoring well, airing today, and coming up next.</p>
        </div>
        <Button className="self-start bg-slate-900 text-white hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300 sm:self-auto" onClick={onRefresh} disabled={loading}>
          <RefreshCcw className="h-4 w-4" /> {loading ? "Updating" : "Refresh"}
        </Button>
      </div>

      <div className="grid gap-3 min-[460px]:grid-cols-2 xl:grid-cols-4">
        {trackerItems.map(({ label, anime, stat, icon, accent }) => (
          <button key={`${label}-${anime.mal_id}`} className={clsx("group touch-card relative min-h-[140px] overflow-hidden rounded-2xl border border-slate-200/70 bg-white/75 p-2.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 dark:border-slate-800 dark:bg-slate-900/70", `bg-gradient-to-br ${accent}`)} onClick={() => onAdd(anime)}>
            <div className="absolute right-2 top-2 h-20 w-20 rounded-full bg-white/40 blur-2xl dark:bg-teal-400/10" />
            <div className="relative grid grid-cols-[56px_minmax(0,1fr)] gap-2.5">
              <img src={anime.image_url} alt="" className="h-20 w-14 rounded-xl object-cover shadow-md" />
              <div className="min-w-0">
                <div className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-white/75 px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
                  {icon} {label}
                </div>
                <p className="mt-1.5 line-clamp-2 text-sm font-black text-slate-950 dark:text-white">{anime.title}</p>
                <p className="mt-0.5 truncate text-base font-black text-teal-700 dark:text-teal-300" title={stat}>{stat}</p>
                <p className="line-clamp-1 text-xs text-slate-500">{anime.genres.slice(0, 2).join(", ") || "Anime"}</p>
              </div>
            </div>
            <span className="relative mt-2 inline-flex items-center gap-1 rounded-full bg-slate-950 px-2.5 py-1 text-[11px] font-bold text-white transition group-hover:bg-teal-500 group-hover:text-slate-950 dark:bg-teal-400 dark:text-slate-950">
              <Plus className="h-3 w-3" /> Save
            </span>
          </button>
        ))}
      </div>
      {!loading && !trackerItems.length && (
        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">Live updates are quiet right now. Try refresh in a moment.</p>
      )}

      {updatedAt && <p className="text-xs font-semibold text-slate-500">Updated {updatedAt}</p>}
      {error && <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-100">{error}</p>}
    </Card>
  );
}

function HomePage({ addAnime }: { addAnime: (anime: AnimeSummary) => void }) {
  const [trending, setTrending] = useState<AnimeSummary[]>([]);
  const [seasonal, setSeasonal] = useState<AnimeSummary[]>([]);
  const [upcoming, setUpcoming] = useState<AnimeSummary[]>([]);
  const [airingToday, setAiringToday] = useState<AnimeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const loadHomeUpdates = async (force = false) => {
    setLoading(true);
    setError("");
    try {
      const [trendingAnime, seasonalAnime, upcomingAnime, todayAnime] = await Promise.all([
        getTopAiring(force),
        getSeasonal(force),
        getUpcomingAnime(force),
        getAiringToday(force)
      ]);
      setTrending(shuffleLiveItems(trendingAnime));
      setSeasonal(shuffleLiveItems(seasonalAnime));
      setUpcoming(shuffleLiveItems(upcomingAnime));
      setAiringToday(shuffleLiveItems(todayAnime));
      setUpdatedAt(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Updates are slow right now. Try again in a bit.");
      setTrending(fixedAnime.slice(0, 6));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHomeUpdates();
    const timer = window.setInterval(() => loadHomeUpdates(true), 15 * 60 * 1000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") loadHomeUpdates();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <Card className="hero-banner grid min-h-[140px] content-start justify-items-end gap-1 pt-4 text-right text-white sm:min-h-[190px] sm:pt-6">
        <img className="hero-media" src="/homepageheader.jpg" alt="Animeboxd hero collage" />
        <h1 className="hero-title font-display text-5xl leading-none sm:text-6xl">Animeboxd</h1>
        <div className="hero-tagline max-w-md text-base italic text-white/90 sm:text-lg">
          <ul className="m-0 list-none space-y-2 p-0 text-right">
            <li>🍥 anime</li>
            <li>🍥 manga</li>
          </ul>
        </div>
      </Card>

      <SeasonTracker trending={trending} seasonal={seasonal} upcoming={upcoming} airingToday={airingToday} updatedAt={updatedAt} loading={loading} error={error} onRefresh={() => loadHomeUpdates(true)} onAdd={addAnime} />

      {loading && !trending.length ? (
        <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-80 animate-pulse rounded-2xl bg-white/70 dark:bg-slate-900/70" />
          ))}
        </div>
      ) : (
        <>
          <AnimeRail title="Currently Airing" kicker="Now on screen" items={seasonal} onAdd={addAnime} />
          <AnimeRail title="Popular Airing" kicker="Audience pulse" items={trending} onAdd={addAnime} />
          <AnimeRail title="Coming Soon" kicker="Next issue" items={upcoming} onAdd={addAnime} />
        </>
      )}
    </div>
  );
}

type ExploreMode = "anime" | "manga";
type AnimeStaff = { person: { name: string }; positions: string[] };
type AnimeCharacter = { character: { name: string }; role: string; voice_actors?: { person: { name: string }; language: string }[] };

function ExplorePage({ onAddAnime, onAddManga, onBack }: { onAddAnime: (anime: AnimeSummary) => void; onAddManga: (manga: MangaSummary) => void; onBack: () => void }) {
  const [mode, setMode] = useState<ExploreMode>("anime");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<(AnimeSummary | MangaSummary)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");
  const [animeDetail, setAnimeDetail] = useState<AnimeDetail | null>(null);
  const [mangaDetail, setMangaDetail] = useState<MangaDetail | null>(null);
  const [staff, setStaff] = useState<AnimeStaff[]>([]);
  const [cast, setCast] = useState<AnimeCharacter[]>([]);
  const [themes, setThemes] = useState<{ openings: string[]; endings: string[] }>({ openings: [], endings: [] });

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setError("");
      setLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      const request = mode === "anime" ? searchAnime(query) : searchManga(query);
      request
        .then(setResults)
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [mode, query]);

  useEffect(() => {
    setQuery("");
    setResults([]);
    setError("");
    setSelectedId(null);
    setAnimeDetail(null);
    setMangaDetail(null);
    setStaff([]);
    setCast([]);
    setThemes({ openings: [], endings: [] });
    setDetailError("");
  }, [mode]);

  useEffect(() => {
    if (!selectedId) return;
    setDetailLoading(true);
    setDetailError("");

    if (mode === "anime") {
      Promise.all([getAnime(selectedId), getAnimeStaff(selectedId), getAnimeCharacters(selectedId), getAnimeThemes(selectedId)])
        .then(([detail, staffData, castData, themeData]) => {
          setAnimeDetail(detail);
          setStaff(staffData);
          setCast(castData);
          setThemes(themeData);
        })
        .catch((err: Error) => setDetailError(err.message))
        .finally(() => setDetailLoading(false));
      return;
    }

    getManga(selectedId)
      .then((detail) => setMangaDetail(detail))
      .catch((err: Error) => setDetailError(err.message))
      .finally(() => setDetailLoading(false));
  }, [mode, selectedId]);

  const renderChipList = (items: string[]) => {
    if (!items.length) return <span className="text-slate-500">Not listed.</span>;
    return (
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span key={item} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-200">
            {item}
          </span>
        ))}
      </div>
    );
  };

  const safeResults = results.filter((item): item is AnimeSummary | MangaSummary => Boolean(item && typeof item.mal_id === "number"));
  const detail = mode === "anime" ? animeDetail : mangaDetail;

  const clearExploreInput = () => {
    setQuery("");
    setResults([]);
    setError("");
    setLoading(false);
  };

  const clearExploreAll = () => {
    clearExploreInput();
    setSelectedId(null);
    setAnimeDetail(null);
    setMangaDetail(null);
    setStaff([]);
    setCast([]);
    setThemes({ openings: [], endings: [] });
    setDetailError("");
    setDetailLoading(false);
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <Card className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-2">
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Explore</p>
            <h2 className="font-display text-3xl leading-tight sm:text-4xl">Find your next watch.</h2>
            <p className="text-sm text-slate-500">Search anime or manga, then save what catches your eye.</p>
          </div>
          <Button className="bg-rose-600 hover:bg-rose-700" onClick={onBack}>Back to home</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold", mode === "anime" ? "border-teal-400 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300")} onClick={() => setMode("anime")}>
            Anime
          </button>
          <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold", mode === "manga" ? "border-teal-400 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300")} onClick={() => setMode("manga")}>
            Manga
          </button>
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <Card className={clsx("grid gap-3", selectedId ? "hidden lg:grid" : "grid")}>
          <div className="grid gap-2">
            <div className="grid grid-cols-[20px_minmax(0,1fr)] items-center gap-2">
              <Search className="h-5 w-5 text-slate-400" />
              <input className={clsx(inputClass(), "border-0 bg-transparent px-0 focus:border-0")} placeholder={`Search ${mode} by title`} value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
              <button className="button-ghost" type="button" onClick={clearExploreInput}>Clear search</button>
              <button className="button-ghost" type="button" onClick={clearExploreAll}>Reset</button>
            </div>
          </div>
          {loading && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">Searching...</p>}
          {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
          {!loading && query.trim().length >= 2 && !safeResults.length && !error && (
            <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No safe results found. Try a different title.</p>
          )}
          {!loading && !results.length && query.trim().length < 2 && (
            <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">Type a title to start.</p>
          )}
          <div className="scrollbar-soft grid max-h-[70vh] gap-2 overflow-auto pr-1 md:max-h-[520px]">
            {safeResults.map((item) => {
              const isSelected = item.mal_id === selectedId;
              const meta = mode === "anime"
                ? `${item.year || "Unknown"} • ${(item as AnimeSummary).total_episodes || "?"} eps`
                : `${item.year || "Unknown"} • ${(item as MangaSummary).total_chapters || "?"} ch`;
              return (
                <button key={item.mal_id} className={clsx("grid grid-cols-[56px_minmax(0,1fr)] items-center gap-3 rounded-xl border p-2 text-left transition", isSelected ? "border-teal-400 bg-teal-50/70" : "border-slate-200/70 bg-white/70 dark:border-slate-800 dark:bg-slate-950/70")} onClick={() => setSelectedId(item.mal_id)}>
                  <img src={item.image_url} alt="" className="h-20 w-14 rounded-lg object-cover" />
                  <div>
                    <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
                    <p className="text-xs text-slate-500">{meta}</p>
                    <p className="line-clamp-1 text-xs text-slate-500">{item.synopsis || "No synopsis available."}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
        <Card className={clsx("scrollbar-soft grid gap-4 lg:max-h-[72vh] lg:overflow-auto", selectedId ? "grid" : "hidden lg:grid")}>
          {selectedId && (
            <button className="button-ghost" onClick={() => setSelectedId(null)}>
              Back to results
            </button>
          )}
          {!selectedId && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">Choose a title to see more.</p>}
          {detailLoading && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">Loading details...</p>}
          {detailError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{detailError}</p>}
          {detail && (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
                <img src={detail.image_url} alt="" className="w-full rounded-xl object-cover" />
                <div className="grid gap-2">
                  <div>
                    <h3 className="font-display text-3xl leading-tight">{detail.title}</h3>
                    {detail.title_english && <p className="text-sm text-slate-500">{detail.title_english}</p>}
                    {detail.title_japanese && <p className="text-sm text-slate-500">{detail.title_japanese}</p>}
                  </div>
                  <p className="line-clamp-4 text-sm leading-6 text-slate-600 dark:text-slate-300">{detail.synopsis || "No synopsis available."}</p>
                  <p className="mt-3 text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Artwork and reference details are credited to their respective owners. AnimeBoxD uses public Jikan/MyAnimeList reference data and does not claim ownership of third-party content.
                  </p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                    {detail.score ? <span className="rounded-xl bg-slate-100 px-3 py-1 dark:bg-slate-900">Score {detail.score}</span> : null}
                    {detail.rank ? <span className="rounded-xl bg-slate-100 px-3 py-1 dark:bg-slate-900">Rank #{detail.rank}</span> : null}
                    {detail.year ? <span className="rounded-xl bg-slate-100 px-3 py-1 dark:bg-slate-900">{detail.year}</span> : null}
                    {detail.url ? <a className="inline-flex items-center rounded-xl border border-slate-200/70 bg-white/80 px-3 py-1 text-teal-600 transition hover:-translate-y-0.5 hover:border-teal-400 dark:border-slate-800 dark:bg-slate-950/70" href={detail.url} target="_blank" rel="noreferrer">Open on MAL</a> : null}
                  </div>
                  {mode === "anime" && animeDetail && (
                    <Button className="w-full bg-teal-400 text-slate-950 hover:bg-teal-300 sm:w-fit" onClick={() => onAddAnime(animeDetail)}>
                      <Plus className="h-4 w-4" /> Add to diary
                    </Button>
                  )}
                  {mode === "manga" && mangaDetail && (
                    <Button className="w-full bg-teal-400 text-slate-950 hover:bg-teal-300 sm:w-fit" onClick={() => onAddManga(mangaDetail)}>
                      <Plus className="h-4 w-4" /> Add to manga
                    </Button>
                  )}
                </div>
              </div>
              {mode === "anime" && animeDetail && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Production and release</p>
                    <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                      {animeDetail.studios.length ? <p><span className="font-semibold">Studios:</span> {animeDetail.studios.join(", ")}</p> : null}
                      {animeDetail.producers?.length ? <p><span className="font-semibold">Producers:</span> {animeDetail.producers.join(", ")}</p> : null}
                      {animeDetail.licensors?.length ? <p><span className="font-semibold">Licensors:</span> {animeDetail.licensors.join(", ")}</p> : null}
                      {animeDetail.source ? <p><span className="font-semibold">Source:</span> {animeDetail.source}</p> : null}
                      {animeDetail.rating ? <p><span className="font-semibold">Rating:</span> {animeDetail.rating}</p> : null}
                      {animeDetail.duration ? <p><span className="font-semibold">Duration:</span> {animeDetail.duration}</p> : null}
                      {animeDetail.broadcast ? <p><span className="font-semibold">Broadcast:</span> {animeDetail.broadcast}</p> : null}
                      {animeDetail.season ? <p><span className="font-semibold">Season:</span> {animeDetail.season}</p> : null}
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Genres and themes</p>
                    {renderChipList([...(animeDetail.genres || []), ...(animeDetail.themes || []), ...(animeDetail.demographics || [])])}
                  </div>
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Staff highlights</p>
                    {staff.length ? (
                      <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                        {staff.slice(0, 8).map((member) => (
                          <p key={`${member.person.name}-${member.positions.join("-")}`}>{member.person.name} • {member.positions.join(", ")}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No staff details listed.</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cast highlights</p>
                    {cast.length ? (
                      <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                        {cast.slice(0, 8).map((member) => {
                          const mainVA = member.voice_actors?.[0];
                          return (
                            <p key={`${member.character.name}-${member.role}`}>
                              {member.character.name} ({member.role}){mainVA ? ` • ${mainVA.person.name} (${mainVA.language})` : ""}
                            </p>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No cast details listed.</p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Music</p>
                    {themes.openings.length || themes.endings.length ? (
                      <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                        {themes.openings.slice(0, 6).map((item) => (
                          <p key={`op-${item}`}>OP: {item}</p>
                        ))}
                        {themes.endings.slice(0, 6).map((item) => (
                          <p key={`ed-${item}`}>ED: {item}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-500">No theme music listed.</p>
                    )}
                  </div>
                </div>
              )}
              {mode === "manga" && mangaDetail && (
                <div className="grid gap-4">
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Publication details</p>
                    <div className="grid gap-2 text-sm text-slate-600 dark:text-slate-300">
                      {mangaDetail.authors.length ? <p><span className="font-semibold">Authors:</span> {mangaDetail.authors.join(", ")}</p> : null}
                      {mangaDetail.serialization?.length ? <p><span className="font-semibold">Serialization:</span> {mangaDetail.serialization.join(", ")}</p> : null}
                      {mangaDetail.status ? <p><span className="font-semibold">Status:</span> {mangaDetail.status}</p> : null}
                      <p><span className="font-semibold">Chapters:</span> {mangaDetail.total_chapters || "?"}</p>
                      <p><span className="font-semibold">Volumes:</span> {mangaDetail.total_volumes || "?"}</p>
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Genres and themes</p>
                    {renderChipList([...(mangaDetail.genres || []), ...(mangaDetail.themes || []), ...(mangaDetail.demographics || [])])}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function MyStuffPage({ data, onSelect, updateEntry, removeEntry, updateData, onBack, onClearHistory }: { data: AppData; onSelect: (anime: AnimeSummary) => void; updateEntry: (entry: LibraryEntry) => void; removeEntry: (id: number) => void; updateData: (patch: Partial<AppData>) => void; onBack: () => void; onClearHistory: () => void }) {
  const grouped = useMemo(() => {
    return sections.map((section) => ({
      ...section,
      entries: data.library.filter((entry) => entry.status === section.key)
    }));
  }, [data.library]);

  const counts = {
    total: data.library.length,
    watching: data.library.filter((entry) => entry.status === "Watching").length,
    completed: data.library.filter((entry) => entry.status === "Completed").length,
    plan: data.library.filter((entry) => entry.status === "Plan to Watch").length,
    onHold: data.library.filter((entry) => entry.status === "On Hold").length,
    dropped: data.library.filter((entry) => entry.status === "Dropped").length
  };

  const recent = [...data.library]
    .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
    .slice(0, 4);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-3xl leading-tight">My Anime</h2>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button className="bg-rose-600 px-2 hover:bg-rose-700 sm:px-4" onClick={onClearHistory}>Clear history</Button>
          <Button className="bg-slate-900 px-2 hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300 sm:px-4" onClick={onBack}>Back home</Button>
        </div>
      </div>
      <Card className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Diary shelf</p>
          <h3 className="break-words font-display text-3xl leading-tight sm:text-4xl">{data.settings.username}'s logbook</h3>
          <p className="text-sm text-slate-500">What you are watching, finished, and saving for later.</p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900">Total {counts.total}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900">Watching {counts.watching}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900">Completed {counts.completed}</span>
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent entries</p>
          {recent.length === 0 && <p className="text-sm text-slate-500">Nothing here yet. Add an anime when you are ready.</p>}
          {recent.map((entry) => (
            <div key={entry.mal_id} className="flex items-center gap-3">
              <img src={entry.image_url} alt="" className="h-12 w-9 rounded-md object-cover" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{entry.title}</p>
                <p className="text-xs text-slate-500">{statusLabels[entry.status]} • {new Date(entry.added_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <ProfileHighlights data={data} updateData={updateData} />
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-6">
        <Card className="text-sm"><p className="text-slate-500">Total</p><p className="text-2xl font-black">{counts.total}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Watching</p><p className="text-2xl font-black">{counts.watching}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Completed</p><p className="text-2xl font-black">{counts.completed}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Planned</p><p className="text-2xl font-black">{counts.plan}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">On hold</p><p className="text-2xl font-black">{counts.onHold}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Dropped</p><p className="text-2xl font-black">{counts.dropped}</p></Card>
      </div>
      <SearchPanel onSelect={onSelect} />
      <div className="grid gap-6">
        {grouped.map((section) => (
          <Section key={section.key} title={section.title} icon={section.icon}>
            {section.entries.length === 0 ? (
              <Card className="text-sm text-slate-500">This shelf is empty for now.</Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {section.entries.map((entry) => (
                  <LibraryCard key={entry.mal_id} entry={entry} onUpdate={updateEntry} onRemove={() => removeEntry(entry.mal_id)} />
                ))}
              </div>
            )}
          </Section>
        ))}
      </div>
    </div>
  );
}

function MyMangaPage({ data, onSelect, updateEntry, removeEntry, updateData, onBack, onClearHistory }: { data: AppData; onSelect: (manga: MangaSummary) => void; updateEntry: (entry: MangaEntry) => void; removeEntry: (id: number) => void; updateData: (patch: Partial<AppData>) => void; onBack: () => void; onClearHistory: () => void }) {
  const grouped = useMemo(() => {
    return mangaSections.map((section) => ({
      ...section,
      entries: data.mangaLibrary.filter((entry) => entry.status === section.key)
    }));
  }, [data.mangaLibrary]);

  const counts = {
    total: data.mangaLibrary.length,
    reading: data.mangaLibrary.filter((entry) => entry.status === "Reading").length,
    completed: data.mangaLibrary.filter((entry) => entry.status === "Completed").length,
    plan: data.mangaLibrary.filter((entry) => entry.status === "Plan to Read").length,
    onHold: data.mangaLibrary.filter((entry) => entry.status === "On Hold").length,
    dropped: data.mangaLibrary.filter((entry) => entry.status === "Dropped").length
  };

  const recent = [...data.mangaLibrary]
    .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
    .slice(0, 4);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-3xl leading-tight">My Manga</h2>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button className="bg-rose-600 px-2 hover:bg-rose-700 sm:px-4" onClick={onClearHistory}>Clear history</Button>
          <Button className="bg-slate-900 px-2 hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300 sm:px-4" onClick={onBack}>Back home</Button>
        </div>
      </div>
      <Card className="grid gap-4 border border-teal-200/70 bg-teal-50/40 dark:border-teal-900/60 dark:bg-slate-950/70 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Manga shelf</p>
          <h3 className="break-words font-display text-3xl leading-tight sm:text-4xl">{data.settings.username}'s bookshelf</h3>
          <p className="text-sm text-slate-600 dark:text-slate-300">Keep your manga list close and easy to update.</p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-700">
            <span className="rounded-xl bg-white/70 px-3 py-1 dark:bg-slate-900">Total {counts.total}</span>
            <span className="rounded-xl bg-white/70 px-3 py-1 dark:bg-slate-900">Reading {counts.reading}</span>
            <span className="rounded-xl bg-white/70 px-3 py-1 dark:bg-slate-900">Completed {counts.completed}</span>
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent entries</p>
          {recent.length === 0 && <p className="text-sm text-slate-500">No manga yet. Add a series when one sticks.</p>}
          {recent.map((entry) => (
            <div key={entry.mal_id} className="flex items-center gap-3">
              <img src={entry.image_url} alt="" className="h-12 w-9 rounded-md object-cover" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{entry.title}</p>
                <p className="text-xs text-slate-500">{mangaStatusLabels[entry.status]} • {new Date(entry.added_at).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
      <MangaHighlights data={data} updateData={updateData} />
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-6">
        <Card className="text-sm"><p className="text-slate-500">Total</p><p className="text-2xl font-black">{counts.total}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Reading</p><p className="text-2xl font-black">{counts.reading}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Completed</p><p className="text-2xl font-black">{counts.completed}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Planned</p><p className="text-2xl font-black">{counts.plan}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">On hold</p><p className="text-2xl font-black">{counts.onHold}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Dropped</p><p className="text-2xl font-black">{counts.dropped}</p></Card>
      </div>
      <SearchMangaPanel onSelect={onSelect} />
      <div className="grid gap-6">
        {grouped.map((section) => (
          <Section key={section.key} title={section.title} icon={section.icon}>
            {section.entries.length === 0 ? (
              <Card className="text-sm text-slate-500">This shelf is empty for now.</Card>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {section.entries.map((entry) => (
                  <MangaCard key={entry.mal_id} entry={entry} onUpdate={updateEntry} onRemove={() => removeEntry(entry.mal_id)} />
                ))}
              </div>
            )}
          </Section>
        ))}
      </div>
    </div>
  );
}

function ProfileHighlights({ data, updateData }: { data: AppData; updateData: (patch: Partial<AppData>) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AnimeSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const selectedIds = data.settings.favoriteAnimeIds || [];
  const favoriteCatalog = data.settings.favoriteAnimeCatalog || [];
  const catalog = allKnownAnime(data.library, favoriteCatalog);
  const searchableCatalog = allKnownAnime(data.library, [...favoriteCatalog, ...searchResults]);
  const catalogIds = new Set(catalog.map((anime) => anime.mal_id));
  const validSelectedIds = selectedIds.filter((animeId) => catalogIds.has(animeId));
  const selected = validSelectedIds.map((animeId) => catalog.find((anime) => anime.mal_id === animeId)).filter(Boolean) as AnimeSummary[];
  const visibleCatalog = searchableCatalog.filter((anime) => !query.trim() || anime.title.toLowerCase().includes(query.toLowerCase()) || anime.genres.some((genre) => genre.toLowerCase().includes(query.toLowerCase())));

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      setSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      searchAnime(query)
        .then((items) => {
          setSearchResults(items);
          setSearchError("");
        })
        .catch((err: Error) => setSearchError(err.message))
        .finally(() => setSearchLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [open, query]);

  const toggleFavorite = (anime: AnimeSummary) => {
    const nextIds = validSelectedIds.includes(anime.mal_id) ? validSelectedIds.filter((idValue) => idValue !== anime.mal_id) : [...validSelectedIds, anime.mal_id];
    const shouldStoreAnime = !fixedAnime.some((item) => item.mal_id === anime.mal_id) && !data.library.some((item) => item.mal_id === anime.mal_id);
    const nextCatalog = shouldStoreAnime && !favoriteCatalog.some((item) => item.mal_id === anime.mal_id) ? [...favoriteCatalog, anime] : favoriteCatalog;
    updateData({ settings: { ...data.settings, favoriteAnimeIds: nextIds, favoriteAnimeCatalog: nextCatalog } });
  };

  return (
    <Card className="grid gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Profile highlights</p>
        <h3 className="font-display text-3xl">Favorite anime shelf</h3>
        <p className="text-sm text-slate-500">Pin the anime you want people to notice first.</p>
      </div>
      {selected.length > 0 ? (
        <div className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-4">
          {selected.map((anime) => (
            <div key={anime.mal_id} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-xl border border-teal-200 bg-teal-50/70 p-2 dark:border-teal-900 dark:bg-teal-950/30">
              <img src={anime.image_url} alt="" className="h-20 w-14 rounded-lg object-cover" />
              <div>
                <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{anime.title}</p>
                <p className="text-xs text-slate-500">{anime.year || "Unknown"} • {(anime.genres || []).slice(0, 2).join(", ")}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No highlights yet.</p>
      )}
      <button className="inline-flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200" onClick={() => setOpen((prev) => !prev)}>
        <span>{open ? "Hide favorite picker" : "Choose favorite anime"}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="grid gap-3">
          <input className={inputClass()} placeholder="Search anime favorites" value={query} onChange={(event) => setQuery(event.target.value)} />
          {searchLoading && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">Searching anime...</p>}
          {searchError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{searchError}</p>}
          <div className="scrollbar-soft grid max-h-[70vh] gap-2 overflow-auto pr-1 md:max-h-96 md:grid-cols-2 xl:grid-cols-3">
            {visibleCatalog.map((anime) => (
              <label key={anime.mal_id} className="grid grid-cols-[18px_44px_minmax(0,1fr)] items-center gap-2 rounded-xl border border-slate-200/70 bg-white/70 p-2 text-sm font-semibold dark:border-slate-800 dark:bg-slate-950/70">
                <input type="checkbox" checked={validSelectedIds.includes(anime.mal_id)} onChange={() => toggleFavorite(anime)} />
                <img src={anime.image_url} alt="" className="h-14 w-10 rounded-md object-cover" />
                <span>
                  <span className="line-clamp-1">{anime.title}</span>
                  <span className="block text-xs font-normal text-slate-500">{anime.year || "Unknown"} • {(anime.genres || []).slice(0, 2).join(", ")}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function MangaHighlights({ data, updateData }: { data: AppData; updateData: (patch: Partial<AppData>) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MangaSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const selectedIds = data.settings.favoriteMangaIds || [];
  const favoriteCatalog = data.settings.favoriteMangaCatalog || [];
  const catalog = allKnownManga(data.mangaLibrary, favoriteCatalog);
  const searchableCatalog = allKnownManga(data.mangaLibrary, [...favoriteCatalog, ...searchResults]);
  const catalogIds = new Set(catalog.map((manga) => manga.mal_id));
  const validSelectedIds = selectedIds.filter((mangaId) => catalogIds.has(mangaId));
  const selected = validSelectedIds.map((mangaId) => catalog.find((manga) => manga.mal_id === mangaId)).filter(Boolean) as MangaSummary[];
  const visibleCatalog = searchableCatalog.filter((manga) => !query.trim() || manga.title.toLowerCase().includes(query.toLowerCase()) || manga.genres.some((genre) => genre.toLowerCase().includes(query.toLowerCase())));

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setSearchResults([]);
      setSearchError("");
      setSearchLoading(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSearchLoading(true);
      searchManga(query)
        .then((items) => {
          setSearchResults(items);
          setSearchError("");
        })
        .catch((err: Error) => setSearchError(err.message))
        .finally(() => setSearchLoading(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [open, query]);

  const toggleFavorite = (manga: MangaSummary) => {
    const nextIds = validSelectedIds.includes(manga.mal_id) ? validSelectedIds.filter((idValue) => idValue !== manga.mal_id) : [...validSelectedIds, manga.mal_id];
    const shouldStoreManga = !data.mangaLibrary.some((item) => item.mal_id === manga.mal_id);
    const nextCatalog = shouldStoreManga && !favoriteCatalog.some((item) => item.mal_id === manga.mal_id) ? [...favoriteCatalog, manga] : favoriteCatalog;
    updateData({ settings: { ...data.settings, favoriteMangaIds: nextIds, favoriteMangaCatalog: nextCatalog } });
  };

  return (
    <Card className="grid gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Manga highlights</p>
        <h3 className="font-display text-3xl">Favorite manga shelf</h3>
        <p className="text-sm text-slate-500">Pin the manga you keep coming back to.</p>
      </div>
      {selected.length > 0 ? (
        <div className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-4">
          {selected.map((manga) => (
            <div key={manga.mal_id} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3 rounded-xl border border-teal-200 bg-teal-50/70 p-2 dark:border-teal-900 dark:bg-teal-950/20">
              <img src={manga.image_url} alt="" className="h-20 w-14 rounded-lg object-cover" />
              <div>
                <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{manga.title}</p>
                <p className="text-xs text-slate-500">{manga.year || "Unknown"} • {(manga.genres || []).slice(0, 2).join(", ")}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-teal-50 p-3 text-sm text-slate-500 dark:bg-teal-950/30">No manga highlights yet.</p>
      )}
      <button className="inline-flex items-center justify-between rounded-xl border border-teal-200/70 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-teal-900/50 dark:bg-slate-950/70 dark:text-slate-200" onClick={() => setOpen((prev) => !prev)}>
        <span>{open ? "Hide manga picker" : "Choose favorite manga"}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="grid gap-3">
          <input className={inputClass()} placeholder="Search manga favorites" value={query} onChange={(event) => setQuery(event.target.value)} />
          {searchLoading && <p className="rounded-xl bg-teal-50 p-3 text-sm text-slate-500 dark:bg-teal-950/30">Searching manga...</p>}
          {searchError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{searchError}</p>}
          <div className="scrollbar-soft grid max-h-[70vh] gap-2 overflow-auto pr-1 md:max-h-96 md:grid-cols-2 xl:grid-cols-3">
            {visibleCatalog.map((manga) => (
              <label key={manga.mal_id} className="grid grid-cols-[18px_44px_minmax(0,1fr)] items-center gap-2 rounded-xl border border-teal-200/70 bg-white/70 p-2 text-sm font-semibold dark:border-teal-900/50 dark:bg-slate-950/70">
                <input type="checkbox" checked={validSelectedIds.includes(manga.mal_id)} onChange={() => toggleFavorite(manga)} />
                <img src={manga.image_url} alt="" className="h-14 w-10 rounded-md object-cover" />
                <span>
                  <span className="line-clamp-1">{manga.title}</span>
                  <span className="block text-xs font-normal text-slate-500">{manga.year || "Unknown"} • {(manga.genres || []).slice(0, 2).join(", ")}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function formatDate(value?: string) {
  if (!value) return "New member";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "New member";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ProfilePage({ data, memberSince, onBack, onSaveProfile, onDeleteAccount }: { data: AppData; memberSince?: string; onBack: () => void; onSaveProfile: (settings: Pick<Settings, "username" | "avatar" | "bio" | "isPublic">) => void | Promise<void>; onDeleteAccount: () => void | Promise<void> }) {
  const [username, setUsername] = useState(data.settings.username || "");
  const [avatar, setAvatar] = useState(data.settings.avatar || "✨");
  const [bio, setBio] = useState(data.settings.bio || "");
  const [isPublic, setIsPublic] = useState(data.settings.isPublic);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const animeCompleted = data.library.filter((entry) => entry.status === "Completed").length;
  const mangaCompleted = data.mangaLibrary.filter((entry) => entry.status === "Completed").length;
  const ratedItems = [...data.library, ...data.mangaLibrary].filter((entry) => entry.rating > 0);
  const averageRating = ratedItems.length ? (ratedItems.reduce((sum, entry) => sum + entry.rating, 0) / ratedItems.length).toFixed(1) : "-";
  const recentActivity = [
    ...data.library.map((entry) => ({ kind: "Anime" as const, title: entry.title, image: entry.image_url, action: statusLabels[entry.status], date: entry.added_at, detail: entry.rating ? `${entry.rating}/10` : `${entry.episodes_watched}/${entry.total_episodes || "?"} eps` })),
    ...data.mangaLibrary.map((entry) => ({ kind: "Manga" as const, title: entry.title, image: entry.image_url, action: mangaStatusLabels[entry.status], date: entry.added_at, detail: entry.rating ? `${entry.rating}/10` : "No rating yet" }))
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);

  useEffect(() => {
    setUsername(data.settings.username || "");
    setAvatar(data.settings.avatar || "✨");
    setBio(data.settings.bio || "");
    setIsPublic(data.settings.isPublic);
  }, [data.settings.avatar, data.settings.bio, data.settings.isPublic, data.settings.username]);

  const saveProfile = async () => {
    const nextUsername = username.trim() || "Anime fan";
    setStatus("saving");
    setError("");
    try {
      await onSaveProfile({
        username: nextUsername,
        avatar: avatar.trim() || "✨",
        bio: bio.trim(),
        isPublic
      });
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1800);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not save profile.");
    }
  };

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-3xl leading-tight">Profile</h2>
        <Button className="w-full sm:w-fit" onClick={onBack}>Back home</Button>
      </div>

      <Card className="grid gap-5 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
        <div className="grid gap-4">
          <button className="grid w-full grid-cols-[64px_minmax(0,1fr)] gap-4 rounded-2xl p-2 text-left transition hover:bg-white/60 dark:hover:bg-slate-900/60 sm:flex sm:items-center" onClick={() => setEditOpen((prev) => !prev)} type="button" aria-expanded={editOpen}>
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-teal-50 text-4xl shadow-sm dark:bg-teal-950/50">{avatar || data.settings.avatar}</div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Member profile</p>
              <h3 className="break-words font-display text-4xl leading-tight">{data.settings.username || "Anime fan"}</h3>
              <p className="text-sm text-slate-500">Member since {formatDate(memberSince)}</p>
            </div>
            <span className="ml-auto hidden shrink-0 items-center gap-1 text-xs font-black text-teal-600 sm:inline-flex">
              {editOpen ? "Close editor" : "Edit profile"}
              {editOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </button>
          {editOpen && <div className="grid gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-2xl">Edit profile</h3>
              <Sparkles className="h-5 w-5 text-teal-500" />
            </div>
            <div className="grid gap-3 rounded-2xl bg-slate-100/80 p-3 dark:bg-slate-950/60">
              <div className="flex items-center gap-3">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-3xl shadow-sm dark:bg-slate-900">{avatar || "✨"}</div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900 dark:text-white">Choose a profile icon</p>
                  <p className="text-xs text-slate-500">Pick one below or type your own emoji.</p>
                </div>
              </div>
              <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
                {avatarOptions.map((item) => (
                  <button
                    key={item}
                    className={clsx("grid h-10 place-items-center rounded-xl border text-xl transition hover:-translate-y-0.5", avatar === item ? "border-teal-400 bg-teal-50 shadow-sm dark:bg-teal-400/20" : "border-slate-200 bg-white/80 dark:border-slate-800 dark:bg-slate-900/80")}
                    onClick={() => setAvatar(item)}
                    type="button"
                    aria-label={`Use ${item} as avatar`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_96px]">
              <Field label="Username">
                <input className={inputClass()} maxLength={40} value={username} onChange={(event) => setUsername(event.target.value)} />
              </Field>
              <Field label="Avatar">
                <input className={inputClass()} maxLength={4} value={avatar} onChange={(event) => setAvatar(event.target.value)} />
              </Field>
            </div>
            <Field label="Bio">
              <textarea className={clsx(inputClass(), "min-h-24 resize-y")} maxLength={180} value={bio} onChange={(event) => setBio(event.target.value)} />
            </Field>
            <label className="flex items-center justify-between gap-3 rounded-xl bg-slate-100 p-3 text-sm font-semibold text-slate-700 dark:bg-slate-950/70 dark:text-slate-200">
              <span>
                Keep profile private
                <span className="block text-xs font-normal text-slate-500">Profiles are private while AnimeBoxD has no social user connections.</span>
              </span>
              <input className="h-5 w-5 accent-teal-500" type="checkbox" checked={!isPublic} onChange={(event) => setIsPublic(!event.target.checked)} />
            </label>
            {status === "error" && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-100">{error}</p>}
            {status === "saved" && <p className="rounded-xl bg-teal-50 p-3 text-sm font-semibold text-teal-800 dark:bg-teal-950/40 dark:text-teal-100">Profile saved.</p>}
            <Button className="w-full sm:w-fit" onClick={saveProfile} disabled={status === "saving"}>{status === "saving" ? "Saving..." : "Save profile"}</Button>
          </div>}
          <p className="rounded-2xl bg-white/60 p-4 text-sm leading-6 text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
            {bio || "Keeping track of anime, manga, ratings, and favorites."}
          </p>
          <div className="grid grid-cols-2 gap-3 text-center text-sm font-semibold sm:grid-cols-4 lg:grid-cols-2">
            <span className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900"><strong className="block text-2xl text-slate-950 dark:text-white">{data.library.length}</strong>Anime</span>
            <span className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900"><strong className="block text-2xl text-slate-950 dark:text-white">{data.mangaLibrary.length}</strong>Manga</span>
            <span className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900"><strong className="block text-2xl text-slate-950 dark:text-white">{animeCompleted + mangaCompleted}</strong>Completed</span>
            <span className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900"><strong className="block text-2xl text-slate-950 dark:text-white">{averageRating}</strong>Avg rating</span>
          </div>
        </div>

        <div className="grid gap-3">
          <h3 className="font-display text-2xl">Recent activity</h3>
          {recentActivity.length === 0 ? (
            <p className="rounded-2xl bg-slate-100 p-4 text-sm text-slate-500 dark:bg-slate-900">No activity yet. Add anime or manga to start building your profile.</p>
          ) : (
            recentActivity.map((entry) => (
              <div key={`${entry.kind}-${entry.title}-${entry.date}`} className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <img src={entry.image} alt="" className="h-16 w-12 rounded-lg object-cover" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="line-clamp-1 font-semibold text-slate-900 dark:text-white">{entry.title}</p>
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-200">{entry.kind}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{entry.action} • {entry.detail}</p>
                  <p className="text-xs text-slate-500">Added {formatDate(entry.date)}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="border-rose-200/80 bg-rose-50/60 dark:border-rose-900/50 dark:bg-rose-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-display text-2xl">Delete account</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">This removes your account and saved AnimeBoxD data. This cannot be undone.</p>
          </div>
          <Button className="w-full bg-rose-600 hover:bg-rose-700 sm:w-fit" onClick={onDeleteAccount}>Delete account</Button>
        </div>
      </Card>
    </div>
  );
}

function DashboardPage({ data, onClearHistory, onBack }: { data: AppData; onClearHistory: () => void; onBack: () => void }) {
  const counts = {
    total: data.library.length,
    watching: data.library.filter((entry) => entry.status === "Watching").length,
    completed: data.library.filter((entry) => entry.status === "Completed").length,
    plan: data.library.filter((entry) => entry.status === "Plan to Watch").length,
    onHold: data.library.filter((entry) => entry.status === "On Hold").length,
    dropped: data.library.filter((entry) => entry.status === "Dropped").length
  };
  const mangaCounts = {
    total: data.mangaLibrary.length,
    reading: data.mangaLibrary.filter((entry) => entry.status === "Reading").length,
    completed: data.mangaLibrary.filter((entry) => entry.status === "Completed").length,
    plan: data.mangaLibrary.filter((entry) => entry.status === "Plan to Read").length,
    onHold: data.mangaLibrary.filter((entry) => entry.status === "On Hold").length,
    dropped: data.mangaLibrary.filter((entry) => entry.status === "Dropped").length
  };

  const rated = data.library.filter((entry) => entry.rating > 0);
  const averageRating = rated.length ? (rated.reduce((sum, entry) => sum + entry.rating, 0) / rated.length).toFixed(1) : "-";
  const mangaRated = data.mangaLibrary.filter((entry) => entry.rating > 0);
  const mangaAverage = mangaRated.length ? (mangaRated.reduce((sum, entry) => sum + entry.rating, 0) / mangaRated.length).toFixed(1) : "-";
  const totalEntries = counts.total + mangaCounts.total;
  const totalCompleted = counts.completed + mangaCounts.completed;
  const totalInProgress = counts.watching + mangaCounts.reading;
  const overallCompletion = totalEntries ? Math.round((totalCompleted / totalEntries) * 100) : 0;
  const watchedEpisodes = data.library.reduce((sum, entry) => sum + Math.max(0, entry.episodes_watched || 0), 0);
  const totalKnownEpisodes = data.library.reduce((sum, entry) => sum + Math.max(0, entry.total_episodes || 0), 0);
  const watchedKnownEpisodes = data.library.reduce((sum, entry) => entry.total_episodes > 0 ? sum + Math.min(Math.max(0, entry.episodes_watched || 0), entry.total_episodes) : sum, 0);
  const animeProgressWidth = totalKnownEpisodes ? Math.round((watchedKnownEpisodes / totalKnownEpisodes) * 100) : 0;
  const mangaCompletionWidth = mangaCounts.total ? Math.round((mangaCounts.completed / mangaCounts.total) * 100) : 0;
  const animeProgressLabel = totalKnownEpisodes ? `${watchedKnownEpisodes}/${totalKnownEpisodes} known episodes` : `${watchedEpisodes} episodes logged`;
  const mangaCompletionLabel = mangaCounts.total ? `${mangaCounts.completed}/${mangaCounts.total} completed` : "No manga saved yet";
  const averageAcrossLibraries = [...rated.map((entry) => entry.rating), ...mangaRated.map((entry) => entry.rating)];
  const combinedAverage = averageAcrossLibraries.length ? (averageAcrossLibraries.reduce((sum, rating) => sum + rating, 0) / averageAcrossLibraries.length).toFixed(1) : "-";
  const recentHistory = [
    ...data.library.map((entry) => ({ kind: "Anime" as const, title: entry.title, image: entry.image_url, status: statusLabels[entry.status], detail: `${entry.episodes_watched}/${entry.total_episodes || "?"} eps`, rating: entry.rating, date: entry.added_at })),
    ...data.mangaLibrary.map((entry) => ({ kind: "Manga" as const, title: entry.title, image: entry.image_url, status: mangaStatusLabels[entry.status], detail: entry.genres.slice(0, 2).join(", ") || "Manga", rating: entry.rating, date: entry.added_at }))
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);
  const favoriteIds = new Set(data.settings.favoriteAnimeIds || []);
  const favoriteAnime = allKnownAnime(data.library, data.settings.favoriteAnimeCatalog || []).filter((anime) => favoriteIds.has(anime.mal_id));
  const favoriteMangaIds = new Set(data.settings.favoriteMangaIds || []);
  const favoriteManga = allKnownManga(data.mangaLibrary, data.settings.favoriteMangaCatalog || []).filter((manga) => favoriteMangaIds.has(manga.mal_id));
  const favoriteHighlights = [
    ...favoriteAnime.map((anime) => ({ kind: "Anime" as const, title: anime.title, image: anime.image_url, meta: isLibraryEntry(anime) ? `${statusLabels[anime.status]} • ${anime.rating || "-"}/10` : `${anime.year || "Unknown"} • ${(anime.genres || []).slice(0, 2).join(", ")}` })),
    ...favoriteManga.map((manga) => ({ kind: "Manga" as const, title: manga.title, image: manga.image_url, meta: isMangaEntry(manga) ? `${mangaStatusLabels[manga.status]} • ${manga.rating || "-"}/10` : `${manga.year || "Unknown"} • ${(manga.genres || []).slice(0, 2).join(", ")}` }))
  ].slice(0, 6);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-3xl leading-tight">Dashboard</h2>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Button className="bg-rose-600 px-2 hover:bg-rose-700 sm:px-4" onClick={onClearHistory}>Clear history</Button>
          <Button className="bg-slate-900 px-2 hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300 sm:px-4" onClick={onBack}>Back home</Button>
        </div>
      </div>
      <Card className="grid gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-teal-500">History summary</p>
          <h3 className="font-display text-3xl leading-tight sm:text-4xl">Your watch life, simplified.</h3>
          <p className="max-w-2xl text-sm text-slate-500">A clean snapshot of what you have saved and finished.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-teal-200/70 bg-teal-50/60 p-4 dark:border-teal-900/60 dark:bg-teal-950/20">
            <p className="text-sm font-semibold text-slate-500">Total saved</p>
            <p className="mt-1 text-3xl font-black sm:text-4xl">{totalEntries}</p>
            <p className="text-xs text-slate-500">{counts.total} anime • {mangaCounts.total} manga</p>
          </div>
          <div className="rounded-2xl border border-teal-200/70 bg-white/70 p-4 dark:border-teal-900/50 dark:bg-slate-950/70">
            <p className="text-sm font-semibold text-slate-500">Completed</p>
            <p className="mt-1 text-3xl font-black sm:text-4xl">{totalCompleted}</p>
            <p className="text-xs text-slate-500">{overallCompletion}% of your library</p>
          </div>
          <div className="rounded-2xl border border-teal-200/70 bg-white/70 p-4 dark:border-teal-900/50 dark:bg-slate-950/70">
            <p className="text-sm font-semibold text-slate-500">In progress</p>
            <p className="mt-1 text-3xl font-black sm:text-4xl">{totalInProgress}</p>
            <p className="text-xs text-slate-500">{counts.watching} watching • {mangaCounts.reading} reading</p>
          </div>
          <div className="rounded-2xl border border-teal-200/70 bg-white/70 p-4 dark:border-teal-900/50 dark:bg-slate-950/70">
            <p className="text-sm font-semibold text-slate-500">Average rating</p>
            <p className="mt-1 text-3xl font-black sm:text-4xl">{combinedAverage}</p>
            <p className="text-xs text-slate-500">Anime {averageRating} • Manga {mangaAverage}</p>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Anime</p>
              <h3 className="font-display text-3xl">Watch history</h3>
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
              <span>Episodes watched</span>
              <span>{animeProgressLabel}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-3 rounded-full bg-teal-500" style={{ width: `${animeProgressWidth}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="rounded-xl bg-slate-100 p-2 dark:bg-slate-900">{counts.watching}<br />Watching</span>
            <span className="rounded-xl bg-slate-100 p-2 dark:bg-slate-900">{counts.plan}<br />Planned</span>
            <span className="rounded-xl bg-slate-100 p-2 dark:bg-slate-900">{counts.dropped}<br />Dropped</span>
          </div>
        </Card>

        <Card className="grid gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Manga</p>
              <h3 className="font-display text-3xl">Reading history</h3>
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs font-semibold text-slate-500">
              <span>Completed manga</span>
              <span>{mangaCompletionLabel}</span>
            </div>
            <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-3 rounded-full bg-teal-500" style={{ width: `${mangaCompletionWidth}%` }} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">
            <span className="rounded-xl bg-slate-100 p-2 dark:bg-slate-900">{mangaCounts.reading}<br />Reading</span>
            <span className="rounded-xl bg-slate-100 p-2 dark:bg-slate-900">{mangaCounts.plan}<br />Planned</span>
            <span className="rounded-xl bg-slate-100 p-2 dark:bg-slate-900">{mangaCounts.dropped}<br />Dropped</span>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <h3 className="mb-3 font-display text-2xl">Recent history</h3>
          <div className="grid gap-3">
            {recentHistory.length === 0 && <p className="text-sm text-slate-500">Your timeline is empty for now.</p>}
            {recentHistory.map((entry) => (
              <div key={`${entry.kind}-${entry.title}-${entry.date}`} className="grid grid-cols-[48px_minmax(0,1fr)] gap-3 rounded-xl border border-slate-200/70 bg-white/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
                <img src={entry.image} alt="" className="h-16 w-12 rounded-lg object-cover" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="line-clamp-1 font-semibold text-slate-900 dark:text-white">{entry.title}</p>
                    <span className="rounded-full bg-teal-50 px-2 py-1 text-[11px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-200">{entry.kind}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{entry.status} • {entry.rating || "-"}/10 • {entry.detail}</p>
                  <p className="text-xs text-slate-500">Added {new Date(entry.date).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 font-display text-2xl">Favorites</h3>
          {favoriteHighlights.length === 0 ? (
            <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No favorites pinned yet.</p>
          ) : (
            <div className="grid gap-3">
              {favoriteHighlights.map((item) => (
                <div key={`${item.kind}-${item.title}`} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3 rounded-xl border border-slate-200/70 bg-white/70 p-2 dark:border-slate-800 dark:bg-slate-900/70">
                  <img src={item.image} alt="" className="h-16 w-12 rounded-lg object-cover" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="line-clamp-1 text-sm font-semibold text-slate-900 dark:text-white">{item.title}</p>
                      <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-200">{item.kind}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">{item.meta}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// Maps activity event_type keys to a friendly label and emoji
function friendlyEvent(eventType: string): { label: string; icon: string } {
  const map: Record<string, { label: string; icon: string }> = {
    sign_in:        { label: "Signed in",           icon: "🔑" },
    sign_up:        { label: "Created account",     icon: "🎉" },
    sign_out:       { label: "Signed out",          icon: "👋" },
    add_anime:      { label: "Added anime",         icon: "📺" },
    update_anime:   { label: "Updated anime entry", icon: "✏️" },
    remove_anime:   { label: "Removed anime",       icon: "🗑️" },
    add_manga:      { label: "Added manga",         icon: "📖" },
    update_manga:   { label: "Updated manga entry", icon: "✏️" },
    remove_manga:   { label: "Removed manga",       icon: "🗑️" },
    update_profile: { label: "Updated profile",     icon: "👤" },
    delete_account: { label: "Deleted account",     icon: "⛔" },
    save_review:    { label: "Wrote a review",      icon: "⭐" },
    save_diary:     { label: "Added diary entry",   icon: "📔" },
  };
  return map[eventType] ?? { label: eventType.replace(/_/g, " "), icon: "📌" };
}

function AdminPage({ onBack }: { onBack: () => void }) {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [showAllUsers, setShowAllUsers] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      setDashboard(await loadAdminDashboard());
    } catch (err) {
      setError(friendlyAuthError(err, "Could not load the admin board. Make sure the admin SQL has been run and your profile is marked as admin."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const profiles = dashboard?.profiles || [];
  const reports = dashboard?.reports || [];
  const activity = dashboard?.activity || [];
  const notifications = dashboard?.notifications || [];

  // Quick-lookup: userId → profile
  const userById = new Map(profiles.map((p) => [p.id, p]));

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const activeThisWeek = profiles.filter((p) => p.last_seen && new Date(p.last_seen).getTime() >= weekAgo).length;
  const newThisMonth = profiles.filter((p) => p.created_at && new Date(p.created_at).getTime() >= monthAgo).length;
  const totalAnime = profiles.reduce((sum, p) => sum + (p.anime_count || 0), 0);
  const totalManga = profiles.reduce((sum, p) => sum + (p.manga_count || 0), 0);
  const openReports = reports.filter((r) => r.status !== "closed").length;
  const unread = notifications.filter((n) => !n.is_read).length;

  const selectedUser = profiles.find((p) => p.id === selectedUserId) || null;
  const selectedUserReports = selectedUser ? reports.filter((r) => r.user_id === selectedUser.id) : [];
  const selectedUserActivity = selectedUser ? activity.filter((e) => e.user_id === selectedUser.id).slice(0, 10) : [];

  const pageViews = dashboard?.pageViews || [];
  const uniqueSessions = new Set(pageViews.map((v) => v.session_id)).size;
  const anonViews = pageViews.filter((v) => !v.user_id).length;
  const signedInViews = pageViews.filter((v) => v.user_id).length;
  const pageViewsByPage = Object.entries(pageViews.reduce<Record<string, number>>((acc, v) => {
    acc[v.page] = (acc[v.page] || 0) + 1;
    return acc;
  }, {})).map(([page, count]) => ({ page, count })).sort((a, b) => b.count - a.count);

  const buildSeries = (items: { created_at?: string }[], days = 14) => {
    const now = new Date();
    const rows = Array.from({ length: days }).map((_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (days - 1 - index));
      const key = date.toISOString().slice(0, 10);
      return { key, date: formatShortDate(key), count: 0 };
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));
    items.forEach((item) => {
      if (!item.created_at) return;
      const key = new Date(item.created_at).toISOString().slice(0, 10);
      const row = byKey.get(key);
      if (row) row.count += 1;
    });
    return rows;
  };
  const signupSeries = buildSeries(profiles);
  const activitySeries = buildSeries(activity);
  const pageViewSeries = buildSeries(pageViews, 30);
  const reportCategoryData = Object.entries(reports.reduce<Record<string, number>>((acc, report) => {
    acc[report.category] = (acc[report.category] || 0) + 1;
    return acc;
  }, {})).map(([category, count]) => ({ category, count }));

  const filteredProfiles = userSearch.trim()
    ? profiles.filter((p) => p.username.toLowerCase().includes(userSearch.toLowerCase()) || (p.email || "").toLowerCase().includes(userSearch.toLowerCase()))
    : profiles;
  const visibleProfiles = showAllUsers ? filteredProfiles : filteredProfiles.slice(0, 8);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Owner tools</p>
          <h2 className="font-display text-3xl leading-tight">Admin board</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={refresh} disabled={loading}><RefreshCcw className="h-4 w-4" /> {loading ? "Loading" : "Refresh"}</Button>
          <Button className="bg-slate-900 hover:bg-slate-800 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300" onClick={onBack}>Back home</Button>
        </div>
      </div>

      {error && <p className="rounded-2xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-100">{error}</p>}

      {/* Primary stats */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-teal-200/60 dark:border-teal-900/40">
          <p className="text-sm font-semibold text-slate-500">Total signups</p>
          <p className="mt-1 text-4xl font-black text-teal-600 dark:text-teal-400">{profiles.length}</p>
          <p className="text-xs text-slate-500">+{newThisMonth} this month · {activeThisWeek} active this week</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">Anime tracked</p>
          <p className="mt-1 text-4xl font-black">{totalAnime}</p>
          <p className="text-xs text-slate-500">Across all users</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">Manga tracked</p>
          <p className="mt-1 text-4xl font-black">{totalManga}</p>
          <p className="text-xs text-slate-500">Across all users</p>
        </Card>
        <Card>
          <p className="text-sm font-semibold text-slate-500">Reports</p>
          <p className="mt-1 text-4xl font-black">{reports.length}</p>
          <p className="text-xs text-slate-500">{openReports} open · {unread} unread notifications</p>
        </Card>
      </div>

      {/* Reach stats */}
      <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-3">
        <Card><p className="text-sm font-semibold text-slate-500">Page views <span className="text-[10px] font-normal">(30 days)</span></p><p className="mt-1 text-4xl font-black">{pageViews.length}</p><p className="text-xs text-slate-500">{uniqueSessions} unique sessions</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">Anonymous visitors</p><p className="mt-1 text-4xl font-black">{anonViews}</p><p className="text-xs text-slate-500">Browsed without signing in</p></Card>
        <Card><p className="text-sm font-semibold text-slate-500">Signed-in views</p><p className="mt-1 text-4xl font-black">{signedInViews}</p><p className="text-xs text-slate-500">Views from logged-in users</p></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="grid gap-3 lg:col-span-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Growth</p>
            <h3 className="font-display text-2xl">Signups by day</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={signupSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} width={28} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#14b8a6" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="grid gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Reports</p>
            <h3 className="font-display text-2xl">Categories</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={reportCategoryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} width={28} />
                <Tooltip />
                <Bar dataKey="count" fill="#14b8a6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="grid gap-3 lg:col-span-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Pulse</p>
            <h3 className="font-display text-2xl">Activity by day</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={activitySeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} width={28} />
                <Tooltip />
                <Bar dataKey="count" fill="#0f766e" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="grid gap-3 lg:col-span-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Reach</p>
            <h3 className="font-display text-2xl">Visitor page views <span className="text-base font-normal text-slate-400">(30 days)</span></h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pageViewSeries}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis allowDecimals={false} width={28} />
                <Tooltip />
                <Bar dataKey="count" fill="#6366f1" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="grid gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Reach</p>
            <h3 className="font-display text-2xl">Top pages</h3>
          </div>
          <div className="grid gap-2">
            {pageViewsByPage.length === 0 && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No page view data yet.</p>}
            {pageViewsByPage.slice(0, 8).map(({ page, count }) => (
              <div key={page} className="flex items-center gap-3 rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-900/70">
                <span className="min-w-0 flex-1 truncate font-semibold capitalize text-slate-700 dark:text-slate-200">{page}</span>
                <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">{count}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-2xl">Members <span className="text-base font-normal text-slate-400">({filteredProfiles.length})</span></h3>
          </div>
          <input
            className="w-full rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100"
            placeholder="Search by name or email…"
            value={userSearch}
            onChange={(e) => { setUserSearch(e.target.value); setShowAllUsers(true); }}
          />
          {visibleProfiles.map((profile) => (
            <button key={profile.id} className={clsx("grid grid-cols-[44px_minmax(0,1fr)] gap-3 rounded-2xl border p-3 text-left transition hover:border-teal-400", selectedUserId === profile.id ? "border-teal-400 bg-teal-50/70 dark:bg-teal-950/30" : "border-slate-200/70 bg-white/70 dark:border-slate-800 dark:bg-slate-900/70")} onClick={() => setSelectedUserId(profile.id === selectedUserId ? "" : profile.id)} type="button">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-2xl dark:bg-teal-950/40">{profile.avatar || "✨"}</div>
              <div className="min-w-0">
                <p className="truncate font-bold text-slate-900 dark:text-white">{profile.username}{profile.is_admin ? <span className="ml-1.5 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-300">admin</span> : null}</p>
                <p className="truncate text-xs text-slate-500">{profile.email || "No email saved"}</p>
                <p className="text-xs text-slate-500">Joined {formatDate(profile.created_at)} · {profile.anime_count || 0} anime · {profile.manga_count || 0} manga</p>
              </div>
            </button>
          ))}
          {filteredProfiles.length > 8 && (
            <button className="rounded-xl border border-slate-200/70 py-2 text-sm font-semibold text-slate-500 transition hover:border-teal-400 hover:text-teal-600 dark:border-slate-800 dark:text-slate-400" onClick={() => setShowAllUsers((v) => !v)} type="button">
              {showAllUsers ? "Show fewer" : `Show all ${filteredProfiles.length} members`}
            </button>
          )}
          {!profiles.length && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No users loaded yet.</p>}
        </Card>

        <Card className="grid gap-3">
          <h3 className="font-display text-2xl">Live activity</h3>
          {activity.slice(0, 15).map((event) => {
            const actor = event.user_id ? userById.get(event.user_id) : null;
            const { label, icon } = friendlyEvent(event.event_type);
            return (
              <div key={event.id} className="flex items-start gap-3 rounded-2xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <span className="mt-0.5 shrink-0 text-xl leading-none">{icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold capitalize text-slate-900 dark:text-white">{label}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {actor ? (
                      <button className="truncate text-xs font-semibold text-teal-600 dark:text-teal-400 hover:underline" onClick={() => setSelectedUserId(actor.id)} type="button">
                        {actor.avatar} {actor.username}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Unknown user</span>
                    )}
                    <span className="text-xs text-slate-400">{formatDate(event.created_at)}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {!activity.length && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No activity logged yet.</p>}
        </Card>

        <Card className="grid gap-3">
          <h3 className="font-display text-2xl">Reports inbox</h3>
          {reports.slice(0, 8).map((report) => (
            <div key={report.id} className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:bg-teal-950 dark:text-teal-200">{report.category}</span>
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950 dark:text-rose-100">{report.priority}</span>
                <span className="text-xs text-slate-500">{formatDate(report.created_at)}</span>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-slate-700 dark:text-slate-200">{report.message}</p>
              <p className="mt-1 truncate text-xs text-slate-500">{report.name || "Anonymous"} · {report.email || "No email"}</p>
            </div>
          ))}
          {!reports.length && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No reports yet.</p>}
        </Card>

        <Card className="grid gap-3">
          <h3 className="font-display text-2xl">Notifications</h3>
          {notifications.slice(0, 10).map((note) => (
            <div key={note.id} className="rounded-2xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
              <p className="font-bold text-slate-900 dark:text-white">{note.title}</p>
              <p className="text-sm text-slate-600 dark:text-slate-300">{note.body}</p>
              <p className="text-xs text-slate-500">{formatDate(note.created_at)}</p>
            </div>
          ))}
          {!notifications.length && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No notifications yet.</p>}
        </Card>
      </div>

      {selectedUser && (
        <Card className="grid gap-4 border-teal-200/70 dark:border-teal-900/50">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-teal-50 text-3xl dark:bg-teal-950/40">{selectedUser.avatar || "✨"}</div>
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.3em] text-teal-500">User detail</p>
                <h3 className="break-words font-display text-3xl leading-tight">{selectedUser.username}</h3>
                <p className="break-all text-sm text-slate-500">{selectedUser.email || "No email saved"}</p>
              </div>
            </div>
            <button className="button-ghost self-start" onClick={() => setSelectedUserId("")} type="button">Close</button>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center text-sm font-semibold sm:grid-cols-4">
            <span className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900"><strong className="block text-2xl text-slate-950 dark:text-white">{selectedUser.anime_count || 0}</strong>Anime</span>
            <span className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900"><strong className="block text-2xl text-slate-950 dark:text-white">{selectedUser.manga_count || 0}</strong>Manga</span>
            <span className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900"><strong className="block text-2xl text-slate-950 dark:text-white">{selectedUser.report_count || 0}</strong>Reports</span>
            <span className="rounded-2xl bg-slate-100 p-3 dark:bg-slate-900"><strong className="block text-2xl text-slate-950 dark:text-white">{selectedUser.is_public ? "Public" : "Private"}</strong>Profile</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              <h4 className="font-display text-xl">Recent actions</h4>
              {selectedUserActivity.map((event) => (
                <div key={event.id} className="rounded-xl bg-white/70 p-3 text-sm dark:bg-slate-900/70">
                  <p className="font-bold capitalize">{event.event_type.replace(/_/g, " ")}</p>
                  <p className="text-xs text-slate-500">{formatDate(event.created_at)}</p>
                </div>
              ))}
              {!selectedUserActivity.length && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No tracked activity yet.</p>}
            </div>
            <div className="grid gap-2">
              <h4 className="font-display text-xl">Reports from this user</h4>
              {selectedUserReports.map((report) => (
                <div key={report.id} className="rounded-xl bg-white/70 p-3 text-sm dark:bg-slate-900/70">
                  <p className="font-bold">{report.category} • {report.priority}</p>
                  <p className="line-clamp-3 text-slate-600 dark:text-slate-300">{report.message}</p>
                </div>
              ))}
              {!selectedUserReports.length && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No reports from this user.</p>}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function App() {
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<AppData>(() => loadData());
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [cloudSaveReady, setCloudSaveReady] = useState(!isSupabaseConfigured);
  const [saveError, setSaveError] = useState("");
  const [page, setPage] = useState<AppPage>("home");
  const [isAdmin, setIsAdmin] = useState(false);
  const [memberSince, setMemberSince] = useState("");
  const [selectedAnime, setSelectedAnime] = useState<AnimeSummary | null>(null);
  const [selectedManga, setSelectedManga] = useState<MangaSummary | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState("");
  const [guestPrompt, setGuestPrompt] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "logout" | "delete-account" | "clear-all" | "clear-anime" | "clear-manga">(null);
  const lastActivityAtRef = useRef(Date.now());
  useTheme(data.settings);

  // Track every page navigation as a page view
  useEffect(() => {
    logPageView(page, userId || null);
  }, [page, userId]);

  useEffect(() => {
    if (!isSupabaseConfigured || userId) {
      if (!isSupabaseConfigured) setAuthLoading(false);
      return;
    }
    if (getAuthHashType() === "recovery") {
      setAuthLoading(false);
      return;
    }
    let cancelled = false;
    const restoreSession = async () => {
      try {
        const session = await getCurrentSession();
        if (!session?.user || cancelled) return;
        const profile = (await loadProfile(session.user.id)) || userToProfileFallback(session.user);
        const nextData = await loadCloudData(session.user.id);
        if (cancelled) return;
        setCloudSaveReady(false);
        setActiveUser(session.user.id);
        setUserId(session.user.id);
        setIsAdmin(Boolean(profile.is_admin));
        setMemberSince(profile.created_at || session.user.created_at);
        setData({ ...nextData, settings: { ...nextData.settings, username: profile.username, avatar: profile.avatar, bio: profile.bio || nextData.settings.bio, isPublic: profile.is_public } });
        markProfileSeen(session.user.id).catch(() => undefined);
        window.setTimeout(() => setCloudSaveReady(true), 0);
      } catch (err) {
        setSaveError(friendlyAuthError(err, "Could not restore your session."));
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };
    restoreSession();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId || isSupabaseConfigured) return;
    const loaded = loadData(userId);
    const user = findUserById(userId);
    const name = user?.name || userId;
    const avatar = user?.avatar || "✨";
    setData({ ...loaded, settings: { ...loaded.settings, username: name, avatar } });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    if (!isSupabaseConfigured) {
      saveData(userId, data);
      return;
    }
    if (!cloudSaveReady) return;
    const timer = window.setTimeout(() => {
      saveCloudData(userId, data)
        .then(() => setSaveError(""))
        .catch((err) => setSaveError(friendlyAuthError(err, "Could not save your latest change.")));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [cloudSaveReady, data, userId]);

  const updateData = (patch: Partial<AppData>) => setData((prev) => ({ ...prev, ...patch }));
  const logEvent = (eventType: string, metadata: Record<string, unknown> = {}) => {
    if (!isSupabaseConfigured || !userId) return;
    logActivityEvent(userId, eventType, metadata).catch(() => undefined);
  };

  const addAnime = (anime: AnimeSummary) => {
    setData((prev) => {
      const exists = prev.library.find((item) => item.mal_id === anime.mal_id);
      const library = exists ? prev.library.map((item) => item.mal_id === anime.mal_id ? mergeAnimeToEntry(anime, item) : item) : [mergeAnimeToEntry(anime), ...prev.library];
      return { ...prev, library };
    });
  };

  const addEntry = (entry: LibraryEntry) => {
    setData((prev) => {
      const exists = prev.library.find((item) => item.mal_id === entry.mal_id);
      const library = exists ? prev.library.map((item) => item.mal_id === entry.mal_id ? entry : item) : [entry, ...prev.library];
      return { ...prev, library };
    });
    logEvent("anime_saved", { mal_id: entry.mal_id, title: entry.title, status: entry.status, rating: entry.rating });
  };

  const addMangaEntry = (entry: MangaEntry) => {
    setData((prev) => {
      const exists = prev.mangaLibrary.find((item) => item.mal_id === entry.mal_id);
      const mangaLibrary = exists ? prev.mangaLibrary.map((item) => item.mal_id === entry.mal_id ? entry : item) : [entry, ...prev.mangaLibrary];
      return { ...prev, mangaLibrary };
    });
    logEvent("manga_saved", { mal_id: entry.mal_id, title: entry.title, status: entry.status, rating: entry.rating });
  };

  const requireSignIn = (notice: string) => {
    setAuthNotice(notice);
    setSelectedAnime(null);
    setSelectedManga(null);
    setPage("auth");
  };

  const startAddFlow = (anime: AnimeSummary) => {
    setSelectedAnime(anime);
    setPage("add");
  };

  const startAddMangaFlow = (manga: MangaSummary) => {
    setSelectedManga(manga);
    setPage("add-manga");
  };

  const updateEntry = (entry: LibraryEntry) => {
    setData((prev) => ({ ...prev, library: prev.library.map((item) => item.mal_id === entry.mal_id ? entry : item) }));
    logEvent("anime_updated", { mal_id: entry.mal_id, title: entry.title, status: entry.status, rating: entry.rating });
  };

  const updateMangaEntry = (entry: MangaEntry) => {
    setData((prev) => ({ ...prev, mangaLibrary: prev.mangaLibrary.map((item) => item.mal_id === entry.mal_id ? entry : item) }));
    logEvent("manga_updated", { mal_id: entry.mal_id, title: entry.title, status: entry.status, rating: entry.rating });
  };

  const removeEntry = (idValue: number) => {
    setData((prev) => ({ ...prev, library: prev.library.filter((item) => item.mal_id !== idValue) }));
  };

  const removeMangaEntry = (idValue: number) => {
    setData((prev) => ({ ...prev, mangaLibrary: prev.mangaLibrary.filter((item) => item.mal_id !== idValue) }));
  };

  const handleLogin = ({ user, data: nextData }: { user: UserAccount; data: AppData }) => {
    setAuthNotice("");
    setCloudSaveReady(!user.isCloud);
    setActiveUser(user.id);
    setUserId(user.id);
    setIsAdmin(Boolean(user.isAdmin));
    setMemberSince(user.memberSince || "");
    setPage("home");
    setData(nextData);
    if (user.isCloud) window.setTimeout(() => setCloudSaveReady(true), 0);
  };

  const handleLogout = async (notice = "") => {
    if (isSupabaseConfigured) {
      try {
        await signOutCloud();
      } catch (err) {
        setSaveError(friendlyAuthError(err, "Could not sign out."));
      }
    }
    setCloudSaveReady(false);
    setActiveUser("");
    setUserId("");
    setIsAdmin(false);
    setMemberSince("");
    setData(loadData());
    setPage("home");
    setConfirmAction(null);
    setReportOpen(false);
    setAuthNotice(notice);
  };

  useEffect(() => {
    if (!userId) return;
    let timeoutId: number | undefined;
    const signOutForInactivity = () => {
      handleLogout("You were signed out after being inactive. Sign in again to continue.");
    };
    const scheduleTimer = () => {
      window.clearTimeout(timeoutId);
      const remaining = inactivityTimeoutMs - (Date.now() - lastActivityAtRef.current);
      timeoutId = window.setTimeout(signOutForInactivity, Math.max(0, remaining));
    };
    const recordActivity = () => {
      lastActivityAtRef.current = Date.now();
      scheduleTimer();
    };
    const checkVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActivityAtRef.current >= inactivityTimeoutMs) {
        signOutForInactivity();
        return;
      }
      scheduleTimer();
    };
    const activityEvents = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    lastActivityAtRef.current = Date.now();
    activityEvents.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    document.addEventListener("visibilitychange", checkVisibility);
    scheduleTimer();
    return () => {
      window.clearTimeout(timeoutId);
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      document.removeEventListener("visibilitychange", checkVisibility);
    };
  }, [userId]);

  const handleDeleteAccount = async () => {
    setSaveError("");
    try {
      if (isSupabaseConfigured) {
        await deleteCloudAccount();
      }
      setCloudSaveReady(false);
      setActiveUser("");
      setUserId("");
      setIsAdmin(false);
      setMemberSince("");
      setData(loadData());
      setPage("home");
      setConfirmAction(null);
    } catch (err) {
      setSaveError(friendlyAuthError(err, "Could not delete the account right now."));
    }
  };

  const handleSaveProfile = async (profileSettings: Pick<Settings, "username" | "avatar" | "bio" | "isPublic">) => {
    const nextSettings = { ...data.settings, ...profileSettings };
    setData((prev) => ({ ...prev, settings: { ...prev.settings, ...profileSettings } }));
    if (isSupabaseConfigured && userId) {
      await saveCloudData(userId, { ...data, settings: nextSettings });
      await upsertProfile({
        id: userId,
        username: profileSettings.username,
        avatar: profileSettings.avatar,
        bio: profileSettings.bio,
        is_public: profileSettings.isPublic
      });
    }
    logEvent("profile_updated", { username: profileSettings.username, isPublic: profileSettings.isPublic });
  };

  const clearHistory = () => {
    setData((prev) => ({ ...prev, library: [], mangaLibrary: [] }));
    logEvent("history_cleared", { scope: "all" });
    setConfirmAction(null);
  };

  const clearAnimeHistory = () => {
    setData((prev) => ({ ...prev, library: [] }));
    logEvent("history_cleared", { scope: "anime" });
    setConfirmAction(null);
  };

  const clearMangaHistory = () => {
    setData((prev) => ({ ...prev, mangaLibrary: [] }));
    logEvent("history_cleared", { scope: "manga" });
    setConfirmAction(null);
  };

  if (authLoading) {
    return (
      <div className="page-shell grid min-h-screen place-items-center px-4 text-slate-900 dark:text-slate-100">
        <Card className="w-full max-w-md text-center">
          <Film className="mx-auto h-10 w-10 text-teal-500" />
          <h1 className="mt-3 font-display text-3xl">Opening Animeboxd</h1>
          <p className="mt-1 text-sm text-slate-500">Getting your shelf ready.</p>
        </Card>
      </div>
    );
  }

  if (!userId && (page === "auth" || hasAuthCallbackParams())) {
    return (
      <AuthPage
        initialNotice={authNotice}
        onBrowse={() => {
          setAuthNotice("");
          setPage("home");
        }}
        onLogin={handleLogin}
      />
    );
  }

  if (!userId) {
    const guestSave = () => setGuestPrompt(true);
    const noop = () => {};
    return (
      <div className="page-shell min-h-screen text-slate-900 dark:text-slate-100">
        <PublicHeader
          theme={data.settings.theme}
          activePage={page}
          onThemeChange={(value) => updateData({ settings: { ...data.settings, theme: value } })}
          onHome={() => setPage("home")}
          onExplore={() => setPage("explore")}
          onMyStuff={() => setPage("stuff")}
          onMyManga={() => setPage("manga")}
          onReportIssue={() => setReportOpen(true)}
          onAuth={() => {
            setAuthNotice("Sign in or create an account when you are ready to save your library.");
            setPage("auth");
          }}
          onRequireSignIn={(msg) => {
            setAuthNotice(msg);
            setPage("auth");
          }}
        />
        {reportOpen && <ReportIssueModal onClose={() => setReportOpen(false)} />}
        {guestPrompt && (
          <GuestSaveModal
            onSignUp={() => {
              setGuestPrompt(false);
              setAuthNotice("Create a free account to save your anime and manga library.");
              setPage("auth");
            }}
            onClose={() => setGuestPrompt(false)}
          />
        )}
        {page === "explore" && <ExplorePage onAddAnime={startAddFlow} onAddManga={startAddMangaFlow} onBack={() => setPage("home")} />}
        {page === "stuff" && <MyStuffPage data={data} onSelect={startAddFlow} updateEntry={guestSave} removeEntry={guestSave} updateData={guestSave} onBack={() => setPage("home")} onClearHistory={noop} />}
        {page === "manga" && <MyMangaPage data={data} onSelect={startAddMangaFlow} updateEntry={guestSave} removeEntry={guestSave} updateData={guestSave} onBack={() => setPage("home")} onClearHistory={noop} />}
        {page === "add" && selectedAnime && (
          <AddEntryPage
            anime={selectedAnime}
            onSave={guestSave}
            onCancel={() => { setSelectedAnime(null); setPage("stuff"); }}
          />
        )}
        {page === "add-manga" && selectedManga && (
          <AddMangaPage
            manga={selectedManga}
            onSave={guestSave}
            onCancel={() => { setSelectedManga(null); setPage("manga"); }}
          />
        )}
        {page !== "explore" && page !== "stuff" && page !== "manga" && page !== "add" && page !== "add-manga" && (
          <HomePage addAnime={startAddFlow} />
        )}
        <div className="mx-auto max-w-6xl px-3 pb-6 pt-2 sm:px-4">
          <SiteFooter />
        </div>
        <CookieBanner onConsent={() => {}} />
      </div>
    );
  }

  return (
    <div className="page-shell min-h-screen text-slate-900 dark:text-slate-100">
      <Header
        user={{ name: data.settings.username, avatar: data.settings.avatar }}
        theme={data.settings.theme}
        isAdmin={isAdmin}
        onThemeChange={(value) => updateData({ settings: { ...data.settings, theme: value } })}
        onLogout={() => setConfirmAction("logout")}
        onHome={() => setPage("home")}
        onMyStuff={() => setPage("stuff")}
        onMyManga={() => setPage("manga")}
        onDashboard={() => setPage("dashboard")}
        onExplore={() => setPage("explore")}
        onProfile={() => setPage("profile")}
        onAdmin={() => setPage("admin")}
        onReportIssue={() => setReportOpen(true)}
        activePage={page}
      />
      {saveError && <div className="mx-auto mt-3 max-w-6xl px-3 text-sm text-rose-600 dark:text-rose-200 sm:px-4">{saveError}</div>}
      {reportOpen && <ReportIssueModal userId={userId} onClose={() => setReportOpen(false)} />}
      <CookieBanner onConsent={() => {}} />
      {confirmAction === "logout" && (
        <ConfirmModal title="Sign out?" message="Your latest changes are saved to your account before you leave." confirmLabel="Sign out" tone="neutral" onCancel={() => setConfirmAction(null)} onConfirm={handleLogout} />
      )}
      {confirmAction === "delete-account" && (
        <ConfirmModal title="Delete account" message="This permanently removes your account and saved AnimeBoxD data. This cannot be undone." confirmLabel="Delete account" requiresText="DELETE" onCancel={() => setConfirmAction(null)} onConfirm={handleDeleteAccount} />
      )}
      {confirmAction === "clear-all" && (
        <ConfirmModal title="Clear all history?" message="This removes your anime and manga history from this account." confirmLabel="Clear history" onCancel={() => setConfirmAction(null)} onConfirm={clearHistory} />
      )}
      {confirmAction === "clear-anime" && (
        <ConfirmModal title="Clear anime history?" message="This removes every anime entry from this account." confirmLabel="Clear anime" onCancel={() => setConfirmAction(null)} onConfirm={clearAnimeHistory} />
      )}
      {confirmAction === "clear-manga" && (
        <ConfirmModal title="Clear manga history?" message="This removes every manga entry from this account." confirmLabel="Clear manga" onCancel={() => setConfirmAction(null)} onConfirm={clearMangaHistory} />
      )}
      {page === "home" && <HomePage addAnime={startAddFlow} />}
      {page === "explore" && <ExplorePage onAddAnime={startAddFlow} onAddManga={startAddMangaFlow} onBack={() => setPage("home")} />}
      {page === "stuff" && <MyStuffPage data={data} onSelect={startAddFlow} updateEntry={updateEntry} removeEntry={removeEntry} updateData={updateData} onBack={() => setPage("home")} onClearHistory={() => setConfirmAction("clear-anime")} />}
      {page === "manga" && <MyMangaPage data={data} onSelect={startAddMangaFlow} updateEntry={updateMangaEntry} removeEntry={removeMangaEntry} updateData={updateData} onBack={() => setPage("home")} onClearHistory={() => setConfirmAction("clear-manga")} />}
      {page === "dashboard" && <DashboardPage data={data} onClearHistory={() => setConfirmAction("clear-all")} onBack={() => setPage("home")} />}
      {page === "profile" && <ProfilePage data={data} memberSince={memberSince} onBack={() => setPage("home")} onSaveProfile={handleSaveProfile} onDeleteAccount={() => setConfirmAction("delete-account")} />}
      {page === "admin" && isAdmin && <AdminPage onBack={() => setPage("home")} />}
      {page === "add" && selectedAnime && (
        <AddEntryPage
          anime={selectedAnime}
          onSave={(entry) => {
            addEntry(entry);
            setSelectedAnime(null);
            setPage("stuff");
          }}
          onCancel={() => {
            setSelectedAnime(null);
            setPage("home");
          }}
        />
      )}
      {page === "add-manga" && selectedManga && (
        <AddMangaPage
          manga={selectedManga}
          onSave={(entry) => {
            addMangaEntry(entry);
            setSelectedManga(null);
            setPage("manga");
          }}
          onCancel={() => {
            setSelectedManga(null);
            setPage("manga");
          }}
        />
      )}
      <div className="mx-auto max-w-6xl px-3 pb-6 pt-2 sm:px-4">
        <SiteFooter />
      </div>
    </div>
  );
}

export default App;
