import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import {
  BookMarked,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Film,
  LogOut,
  PlayCircle,
  Plus,
  RefreshCcw,
  Search,
  Trash2
} from "lucide-react";
import { fixedAnime, platformOptions } from "./lib/fixedAnime";
import { searchAnime } from "./lib/jikan";
import { loadData, saveData, setActiveUser } from "./lib/storage";
import type { AnimeSummary, AppData, LibraryEntry, LibraryStatus, Settings, ThemeMode } from "./types/anime";

type UserAccount = { id: string; name: string; avatar: string; passcode: string };

type AuthMode = "signin" | "signup";

type Section = { key: LibraryStatus; title: string; icon: React.ReactElement };

const USER_KEY = "animeboxd_users_v1";
const DEMO_USER: UserAccount = { id: "demo", name: "Demo", avatar: "🎴", passcode: "demo123" };
const statuses: LibraryStatus[] = ["Watching", "Completed", "Plan to Watch", "On Hold", "Dropped"];
const chartColors = ["#2dd4bf", "#f472b6", "#60a5fa", "#f59e0b", "#a78bfa"];
const statusLabels: Record<LibraryStatus, string> = {
  Watching: "Watching",
  Completed: "Completed",
  "Plan to Watch": "Plan to Watch",
  "On Hold": "On Hold",
  Dropped: "Dropped"
};

const sections: Section[] = [
  { key: "Watching", title: "Watching now", icon: <PlayCircle className="h-5 w-5" /> },
  { key: "Plan to Watch", title: "Plan to watch", icon: <BookMarked className="h-5 w-5" /> },
  { key: "Completed", title: "Completed", icon: <CheckCircle2 className="h-5 w-5" /> },
  { key: "On Hold", title: "On hold", icon: <Film className="h-5 w-5" /> }
];

const genreOptions = [...new Set(fixedAnime.flatMap((anime) => anime.genres))].sort();
const decadeOptions = ["All", ...new Set(fixedAnime.map((anime) => `${Math.floor((anime.year || 0) / 10) * 10}s`))].filter((item) => item !== "0s");

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
  return <div className={clsx("glass-card rounded-2xl p-5 text-slate-900 dark:text-slate-100", className)}>{children}</div>;
}

function Button({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={clsx("button-glow inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-400 dark:text-slate-950 dark:hover:bg-teal-300", className)} {...props}>
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

function inputClass() {
  return "rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-100";
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

function AuthPage({ onLogin }: { onLogin: (payload: { user: UserAccount; data: AppData }) => void }) {
  const [mode, setMode] = useState<AuthMode>("signup");
  const [name, setName] = useState("");
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const nextUsers = ensureDemoUser(loadUsers());
    saveUsers(nextUsers);
  }, []);

  const submit = () => {
    setError("");
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

  return (
    <div className="page-shell min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-4xl items-center px-3 py-6 sm:px-4 sm:py-12">
        <Card className="grid gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Animeboxd</p>
              <h1 className="font-display text-4xl leading-tight sm:text-5xl">Welcome back</h1>
              <p className="text-sm text-slate-500">Sign up or sign in to your personal diary.</p>
            </div>
            <Film className="h-10 w-10 shrink-0 text-teal-500" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold", mode === "signup" ? "border-teal-400 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300")} onClick={() => setMode("signup")}>
              Sign up
            </button>
            <button className={clsx("rounded-xl border px-3 py-2 text-sm font-semibold", mode === "signin" ? "border-teal-400 bg-teal-50 text-teal-900" : "border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300")} onClick={() => setMode("signin")}>
              Sign in
            </button>
          </div>
          <div className="grid gap-4">
            <Field label="Display name">
              <input className={inputClass()} placeholder="e.g. Mirai" value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Passcode">
              <input className={inputClass()} type="password" placeholder="Simple passcode" value={passcode} onChange={(event) => setPasscode(event.target.value)} />
            </Field>
            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</p>}
            <Button onClick={submit}>{mode === "signup" ? "Create diary" : "Enter diary"}</Button>
            <button className="text-sm font-semibold text-teal-600" onClick={loginDemo}>Use demo user</button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Header({ user, theme, onThemeChange, onLogout, onHome, onMyStuff, onDashboard, activePage }: { user: { name: string; avatar: string }; theme: ThemeMode; onThemeChange: (value: ThemeMode) => void; onLogout: () => void; onHome: () => void; onMyStuff: () => void; onDashboard: () => void; activePage: "home" | "stuff" | "add" | "dashboard" }) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/60 bg-white/70 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-between gap-3">
        <button className="flex min-w-0 items-center gap-2" onClick={onHome}>
          <Film className="h-7 w-7 text-teal-500" />
          <div className="min-w-0">
            <p className="font-display text-2xl leading-none">Animeboxd</p>
            <p className="text-xs text-slate-500">Personal diary</p>
          </div>
        </button>
          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <span className="rounded-full bg-white/80 px-2 py-1 text-sm font-semibold shadow-sm dark:bg-slate-900/70">{user.avatar}</span>
            <button className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/70 bg-white/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200" onClick={onLogout} aria-label="Log out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 overflow-x-auto pb-1 lg:w-auto lg:overflow-visible lg:pb-0">
          <button className={clsx("inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition", activePage === "home" ? "border-teal-400 bg-teal-50 text-teal-900" : "border-slate-200/70 bg-white/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200")} onClick={onHome}>
            Homepage
          </button>
          <button className={clsx("inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition", activePage === "stuff" ? "border-teal-400 bg-teal-50 text-teal-900" : "border-slate-200/70 bg-white/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200")} onClick={onMyStuff}>
            <Plus className="h-4 w-4" /> My Stuff
          </button>
          <button className={clsx("inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition", activePage === "dashboard" ? "border-teal-400 bg-teal-50 text-teal-900" : "border-slate-200/70 bg-white/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200")} onClick={onDashboard}>
            Dashboard
          </button>
          <select className={clsx(inputClass(), "w-28 shrink-0")} value={theme} onChange={(event) => onThemeChange(event.target.value as ThemeMode)}>
            {["Dark", "Light", "System"].map((item) => <option key={item}>{item}</option>)}
          </select>
          <div className="hidden shrink-0 items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-sm font-semibold text-slate-700 shadow-sm dark:bg-slate-900/70 dark:text-slate-200 lg:flex">
            <span className="text-lg">{user.avatar}</span>
            <span>{user.name}</span>
          </div>
          <button className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-white/80 text-slate-700 transition hover:-translate-y-0.5 hover:border-teal-400 hover:text-teal-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-200 lg:inline-flex" onClick={onLogout} aria-label="Log out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
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
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 text-slate-400" />
        <input className={clsx(inputClass(), "w-full border-0 bg-transparent px-0 focus:border-0")} placeholder="Search anime to add" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      {loading && <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />)}</div>}
      {error && <p className="mt-3 rounded-md bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">{error}</p>}
      {!!results.length && (
        <div className="mt-4 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {results.map((anime) => (
            <div key={anime.mal_id} className="rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-900/70">
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

function CuratedGrid({ items, onAdd }: { items: AnimeSummary[]; onAdd: (anime: AnimeSummary) => void }) {
  const safeItems = Array.isArray(items) ? items : [];
  return (
    <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-3">
      {safeItems.map((anime) => (
        <div key={anime.mal_id} className="rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
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

function shuffleItems<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function allKnownAnime(library: LibraryEntry[], extra: AnimeSummary[] = []) {
  const byId = new Map<number, AnimeSummary>();
  fixedAnime.forEach((anime) => byId.set(anime.mal_id, anime));
  extra.forEach((anime) => byId.set(anime.mal_id, anime));
  library.forEach((anime) => byId.set(anime.mal_id, anime));
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}

function isLibraryEntry(anime: AnimeSummary): anime is LibraryEntry {
  return "status" in anime && "rating" in anime && "episodes_watched" in anime;
}

function AddEntryPage({ anime, onSave, onCancel }: { anime: AnimeSummary; onSave: (entry: LibraryEntry) => void; onCancel: () => void }) {
  const [status, setStatus] = useState<LibraryStatus>("Plan to Watch");
  const [ratingInput, setRatingInput] = useState("");
  const [episodesWatchedInput, setEpisodesWatchedInput] = useState("");
  const [review, setReview] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-3 py-4 sm:px-4 sm:py-6">
      <Card className="grid gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Add to diary</p>
            <h2 className="break-words font-display text-3xl leading-tight sm:text-4xl">{anime.title}</h2>
          </div>
          <button className="self-start text-sm font-semibold text-slate-500 sm:self-auto" onClick={onCancel}>Back</button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr] md:grid-cols-[170px_1fr]">
          <img src={anime.image_url} alt="" className="mx-auto aspect-[2/3] w-40 rounded-xl object-cover sm:w-full" />
          <div className="grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Status">
                <select className={inputClass()} value={status} onChange={(event) => setStatus(event.target.value as LibraryStatus)}>
                  {statuses.map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}
                </select>
              </Field>
              <Field label="Rating">
                <input
                  className={inputClass()}
                  type="number"
                  min={0}
                  max={10}
                  placeholder="0-10"
                  value={ratingInput}
                  onChange={(event) => setRatingInput(event.target.value)}
                />
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
            <Field label="Review">
              <textarea className={clsx(inputClass(), "min-h-24")} value={review} onChange={(event) => setReview(event.target.value)} />
            </Field>
            <Field label="Notes">
              <textarea className={clsx(inputClass(), "min-h-20")} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </Field>
            <div className="flex items-center gap-2">
              <Button className="bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={() => {
                const entry = mergeAnimeToEntry(anime);
                const rating = ratingInput.trim() ? Number(ratingInput) : 0;
                const episodesWatched = episodesWatchedInput.trim() ? Number(episodesWatchedInput) : 0;
                onSave({ ...entry, status, rating, episodes_watched: episodesWatched, review, notes });
              }}>Save</Button>
              <button className="text-sm font-semibold text-slate-500" onClick={onCancel}>Cancel</button>
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
    <div className="grid gap-3 rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
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
      {expanded && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <Field label="Status">
              <select className={inputClass()} value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LibraryStatus })}>
                {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </select>
            </Field>
            <Field label="Episodes watched">
              <input className={inputClass()} type="number" min={0} max={draft.total_episodes || undefined} value={draft.episodes_watched} onChange={(event) => setDraft({ ...draft, episodes_watched: Number(event.target.value) })} />
            </Field>
            <Field label="Rating">
              <input className={inputClass()} type="number" min={0} max={10} value={draft.rating} onChange={(event) => setDraft({ ...draft, rating: Number(event.target.value) })} />
            </Field>
          </div>
          <Field label="Review">
            <textarea className={clsx(inputClass(), "min-h-24")} value={draft.review} onChange={(event) => setDraft({ ...draft, review: event.target.value })} />
          </Field>
          <Field label="Notes">
            <textarea className={clsx(inputClass(), "min-h-20")} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
          </Field>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <span>Added {new Date(entry.added_at).toLocaleDateString()}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="bg-teal-400 text-slate-950 hover:bg-teal-300" onClick={() => { onUpdate({ ...draft }); setExpanded(false); }}>Save</Button>
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

function HomePage({ addAnime }: { addAnime: (anime: AnimeSummary) => void }) {
  const [randomAnime, setRandomAnime] = useState<AnimeSummary[]>(() => shuffleItems(fixedAnime).slice(0, 12));
  const reshuffle = () => setRandomAnime(shuffleItems(fixedAnime).slice(0, 12));

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <Card className="grid gap-2">
        <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Animeboxd</p>
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Keep your anime life in one cozy place.</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
          Find something new to watch, save it to your diary, rate what you finish, and keep the little notes you will want to remember later.
        </p>
      </Card>
      <Section title="Random Picks" icon={<Film className="h-5 w-5" />}>
        <div className="flex justify-end">
          <Button className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-900 dark:text-white dark:hover:bg-slate-800" onClick={reshuffle}>
            <RefreshCcw className="h-4 w-4" /> Shuffle
          </Button>
        </div>
        <CuratedGrid items={randomAnime} onAdd={addAnime} />
      </Section>
      <DiscoveryPanel onAdd={addAnime} />
    </div>
  );
}

function DiscoveryPanel({ onAdd }: { onAdd: (anime: AnimeSummary) => void }) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("All");
  const [decade, setDecade] = useState("All");
  const [platform, setPlatform] = useState("All");

  const filtered = fixedAnime.filter((anime) => {
    const animeDecade = anime.year ? `${Math.floor(anime.year / 10) * 10}s` : "Unknown";
    const matchesQuery = !query.trim() || anime.title.toLowerCase().includes(query.toLowerCase()) || anime.synopsis?.toLowerCase().includes(query.toLowerCase());
    const matchesGenre = genre === "All" || anime.genres.includes(genre);
    const matchesDecade = decade === "All" || animeDecade === decade;
    const matchesPlatform = platform === "All" || anime.platforms?.includes(platform);
    return matchesQuery && matchesGenre && matchesDecade && matchesPlatform;
  });

  return (
    <Section title="Search and Discovery" icon={<Search className="h-5 w-5" />}>
      <Card className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search">
            <input className={inputClass()} placeholder="Title or mood" value={query} onChange={(event) => setQuery(event.target.value)} />
          </Field>
          <Field label="Genre">
            <select className={inputClass()} value={genre} onChange={(event) => setGenre(event.target.value)}>
              {["All", ...genreOptions].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Decade">
            <select className={inputClass()} value={decade} onChange={(event) => setDecade(event.target.value)}>
              {decadeOptions.map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="Where to watch">
            <select className={inputClass()} value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {["All", ...platformOptions].map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
        </div>
        <p className="text-sm text-slate-500">{filtered.length} matches. Each result includes a quick overview, genres, decade, and streaming availability.</p>
        <CuratedGrid items={filtered} onAdd={onAdd} />
      </Card>
    </Section>
  );
}

function MyStuffPage({ data, onSelect, updateEntry, removeEntry, updateData, onBack }: { data: AppData; onSelect: (anime: AnimeSummary) => void; updateEntry: (entry: LibraryEntry) => void; removeEntry: (id: number) => void; updateData: (patch: Partial<AppData>) => void; onBack: () => void }) {
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
    onHold: data.library.filter((entry) => entry.status === "On Hold").length
  };

  const recent = [...data.library]
    .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
    .slice(0, 4);

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-3xl leading-tight">My Stuff</h2>
        <button className="text-sm font-semibold text-teal-600" onClick={onBack}>Back to home</button>
      </div>
      <Card className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Diary shelf</p>
          <h3 className="break-words font-display text-3xl leading-tight sm:text-4xl">{data.settings.username}'s logbook</h3>
          <p className="text-sm text-slate-500">A living record of what you watch, what you finish, and what you plan to watch next.</p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900">Total {counts.total}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900">Watching {counts.watching}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900">Completed {counts.completed}</span>
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Recent entries</p>
          {recent.length === 0 && <p className="text-sm text-slate-500">No entries yet. Add your first anime.</p>}
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
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
        <Card className="text-sm"><p className="text-slate-500">Total</p><p className="text-2xl font-black">{counts.total}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Watching</p><p className="text-2xl font-black">{counts.watching}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Completed</p><p className="text-2xl font-black">{counts.completed}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Plan</p><p className="text-2xl font-black">{counts.plan}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">On hold</p><p className="text-2xl font-black">{counts.onHold}</p></Card>
      </div>
      <SearchPanel onSelect={onSelect} />
      <div className="grid gap-6">
        {grouped.map((section) => (
          <Section key={section.key} title={section.title} icon={section.icon}>
            {section.entries.length === 0 ? (
              <Card className="text-sm text-slate-500">No anime here yet.</Card>
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
        <p className="text-sm text-slate-500">Pick favorites from the anime catalog or anything you have added yourself.</p>
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
        <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No favorites highlighted yet.</p>
      )}
      <button className="inline-flex items-center justify-between rounded-xl border border-slate-200/70 bg-white/70 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-200" onClick={() => setOpen((prev) => !prev)}>
        <span>{open ? "Hide favorite picker" : "Choose favorite anime"}</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="grid gap-3">
          <input className={inputClass()} placeholder="Search favorites by title or genre" value={query} onChange={(event) => setQuery(event.target.value)} />
          {searchLoading && <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">Searching anime...</p>}
          {searchError && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{searchError}</p>}
          <div className="grid max-h-[70vh] gap-2 overflow-auto pr-1 md:max-h-96 md:grid-cols-2 xl:grid-cols-3">
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

function DashboardPage({ data, onClearHistory }: { data: AppData; onClearHistory: () => void }) {
  const counts = {
    total: data.library.length,
    watching: data.library.filter((entry) => entry.status === "Watching").length,
    completed: data.library.filter((entry) => entry.status === "Completed").length,
    plan: data.library.filter((entry) => entry.status === "Plan to Watch").length,
    onHold: data.library.filter((entry) => entry.status === "On Hold").length,
    dropped: data.library.filter((entry) => entry.status === "Dropped").length
  };

  const rated = data.library.filter((entry) => entry.rating > 0);
  const averageRating = rated.length ? (rated.reduce((sum, entry) => sum + entry.rating, 0) / rated.length).toFixed(1) : "-";
  const completionRate = counts.total ? Math.round((counts.completed / counts.total) * 100) : 0;
  const lastAdded = [...data.library].sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())[0];
  const topGenres = Object.entries(
    data.library.flatMap((entry) => entry.genres).reduce<Record<string, number>>((acc, genre) => {
      acc[genre] = (acc[genre] || 0) + 1;
      return acc;
    }, {})
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([genre]) => genre);

  const statusData = statuses.map((status) => ({ name: statusLabels[status], value: data.library.filter((entry) => entry.status === status).length })).filter((item) => item.value > 0);
  const summaryText = counts.total
    ? `You have ${counts.total} entries: ${counts.watching} watching, ${counts.completed} completed, ${counts.plan} plan to watch, ${counts.onHold} on hold, ${counts.dropped} dropped.`
    : "No entries yet. Start by adding a few anime to your diary.";
  const recentActivity = [...data.library]
    .sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime())
    .slice(0, 6);
  const favoriteIds = new Set(data.settings.favoriteAnimeIds || []);
  const favoriteAnime = allKnownAnime(data.library, data.settings.favoriteAnimeCatalog || []).filter((anime) => favoriteIds.has(anime.mal_id));

  return (
    <div className="mx-auto grid max-w-6xl gap-5 px-3 py-4 sm:gap-6 sm:px-4 sm:py-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="font-display text-3xl leading-tight">Dashboard</h2>
        <Button className="bg-rose-600 hover:bg-rose-700" onClick={onClearHistory}>Clear history</Button>
      </div>
      <Card className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-2">
          <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Diary pulse</p>
          <h3 className="font-display text-3xl leading-tight sm:text-4xl">Your archive at a glance</h3>
          <p className="text-sm text-slate-500">Track progress, completion, and the genres shaping your season.</p>
          <p className="text-sm text-slate-600">{summaryText}</p>
          <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900">Avg rating {averageRating}</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 dark:bg-slate-900">Completion {completionRate}%</span>
          </div>
        </div>
        <div className="grid gap-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Latest update</p>
          {lastAdded ? (
            <div className="flex items-center gap-3">
              <img src={lastAdded.image_url} alt="" className="h-12 w-9 rounded-md object-cover" />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{lastAdded.title}</p>
                <p className="text-xs text-slate-500">Added {new Date(lastAdded.added_at).toLocaleDateString()}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No entries yet.</p>
          )}
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Top genres</p>
          {topGenres.length ? (
            <div className="flex flex-wrap gap-2">
              {topGenres.map((genre) => <span key={genre} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-900">{genre}</span>)}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Add a few anime to reveal your taste.</p>
          )}
        </div>
      </Card>
      <Card className="grid gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-teal-500">Profile favorites</p>
          <h3 className="font-display text-3xl">Favorite anime</h3>
        </div>
        {favoriteAnime.length === 0 ? (
          <p className="rounded-xl bg-slate-100 p-3 text-sm text-slate-500 dark:bg-slate-900">No favorites selected yet. Choose them in My Stuff.</p>
        ) : (
          <div className="grid gap-3 min-[520px]:grid-cols-2 lg:grid-cols-4">
            {favoriteAnime.map((anime) => (
              <div key={anime.mal_id} className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-xl border border-slate-200/70 bg-white/70 p-3 dark:border-slate-800 dark:bg-slate-950/70">
                <img src={anime.image_url} alt="" className="h-24 w-16 rounded-lg object-cover" />
                <div>
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-white">{anime.title}</p>
                  <p className="text-xs text-slate-500">{isLibraryEntry(anime) ? `${statusLabels[anime.status]} • ${anime.rating || "-"}/10` : `${anime.year || "Unknown"} • ${(anime.genres || []).slice(0, 2).join(", ")}`}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{isLibraryEntry(anime) ? anime.review || anime.notes || "Pinned to your profile highlights." : anime.synopsis || "Pinned to your profile highlights."}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Status breakdown</h3>
          <div className="h-72 min-w-0 overflow-hidden sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={90}>
                  {statusData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Recent activity</h3>
          <div className="grid gap-3">
            {recentActivity.length === 0 && <p className="text-sm text-slate-500">No activity yet. Add your first entry.</p>}
            {recentActivity.map((entry) => (
              <div key={entry.mal_id} className="rounded-xl border border-slate-200/70 bg-white/70 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/70">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900 dark:text-white">{entry.title}</p>
                  <span className="text-xs text-slate-500">{new Date(entry.added_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{statusLabels[entry.status]} • {entry.rating || "-"}/10 • {entry.episodes_watched}/{entry.total_episodes || "?"} eps</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-3">
        <Card className="text-sm"><p className="text-slate-500">Total entries</p><p className="text-3xl font-black">{counts.total}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Watching</p><p className="text-3xl font-black">{counts.watching}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Completed</p><p className="text-3xl font-black">{counts.completed}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Plan to watch</p><p className="text-3xl font-black">{counts.plan}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">On hold</p><p className="text-3xl font-black">{counts.onHold}</p></Card>
        <Card className="text-sm"><p className="text-slate-500">Dropped</p><p className="text-3xl font-black">{counts.dropped}</p></Card>
      </div>
    </div>
  );
}

function App() {
  const [userId, setUserId] = useState("");
  const [data, setData] = useState<AppData>(() => loadData());
  const [page, setPage] = useState<"home" | "stuff" | "add" | "dashboard">("home");
  const [selectedAnime, setSelectedAnime] = useState<AnimeSummary | null>(null);
  useTheme(data.settings);

  useEffect(() => {
    if (!userId) return;
    const loaded = loadData(userId);
    const user = findUserById(userId);
    const name = user?.name || userId;
    const avatar = user?.avatar || "✨";
    setData({ ...loaded, settings: { ...loaded.settings, username: name, avatar } });
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    saveData(userId, data);
  }, [data, userId]);

  const updateData = (patch: Partial<AppData>) => setData((prev) => ({ ...prev, ...patch }));

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
  };

  const startAddFlow = (anime: AnimeSummary) => {
    setSelectedAnime(anime);
    setPage("add");
  };

  const updateEntry = (entry: LibraryEntry) => {
    setData((prev) => ({ ...prev, library: prev.library.map((item) => item.mal_id === entry.mal_id ? entry : item) }));
  };

  const removeEntry = (idValue: number) => {
    setData((prev) => ({ ...prev, library: prev.library.filter((item) => item.mal_id !== idValue) }));
  };

  const handleLogin = ({ user, data: nextData }: { user: UserAccount; data: AppData }) => {
    setActiveUser(user.id);
    setUserId(user.id);
    setPage("home");
    setData(nextData);
  };

  const handleLogout = () => {
    setActiveUser("");
    setUserId("");
    setData(loadData());
    setPage("home");
  };

  const clearHistory = () => {
    if (!confirm("Clear all anime history for this account?")) return;
    setData((prev) => ({ ...prev, library: [] }));
  };

  if (!userId) return <AuthPage onLogin={handleLogin} />;

  return (
    <div className="page-shell min-h-screen text-slate-900 dark:text-slate-100">
      <Header
        user={{ name: data.settings.username, avatar: data.settings.avatar }}
        theme={data.settings.theme}
        onThemeChange={(value) => updateData({ settings: { ...data.settings, theme: value } })}
        onLogout={handleLogout}
        onHome={() => setPage("home")}
        onMyStuff={() => setPage("stuff")}
        onDashboard={() => setPage("dashboard")}
        activePage={page}
      />
      {page === "home" && <HomePage addAnime={startAddFlow} />}
      {page === "stuff" && <MyStuffPage data={data} onSelect={startAddFlow} updateEntry={updateEntry} removeEntry={removeEntry} updateData={updateData} onBack={() => setPage("home")} />}
      {page === "dashboard" && <DashboardPage data={data} onClearHistory={clearHistory} />}
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
    </div>
  );
}

export default App;
