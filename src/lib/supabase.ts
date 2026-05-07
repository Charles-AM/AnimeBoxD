import { createClient, type User } from "@supabase/supabase-js";
import { createDefaultData, normalizeAppData } from "./storage";
import type { AdminDashboardData, AppData } from "../types/anime";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const configuredSiteUrl = import.meta.env.VITE_SITE_URL as string | undefined;

function normalizeSupabaseUrl(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  try {
    const parsed = new URL(trimmed);
    return parsed.origin;
  } catch {
    return trimmed.replace(/\/+$/, "");
  }
}

const normalizedSupabaseUrl = normalizeSupabaseUrl(supabaseUrl);

export const isSupabaseConfigured = Boolean(normalizedSupabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(normalizedSupabaseUrl, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    })
  : null;

export type CloudProfile = {
  id: string;
  email?: string;
  username: string;
  avatar: string;
  bio: string;
  is_public: boolean;
  is_admin?: boolean;
  created_at?: string;
  last_seen?: string;
};

function assertSupabase() {
  if (!supabase) throw new Error("Supabase is not configured yet.");
  return supabase;
}

function authRedirectUrl() {
  if (configuredSiteUrl) return configuredSiteUrl.replace(/\/+$/, "/");
  if (typeof window !== "undefined") return `${window.location.origin}/`;
  return "https://animeboxd.app/";
}

export function userToProfileFallback(user: User): CloudProfile {
  return {
    id: user.id,
    username: (user.user_metadata?.username as string) || user.email?.split("@")[0] || "Anime fan",
    email: user.email,
    avatar: (user.user_metadata?.avatar as string) || "✨",
    bio: "",
    is_public: false,
    created_at: user.created_at
  };
}

export async function getCurrentSession() {
  const client = assertSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function completeAuthSessionFromUrl() {
  const client = assertSupabase();
  if (typeof window === "undefined") return null;

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const queryParams = new URLSearchParams(window.location.search);
  const type = hashParams.get("type") || queryParams.get("type") || "";
  const accessToken = hashParams.get("access_token");
  const refreshToken = hashParams.get("refresh_token");
  const code = queryParams.get("code");

  if (accessToken && refreshToken) {
    const { data, error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken
    });
    if (error) throw error;
    return { type, session: data.session };
  }

  if (code) {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return { type, session: data.session };
  }

  return { type, session: null };
}

export async function signUpWithEmail(email: string, password: string, username: string) {
  const client = assertSupabase();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: authRedirectUrl(),
      data: {
        username,
        avatar: "✨"
      }
    }
  });
  if (error) throw error;
  if (data.user && data.session) {
    await upsertProfile({
      id: data.user.id,
      email: data.user.email,
      username,
      avatar: "✨",
      bio: "",
      is_public: false,
      created_at: data.user.created_at
    });
    await ensureCloudData(data.user.id, username);
  }
  return data;
}

export async function resendSignupConfirmation(email: string) {
  const client = assertSupabase();
  const { error } = await client.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: authRedirectUrl()
    }
  });
  if (error) throw error;
}

export async function sendPasswordResetEmail(email: string) {
  const client = assertSupabase();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl()
  });
  if (error) throw error;
}

export async function updateCloudPassword(password: string) {
  const client = assertSupabase();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
}

export async function signInWithEmail(email: string, password: string) {
  const client = assertSupabase();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (data.user) {
    const username = (data.user.user_metadata?.username as string) || data.user.email?.split("@")[0] || "Anime fan";
    const profile = await loadProfile(data.user.id);
    if (!profile) {
      await upsertProfile({
        id: data.user.id,
        email: data.user.email,
        username,
        avatar: (data.user.user_metadata?.avatar as string) || "✨",
        bio: "",
        is_public: false,
        created_at: data.user.created_at
      });
    }
    await ensureCloudData(data.user.id, username);
    await markProfileSeen(data.user.id).catch(() => undefined);
    await logActivityEvent(data.user.id, "sign_in", { method: "password" }).catch(() => undefined);
  }
  return data;
}

export async function signOutCloud() {
  const client = assertSupabase();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function loadProfile(userId: string) {
  const client = assertSupabase();
  const { data, error } = await client
    .from("profiles")
    .select("id, email, username, avatar, bio, is_public, is_admin, created_at, last_seen")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as CloudProfile | null;
}

export async function upsertProfile(profile: CloudProfile) {
  const client = assertSupabase();
  const { created_at, last_seen, ...writeableProfile } = profile;
  const { error } = await client.from("profiles").upsert(writeableProfile, { onConflict: "id" });
  if (error) throw error;
}

export async function markProfileSeen(userId: string) {
  const client = assertSupabase();
  const { error } = await client.from("profiles").update({ last_seen: new Date().toISOString() }).eq("id", userId);
  if (error) throw error;
}

export async function logActivityEvent(userId: string, eventType: string, metadata: Record<string, unknown> = {}) {
  const client = assertSupabase();
  const { error } = await client.from("activity_events").insert({
    user_id: userId,
    event_type: eventType,
    metadata
  });
  if (error) throw error;
}

export async function ensureCloudData(userId: string, username: string) {
  const client = assertSupabase();
  const { data: existing, error: existingError } = await client
    .from("user_app_data")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return;
  const defaultData = createDefaultData();
  const starter: AppData = {
    ...defaultData,
    settings: {
      ...defaultData.settings,
      username
    }
  };
  const { error } = await client
    .from("user_app_data")
    .upsert({ user_id: userId, data: starter }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function loadCloudData(userId: string): Promise<AppData> {
  const client = assertSupabase();
  const { data, error } = await client
    .from("user_app_data")
    .select("data")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return normalizeAppData(data?.data as Partial<AppData> | undefined);
}

export async function saveCloudData(userId: string, appData: AppData) {
  const client = assertSupabase();
  const { error } = await client
    .from("user_app_data")
    .upsert({ user_id: userId, data: appData }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function createReport(payload: { userId?: string; name?: string; email?: string; category: string; priority?: string; message: string }) {
  const client = assertSupabase();
  const { error } = await client.from("user_reports").insert({
    user_id: payload.userId || null,
    name: payload.name || null,
    email: payload.email || null,
    category: payload.category,
    priority: payload.priority || "Normal",
    message: payload.message
  });
  if (error) throw error;
}

export async function loadAdminDashboard(): Promise<AdminDashboardData> {
  const client = assertSupabase();
  const [profiles, reports, activity, notifications, userData] = await Promise.all([
    client
      .from("profiles")
      .select("id, email, username, avatar, bio, is_public, is_admin, created_at, last_seen")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("user_reports")
      .select("id, user_id, name, email, category, priority, message, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    client
      .from("activity_events")
      .select("id, user_id, event_type, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    client
      .from("admin_notifications")
      .select("id, kind, title, body, is_read, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    client
      .from("user_app_data")
      .select("user_id, data")
      .limit(100)
  ]);

  const firstError = profiles.error || reports.error || activity.error || notifications.error || userData.error;
  if (firstError) throw firstError;
  const userDataById = new Map((userData.data || []).map((row: { user_id: string; data: Partial<AppData> }) => [row.user_id, row.data]));
  const reportsByUser = new Map<string, number>();
  (reports.data || []).forEach((report: { user_id?: string | null }) => {
    if (!report.user_id) return;
    reportsByUser.set(report.user_id, (reportsByUser.get(report.user_id) || 0) + 1);
  });
  const latestActivityByUser = new Map<string, string>();
  (activity.data || []).forEach((event: { user_id?: string | null; created_at: string }) => {
    if (!event.user_id || latestActivityByUser.has(event.user_id)) return;
    latestActivityByUser.set(event.user_id, event.created_at);
  });

  return {
    profiles: (profiles.data || []).map((profile) => {
      const data = userDataById.get(profile.id);
      return {
        ...profile,
        anime_count: Array.isArray(data?.library) ? data.library.length : 0,
        manga_count: Array.isArray(data?.mangaLibrary) ? data.mangaLibrary.length : 0,
        report_count: reportsByUser.get(profile.id) || 0,
        latest_activity: latestActivityByUser.get(profile.id)
      };
    }),
    reports: reports.data || [],
    activity: activity.data || [],
    notifications: notifications.data || []
  } as AdminDashboardData;
}

export async function deleteCloudAccount() {
  const client = assertSupabase();
  const { error } = await client.rpc("delete_current_user");
  if (error) throw error;
  await client.auth.signOut();
}
