import type { AnimeSummary } from "../types/anime";

const API = "https://api.jikan.moe/v4";
const hour = 60 * 60 * 1000;

type JikanAnime = {
  mal_id: number;
  title: string;
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
    score: item.score || 0,
    rank: item.rank || 0,
    year: item.year || undefined,
    url: item.url
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

export async function searchAnime(query: string): Promise<AnimeSummary[]> {
  const key = `search_cache_${query.toLowerCase().trim()}`;
  const cached = localStorage.getItem(key);
  if (cached) {
    const parsed = JSON.parse(cached) as { at: number; data: AnimeSummary[] };
    if (Date.now() - parsed.at < hour) return parsed.data;
  }
  const payload = await requestJson<{ data?: JikanAnime[] }>(`/anime?q=${encodeURIComponent(query)}&limit=12`);
  const data = Array.isArray(payload.data) ? payload.data.map(normalizeAnime) : [];
  localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  return data;
}

export async function getAnime(id: number): Promise<AnimeSummary> {
  const payload = await requestJson<{ data: JikanAnime }>(`/anime/${id}/full`);
  return normalizeAnime(payload.data);
}

export async function getTopAiring() {
  const payload = await requestJson<{ data?: JikanAnime[] }>("/top/anime?filter=airing&limit=10");
  return Array.isArray(payload.data) ? payload.data.map(normalizeAnime) : [];
}

export async function getTopAnime(limit = 12) {
  const key = `top_anime_cache_v2_${limit}`;
  const cached = localStorage.getItem(key);
  if (cached) {
    const parsed = JSON.parse(cached) as { at: number; data: AnimeSummary[] };
    if (Date.now() - parsed.at < hour && Array.isArray(parsed.data)) return parsed.data;
  }
  const payload = await requestJson<{ data?: JikanAnime[] }>(`/top/anime?limit=${limit}`);
  const data = Array.isArray(payload.data) ? payload.data.map(normalizeAnime) : [];
  localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  return data;
}

export async function getRandomAnimeList(limit = 8) {
  const topAnime = await getTopAnime(30);
  return topAnime.sort(() => Math.random() - 0.5).slice(0, limit);
}

export async function getSeasonal() {
  const payload = await requestJson<{ data?: JikanAnime[] }>("/seasons/now?limit=10");
  return Array.isArray(payload.data) ? payload.data.map(normalizeAnime) : [];
}

export async function getRandomAnime() {
  const payload = await requestJson<{ data: JikanAnime }>("/random/anime");
  return normalizeAnime(payload.data);
}

export async function getRecommendations(id: number) {
  const payload = await requestJson<{ data?: { entry: JikanAnime }[] }>(`/anime/${id}/recommendations`);
  return Array.isArray(payload.data) ? payload.data.slice(0, 8).map((item) => normalizeAnime(item.entry)) : [];
}

export async function getRelations(id: number) {
  const payload = await requestJson<{ data: { relation: string; entry: { mal_id: number; name: string; type: string; url: string }[] }[] }>(`/anime/${id}/relations`);
  return payload.data;
}
