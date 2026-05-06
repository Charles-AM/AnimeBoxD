export type LibraryStatus = "Watching" | "Completed" | "Plan to Watch" | "On Hold" | "Dropped";
export type MangaStatus = "Reading" | "Completed" | "Plan to Read" | "On Hold" | "Dropped";
export type ThemeMode = "Dark" | "Light" | "System";

export interface AnimeSummary {
  mal_id: number;
  title: string;
  image_url: string;
  total_episodes: number;
  genres: string[];
  studios: string[];
  platforms?: string[];
  synopsis?: string;
  aired?: string;
  broadcast?: string;
  score?: number;
  rank?: number;
  favorites?: number;
  popularity?: number;
  year?: number;
  url?: string;
}

export interface AnimeDetail extends AnimeSummary {
  producers?: string[];
  licensors?: string[];
  themes?: string[];
  demographics?: string[];
  source?: string;
  rating?: string;
  duration?: string;
  broadcast?: string;
  season?: string;
  title_english?: string;
  title_japanese?: string;
}

export interface MangaSummary {
  mal_id: number;
  title: string;
  image_url: string;
  total_chapters: number;
  total_volumes: number;
  genres: string[];
  authors: string[];
  synopsis?: string;
  score?: number;
  rank?: number;
  year?: number;
  url?: string;
  status?: string;
  serialization?: string[];
  themes?: string[];
  demographics?: string[];
}

export interface MangaDetail extends MangaSummary {
  title_english?: string;
  title_japanese?: string;
  favorites?: number;
}

export interface LibraryEntry extends AnimeSummary {
  status: LibraryStatus;
  rating: number;
  episodes_watched: number;
  rewatch_count: number;
  start_date: string;
  end_date: string;
  notes: string;
  review: string;
  drop_reason: string;
  tags: string[];
  added_at: string;
}

export interface MangaEntry extends MangaSummary {
  status: MangaStatus;
  rating: number;
  chapters_read: number;
  volumes_read: number;
  start_date: string;
  end_date: string;
  notes: string;
  review: string;
  drop_reason: string;
  tags: string[];
  added_at: string;
}

export interface Review {
  id: string;
  anime_id: number;
  rating: number;
  text: string;
  is_spoiler: boolean;
  likes: number;
  date: string;
  user_id: string;
  comments: ReviewComment[];
}

export interface ReviewComment {
  id: string;
  user_id: string;
  text: string;
  date: string;
  replies: ReviewComment[];
}

export interface CustomList {
  id: string;
  name: string;
  description: string;
  animeIds: number[];
  isDefault: boolean;
}

export interface DiaryEntry {
  id: string;
  anime_id: number;
  date_watched: string;
  episode_range: string;
  rating: number;
  review: string;
}

export interface Settings {
  theme: ThemeMode;
  episodeLength: number;
  username: string;
  bio: string;
  avatar: string;
  isPublic: boolean;
  favoriteAnimeIds: number[];
  favoriteAnimeCatalog: AnimeSummary[];
  favoriteMangaIds: number[];
  favoriteMangaCatalog: MangaSummary[];
}

export interface AppData {
  library: LibraryEntry[];
  mangaLibrary: MangaEntry[];
  reviews: Review[];
  lists: CustomList[];
  diary: DiaryEntry[];
  settings: Settings;
}
