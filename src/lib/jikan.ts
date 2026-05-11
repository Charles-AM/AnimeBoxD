import type { AnimeDetail, AnimeSummary, MangaDetail, MangaSummary } from "../types/anime";

const API = "https://api.jikan.moe/v4";
const hour = 60 * 60 * 1000;
const liveCacheTime = 10 * 60 * 1000;
const minSearchInterval = 1000;
const lastSearchAt: Record<"anime" | "manga", number> = { anime: 0, manga: 0 };
const blockedContentTerms = ["hentai", "erotica", "ecchi"];
const blockedRatingTerms = ["rx", "hentai"];

type JikanAnime = {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  episodes?: number;
  score?: number;
  rank?: number;
  year?: number;
  url?: string;
  aired?: { string?: string };
  images?: { jpg?: { image_url?: string; large_image_url?: string } };
  genres?: { name: string }[];
  studios?: { name: string }[];
  producers?: { name: string }[];
  licensors?: { name: string }[];
  themes?: { name: string }[];
  demographics?: { name: string }[];
  source?: string;
  rating?: string;
  duration?: string;
  broadcast?: { string?: string };
  season?: string;
  popularity?: number;
  favorites?: number;
};

type JikanManga = {
  mal_id: number;
  title: string;
  title_english?: string;
  title_japanese?: string;
  synopsis?: string;
  chapters?: number;
  volumes?: number;
  score?: number;
  rank?: number;
  year?: number;
  url?: string;
  status?: string;
  type?: string;
  images?: { jpg?: { image_url?: string; large_image_url?: string } };
  genres?: { name: string }[];
  themes?: { name: string }[];
  demographics?: { name: string }[];
  authors?: { name: string }[];
  serializations?: { name: string }[];
  favorites?: number;
};

export function normalizeAnime(item: JikanAnime): AnimeSummary {
  return {
    mal_id: item.mal_id,
    title: item.title,
    image_url: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || "",
    total_episodes: item.episodes || 0,
    genres: item.genres?.map((g) => g.name) || [],
    studios: item.studios?.map((s) => s.name) || [],
    synopsis: item.synopsis || "",
    aired: item.aired?.string || "",
    broadcast: item.broadcast?.string || "",
    score: item.score || 0,
    rank: item.rank || 0,
    favorites: item.favorites || 0,
    popularity: item.popularity || 0,
    year: item.year || undefined,
    url: item.url
  };
}

export function normalizeAnimeDetail(item: JikanAnime): AnimeDetail {
  return {
    ...normalizeAnime(item),
    producers: item.producers?.map((producer) => producer.name) || [],
    licensors: item.licensors?.map((licensor) => licensor.name) || [],
    themes: item.themes?.map((theme) => theme.name) || [],
    demographics: item.demographics?.map((demo) => demo.name) || [],
    source: item.source || "",
    rating: item.rating || "",
    duration: item.duration || "",
    broadcast: item.broadcast?.string || "",
    season: item.season || "",
    title_english: item.title_english || "",
    title_japanese: item.title_japanese || "",
    popularity: item.popularity || 0,
    favorites: item.favorites || 0
  };
}

function jikanTypeToMediaType(type?: string): import("../types/anime").ComicMediaType {
  const t = type?.toLowerCase();
  if (t === "manhwa") return "manhwa";
  if (t === "light novel" || t === "lightnovel" || t === "light_novel") return "light-novel";
  return "manga";
}

export function normalizeManga(item: JikanManga): MangaSummary {
  return {
    mal_id: item.mal_id,
    title: item.title,
    image_url: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || "",
    total_chapters: item.chapters || 0,
    total_volumes: item.volumes || 0,
    genres: item.genres?.map((genre) => genre.name) || [],
    authors: item.authors?.map((author) => author.name) || [],
    synopsis: item.synopsis || "",
    score: item.score || 0,
    rank: item.rank || 0,
    year: item.year || undefined,
    url: item.url,
    status: item.status || "",
    serialization: item.serializations?.map((serialization) => serialization.name) || [],
    themes: item.themes?.map((theme) => theme.name) || [],
    demographics: item.demographics?.map((demo) => demo.name) || [],
    mediaType: jikanTypeToMediaType(item.type)
  };
}

export function normalizeMangaDetail(item: JikanManga): MangaDetail {
  return {
    ...normalizeManga(item),
    title_english: item.title_english || "",
    title_japanese: item.title_japanese || "",
    favorites: item.favorites || 0
  };
}

async function requestJson<T>(path: string, retries = 3): Promise<T> {
  let wait = 700;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(`${API}${path}`);
    if (response.ok) return response.json();
    if (response.status === 429 && attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, wait));
      wait *= 2;
      continue;
    }
    if (response.status === 429) throw new Error("Too many requests, please wait 2 seconds");
    if (attempt === retries) throw new Error("Jikan is unavailable right now. Try again shortly.");
    await new Promise((resolve) => setTimeout(resolve, wait));
    wait *= 2;
  }
  throw new Error("Request failed");
}

async function throttleSearch(kind: "anime" | "manga") {
  const now = Date.now();
  const elapsed = now - lastSearchAt[kind];
  if (elapsed < minSearchInterval) {
    await new Promise((resolve) => setTimeout(resolve, minSearchInterval - elapsed));
  }
  lastSearchAt[kind] = Date.now();
}

function normalizeQuery(query: string) {
  return query
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesQuery(raw: { title?: string; title_english?: string; title_japanese?: string; synopsis?: string }, query: string) {
  if (!query) return true;
  const haystack = [raw.title, raw.title_english, raw.title_japanese, raw.synopsis]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function sanitizeItems<T extends { mal_id?: number; title?: string }>(items: T[]) {
  return items.filter((item) => item && typeof item.mal_id === "number" && Boolean(item.title));
}

function normalizeTerm(value?: string) {
  return String(value || "").toLowerCase().trim();
}

function hasBlockedTerm(values: (string | undefined)[]) {
  return values.some((value) => {
    const normalized = normalizeTerm(value);
    return blockedContentTerms.some((term) => normalized === term || normalized.includes(term));
  });
}

function isBlockedQuery(query: string) {
  const normalized = normalizeTerm(query);
  return blockedContentTerms.some((term) => normalized === term || normalized.includes(term));
}

function isSafeAnime(item: JikanAnime) {
  const rating = normalizeTerm(item.rating);
  const names = [
    item.title,
    item.title_english,
    item.synopsis,
    ...(item.genres || []).map((itemGenre) => itemGenre.name),
    ...(item.themes || []).map((theme) => theme.name),
    ...(item.demographics || []).map((demo) => demo.name)
  ];
  return !blockedRatingTerms.some((term) => rating.includes(term)) && !hasBlockedTerm(names);
}

function isSafeManga(item: JikanManga) {
  const names = [
    item.title,
    item.title_english,
    item.synopsis,
    ...(item.genres || []).map((itemGenre) => itemGenre.name),
    ...(item.themes || []).map((theme) => theme.name),
    ...(item.demographics || []).map((demo) => demo.name)
  ];
  return !hasBlockedTerm(names);
}

function filterSafeAnime(items: JikanAnime[]) {
  return items.filter(isSafeAnime);
}

function filterSafeManga(items: JikanManga[]) {
  return items.filter(isSafeManga);
}

function filterSafeAnimeSummaries(items: AnimeSummary[]) {
  return items.filter((item) => !hasBlockedTerm([...(item.genres || []), item.title, item.synopsis]));
}

function filterSafeMangaSummaries(items: MangaSummary[]) {
  return items.filter((item) => !hasBlockedTerm([...(item.genres || []), item.title, item.synopsis]));
}

function readCache<T>(key: string, maxAge = hour): T | null {
  const cached = localStorage.getItem(key);
  if (!cached) return null;
  try {
    const parsed = JSON.parse(cached) as { at: number; data: T };
    if (Date.now() - parsed.at < maxAge) return parsed.data;
  } catch {
    localStorage.removeItem(key);
  }
  return null;
}

function writeCache<T>(key: string, data: T) {
  localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
}

export async function searchAnime(query: string): Promise<AnimeSummary[]> {
  const normalizedQuery = normalizeQuery(query);
  if (isBlockedQuery(normalizedQuery)) return [];
  const key = `search_cache_v3_safe_${normalizedQuery}`;
  const cached = readCache<AnimeSummary[]>(key, hour);
  if (cached) return filterSafeAnimeSummaries(cached);
  await throttleSearch("anime");
  const payload = await requestJson<{ data?: JikanAnime[] }>(`/anime?q=${encodeURIComponent(query)}&limit=25&sfw=true`);
  const items = Array.isArray(payload.data) ? filterSafeAnime(sanitizeItems(payload.data)) : [];
  let filtered = items.filter((item) => matchesQuery(item, normalizedQuery));

  if (!filtered.length && normalizedQuery.includes(" ")) {
    const token = normalizedQuery.split(" ").sort((a, b) => b.length - a.length)[0];
    if (token) {
      await throttleSearch("anime");
      const fallback = await requestJson<{ data?: JikanAnime[] }>(`/anime?q=${encodeURIComponent(token)}&limit=25&sfw=true`);
      const fallbackItems = Array.isArray(fallback.data) ? filterSafeAnime(sanitizeItems(fallback.data)) : [];
      filtered = fallbackItems.filter((item) => matchesQuery(item, normalizedQuery));
      if (!filtered.length) filtered = fallbackItems;
    }
  }

  const data = (filtered.length ? filtered : items).slice(0, 12).map(normalizeAnime);
  writeCache(key, data);
  return data;
}

export async function searchManhwa(query: string): Promise<MangaSummary[]> {
  const normalizedQuery = normalizeQuery(query);
  if (isBlockedQuery(normalizedQuery)) return [];
  const key = `search_manhwa_cache_v1_${normalizedQuery}`;
  const cached = readCache<MangaSummary[]>(key, hour);
  if (cached) return filterSafeMangaSummaries(cached);
  await throttleSearch("manga");
  const payload = await requestJson<{ data?: JikanManga[] }>(`/manga?q=${encodeURIComponent(query)}&type=manhwa&limit=25&sfw=true`);
  const items = Array.isArray(payload.data) ? filterSafeManga(sanitizeItems(payload.data)) : [];
  const data = items.slice(0, 12).map(normalizeManga);
  writeCache(key, data);
  return data;
}

export async function getTopManhwa(limit = 12): Promise<MangaSummary[]> {
  const key = `top_manhwa_cache_v1_${limit}`;
  const cached = readCache<MangaSummary[]>(key, hour);
  if (cached) return filterSafeMangaSummaries(cached);
  const payload = await requestJson<{ data?: JikanManga[] }>(`/top/manga?type=manhwa&limit=${limit}&sfw=true`);
  const data = Array.isArray(payload.data) ? filterSafeManga(payload.data).map(normalizeManga) : [];
  writeCache(key, data);
  return data;
}


export async function searchLightNovels(query: string): Promise<MangaSummary[]> {
  const normalizedQuery = normalizeQuery(query);
  if (isBlockedQuery(normalizedQuery)) return [];
  const key = `search_ln_cache_v2_${normalizedQuery}`;
  const cached = readCache<MangaSummary[]>(key, hour);
  if (cached) return filterSafeMangaSummaries(cached);
  await throttleSearch("manga");
  const payload = await requestJson<{ data?: JikanManga[] }>(`/manga?q=${encodeURIComponent(query)}&type=lightnovel&limit=25&sfw=true`);
  const items = Array.isArray(payload.data) ? filterSafeManga(sanitizeItems(payload.data)) : [];
  const data = items.slice(0, 12).map(normalizeManga);
  writeCache(key, data);
  return data;
}

export async function getTopLightNovels(limit = 12): Promise<MangaSummary[]> {
  const key = `top_ln_cache_v1_${limit}`;
  const cached = readCache<MangaSummary[]>(key, hour);
  if (cached) return filterSafeMangaSummaries(cached);
  const payload = await requestJson<{ data?: JikanManga[] }>(`/top/manga?type=lightnovel&limit=${limit}&sfw=true`);
  const data = Array.isArray(payload.data) ? filterSafeManga(payload.data).map(normalizeManga) : [];
  writeCache(key, data);
  return data;
}

export async function searchManga(query: string): Promise<MangaSummary[]> {
  const normalizedQuery = normalizeQuery(query);
  if (isBlockedQuery(normalizedQuery)) return [];
  const key = `search_manga_cache_v3_safe_${normalizedQuery}`;
  const cached = readCache<MangaSummary[]>(key, hour);
  if (cached) return filterSafeMangaSummaries(cached);
  await throttleSearch("manga");
  const payload = await requestJson<{ data?: JikanManga[] }>(`/manga?q=${encodeURIComponent(query)}&limit=25&sfw=true`);
  const items = Array.isArray(payload.data) ? filterSafeManga(sanitizeItems(payload.data)) : [];
  let filtered = items.filter((item) => matchesQuery(item, normalizedQuery));

  if (!filtered.length && normalizedQuery.includes(" ")) {
    const token = normalizedQuery.split(" ").sort((a, b) => b.length - a.length)[0];
    if (token) {
      await throttleSearch("manga");
      const fallback = await requestJson<{ data?: JikanManga[] }>(`/manga?q=${encodeURIComponent(token)}&limit=25&sfw=true`);
      const fallbackItems = Array.isArray(fallback.data) ? filterSafeManga(sanitizeItems(fallback.data)) : [];
      filtered = fallbackItems.filter((item) => matchesQuery(item, normalizedQuery));
      if (!filtered.length) filtered = fallbackItems;
    }
  }

  const data = (filtered.length ? filtered : items).slice(0, 12).map(normalizeManga);
  writeCache(key, data);
  return data;
}

export async function getAnime(id: number): Promise<AnimeDetail> {
  const payload = await requestJson<{ data: JikanAnime }>(`/anime/${id}/full`);
  if (!isSafeAnime(payload.data)) throw new Error("This title is not available on AnimeBoxD.");
  return normalizeAnimeDetail(payload.data);
}

export async function getManga(id: number): Promise<MangaDetail> {
  const payload = await requestJson<{ data: JikanManga }>(`/manga/${id}/full`);
  if (!isSafeManga(payload.data)) throw new Error("This title is not available on AnimeBoxD.");
  return normalizeMangaDetail(payload.data);
}

export async function getAnimeStaff(id: number) {
  const payload = await requestJson<{ data?: { person: { name: string }; positions: string[] }[] }>(`/anime/${id}/staff`);
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function getAnimeCharacters(id: number) {
  const payload = await requestJson<{ data?: { character: { name: string }; role: string; voice_actors?: { person: { name: string }; language: string }[] }[] }>(`/anime/${id}/characters`);
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function getAnimeThemes(id: number) {
  const payload = await requestJson<{ data?: { openings?: string[]; endings?: string[] } }>(`/anime/${id}/themes`);
  return {
    openings: payload.data?.openings || [],
    endings: payload.data?.endings || []
  };
}

export async function getTopAiring(force = false) {
  const key = "top_airing_cache_v3_safe";
  const cached = force ? null : readCache<AnimeSummary[]>(key, liveCacheTime);
  if (cached) return filterSafeAnimeSummaries(cached);
  const payload = await requestJson<{ data?: JikanAnime[] }>("/top/anime?filter=airing&limit=25&sfw=true");
  const data = Array.isArray(payload.data) ? filterSafeAnime(payload.data).map(normalizeAnime) : [];
  writeCache(key, data);
  return data;
}

export async function getAiringToday(force = false) {
  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const today = weekdays[new Date().getDay()];
  const key = `airing_today_cache_v3_safe_${today}`;
  const cached = force ? null : readCache<AnimeSummary[]>(key, liveCacheTime);
  if (cached) return filterSafeAnimeSummaries(cached);
  const payload = await requestJson<{ data?: JikanAnime[] }>(`/schedules?filter=${today}&limit=25&sfw=true`);
  const data = Array.isArray(payload.data) ? filterSafeAnime(payload.data).map(normalizeAnime) : [];
  writeCache(key, data);
  return data;
}

export async function getTopAnime(limit = 12) {
  const key = `top_anime_cache_v3_safe_${limit}`;
  const cached = localStorage.getItem(key);
  if (cached) {
    const parsed = JSON.parse(cached) as { at: number; data: AnimeSummary[] };
    if (Date.now() - parsed.at < hour && Array.isArray(parsed.data)) return filterSafeAnimeSummaries(parsed.data);
  }
  const payload = await requestJson<{ data?: JikanAnime[] }>(`/top/anime?limit=${limit}&sfw=true`);
  const data = Array.isArray(payload.data) ? filterSafeAnime(payload.data).map(normalizeAnime) : [];
  localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  return data;
}

export async function getRandomAnimeList(limit = 8) {
  const topAnime = await getTopAnime(30);
  return topAnime.sort(() => Math.random() - 0.5).slice(0, limit);
}

export async function getSeasonal(force = false) {
  const key = "seasonal_anime_cache_v3_safe";
  const cached = force ? null : readCache<AnimeSummary[]>(key, liveCacheTime);
  if (cached) return filterSafeAnimeSummaries(cached);
  const payload = await requestJson<{ data?: JikanAnime[] }>("/seasons/now?limit=25&sfw=true");
  const data = Array.isArray(payload.data) ? filterSafeAnime(payload.data).map(normalizeAnime) : [];
  writeCache(key, data);
  return data;
}

export async function getUpcomingAnime(force = false) {
  const key = "upcoming_anime_cache_v3_safe";
  const cached = force ? null : readCache<AnimeSummary[]>(key, liveCacheTime);
  if (cached) return filterSafeAnimeSummaries(cached);
  const payload = await requestJson<{ data?: JikanAnime[] }>("/seasons/upcoming?limit=25&sfw=true");
  const data = Array.isArray(payload.data) ? filterSafeAnime(payload.data).map(normalizeAnime) : [];
  writeCache(key, data);
  return data;
}

export async function getRandomAnime() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const payload = await requestJson<{ data: JikanAnime }>("/random/anime");
    if (isSafeAnime(payload.data)) return normalizeAnime(payload.data);
  }
  throw new Error("Could not find a safe random title right now.");
}

export async function getRecommendations(id: number) {
  const payload = await requestJson<{ data?: { entry: JikanAnime }[] }>(`/anime/${id}/recommendations`);
  return Array.isArray(payload.data) ? payload.data.map((item) => item.entry).filter(isSafeAnime).slice(0, 8).map(normalizeAnime) : [];
}

export async function getRelations(id: number) {
  const payload = await requestJson<{ data: { relation: string; entry: { mal_id: number; name: string; type: string; url: string }[] }[] }>(`/anime/${id}/relations`);
  return payload.data;
}
