import type { AppData, CustomList, Settings } from "../types/anime";

export const STORAGE_KEY = "animeboxd_data_v1";
export const ACTIVE_USER_KEY = "animeboxd_active_user";

export const defaultLists: CustomList[] = [
  { id: "watchlist", name: "Watchlist", description: "Shows queued for later.", animeIds: [], isDefault: true },
  { id: "favorites", name: "Favorites", description: "Personal favorites.", animeIds: [], isDefault: true },
  { id: "dropped", name: "Dropped", description: "Shows you moved on from.", animeIds: [], isDefault: true },
  { id: "all-time-favorites", name: "All Time Favorites", description: "The forever shelf.", animeIds: [], isDefault: true }
];

export const defaultSettings: Settings = {
  theme: "System",
  episodeLength: 24,
  username: "You",
  bio: "Building a better anime memory palace.",
  avatar: "✨",
  favoriteAnimeIds: [],
  favoriteAnimeCatalog: []
};

export const defaultData: AppData = {
  library: [],
  reviews: [],
  lists: defaultLists,
  diary: [],
  settings: defaultSettings
};

function dataKey(userId: string) {
  return `${STORAGE_KEY}_${userId}`;
}

export function getActiveUser() {
  return localStorage.getItem(ACTIVE_USER_KEY) || "";
}

export function setActiveUser(userId: string) {
  if (userId) {
    localStorage.setItem(ACTIVE_USER_KEY, userId);
  } else {
    localStorage.removeItem(ACTIVE_USER_KEY);
  }
}

export function loadData(userId?: string): AppData {
  if (!userId) return defaultData;
  const raw = localStorage.getItem(dataKey(userId));
  if (!raw) return defaultData;
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      ...defaultData,
      ...parsed,
      settings: { ...defaultSettings, ...parsed.settings },
      lists: parsed.lists?.length ? parsed.lists : defaultLists
    };
  } catch {
    return defaultData;
  }
}

export function saveData(userId: string, data: AppData) {
  localStorage.setItem(dataKey(userId), JSON.stringify(data));
}
