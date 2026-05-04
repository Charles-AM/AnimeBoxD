export type LibraryStatus = "Watching" | "Completed" | "Plan to Watch" | "On Hold" | "Dropped";
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
  score?: number;
  rank?: number;
  year?: number;
  url?: string;
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
  favoriteAnimeIds: number[];
  favoriteAnimeCatalog: AnimeSummary[];
}

export interface AppData {
  library: LibraryEntry[];
  reviews: Review[];
  lists: CustomList[];
  diary: DiaryEntry[];
  settings: Settings;
}
